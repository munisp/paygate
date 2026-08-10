"""
PayGate NextHub — Billing Temporal Activities
=============================================
Activities for the MonthlyBillingWorkflow.
"""

import base64
import io
import json
import logging
import os
import smtplib
import struct
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

import asyncpg
from temporalio import activity

logger = logging.getLogger(__name__)

PG_DSN = os.getenv("PG_DATABASE_URL", "postgresql://paygate_user:paygate_dev_2026@127.0.0.1/paygate_db")
S3_BUCKET = os.getenv("S3_BUCKET", "nexthub-lakehouse")
AWS_REGION = os.getenv("AWS_REGION", "af-south-1")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
TIGERBEETLE_ADDRESS = os.getenv("TIGERBEETLE_ADDRESS", "localhost:3000")


async def _get_pg() -> asyncpg.Connection:
    return await asyncpg.connect(PG_DSN)


@activity.defn(name="aggregate_fee_postings")
async def aggregate_fee_postings(
    dfsp_id: str,
    period_start_ms: int,
    period_end_ms: int,
    currency: str,
) -> dict:
    """Aggregate all fee postings for a DFSP in a billing period."""
    activity.heartbeat("Aggregating fee postings from DB")
    conn = await _get_pg()
    try:
        rows = await conn.fetch(
            """
            SELECT
                fee_type,
                SUM(amount_minor) AS total
            FROM nexthub_fee_postings
            WHERE dfsp_id = $1
              AND currency = $2
              AND created_at_ms >= $3
              AND created_at_ms < $4
            GROUP BY fee_type
            """,
            dfsp_id, currency, period_start_ms, period_end_ms,
        )
        summary = {
            "scheme_fee_minor": 0,
            "interchange_minor": 0,
            "fx_markup_minor": 0,
            "penalty_minor": 0,
            "total_minor": 0,
            "transaction_count": 0,
        }
        for row in rows:
            fee_type = row["fee_type"]
            total = int(row["total"] or 0)
            if fee_type == "SCHEME_FEE":
                summary["scheme_fee_minor"] = total
            elif fee_type == "INTERCHANGE":
                summary["interchange_minor"] = total
            elif fee_type == "FX_MARKUP":
                summary["fx_markup_minor"] = total
            elif fee_type == "PENALTY":
                summary["penalty_minor"] = total

        summary["total_minor"] = (
            summary["scheme_fee_minor"]
            + summary["interchange_minor"]
            + summary["fx_markup_minor"]
            + summary["penalty_minor"]
        )

        # Get transaction count
        count_row = await conn.fetchrow(
            """
            SELECT COUNT(*) AS cnt
            FROM nexthub_fee_postings
            WHERE dfsp_id = $1 AND currency = $2
              AND created_at_ms >= $3 AND created_at_ms < $4
            """,
            dfsp_id, currency, period_start_ms, period_end_ms,
        )
        summary["transaction_count"] = int(count_row["cnt"] or 0)
        return summary
    finally:
        await conn.close()


