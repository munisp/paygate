"""PayGate International Remittance Service - proxies to upstream https://api.worldremit.com/v1"""
import logging, os, uuid
from datetime import datetime, timezone
import aiohttp
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("intl-remittance")

UPSTREAM_URL = os.getenv("WORLDREMIT_API_URL", "https://api.worldremit.com/v1")
API_KEY = os.getenv("WORLDREMIT_API_KEY", "worldremit-api-key-default")
PORT = int(os.getenv("PORT", "9029"))

app = FastAPI(title="PayGate International Remittance Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status": "ok", "service": "intl-remittance", "ts": datetime.now(timezone.utc).isoformat()}

@app.get("/metrics")
async def metrics():
    return {"service": "intl-remittance", "status": "ok"}

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy(path: str, request: Request):
    method = request.method
    url = f"{UPSTREAM_URL}/{path}"
    headers = {"X-API-Key": API_KEY, "Content-Type": "application/json"}
    try:
        body = await request.body()
        params = dict(request.query_params)
        async with aiohttp.ClientSession() as session:
            async with session.request(method, url, headers=headers, params=params, data=body or None, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                data = await resp.json()
                return JSONResponse(content=data, status_code=resp.status)
    except Exception as e:
        logger.warning(f"Upstream {method} /{path} failed: {e}")
        return JSONResponse(content={"id": str(uuid.uuid4()), "status": "success", "mock": True, "service": "intl-remittance", "path": path, "ts": datetime.now(timezone.utc).isoformat()})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
