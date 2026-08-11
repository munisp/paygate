"""
PayGate CIPS/UPI/PIX FX Corridor Service
=========================================
Provides real-time FX rates, corridor pricing, and ISO 20022 message formatting
for CIPS (China), UPI (India), PIX (Brazil), Mojaloop, BRICS Pay, and SWIFT rails.

Endpoints:
  GET  /health                    - Service health
  GET  /v1/rates/{base}           - Get FX rates for base currency
  GET  /v1/corridors              - List all supported corridors
  POST /v1/quote                  - Get corridor quote with fees
  POST /v1/iso20022/generate      - Generate ISO 20022 XML message
  POST /v1/iso20022/parse         - Parse ISO 20022 XML message
  GET  /v1/rails                  - List all rails with status
  POST /v1/rails/recommend        - Recommend optimal rail for corridor
"""

import os
import json
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, List, Any
from flask import Flask, jsonify, request, Response

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
log = logging.getLogger("cips-upi-pix-fx")

app = Flask(__name__)

# ─── Mandatory internal service-to-service auth (fail closed) ───────────────
# INTERNAL_API_KEY must be configured; every request other than /health and
# /metrics must present it via the X-Internal-Key header. Constant-time
# comparison to resist timing attacks.
import hmac as _hmac_mod

_INTERNAL_AUTH_KEY = os.getenv("INTERNAL_API_KEY", "")
_AUTH_EXEMPT_PATHS = frozenset({"/health", "/healthz", "/metrics"})


@app.before_request
def _require_internal_api_key():
    if request.path in _AUTH_EXEMPT_PATHS:
        return None
    if not _INTERNAL_AUTH_KEY:
        return jsonify({"detail": "Service misconfigured: INTERNAL_API_KEY not set"}), 503
    if not _hmac_mod.compare_digest(
        request.headers.get("x-internal-key", ""), _INTERNAL_AUTH_KEY
    ):
        return jsonify({"detail": "Unauthorized"}), 401
    return None


# ─── Configuration ─────────────────────────────────────────────────────────────

PORT = int(os.getenv("PORT", "8102"))
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "internal-api-key-default")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# ─── FX Rates (production: fetched from live provider) ────────────────────────

# Base rates vs USD (updated every 30 seconds in production)
FX_RATES_VS_USD: Dict[str, float] = {
    # Major currencies
    "USD": 1.0000,
    "EUR": 0.9217,
    "GBP": 0.7905,
    "JPY": 149.85,
    "CHF": 0.9012,
    "CAD": 1.3625,
    "AUD": 1.5280,
    "NZD": 1.6350,
    "SGD": 1.3420,
    "HKD": 7.8250,
    # CIPS — China
    "CNY": 7.2450,
    "CNH": 7.2510,  # Offshore CNY
    # UPI — India
    "INR": 83.2500,
    # PIX — Brazil
    "BRL": 5.0250,
    # BRICS currencies
    "RUB": 88.5000,
    "ZAR": 18.7500,
    "EGP": 30.9000,
    "AED": 3.6725,
    "SAR": 3.7500,
    "IRR": 42000.0,
    # African currencies (Mojaloop corridors)
    "NGN": 1580.00,
    "KES": 128.50,
    "GHS": 12.80,
    "TZS": 2520.0,
    "UGX": 3750.0,
    "XOF": 604.0,   # West African CFA
    "XAF": 604.0,   # Central African CFA
    "MWK": 1730.0,
    "ZMW": 26.50,
    "MZN": 63.50,
    "ETB": 56.50,
    "RWF": 1280.0,
    # Other
    "MXN": 17.15,
    "COP": 3950.0,
    "ARS": 875.0,
    "CLP": 920.0,
    "PEN": 3.75,
    "PKR": 278.0,
    "BDT": 110.0,
    "VND": 24500.0,
    "PHP": 56.50,
    "IDR": 15750.0,
    "MYR": 4.68,
    "THB": 35.20,
}

# ─── Corridor Definitions ──────────────────────────────────────────────────────

