"""
PayGate Bill Inbox Service
==========================
Email ingress for the AP bill inbox (Melio spec P0-b). Receives SendGrid
Inbound-Parse webhooks, authenticates them via a shared query-token, then
forwards each attachment as base64 to the TypeScript internal
`apBillInbox.receiveEmailBill` tRPC procedure, which stores the document and
triggers OCR extraction.

Endpoints:
  GET  /health           — Health check (no auth)
  POST /ingress/sendgrid — SendGrid Inbound-Parse webhook (?token=...)

Env:
  BILL_INBOX_TOKEN       — shared secret verified against the ?token= query param
  APP_INTERNAL_URL       — base URL of the TS app (e.g. http://app:3000)
  INTERNAL_API_KEY       — X-Internal-Key for the TS internal endpoint
  BILL_INBOX_MERCHANT_ID — default merchant that owns inbound bills
"""

import base64
import hmac
import logging
import os
from typing import Any

import httpx
from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse
from starlette.datastructures import UploadFile as StarletteUploadFile

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("bill-inbox")

# ─── Config ───────────────────────────────────────────────────────────────────
BILL_INBOX_TOKEN = os.getenv("BILL_INBOX_TOKEN", "")
APP_INTERNAL_URL = os.getenv("APP_INTERNAL_URL", "").rstrip("/")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
BILL_INBOX_MERCHANT_ID = os.getenv("BILL_INBOX_MERCHANT_ID", "")
FORWARD_TIMEOUT_SECONDS = float(os.getenv("BILL_INBOX_FORWARD_TIMEOUT", "30"))
MAX_ATTACHMENT_BYTES = int(os.getenv("BILL_INBOX_MAX_ATTACHMENT_BYTES", str(15 * 1024 * 1024)))

ALLOWED_CONTENT_TYPES = frozenset({
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/tiff",
})

# ─── App ──────────────────────────────────────────────────────────────────────
import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(title="PayGate Bill Inbox Service", version="1.0.0")
setup_telemetry("bill-inbox", app)


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "token_configured": bool(BILL_INBOX_TOKEN),
        "app_internal_url_configured": bool(APP_INTERNAL_URL),
    }


# ─── SendGrid Inbound Parse ingress ───────────────────────────────────────────
@app.post("/ingress/sendgrid")
async def ingress_sendgrid(request: Request, token: str = Query(default="")):
    # Fail closed: refuse all traffic when the shared token is not configured.
    if not BILL_INBOX_TOKEN:
        return JSONResponse(status_code=503, content={"detail": "Service misconfigured: BILL_INBOX_TOKEN not set"})
    if not hmac.compare_digest(token, BILL_INBOX_TOKEN):
        return JSONResponse(status_code=403, content={"detail": "Invalid token"})
    if not APP_INTERNAL_URL or not INTERNAL_API_KEY:
        return JSONResponse(status_code=503, content={"detail": "Service misconfigured: APP_INTERNAL_URL/INTERNAL_API_KEY not set"})

    form = await request.form()
    sender = str(form.get("from", ""))[:255]
    subject = str(form.get("subject", ""))[:512]
    message_id = str(form.get("message-id", form.get("Message-ID", "")))[:255]

    # SendGrid posts attachments as multipart file parts (attachment1..N).
    attachments: list[tuple[str, str, bytes]] = []
    for _key, value in form.multi_items():
        if not isinstance(value, StarletteUploadFile):
            continue
        filename = value.filename or "attachment"
        content_type = (value.content_type or "").split(";")[0].strip().lower()
        data = await value.read()
        if not data:
            continue
        if content_type not in ALLOWED_CONTENT_TYPES:
            logger.warning(f"[ingress] skipping {filename}: unsupported content type {content_type}")
            continue
        if len(data) > MAX_ATTACHMENT_BYTES:
            logger.warning(f"[ingress] skipping {filename}: exceeds {MAX_ATTACHMENT_BYTES} bytes")
            continue
        attachments.append((filename, content_type, data))

    forwarded = 0
    failed = 0
    errors: list[str] = []
    async with httpx.AsyncClient(timeout=FORWARD_TIMEOUT_SECONDS) as client:
        for filename, content_type, data in attachments:
            payload: dict[str, Any] = {
                "merchantId": BILL_INBOX_MERCHANT_ID,
                "fileName": filename,
                "contentType": content_type,
                "base64Data": base64.b64encode(data).decode(),
                "fromAddress": sender,
                "subject": subject,
                "messageId": message_id or None,
            }
            try:
                resp = await client.post(
                    f"{APP_INTERNAL_URL}/api/trpc/apBillInbox.receiveEmailBill",
                    headers={
                        "Content-Type": "application/json",
                        "X-Internal-Key": INTERNAL_API_KEY,
                    },
                    # tRPC v10 non-batched mutation body (superjson: plain-JSON
                    # inputs need no meta envelope).
                    json={"json": payload},
                )
                if resp.status_code == 200:
                    forwarded += 1
                    logger.info(f"[ingress] forwarded {filename} from={sender}")
                else:
                    failed += 1
                    errors.append(f"{filename}: HTTP {resp.status_code}")
                    logger.error(f"[ingress] forward failed {filename}: HTTP {resp.status_code} {resp.text[:300]}")
            except Exception as e:
                failed += 1
                errors.append(f"{filename}: {e}")
                logger.error(f"[ingress] forward error {filename}: {e}")

    return {
        "received": len(attachments),
        "forwarded": forwarded,
        "failed": failed,
        "errors": errors,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8108, log_level="warning")
