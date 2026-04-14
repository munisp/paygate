"""PayGate Soundbox Service v2.0 — IoT payment device management"""
import logging, os, uuid
from datetime import datetime, timezone
from typing import Optional
import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("soundbox")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/paygate")
PORT = int(os.getenv("PORT", "9034"))
app = FastAPI(title="PayGate Soundbox Service", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_pool = None
async def get_pool():
    global _pool
    if _pool is None:
        try: _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        except Exception as e: logger.warning(f"DB: {e}")
    return _pool

SUPPORTED_LANGUAGES = ["en","yo","ig","ha","fr","sw"]
SUPPORTED_CURRENCIES = ["NGN","GHS","KES","ZAR","USD"]

class RegisterDeviceRequest(BaseModel):
    merchant_id: str; device_id: str; serial_number: str
    device_model: str = "PayGate SB-1"; firmware_version: str = "2.1.0"; location: Optional[str] = None

class ConfigureDeviceRequest(BaseModel):
    device_id: str; volume: int = Field(ge=0,le=100,default=80)
    language: str = "en"; currency: str = "NGN"
    announcement_template: str = "Payment received: {amount} {currency}"

class PaymentAlertRequest(BaseModel):
    device_id: str; amount: float; currency: str = "NGN"
    transaction_id: str; customer_name: Optional[str] = None

@app.get("/health")
async def health():
    pool = await get_pool()
    return {"status":"ok" if pool else "degraded","service":"soundbox","version":"2.0.0","ts":datetime.now(timezone.utc).isoformat()}

@app.get("/metrics")
async def metrics():
    pool = await get_pool()
    total, active = 0, 0
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT COUNT(*) as total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active FROM soundbox_devices")
                total, active = (r["total"], r["active"] or 0) if r else (0, 0)
        except Exception: pass
    return {"service":"soundbox","total_devices":total,"active_devices":active,"supported_languages":SUPPORTED_LANGUAGES,"ts":datetime.now(timezone.utc).isoformat()}

@app.post("/soundbox/register")
async def register_device(req: RegisterDeviceRequest):
    activation_code = f"SB{uuid.uuid4().hex[:6].upper()}"
    now = datetime.now(timezone.utc)
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO soundbox_devices (id,merchant_id,device_id,serial_number,device_model,firmware_version,location,activation_code,status,volume,language,currency,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending_activation',80,'en','NGN',$9) ON CONFLICT (device_id) DO UPDATE SET merchant_id=$2,updated_at=$9",str(uuid.uuid4()),req.merchant_id,req.device_id,req.serial_number,req.device_model,req.firmware_version,req.location,activation_code,now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"registered":True,"device_id":req.device_id,"merchant_id":req.merchant_id,"activation_code":activation_code,"status":"pending_activation","registered_at":now.isoformat()}

@app.post("/soundbox/configure")
async def configure_device(req: ConfigureDeviceRequest):
    if req.language not in SUPPORTED_LANGUAGES: raise HTTPException(400,f"Unsupported language. Supported: {SUPPORTED_LANGUAGES}")
    if req.currency not in SUPPORTED_CURRENCIES: raise HTTPException(400,f"Unsupported currency. Supported: {SUPPORTED_CURRENCIES}")
    now = datetime.now(timezone.utc)
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("UPDATE soundbox_devices SET volume=$1,language=$2,currency=$3,announcement_template=$4,status='active',updated_at=$5 WHERE device_id=$6",req.volume,req.language,req.currency,req.announcement_template,now,req.device_id)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"success":True,"device_id":req.device_id,"volume":req.volume,"language":req.language,"currency":req.currency,"configured_at":now.isoformat()}

@app.get("/soundbox/devices")
async def list_devices(merchant_id: str = Query(...), page: int = Query(1,ge=1), page_size: int = Query(20)):
    pool = await get_pool()
    rows, total = [], 0
    if pool:
        try:
            async with pool.acquire() as c:
                offset=(page-1)*page_size
                rows=[dict(r) for r in await c.fetch("SELECT * FROM soundbox_devices WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",merchant_id,page_size,offset)]
                cr=await c.fetchrow("SELECT COUNT(*) as n FROM soundbox_devices WHERE merchant_id=$1",merchant_id)
                total=cr["n"] if cr else 0
        except Exception as e: logger.warning(f"DB: {e}")
    return {"devices":rows,"total":total,"page":page}

@app.get("/soundbox/stats")
async def device_stats(merchant_id: str = Query(...)):
    pool = await get_pool()
    stats = {"total_devices":0,"active_devices":0,"transactions_today":0,"revenue_today":0.0}
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT COUNT(*) as total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active FROM soundbox_devices WHERE merchant_id=$1",merchant_id)
                if r: stats["total_devices"],stats["active_devices"] = r["total"],r["active"] or 0
                today = datetime.now(timezone.utc).date()
                tr = await c.fetchrow("SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as rev FROM soundbox_transactions WHERE merchant_id=$1 AND DATE(created_at)=$2",merchant_id,today)
                if tr: stats["transactions_today"],stats["revenue_today"] = tr["cnt"],float(tr["rev"])
        except Exception: pass
    return stats

@app.post("/soundbox/payment-alert")
async def send_payment_alert(req: PaymentAlertRequest):
    now = datetime.now(timezone.utc)
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO soundbox_transactions (id,device_id,transaction_id,amount,currency,created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",str(uuid.uuid4()),req.device_id,req.transaction_id,req.amount,req.currency,now)
        except Exception: pass
    message = f"Payment received: {req.amount:.2f} {req.currency}"
    if req.customer_name: message += f" from {req.customer_name}"
    logger.info(f"[AUDIO] Device {req.device_id}: {message}")
    return {"success":True,"device_id":req.device_id,"message_played":message,"played_at":now.isoformat()}

@app.post("/soundbox/test-audio")
async def test_audio(device_id: str, message: str = "Test payment received"):
    logger.info(f"[TEST AUDIO] Device {device_id}: {message}")
    return {"success":True,"device_id":device_id,"message":message,"tested_at":datetime.now(timezone.utc).isoformat()}

@app.get("/soundbox/alerts")
async def get_alerts(merchant_id: str = Query(...), device_id: Optional[str] = None):
    pool = await get_pool()
    rows = []
    if pool:
        try:
            async with pool.acquire() as c:
                if device_id:
                    rows = [dict(r) for r in await c.fetch("SELECT * FROM soundbox_transactions WHERE merchant_id=$1 AND device_id=$2 ORDER BY created_at DESC LIMIT 50",merchant_id,device_id)]
                else:
                    rows = [dict(r) for r in await c.fetch("SELECT * FROM soundbox_transactions WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 50",merchant_id)]
        except Exception: pass
    return {"alerts":rows,"count":len(rows)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