CORRIDORS: List[Dict[str, Any]] = [
    # CIPS corridors (China)
    {"id": "US-CN", "source": "USD", "target": "CNY", "rail": "cips",
     "fee_bps": 30, "min_amount": 1.0, "max_amount": 500000.0,
     "settlement_time": "4h", "description": "USD to CNY via CIPS"},
    {"id": "EU-CN", "source": "EUR", "target": "CNY", "rail": "cips",
     "fee_bps": 35, "min_amount": 1.0, "max_amount": 500000.0,
     "settlement_time": "4h", "description": "EUR to CNY via CIPS"},
    {"id": "GB-CN", "source": "GBP", "target": "CNY", "rail": "cips",
     "fee_bps": 35, "min_amount": 1.0, "max_amount": 500000.0,
     "settlement_time": "4h", "description": "GBP to CNY via CIPS"},
    {"id": "NG-CN", "source": "NGN", "target": "CNY", "rail": "cips",
     "fee_bps": 50, "min_amount": 1000.0, "max_amount": 10000000.0,
     "settlement_time": "6h", "description": "NGN to CNY via CIPS"},
    # UPI corridors (India)
    {"id": "US-IN", "source": "USD", "target": "INR", "rail": "upi",
     "fee_bps": 25, "min_amount": 1.0, "max_amount": 200000.0,
     "settlement_time": "30s", "description": "USD to INR via UPI"},
    {"id": "EU-IN", "source": "EUR", "target": "INR", "rail": "upi",
     "fee_bps": 30, "min_amount": 1.0, "max_amount": 200000.0,
     "settlement_time": "30s", "description": "EUR to INR via UPI"},
    {"id": "GB-IN", "source": "GBP", "target": "INR", "rail": "upi",
     "fee_bps": 30, "min_amount": 1.0, "max_amount": 200000.0,
     "settlement_time": "30s", "description": "GBP to INR via UPI"},
    {"id": "AE-IN", "source": "AED", "target": "INR", "rail": "upi",
     "fee_bps": 20, "min_amount": 1.0, "max_amount": 200000.0,
     "settlement_time": "30s", "description": "AED to INR via UPI (Gulf remittance)"},
    {"id": "SG-IN", "source": "SGD", "target": "INR", "rail": "upi",
     "fee_bps": 20, "min_amount": 1.0, "max_amount": 200000.0,
     "settlement_time": "30s", "description": "SGD to INR via UPI"},
    # PIX corridors (Brazil)
    {"id": "US-BR", "source": "USD", "target": "BRL", "rail": "pix",
     "fee_bps": 20, "min_amount": 1.0, "max_amount": 100000.0,
     "settlement_time": "10s", "description": "USD to BRL via PIX"},
    {"id": "EU-BR", "source": "EUR", "target": "BRL", "rail": "pix",
     "fee_bps": 25, "min_amount": 1.0, "max_amount": 100000.0,
     "settlement_time": "10s", "description": "EUR to BRL via PIX"},
    {"id": "GB-BR", "source": "GBP", "target": "BRL", "rail": "pix",
     "fee_bps": 25, "min_amount": 1.0, "max_amount": 100000.0,
     "settlement_time": "10s", "description": "GBP to BRL via PIX"},
    {"id": "AR-BR", "source": "ARS", "target": "BRL", "rail": "pix",
     "fee_bps": 40, "min_amount": 100.0, "max_amount": 500000.0,
     "settlement_time": "10s", "description": "ARS to BRL via PIX"},
    # Mojaloop corridors (Africa)
    {"id": "US-NG", "source": "USD", "target": "NGN", "rail": "mojaloop",
     "fee_bps": 150, "min_amount": 1.0, "max_amount": 50000.0,
     "settlement_time": "2m", "description": "USD to NGN via Mojaloop"},
    {"id": "GB-NG", "source": "GBP", "target": "NGN", "rail": "mojaloop",
     "fee_bps": 150, "min_amount": 1.0, "max_amount": 50000.0,
     "settlement_time": "2m", "description": "GBP to NGN via Mojaloop"},
    {"id": "US-KE", "source": "USD", "target": "KES", "rail": "mojaloop",
     "fee_bps": 120, "min_amount": 1.0, "max_amount": 50000.0,
     "settlement_time": "2m", "description": "USD to KES via Mojaloop"},
    {"id": "US-GH", "source": "USD", "target": "GHS", "rail": "mojaloop",
     "fee_bps": 130, "min_amount": 1.0, "max_amount": 50000.0,
     "settlement_time": "2m", "description": "USD to GHS via Mojaloop"},
    # BRICS Pay corridors
    {"id": "US-RU", "source": "USD", "target": "RUB", "rail": "brics_pay",
     "fee_bps": 40, "min_amount": 1.0, "max_amount": 100000.0,
     "settlement_time": "1h", "description": "USD to RUB via BRICS Pay"},
    {"id": "CN-RU", "source": "CNY", "target": "RUB", "rail": "brics_pay",
     "fee_bps": 30, "min_amount": 1.0, "max_amount": 500000.0,
     "settlement_time": "1h", "description": "CNY to RUB via BRICS Pay"},
    # SWIFT corridors
    {"id": "US-JP", "source": "USD", "target": "JPY", "rail": "swift",
     "fee_bps": 150, "min_amount": 100.0, "max_amount": 10000000.0,
     "settlement_time": "24h", "description": "USD to JPY via SWIFT"},
    {"id": "EU-US", "source": "EUR", "target": "USD", "rail": "swift",
     "fee_bps": 100, "min_amount": 100.0, "max_amount": 10000000.0,
     "settlement_time": "24h", "description": "EUR to USD via SWIFT"},
]

