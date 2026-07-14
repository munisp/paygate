"""
NextHub Travel Rule Compliance Service
FastAPI microservice for FATF Travel Rule enforcement, VASP identity registry,
and cross-border transaction monitoring.

Integrates with:
- Kafka: paygate.nexthub.remittance topic
- Redis: VASP registry cache
- PostgreSQL: compliance audit log
- Fluvio: real-time compliance event streaming
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
import redis.asyncio as aioredis
import asyncpg

logger = logging.getLogger(__name__)

app = FastAPI(
    title="NextHub Travel Rule Service",
    description="FATF Travel Rule compliance for cross-border transfers",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Configuration ─────────────────────────────────────────────────────────────

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.getenv("PG_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/paygate")
TRAVEL_RULE_THRESHOLD = float(os.getenv("TRAVEL_RULE_THRESHOLD_USD", "1000"))
FLUVIO_ENDPOINT = os.getenv("FLUVIO_ENDPOINT", "localhost:9003")

# ─── Models ────────────────────────────────────────────────────────────────────

class IVMS101NameID(BaseModel):
    primaryIdentifier: str
    secondaryIdentifier: Optional[str] = None
    nameIdentifierType: str = "LEGL"  # ALIA, BIRT, MAID, LEGL, MISC


class IVMS101Person(BaseModel):
    name: dict
    accountNumber: str
    geographicAddress: Optional[dict] = None
    nationalIdentification: Optional[dict] = None
    dateOfBirth: Optional[str] = None
    countryOfResidence: Optional[str] = None


class IVMS101Payload(BaseModel):
    originator: IVMS101Person
    beneficiary: IVMS101Person
    transfer: dict


class TravelRuleVerifyRequest(BaseModel):
    transferId: str = Field(..., description="Transfer ID")
    amount: float = Field(..., description="Transfer amount in source currency")
    sourceCurrency: str = Field(..., description="Source currency code")
    originatorVasp: str = Field(..., description="Originator VASP/DFSP ID")
    beneficiaryVasp: str = Field(..., description="Beneficiary VASP/DFSP ID")
    ivms101Payload: Optional[IVMS101Payload] = None


class VASPRegistration(BaseModel):
    vaspId: str
    name: str
    bic: Optional[str] = None
    lei: Optional[str] = None
    country: str
    travelRuleEndpoint: str
    publicKeyPem: str
    isActive: bool = True


class ComplianceResult(BaseModel):
    transferId: str
    requiresTravelRule: bool
    travelRuleProvided: bool
    isCompliant: bool
    riskScore: float
    flags: list[str]
    checkedAt: datetime


# ─── VASP Registry ─────────────────────────────────────────────────────────────

class VASPRegistry:
    """In-memory + Redis-backed VASP registry."""

    def __init__(self, redis_client):
        self._redis = redis_client
        self._local: dict[str, VASPRegistration] = {}

    async def get(self, vasp_id: str) -> Optional[VASPRegistration]:
        # Try local cache
        if vasp_id in self._local:
            return self._local[vasp_id]

        # Try Redis
        key = f"vasp:{vasp_id}"
        data = await self._redis.get(key)
        if data:
            reg = VASPRegistration(**json.loads(data))
            self._local[vasp_id] = reg
            return reg

        return None

    async def register(self, reg: VASPRegistration) -> None:
        self._local[reg.vaspId] = reg
        key = f"vasp:{reg.vaspId}"
        await self._redis.setex(key, 3600, reg.model_dump_json())

    async def list_all(self) -> list[VASPRegistration]:
        return list(self._local.values())


# ─── Compliance Engine ─────────────────────────────────────────────────────────

class TravelRuleComplianceEngine:
    """
    Evaluates Travel Rule compliance for cross-border transfers.
    Applies FATF Recommendation 16 rules.
    """

    THRESHOLD_USD = TRAVEL_RULE_THRESHOLD

    # High-risk jurisdictions (FATF grey/black list)
    HIGH_RISK_COUNTRIES = {
        "KP", "IR", "MM", "SY", "YE", "LY", "SO", "SS",
        "CF", "CD", "ML", "NI", "PK", "PA", "HT",
    }

    # Sanctioned entity patterns (simplified — production uses OFAC/UN SDN list)
    SANCTIONED_PATTERNS = ["OFAC_MATCH", "UN_SDN", "EU_SANCTIONS"]

    def evaluate(self, req: TravelRuleVerifyRequest) -> ComplianceResult:
        flags: list[str] = []
        risk_score = 0.0

        requires_travel_rule = req.amount >= self.THRESHOLD_USD

        # Check if Travel Rule data is provided when required
        travel_rule_provided = req.ivms101Payload is not None

        if requires_travel_rule and not travel_rule_provided:
            flags.append("TRAVEL_RULE_DATA_MISSING")
            risk_score += 40.0

        # Validate IVMS 101 payload if provided
        if travel_rule_provided and req.ivms101Payload:
            payload = req.ivms101Payload

            # Check originator completeness
            if not payload.originator.accountNumber:
                flags.append("ORIGINATOR_ACCOUNT_MISSING")
                risk_score += 20.0

            if not payload.originator.name.get("nameIdentifiers"):
                flags.append("ORIGINATOR_NAME_MISSING")
                risk_score += 20.0

            # Check beneficiary completeness
            if not payload.beneficiary.accountNumber:
                flags.append("BENEFICIARY_ACCOUNT_MISSING")
                risk_score += 20.0

            if not payload.beneficiary.name.get("nameIdentifiers"):
                flags.append("BENEFICIARY_NAME_MISSING")
                risk_score += 20.0

            # Check for high-risk jurisdictions
            transfer_data = payload.transfer
            originator_country = transfer_data.get("originatorVASP", {}).get("country", "")
            beneficiary_country = transfer_data.get("beneficiaryVASP", {}).get("country", "")

            if originator_country in self.HIGH_RISK_COUNTRIES:
                flags.append(f"HIGH_RISK_ORIGINATOR_COUNTRY:{originator_country}")
                risk_score += 30.0

            if beneficiary_country in self.HIGH_RISK_COUNTRIES:
                flags.append(f"HIGH_RISK_BENEFICIARY_COUNTRY:{beneficiary_country}")
                risk_score += 30.0

        # High-value transfer flag
        if req.amount >= 10000:
            flags.append("HIGH_VALUE_TRANSFER")
            risk_score += 10.0

        # Round-number flag (structuring indicator)
        if req.amount % 1000 == 0 and req.amount >= 5000:
            flags.append("ROUND_NUMBER_STRUCTURING_INDICATOR")
            risk_score += 5.0

        is_compliant = (
            (not requires_travel_rule or travel_rule_provided)
            and "TRAVEL_RULE_DATA_MISSING" not in flags
            and risk_score < 50.0
        )

        return ComplianceResult(
            transferId=req.transferId,
            requiresTravelRule=requires_travel_rule,
            travelRuleProvided=travel_rule_provided,
            isCompliant=is_compliant,
            riskScore=min(risk_score, 100.0),
            flags=flags,
            checkedAt=datetime.now(timezone.utc),
        )


# ─── Application State ─────────────────────────────────────────────────────────

redis_client: Optional[aioredis.Redis] = None
vasp_registry: Optional[VASPRegistry] = None
compliance_engine = TravelRuleComplianceEngine()
kafka_producer: Optional[AIOKafkaProducer] = None
db_pool: Optional[asyncpg.Pool] = None


@app.on_event("startup")
async def startup():
    global redis_client, vasp_registry, kafka_producer, db_pool

    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    vasp_registry = VASPRegistry(redis_client)

    try:
        kafka_producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP,
            value_serializer=lambda v: json.dumps(v).encode(),
        )
        await kafka_producer.start()
    except Exception as e:
        logger.warning(f"Kafka producer startup failed (non-fatal): {e}")

    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    except Exception as e:
        logger.warning(f"Database pool startup failed (non-fatal): {e}")

    logger.info("Travel Rule Service started")


@app.on_event("shutdown")
async def shutdown():
    if kafka_producer:
        await kafka_producer.stop()
    if db_pool:
        await db_pool.close()
    if redis_client:
        await redis_client.close()


# ─── API Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "travel-rule", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/compliance/verify", response_model=ComplianceResult)
async def verify_compliance(req: TravelRuleVerifyRequest, background_tasks: BackgroundTasks):
    """Verify Travel Rule compliance for a transfer."""
    result = compliance_engine.evaluate(req)

    # Persist audit log in background
    background_tasks.add_task(persist_audit_log, req, result)

    # Publish compliance event to Kafka
    if kafka_producer:
        try:
            event = {
                "eventType": "travel_rule.verified",
                "transferId": req.transferId,
                "isCompliant": result.isCompliant,
                "riskScore": result.riskScore,
                "flags": result.flags,
                "timestamp": result.checkedAt.isoformat(),
            }
            await kafka_producer.send("paygate.nexthub.compliance", value=event)
        except Exception as e:
            logger.warning(f"Failed to publish compliance event: {e}")

    return result


@app.post("/vasps/register")
async def register_vasp(reg: VASPRegistration):
    """Register a VASP/DFSP in the Travel Rule registry."""
    await vasp_registry.register(reg)
    return {"message": f"VASP {reg.vaspId} registered", "vaspId": reg.vaspId}


@app.get("/vasps/{vasp_id}")
async def get_vasp(vasp_id: str):
    """Get a VASP registration."""
    reg = await vasp_registry.get(vasp_id)
    if not reg:
        raise HTTPException(status_code=404, detail=f"VASP {vasp_id} not found")
    return reg


@app.get("/vasps")
async def list_vasps():
    """List all registered VASPs."""
    return await vasp_registry.list_all()


@app.post("/compliance/screen")
async def screen_entity(name: str, account: str, country: str):
    """Screen an entity against sanctions lists."""
    # Simplified screening — production integrates OFAC/UN SDN API
    risk_indicators = []

    if country in TravelRuleComplianceEngine.HIGH_RISK_COUNTRIES:
        risk_indicators.append(f"HIGH_RISK_COUNTRY:{country}")

    # Hash-based pseudonymous screening (production uses actual SDN list)
    entity_hash = hashlib.sha256(f"{name}:{account}".lower().encode()).hexdigest()

    return {
        "name": name,
        "account": account,
        "country": country,
        "entityHash": entity_hash,
        "riskIndicators": risk_indicators,
        "isSanctioned": False,  # Production: check against OFAC/UN SDN
        "screenedAt": datetime.now(timezone.utc).isoformat(),
    }


# ─── Helpers ───────────────────────────────────────────────────────────────────

async def persist_audit_log(req: TravelRuleVerifyRequest, result: ComplianceResult):
    """Persist compliance audit log to PostgreSQL."""
    if not db_pool:
        return
    try:
        async with db_pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO travel_rule_audit_log
                    (transfer_id, amount, source_currency, originator_vasp, beneficiary_vasp,
                     requires_travel_rule, travel_rule_provided, is_compliant, risk_score, flags, checked_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (transfer_id) DO UPDATE SET
                    is_compliant = EXCLUDED.is_compliant,
                    risk_score = EXCLUDED.risk_score,
                    flags = EXCLUDED.flags,
                    checked_at = EXCLUDED.checked_at
                """,
                req.transferId, req.amount, req.sourceCurrency,
                req.originatorVasp, req.beneficiaryVasp,
                result.requiresTravelRule, result.travelRuleProvided,
                result.isCompliant, result.riskScore,
                json.dumps(result.flags), result.checkedAt,
            )
    except Exception as e:
        logger.error(f"Failed to persist audit log: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8091")))