@activity.defn(name="generate_invoice_pdf")
async def generate_invoice_pdf(
    dfsp_id: str,
    period_start_ms: int,
    period_end_ms: int,
    fee_summary: dict,
    currency: str,
    invoice_id: Optional[str],
) -> str:
    """Generate a PDF invoice using ReportLab and return base64-encoded bytes."""
    activity.heartbeat("Generating PDF invoice")
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors

    period_start = datetime.utcfromtimestamp(period_start_ms / 1000)
    period_end = datetime.utcfromtimestamp(period_end_ms / 1000)
    invoice_number = invoice_id or f"INV-{dfsp_id[:8].upper()}-{period_start.strftime('%Y%m')}"

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    story = []

    # Header
    story.append(Paragraph("<b>PayGate NextHub</b>", styles["Title"]))
    story.append(Paragraph("Settlement Fee Invoice", styles["Heading2"]))
    story.append(Spacer(1, 0.5*cm))

    # Invoice metadata
    meta = [
        ["Invoice Number:", invoice_number],
        ["DFSP ID:", dfsp_id],
        ["Billing Period:", f"{period_start.strftime('%d %b %Y')} – {period_end.strftime('%d %b %Y')}"],
        ["Currency:", currency],
        ["Issue Date:", datetime.utcnow().strftime("%d %b %Y")],
    ]
    meta_table = Table(meta, colWidths=[5*cm, 10*cm])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 0.5*cm))

    # Fee breakdown
    story.append(Paragraph("<b>Fee Breakdown</b>", styles["Heading3"]))
    minor_to_major = lambda x: f"{x / 100:,.2f}"
    fee_data = [
        ["Fee Type", f"Amount ({currency})"],
        ["Scheme Fee", minor_to_major(fee_summary.get("scheme_fee_minor", 0))],
        ["Interchange", minor_to_major(fee_summary.get("interchange_minor", 0))],
        ["FX Markup", minor_to_major(fee_summary.get("fx_markup_minor", 0))],
        ["Penalty", minor_to_major(fee_summary.get("penalty_minor", 0))],
        ["", ""],
        ["TOTAL", minor_to_major(fee_summary.get("total_minor", 0))],
    ]
    fee_table = Table(fee_data, colWidths=[10*cm, 5*cm])
    fee_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f0f4ff")),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(fee_table)
    story.append(Spacer(1, 0.5*cm))

    # Transaction count
    story.append(Paragraph(
        f"Total transactions in period: <b>{fee_summary.get('transaction_count', 0):,}</b>",
        styles["Normal"],
    ))
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph(
        "Payment is due within 30 days of invoice date. "
        "Amounts are in minor units (kobo for NGN). "
        "This invoice was generated automatically by PayGate NextHub.",
        styles["Small"],
    ))

    doc.build(story)
    pdf_bytes = buf.getvalue()
    return base64.b64encode(pdf_bytes).decode("utf-8")


@activity.defn(name="upload_invoice_to_s3")
async def upload_invoice_to_s3(
    dfsp_id: str,
    period_start_ms: int,
    pdf_bytes_b64: str,
) -> dict:
    """Upload the invoice PDF to S3 and return the key and public URL."""
    import boto3
    activity.heartbeat("Uploading invoice to S3")
    period_str = datetime.utcfromtimestamp(period_start_ms / 1000).strftime("%Y%m")
    key = f"invoices/{dfsp_id}/{period_str}/{uuid.uuid4().hex}.pdf"
    pdf_bytes = base64.b64decode(pdf_bytes_b64)
    s3 = boto3.client("s3", region_name=AWS_REGION)
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=pdf_bytes,
        ContentType="application/pdf",
        ContentDisposition=f'attachment; filename="invoice-{dfsp_id}-{period_str}.pdf"',
    )
    url = f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"
    return {"key": key, "url": url}


@activity.defn(name="notify_dfsp_invoice_ready")
async def notify_dfsp_invoice_ready(
    dfsp_id: str,
    pdf_url: str,
    period_start_ms: int,
    total_minor: int,
    currency: str,
) -> None:
    """Send invoice notification email to the DFSP billing contact."""
    activity.heartbeat("Fetching DFSP billing contact")
    conn = await _get_pg()
    try:
        row = await conn.fetchrow(
            "SELECT name, billing_email FROM nexthub_dfsps WHERE id = $1",
            dfsp_id,
        )
        if not row or not row["billing_email"]:
            logger.warning("No billing email for DFSP %s — skipping notification", dfsp_id)
            return
        dfsp_name = row["name"]
        billing_email = row["billing_email"]
    finally:
        await conn.close()

    period_str = datetime.utcfromtimestamp(period_start_ms / 1000).strftime("%B %Y")
    amount_str = f"{total_minor / 100:,.2f} {currency}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"PayGate NextHub Invoice — {period_str}"
    msg["From"] = SMTP_USER
    msg["To"] = billing_email

    html = f"""
    <html><body>
    <p>Dear {dfsp_name} Billing Team,</p>
    <p>Your PayGate NextHub settlement fee invoice for <strong>{period_str}</strong> is ready.</p>
    <p><strong>Total Amount Due:</strong> {amount_str}</p>
    <p><a href="{pdf_url}">Download Invoice PDF</a></p>
    <p>Payment is due within 30 days.</p>
    <p>PayGate NextHub Operations</p>
    </body></html>
    """
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        if SMTP_USER and SMTP_PASS:
            server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, billing_email, msg.as_string())