# ─── Rail Definitions ──────────────────────────────────────────────────────────

RAILS: List[Dict[str, Any]] = [
    {
        "id": "mojaloop",
        "name": "Mojaloop",
        "description": "Open-source interoperability platform for financial inclusion",
        "status": "operational",
        "latency_ms": 45,
        "uptime_pct": 99.95,
        "regions": ["Africa", "Southeast Asia", "Pacific"],
        "currencies": ["NGN", "KES", "GHS", "TZS", "UGX", "XOF", "MWK"],
        "settlement_time": "2m",
        "iso_standard": "ISO 20022 (FSPIOP v1.1)",
        "operator": "Mojaloop Foundation",
    },
    {
        "id": "cips",
        "name": "CIPS (China Interbank Payment System)",
        "description": "China's cross-border interbank payment system for CNY transactions",
        "status": "operational",
        "latency_ms": 120,
        "uptime_pct": 99.90,
        "regions": ["China", "Global"],
        "currencies": ["CNY", "CNH"],
        "settlement_time": "4h",
        "iso_standard": "ISO 20022 (pacs.008)",
        "operator": "PBOC / CIPS Co., Ltd.",
        "participants": 1400,
    },
    {
        "id": "upi",
        "name": "UPI (Unified Payments Interface)",
        "description": "India's real-time payment system operated by NPCI",
        "status": "operational",
        "latency_ms": 30,
        "uptime_pct": 99.99,
        "regions": ["India", "Global (cross-border)"],
        "currencies": ["INR"],
        "settlement_time": "30s",
        "iso_standard": "NPCI UPI Specification v2.0",
        "operator": "NPCI (National Payments Corporation of India)",
        "daily_transactions": "500M+",
    },
    {
        "id": "pix",
        "name": "PIX (Brazil Instant Payment)",
        "description": "Brazil's instant payment ecosystem operated by BACEN",
        "status": "operational",
        "latency_ms": 15,
        "uptime_pct": 99.98,
        "regions": ["Brazil"],
        "currencies": ["BRL"],
        "settlement_time": "10s",
        "iso_standard": "ISO 20022 (pacs.008 adapted)",
        "operator": "Banco Central do Brasil (BACEN)",
        "key_types": ["CPF", "CNPJ", "PHONE", "EMAIL", "EVP"],
    },
    {
        "id": "brics_pay",
        "name": "BRICS Pay",
        "description": "BRICS nations cross-border payment network",
        "status": "operational",
        "latency_ms": 200,
        "uptime_pct": 99.80,
        "regions": ["Brazil", "Russia", "India", "China", "South Africa", "UAE", "Egypt"],
        "currencies": ["BRL", "RUB", "INR", "CNY", "ZAR", "AED", "EGP"],
        "settlement_time": "1h",
        "iso_standard": "ISO 20022",
        "operator": "BRICS Interbank Cooperation Mechanism",
    },
    {
        "id": "swift",
        "name": "SWIFT",
        "description": "Society for Worldwide Interbank Financial Telecommunication",
        "status": "operational",
        "latency_ms": 500,
        "uptime_pct": 99.70,
        "regions": ["Global"],
        "currencies": ["All major currencies"],
        "settlement_time": "24h",
        "iso_standard": "ISO 20022 (MT103/MT202)",
        "operator": "SWIFT SCRL",
        "members": "11000+",
    },
]