@activity.defn(name="post_tigerbeetle_invoice_transfer")
async def post_tigerbeetle_invoice_transfer(
    dfsp_id: str,
    amount_minor: int,
    currency: str,
    invoice_id: Optional[str],
    period_start_ms: int,
) -> str:
    """
    Post the invoice amount as a TigerBeetle transfer from the DFSP
    position account to the scheme operator fee account.

    Uses the TigerBeetle gRPC service (nexthub-settlement) via HTTP/2.
    Falls back to recording the transfer ID as pending if gRPC is unavailable.
    """
    import aiohttp
    activity.heartbeat("Posting TigerBeetle invoice transfer")

    grpc_url = os.getenv("NEXTHUB_SETTLEMENT_GRPC_URL", "http://localhost:50051")
    transfer_id = str(uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"invoice:{dfsp_id}:{period_start_ms}",
    ))

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{grpc_url}/v1/settlement/invoice",
                json={
                    "transfer_id": transfer_id,
                    "dfsp_id": dfsp_id,
                    "amount_minor": amount_minor,
                    "currency": currency,
                    "invoice_id": invoice_id,
                },
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status not in (200, 201):
                    body = await resp.text()
                    raise RuntimeError(f"Settlement gRPC error {resp.status}: {body}")
                result = await resp.json()
                return result.get("transfer_id", transfer_id)
    except Exception as exc:
        logger.warning(
            "TigerBeetle gRPC unavailable — recording invoice transfer as pending: %s", exc
        )
        # Record as pending in DB for manual reconciliation
        conn = await _get_pg()
        try:
            await conn.execute(
                """
                INSERT INTO nexthub_fee_postings
                  (id, dfsp_id, fee_type, amount_minor, currency, transfer_id,
                   status, created_at_ms)
                VALUES ($1,$2,'INVOICE',$3,$4,$5,'pending_tigerbeetle',$6)
                ON CONFLICT (id) DO NOTHING
                """,
                str(uuid.uuid4()), dfsp_id, amount_minor, currency,
                transfer_id, int(datetime.now(timezone.utc).timestamp() * 1000),
            )
        finally:
            await conn.close()
        return transfer_id


@activity.defn(name="mark_invoice_issued")
async def mark_invoice_issued(
    dfsp_id: str,
    period_start_ms: int,
    period_end_ms: int,
    fee_summary: dict,
    pdf_s3_key: str,
    pdf_url: str,
    tigerbeetle_transfer_id: Optional[str],
    existing_invoice_id: Optional[str],
) -> str:
    """Upsert the invoice record in DB and mark it as issued."""
    conn = await _get_pg()
    try:
        invoice_id = existing_invoice_id or str(uuid.uuid4())
        await conn.execute(
            """
            INSERT INTO nexthub_billing_invoices
              (id, dfsp_id, period_start_ms, period_end_ms,
               scheme_fee_minor, interchange_minor, fx_markup_minor, penalty_minor,
               total_minor, currency, pdf_s3_key, pdf_url,
               tigerbeetle_transfer_id, status, issued_at_ms)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'NGN',$10,$11,$12,'issued',$13)
            ON CONFLICT (id) DO UPDATE SET
              pdf_s3_key = EXCLUDED.pdf_s3_key,
              pdf_url = EXCLUDED.pdf_url,
              tigerbeetle_transfer_id = EXCLUDED.tigerbeetle_transfer_id,
              status = 'issued',
              issued_at_ms = EXCLUDED.issued_at_ms
            """,
            invoice_id, dfsp_id, period_start_ms, period_end_ms,
            fee_summary.get("scheme_fee_minor", 0),
            fee_summary.get("interchange_minor", 0),
            fee_summary.get("fx_markup_minor", 0),
            fee_summary.get("penalty_minor", 0),
            fee_summary.get("total_minor", 0),
            pdf_s3_key, pdf_url, tigerbeetle_transfer_id,
            int(datetime.now(timezone.utc).timestamp() * 1000),
        )
        return invoice_id
    finally:
        await conn.close()