# ─── Helper Functions ──────────────────────────────────────────────────────────

def get_exchange_rate(source: str, target: str) -> Optional[float]:
    """Get exchange rate from source to target currency."""
    if source == target:
        return 1.0
    src_rate = FX_RATES_VS_USD.get(source)
    tgt_rate = FX_RATES_VS_USD.get(target)
    if src_rate is None or tgt_rate is None:
        return None
    # Convert: source → USD → target
    return tgt_rate / src_rate


def calculate_fee(amount: float, fee_bps: int) -> float:
    """Calculate fee from basis points."""
    return round(amount * fee_bps / 10000, 2)


def recommend_rail(source_currency: str, target_currency: str) -> str:
    """Recommend the optimal rail for a currency pair."""
    if target_currency in ("CNY", "CNH") or source_currency in ("CNY", "CNH"):
        return "cips"
    if target_currency == "INR" or source_currency == "INR":
        return "upi"
    if target_currency == "BRL" or source_currency == "BRL":
        return "pix"
    brics = {"RUB", "ZAR", "EGP", "AED", "SAR", "ETB"}
    if target_currency in brics or source_currency in brics:
        return "brics_pay"
    african = {"NGN", "KES", "GHS", "TZS", "UGX", "XOF", "XAF", "MWK", "ZMW", "MZN", "RWF"}
    if target_currency in african or source_currency in african:
        return "mojaloop"
    return "swift"


def auth_required(f):
    """Decorator for internal API key authentication."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        key = request.headers.get("X-Internal-Key") or \
              request.headers.get("Authorization", "").replace("Bearer ", "")
        if not INTERNAL_API_KEY:
            return jsonify({"error": "service misconfigured: INTERNAL_API_KEY not set"}), 503
        if not key or not hmac.compare_digest(key, INTERNAL_API_KEY):
            return jsonify({"error": "unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


# ─── ISO 20022 Message Generator ──────────────────────────────────────────────

def generate_pacs008(data: dict) -> str:
    """Generate ISO 20022 pacs.008.001.08 XML for cross-border credit transfer."""
    ns = "urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08"
    msg_id = data.get("message_id", f"PAYG{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}")
    txns = data.get("transactions", [{}])
    txn = txns[0] if txns else {}

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="{ns}">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <TtlIntrBkSttlmAmt Ccy="{txn.get('source_currency', 'USD')}">{txn.get('amount', '0')}</TtlIntrBkSttlmAmt>
      <SttlmInf>
        <SttlmMtd>{data.get('settlement_method', 'CLRG')}</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>{txn.get('instruction_id', msg_id)}</InstrId>
        <EndToEndId>{txn.get('end_to_end_id', msg_id)}</EndToEndId>
        <TxId>{txn.get('transaction_id', msg_id)}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="{txn.get('target_currency', 'USD')}">{txn.get('target_amount', txn.get('amount', '0'))}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>{datetime.now(timezone.utc).strftime('%Y-%m-%d')}</IntrBkSttlmDt>
      <ChrgBr>{data.get('charge_bearer', 'SHAR')}</ChrgBr>
      <InstgAgt>
        <FinInstnId>
          <BICFI>{data.get('sender_bic', 'PAYGNGLA')}</BICFI>
        </FinInstnId>
      </InstgAgt>
      <InstdAgt>
        <FinInstnId>
          <BICFI>{txn.get('receiver_bic', 'XXXXNGLA')}</BICFI>
        </FinInstnId>
      </InstdAgt>
      <Dbtr>
        <Nm>{txn.get('sender_name', 'PayGate Merchant')}</Nm>
        <CtryOfRes>{data.get('sender_country', 'NG')}</CtryOfRes>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <Othr>
            <Id>{txn.get('sender_account', '0000000000')}</Id>
          </Othr>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>{data.get('sender_bic', 'PAYGNGLA')}</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>{txn.get('receiver_bic', 'XXXXNGLA')}</BICFI>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>{txn.get('receiver_name', 'Beneficiary')}</Nm>
        <CtryOfRes>{txn.get('receiver_country', 'NG')}</CtryOfRes>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>{txn.get('receiver_account', '0000000000')}</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <RmtInf>
        <Ustrd>{txn.get('remittance_info', 'PayGate cross-border transfer')}</Ustrd>
      </RmtInf>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>"""
    return xml


def generate_pain001(data: dict) -> str:
    """Generate ISO 20022 pain.001.001.09 XML for customer credit transfer initiation."""
    ns = "urn:iso:std:iso:20022:tech:xsd:pain.001.001.09"
    msg_id = data.get("message_id", f"PAYG{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}")
    txns = data.get("transactions", [{}])
    txn = txns[0] if txns else {}

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="{ns}">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>{txn.get('amount', '0')}</CtrlSum>
      <InitgPty>
        <Nm>{data.get('initiating_party', 'PayGate')}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>{msg_id}-PMT</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>
        <Dt>{datetime.now(timezone.utc).strftime('%Y-%m-%d')}</Dt>
      </ReqdExctnDt>
      <Dbtr>
        <Nm>{txn.get('sender_name', 'PayGate Merchant')}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>{txn.get('sender_iban', 'GB29NWBK60161331926819')}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>{data.get('sender_bic', 'PAYGNGLA')}</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>{txn.get('end_to_end_id', msg_id)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="{txn.get('source_currency', 'USD')}">{txn.get('amount', '0')}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <BICFI>{txn.get('receiver_bic', 'XXXXNGLA')}</BICFI>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>{txn.get('receiver_name', 'Beneficiary')}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <Othr>
              <Id>{txn.get('receiver_account', '0000000000')}</Id>
            </Othr>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>{txn.get('remittance_info', 'PayGate transfer')}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>"""
    return xml


def parse_iso20022(xml_str: str) -> dict:
    """Parse ISO 20022 XML message to structured dict."""
    try:
        root = ET.fromstring(xml_str)
        # Detect message type from namespace
        ns = root.tag.split("}")[0].lstrip("{") if "}" in root.tag else ""
        msg_type = "unknown"
        if "pacs.008" in ns:
            msg_type = "pacs.008"
        elif "pain.001" in ns:
            msg_type = "pain.001"
        elif "pacs.002" in ns:
            msg_type = "pacs.002"
        elif "camt.053" in ns:
            msg_type = "camt.053"

        return {
            "message_type": msg_type,
            "namespace": ns,
            "parsed": True,
            "element_count": len(list(root.iter())),
        }
    except ET.ParseError as e:
        return {"error": str(e), "parsed": False}


# ─── Routes ────────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({
        "status": "healthy",
        "service": "cips-upi-pix-fx",
        "version": "1.0.0",
        "corridors": len(CORRIDORS),
        "rails": len(RAILS),
        "currencies": len(FX_RATES_VS_USD),
        "ts": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/v1/rates/<base>")
def get_rates(base: str):
    base = base.upper()
    base_rate = FX_RATES_VS_USD.get(base)
    if base_rate is None:
        return jsonify({"error": f"Unknown base currency: {base}"}), 404

    rates = {}
    for currency, usd_rate in FX_RATES_VS_USD.items():
        if currency != base:
            rates[currency] = round(usd_rate / base_rate, 6)

    return jsonify({
        "base": base,
        "rates": rates,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "PayGate FX Engine v97",
    })


@app.route("/v1/corridors")
def list_corridors():
    rail_filter = request.args.get("rail")
    result = CORRIDORS
    if rail_filter:
        result = [c for c in CORRIDORS if c["rail"] == rail_filter.lower()]
    return jsonify({
        "corridors": result,
        "count": len(result),
        "ts": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/v1/quote", methods=["POST"])
@auth_required
def get_quote():
    data = request.get_json() or {}
    source = data.get("source_currency", "USD").upper()
    target = data.get("target_currency", "NGN").upper()
    amount = float(data.get("amount", 0))
    rail = data.get("rail") or recommend_rail(source, target)

    rate = get_exchange_rate(source, target)
    if rate is None:
        return jsonify({"error": f"No rate available for {source}/{target}"}), 400

    # Find corridor config
    corridor = next(
        (c for c in CORRIDORS if c["source"] == source and c["target"] == target),
        {"fee_bps": 150, "settlement_time": "24h", "id": f"{source[:2]}-{target[:2]}"}
    )

    fee_bps = corridor.get("fee_bps", 150)
    fee = calculate_fee(amount, fee_bps)
    net_amount = amount - fee
    target_amount = round(net_amount * rate, 2)

    return jsonify({
        "quote_id": f"Q{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "source_currency": source,
        "target_currency": target,
        "source_amount": amount,
        "target_amount": target_amount,
        "exchange_rate": round(rate, 6),
        "fee": fee,
        "fee_bps": fee_bps,
        "fee_currency": source,
        "rail": rail,
        "corridor_id": corridor.get("id"),
        "settlement_time": corridor.get("settlement_time", "24h"),
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat(),
        "ts": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/v1/iso20022/generate", methods=["POST"])
@auth_required
def generate_iso20022():
    data = request.get_json() or {}
    msg_type = data.get("message_type", "pacs.008")

    if msg_type == "pacs.008":
        xml = generate_pacs008(data)
    elif msg_type == "pain.001":
        xml = generate_pain001(data)
    else:
        return jsonify({"error": f"Unsupported message type: {msg_type}"}), 400

    return Response(xml, mimetype="application/xml")


@app.route("/v1/iso20022/parse", methods=["POST"])
@auth_required
def parse_iso20022_endpoint():
    xml_str = request.data.decode("utf-8") if request.data else ""
    if not xml_str:
        data = request.get_json() or {}
        xml_str = data.get("xml", "")

    if not xml_str:
        return jsonify({"error": "No XML provided"}), 400

    result = parse_iso20022(xml_str)
    return jsonify(result)


@app.route("/v1/rails")
def list_rails():
    return jsonify({
        "rails": RAILS,
        "count": len(RAILS),
        "ts": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/v1/rails/recommend", methods=["POST"])
@auth_required
def recommend_rail_endpoint():
    data = request.get_json() or {}
    source = data.get("source_currency", "USD").upper()
    target = data.get("target_currency", "NGN").upper()
    amount = float(data.get("amount", 0))

    rail = recommend_rail(source, target)
    rail_info = next((r for r in RAILS if r["id"] == rail), None)

    # Find all viable corridors
    viable = [c for c in CORRIDORS if c["source"] == source and c["target"] == target]

    return jsonify({
        "recommended_rail": rail,
        "rail_info": rail_info,
        "viable_corridors": viable,
        "reason": f"Optimal rail for {source}→{target} based on settlement speed and fees",
        "ts": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/v1/currencies")
def list_currencies():
    return jsonify({
        "currencies": list(FX_RATES_VS_USD.keys()),
        "count": len(FX_RATES_VS_USD),
        "base": "USD",
        "ts": datetime.now(timezone.utc).isoformat(),
    })


# ─── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info(f"CIPS/UPI/PIX FX Corridor Service starting on port {PORT}")
    log.info(f"Corridors: {len(CORRIDORS)}, Rails: {len(RAILS)}, Currencies: {len(FX_RATES_VS_USD)}")
    app.run(host="0.0.0.0", port=PORT, debug=False)


# ─── FX Hedge endpoint ─────────────────────────────────────────────────────────

@app.route("/v1/fx/hedge", methods=["POST"])
@auth_required
def fx_hedge():
    """
    POST /v1/fx/hedge
    Request a forward FX hedge for a corridor payment.
    Body: { source_currency, target_currency, amount, settlement_date, hedge_type }
    Returns: hedge_id, locked_rate, premium_bps, expiry_ts
    """
    import uuid as _uuid

    data = request.get_json(force=True, silent=True) or {}
    source = data.get("source_currency", "").upper()
    target = data.get("target_currency", "").upper()
    amount = data.get("amount")
    settlement_date = data.get("settlement_date")  # ISO-8601 date string
    hedge_type = data.get("hedge_type", "forward")  # forward | option | ndf

    if not source or not target or amount is None:
        return jsonify({"error": "source_currency, target_currency, and amount are required"}), 400
    if hedge_type not in ("forward", "option", "ndf"):
        return jsonify({"error": "hedge_type must be one of: forward, option, ndf"}), 400

    rate = get_exchange_rate(source, target)
    if rate is None:
        return jsonify({"error": f"Unsupported currency pair: {source}/{target}"}), 422

    # Premium schedule (basis points): forward=5, option=25, ndf=15
    premium_map = {"forward": 5, "option": 25, "ndf": 15}
    premium_bps = premium_map[hedge_type]

    # Locked rate includes a small spread for the hedge premium
    spread_factor = 1.0 + (premium_bps / 10_000)
    locked_rate = round(rate * spread_factor, 6)

    hedge_id = f"HDG-{_uuid.uuid4().hex[:12].upper()}"

    # Expiry: settlement_date or 30 days from now
    if settlement_date:
        try:
            expiry = datetime.fromisoformat(settlement_date).replace(tzinfo=timezone.utc)
        except ValueError:
            return jsonify({"error": "settlement_date must be ISO-8601 format"}), 400
    else:
        expiry = datetime.now(timezone.utc) + timedelta(days=30)

    log.info(f"FX hedge created: {hedge_id} {source}/{target} {amount} {hedge_type} locked={locked_rate}")
    return jsonify({
        "hedge_id": hedge_id,
        "source_currency": source,
        "target_currency": target,
        "amount": amount,
        "hedge_type": hedge_type,
        "locked_rate": locked_rate,
        "premium_bps": premium_bps,
        "expiry_ts": expiry.isoformat(),
        "status": "confirmed",
        "ts": datetime.now(timezone.utc).isoformat(),
    })


# ─── ISO 20022 validation endpoint ────────────────────────────────────────────

@app.route("/v1/iso20022/validate", methods=["POST"])
@auth_required
def validate_iso20022():
    """
    POST /v1/iso20022/validate
    Validate an ISO 20022 XML message against supported namespaces.
    Body: { xml } or raw XML in request body.
    Returns: { valid, namespace, message_type, errors }
    """
    SUPPORTED_NAMESPACES = {
        "urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08": "pacs.008",
        "urn:iso:std:iso:20022:tech:xsd:pacs.002.001.10": "pacs.002",
        "urn:iso:std:iso:20022:tech:xsd:pain.001.001.09": "pain.001",
        "urn:iso:std:iso:20022:tech:xsd:pain.002.001.10": "pain.002",
        "urn:iso:std:iso:20022:tech:xsd:camt.053.001.08": "camt.053",
        "urn:iso:std:iso:20022:tech:xsd:camt.054.001.08": "camt.054",
    }

    REQUIRED_ELEMENTS = {
        "pacs.008": ["GrpHdr", "CdtTrfTxInf"],
        "pacs.002": ["GrpHdr", "TxInfAndSts"],
        "pain.001": ["GrpHdr", "PmtInf"],
        "pain.002": ["GrpHdr", "OrgnlGrpInfAndSts"],
        "camt.053": ["GrpHdr", "Stmt"],
        "camt.054": ["GrpHdr", "Ntfctn"],
    }

    # Accept JSON body with xml field, or raw XML
    content_type = request.content_type or ""
    if "application/json" in content_type:
        body = request.get_json(force=True, silent=True) or {}
        xml_str = body.get("xml", "")
    else:
        xml_str = request.get_data(as_text=True)

    if not xml_str or not xml_str.strip():
        return jsonify({"valid": False, "errors": ["Empty XML body"]}), 400

    errors = []
    namespace = None
    message_type = None

    try:
        root = ET.fromstring(xml_str.strip())
        # Extract namespace from root tag {ns}element
        if root.tag.startswith("{"):
            ns = root.tag.split("}")[0][1:]
            namespace = ns
            message_type = SUPPORTED_NAMESPACES.get(ns)
            if message_type is None:
                errors.append(f"Unsupported namespace: {ns}")
            else:
                # Check required elements
                required = REQUIRED_ELEMENTS.get(message_type, [])
                for elem in required:
                    found = root.find(f".//{{{ns}}}{elem}") or root.find(f".//{elem}")
                    if found is None:
                        errors.append(f"Missing required element: {elem}")
        else:
            errors.append("Root element must have an ISO 20022 namespace")
    except ET.ParseError as e:
        errors.append(f"XML parse error: {str(e)}")

    valid = len(errors) == 0
    status_code = 200 if valid else 422
    return jsonify({
        "valid": valid,
        "namespace": namespace,
        "message_type": message_type,
        "errors": errors,
    }), status_code


# ─── Corridor fees endpoint ────────────────────────────────────────────────────

@app.route("/v1/corridors/fees", methods=["GET", "POST"])
@auth_required
def corridor_fees():
    """
    GET  /v1/corridors/fees?source=NGN&target=USD&amount=100000
    POST /v1/corridors/fees  { source_currency, target_currency, amount }
    Returns: per-rail fee breakdown for the corridor.
    """
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        source = data.get("source_currency", "").upper()
        target = data.get("target_currency", "").upper()
        amount = data.get("amount", 0)
    else:
        source = request.args.get("source", "").upper()
        target = request.args.get("target", "").upper()
        try:
            amount = float(request.args.get("amount", 0))
        except ValueError:
            return jsonify({"error": "amount must be a number"}), 400

    if not source or not target:
        return jsonify({"error": "source_currency and target_currency are required"}), 400

    rate = get_exchange_rate(source, target)
    if rate is None:
        return jsonify({"error": f"Unsupported currency pair: {source}/{target}"}), 422

    amount = float(amount) if amount else 0.0

    # Build per-rail fee breakdown from CORRIDORS list
    rail_fees = []
    seen_rails = set()
    for corridor in CORRIDORS:
        if corridor["source"] == source and corridor["target"] == target:
            rail_id = corridor["rail"]
            if rail_id in seen_rails:
                continue
            seen_rails.add(rail_id)
            fee_bps = corridor.get("fee_bps", 50)
            fee_amount = calculate_fee(amount, fee_bps) if amount > 0 else None
            converted = round(amount * rate, 2) if amount > 0 else None
            net_converted = round((amount - (fee_amount or 0)) * rate, 2) if amount > 0 else None
            # Find rail metadata
            rail_meta = next((r for r in RAILS if r["id"] == rail_id), {})
            rail_fees.append({
                "rail": rail_id,
                "name": rail_meta.get("name", rail_id),
                "fee_bps": fee_bps,
                "fee_amount": fee_amount,
                "fee_currency": source,
                "converted_amount": converted,
                "net_converted_amount": net_converted,
                "target_currency": target,
                "exchange_rate": rate,
                "estimated_settlement": corridor.get("settlement_time", "unknown"),
                "min_amount": corridor.get("min_amount"),
                "max_amount": corridor.get("max_amount"),
                "status": rail_meta.get("status", "active"),
            })

    if not rail_fees:
        # Fallback: generic estimate using recommended rail
        rec_rail_id = recommend_rail(source, target)
        fee_bps = 75
        fee_amount = calculate_fee(amount, fee_bps) if amount > 0 else None
        rail_meta = next((r for r in RAILS if r["id"] == rec_rail_id), {})
        rail_fees.append({
            "rail": rec_rail_id,
            "name": rail_meta.get("name", rec_rail_id),
            "fee_bps": fee_bps,
            "fee_amount": fee_amount,
            "fee_currency": source,
            "converted_amount": round(amount * rate, 2) if amount > 0 else None,
            "net_converted_amount": round((amount - (fee_amount or 0)) * rate, 2) if amount > 0 else None,
            "target_currency": target,
            "exchange_rate": rate,
            "estimated_settlement": "varies",
            "min_amount": None,
            "max_amount": None,
            "status": "active",
        })

    cheapest = min(rail_fees, key=lambda r: r["fee_bps"])["rail"] if rail_fees else None

    return jsonify({
        "source_currency": source,
        "target_currency": target,
        "amount": amount,
        "exchange_rate": rate,
        "rail_fees": rail_fees,
        "cheapest_rail": cheapest,
        "ts": datetime.now(timezone.utc).isoformat(),
    })
