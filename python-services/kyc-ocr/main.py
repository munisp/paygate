"""
PayGate KYC OCR Service
=======================
World-class document extraction pipeline:
  1. PaddleOCR v3 — multi-language text extraction
  2. Docling — document layout understanding (IBM Research)
  3. VLM (LLaVA / GPT-4V) — semantic field extraction for complex docs
  4. Confidence scoring and field validation

Endpoints:
  POST /extract        — Full pipeline (OCR + VLM + validation)
  POST /extract/fast   — PaddleOCR only (< 500ms)
  POST /extract/vlm    — VLM-only for complex/damaged documents
  GET  /health         — Health check
"""

import asyncio
import base64
import hashlib
import io
import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import boto3
import cv2
import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image, ImageEnhance, ImageFilter

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("kyc-ocr")

# ─── Config ───────────────────────────────────────────────────────────────────
PADDLE_OCR_LANG = os.getenv("PADDLE_OCR_LANG", "en")
VLM_API_URL = os.getenv("VLM_API_URL", "http://llava-service:8080/v1")
VLM_API_KEY = os.getenv("VLM_API_KEY", "")
S3_BUCKET = os.getenv("S3_BUCKET", "paygate-kyc-documents")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
DOCLING_ENABLED = os.getenv("DOCLING_ENABLED", "true").lower() == "true"
VLM_ENABLED = os.getenv("VLM_ENABLED", "true").lower() == "true"
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.7"))

# ─── Models ───────────────────────────────────────────────────────────────────
paddle_ocr = None
docling_converter = None


class DocType(str, Enum):
    PASSPORT = "passport"
    NATIONAL_ID = "national_id"
    DRIVERS_LICENSE = "drivers_license"
    UTILITY_BILL = "utility_bill"
    BANK_STATEMENT = "bank_statement"
    CAC_CERTIFICATE = "cac_certificate"
    # AP bill inbox (Melio P0-b) — supplier invoices and receipts
    SUPPLIER_INVOICE = "supplier_invoice"
    RECEIPT = "receipt"


class ExtractionMode(str, Enum):
    FULL = "full"          # OCR + Docling + VLM
    FAST = "fast"          # PaddleOCR only
    VLM_ONLY = "vlm_only"  # VLM only (for damaged/complex docs)


class ExtractedField(BaseModel):
    value: str | None = None
    confidence: float = 0.0
    source: str = "ocr"  # "ocr" | "vlm" | "docling"


class KYCExtractionResult(BaseModel):
    submission_id: str
    doc_type: DocType
    mode: ExtractionMode

    # Identity fields
    full_name: ExtractedField = Field(default_factory=ExtractedField)
    date_of_birth: ExtractedField = Field(default_factory=ExtractedField)
    document_number: ExtractedField = Field(default_factory=ExtractedField)
    nationality: ExtractedField = Field(default_factory=ExtractedField)
    expiry_date: ExtractedField = Field(default_factory=ExtractedField)
    issue_date: ExtractedField = Field(default_factory=ExtractedField)
    gender: ExtractedField = Field(default_factory=ExtractedField)
    address: ExtractedField = Field(default_factory=ExtractedField)
    mrz_line1: ExtractedField = Field(default_factory=ExtractedField)
    mrz_line2: ExtractedField = Field(default_factory=ExtractedField)

    # Business fields (CAC, utility bill, bank statement)
    company_name: ExtractedField = Field(default_factory=ExtractedField)
    rc_number: ExtractedField = Field(default_factory=ExtractedField)
    account_number: ExtractedField = Field(default_factory=ExtractedField)
    bank_name: ExtractedField = Field(default_factory=ExtractedField)

    # Structured AP bill payload (supplier_invoice / receipt only). Schema:
    # {vendor_name, tin, bill_number, due_date, currency, subtotal_kobo,
    #  tax_kobo, total_kobo, line_items:[{description, quantity,
    #  unit_price_kobo, amount_kobo}]} — all amounts integer kobo.
    structured_data: dict[str, Any] = Field(default_factory=dict)

    # Quality metrics
    overall_confidence: float = 0.0
    image_quality_score: float = 0.0
    is_expired: bool = False
    tamper_indicators: list[str] = Field(default_factory=list)
    processing_ms: int = 0
    raw_text: str = ""


class ExtractionRequest(BaseModel):
    submission_id: str
    doc_type: DocType
    image_url: str | None = None
    image_base64: str | None = None
    mode: ExtractionMode = ExtractionMode.FULL
    language_hint: str | None = None


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global paddle_ocr, docling_converter
    logger.info("Loading PaddleOCR model...")
    try:
        from paddleocr import PaddleOCR
        paddle_ocr = PaddleOCR(
            use_angle_cls=True,
            lang=PADDLE_OCR_LANG,
            use_gpu=os.path.exists("/dev/nvidia0"),
            show_log=False,
            det_db_thresh=0.3,
            det_db_box_thresh=0.5,
            rec_batch_num=6,
            max_text_length=25,
        )
        logger.info("PaddleOCR loaded successfully")
    except ImportError:
        logger.warning("PaddleOCR not available — using fallback OCR")

    if DOCLING_ENABLED:
        logger.info("Loading Docling converter...")
        try:
            from docling.document_converter import DocumentConverter
            docling_converter = DocumentConverter()
            logger.info("Docling loaded successfully")
        except ImportError:
            logger.warning("Docling not available")

    yield

    logger.info("Shutting down KYC OCR service")


# ─── App ──────────────────────────────────────────────────────────────────────
import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(
    title="PayGate KYC OCR Service",
    version="1.0.0",
    lifespan=lifespan,
)
setup_telemetry("kyc-ocr", app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ─── Image Pre-processing ─────────────────────────────────────────────────────
def preprocess_image(img_array: np.ndarray) -> tuple[np.ndarray, float]:
    """
    Enhance document image for better OCR accuracy.
    Returns (processed_image, quality_score).
    """
    gray = cv2.cvtColor(img_array, cv2.COLOR_BGR2GRAY)

    # Quality score: variance of Laplacian (blur detection)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    quality_score = min(1.0, laplacian_var / 500.0)

    # Deskew
    coords = np.column_stack(np.where(gray < 200))
    if len(coords) > 100:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        if abs(angle) > 0.5:
            h, w = gray.shape
            M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
            img_array = cv2.warpAffine(img_array, M, (w, h), flags=cv2.INTER_CUBIC,
                                        borderMode=cv2.BORDER_REPLICATE)

    # Adaptive contrast enhancement
    pil_img = Image.fromarray(cv2.cvtColor(img_array, cv2.COLOR_BGR2RGB))
    enhancer = ImageEnhance.Contrast(pil_img)
    pil_img = enhancer.enhance(1.5)
    enhancer = ImageEnhance.Sharpness(pil_img)
    pil_img = enhancer.enhance(2.0)

    result = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    return result, quality_score


# ─── PaddleOCR Extraction ─────────────────────────────────────────────────────
async def extract_with_paddle(img_array: np.ndarray) -> tuple[str, float]:
    """Run PaddleOCR and return (raw_text, avg_confidence)."""
    if paddle_ocr is None:
        return "", 0.0

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, paddle_ocr.ocr, img_array, True)

    if not result or not result[0]:
        return "", 0.0

    lines = []
    confidences = []
    for line in result[0]:
        if line and len(line) >= 2:
            text = line[1][0]
            conf = line[1][1]
            lines.append(text)
            confidences.append(conf)

    raw_text = "\n".join(lines)
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
    return raw_text, avg_conf


# ─── Docling Layout Analysis ──────────────────────────────────────────────────
async def extract_with_docling(img_bytes: bytes) -> dict[str, Any]:
    """Use Docling for structured document layout understanding."""
    if docling_converter is None:
        return {}

    try:
        loop = asyncio.get_event_loop()

        def _convert():
            from docling.datamodel.base_models import InputFormat
            from docling.datamodel.document import ConversionResult
            import tempfile

            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
                f.write(img_bytes)
                tmp_path = f.name

            result: ConversionResult = docling_converter.convert(tmp_path)
            os.unlink(tmp_path)

            # Extract structured data
            doc = result.document
            return {
                "tables": [t.export_to_dict() for t in doc.tables],
                "text_blocks": [{"text": b.text, "label": str(b.label)} for b in doc.texts],
                "key_value_pairs": {},  # Populated by post-processing
            }

        return await loop.run_in_executor(None, _convert)
    except Exception as e:
        logger.warning(f"Docling extraction failed: {e}")
        return {}


# ─── VLM Extraction ───────────────────────────────────────────────────────────
async def extract_with_vlm(img_bytes: bytes, doc_type: DocType) -> dict[str, Any]:
    """Use LLaVA/GPT-4V for semantic field extraction."""
    if not VLM_ENABLED:
        return {}

    img_b64 = base64.b64encode(img_bytes).decode()

    if doc_type in (DocType.SUPPLIER_INVOICE, DocType.RECEIPT):
        prompt = f"""You are an accounts-payable document extraction specialist. Extract structured data from this {doc_type.value.replace('_', ' ')} document.

Return a JSON object with these fields (use null if not found):
{{
  "vendor_name": "string (supplier/merchant name)",
  "tin": "string (tax identification number)",
  "bill_number": "string (invoice/receipt number)",
  "due_date": "YYYY-MM-DD (payment due date; null for receipts already paid)",
  "currency": "ISO 4217 code, e.g. NGN",
  "subtotal_kobo": integer (subtotal BEFORE tax, smallest currency unit),
  "tax_kobo": integer (VAT/tax amount, smallest currency unit),
  "total_kobo": integer (grand total, smallest currency unit),
  "line_items": [{{"description": "string", "quantity": number, "unit_price_kobo": integer, "amount_kobo": integer}}],
  "tamper_indicators": ["list of any suspicious features"]
}}

CRITICAL: all monetary amounts MUST be integers in the smallest currency unit (e.g. kobo for NGN — multiply naira by 100; cents for USD). Never return decimals for *_kobo fields.
Be precise. Return only valid JSON."""
    else:
        prompt = f"""You are a KYC document extraction specialist. Extract all fields from this {doc_type.value.replace('_', ' ')} document.

Return a JSON object with these fields (use null if not found):
{{
  "full_name": "string",
  "date_of_birth": "YYYY-MM-DD",
  "document_number": "string",
  "nationality": "string",
  "expiry_date": "YYYY-MM-DD",
  "issue_date": "YYYY-MM-DD",
  "gender": "M|F|Other",
  "address": "string",
  "mrz_line1": "string (MRZ line 1 if passport)",
  "mrz_line2": "string (MRZ line 2 if passport)",
  "company_name": "string (if business doc)",
  "rc_number": "string (CAC registration number)",
  "account_number": "string (if bank statement)",
  "bank_name": "string (if bank statement)",
  "tamper_indicators": ["list of any suspicious features"]
}}

Be precise. Return only valid JSON."""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{VLM_API_URL}/chat/completions",
                headers={"Authorization": f"Bearer {VLM_API_KEY}"},
                json={
                    "model": "llava-v1.6",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                                {"type": "text", "text": prompt},
                            ],
                        }
                    ],
                    "max_tokens": 1024,
                    "temperature": 0.1,
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]

            # Extract JSON from response
            json_match = re.search(r"\{.*\}", content, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
    except Exception as e:
        logger.warning(f"VLM extraction failed: {e}")

    return {}


# ─── Field Parsing ────────────────────────────────────────────────────────────
def parse_fields_from_text(raw_text: str, doc_type: DocType) -> dict[str, ExtractedField]:
    """Parse structured fields from raw OCR text using regex patterns."""
    fields: dict[str, ExtractedField] = {}
    text = raw_text.upper()

    # Date patterns
    date_pattern = r"\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}|\d{4}[/\-\.]\d{2}[/\-\.]\d{2})\b"
    dates = re.findall(date_pattern, raw_text)

    # Document number patterns
    if doc_type == DocType.PASSPORT:
        doc_num = re.search(r"\b([A-Z]{1,2}\d{7,9})\b", text)
        if doc_num:
            fields["document_number"] = ExtractedField(value=doc_num.group(1), confidence=0.9, source="ocr")

        # MRZ lines (2 lines of 44 chars for TD3 passports)
        mrz_pattern = r"[A-Z0-9<]{44}"
        mrz_lines = re.findall(mrz_pattern, text)
        if len(mrz_lines) >= 1:
            fields["mrz_line1"] = ExtractedField(value=mrz_lines[0], confidence=0.95, source="ocr")
        if len(mrz_lines) >= 2:
            fields["mrz_line2"] = ExtractedField(value=mrz_lines[1], confidence=0.95, source="ocr")

    elif doc_type == DocType.NATIONAL_ID:
        # Nigerian NIN: 11 digits
        nin = re.search(r"\b(\d{11})\b", raw_text)
        if nin:
            fields["document_number"] = ExtractedField(value=nin.group(1), confidence=0.85, source="ocr")

    elif doc_type == DocType.CAC_CERTIFICATE:
        # RC number: RC followed by digits
        rc = re.search(r"\bRC\s*(\d{4,8})\b", text)
        if rc:
            fields["rc_number"] = ExtractedField(value=f"RC{rc.group(1)}", confidence=0.9, source="ocr")

    # Gender
    if re.search(r"\bMALE\b|\bM\b", text):
        fields["gender"] = ExtractedField(value="M", confidence=0.8, source="ocr")
    elif re.search(r"\bFEMALE\b|\bF\b", text):
        fields["gender"] = ExtractedField(value="F", confidence=0.8, source="ocr")

    # Dates (first = DOB, last = expiry for most docs)
    if dates:
        fields["date_of_birth"] = ExtractedField(value=dates[0], confidence=0.7, source="ocr")
        if len(dates) > 1:
            fields["expiry_date"] = ExtractedField(value=dates[-1], confidence=0.7, source="ocr")

    return fields


# ─── AP Bill Structured Extraction ────────────────────────────────────────────
def _to_kobo_int(value: Any) -> int | None:
    """
    Coerce a VLM-reported amount to integer kobo (smallest currency unit).
    Accepts ints and integer-valued floats/strings as-is; non-integer numbers
    are treated as major units (naira) and multiplied by 100. Anything
    unparseable → None (never fabricated).
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else int(round(value * 100))
    if isinstance(value, str):
        cleaned = value.replace(",", "").replace("₦", "").replace("$", "").strip()
        if not cleaned:
            return None
        try:
            num = float(cleaned)
        except ValueError:
            return None
        return int(num) if num.is_integer() else int(round(num * 100))
    return None


def build_bill_structured_data(vlm_fields: dict[str, Any]) -> dict[str, Any]:
    """
    Normalize the VLM payload for supplier_invoice / receipt documents into the
    canonical AP bill schema. Missing fields stay None — no fabricated values.
    """
    line_items: list[dict[str, Any]] = []
    raw_items = vlm_fields.get("line_items")
    if isinstance(raw_items, list):
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            quantity = item.get("quantity")
            try:
                quantity = float(quantity) if quantity is not None else None
            except (TypeError, ValueError):
                quantity = None
            line_items.append({
                "description": item.get("description") if isinstance(item.get("description"), str) else None,
                "quantity": quantity,
                "unit_price_kobo": _to_kobo_int(item.get("unit_price_kobo")),
                "amount_kobo": _to_kobo_int(item.get("amount_kobo")),
            })

    due_date = vlm_fields.get("due_date")
    if isinstance(due_date, str) and not re.match(r"^\d{4}-\d{2}-\d{2}$", due_date.strip()):
        due_date = None  # keep only ISO dates; everything else is unreliable

    currency = vlm_fields.get("currency")
    if isinstance(currency, str):
        currency = currency.strip().upper()[:3] or None
    else:
        currency = None

    return {
        "vendor_name": vlm_fields.get("vendor_name") if isinstance(vlm_fields.get("vendor_name"), str) else None,
        "tin": vlm_fields.get("tin") if isinstance(vlm_fields.get("tin"), str) else None,
        "bill_number": vlm_fields.get("bill_number") if isinstance(vlm_fields.get("bill_number"), str) else None,
        "due_date": due_date.strip() if isinstance(due_date, str) and due_date else None,
        "currency": currency,
        "subtotal_kobo": _to_kobo_int(vlm_fields.get("subtotal_kobo")),
        "tax_kobo": _to_kobo_int(vlm_fields.get("tax_kobo")),
        "total_kobo": _to_kobo_int(vlm_fields.get("total_kobo")),
        "line_items": line_items,
    }


def merge_results(
    ocr_fields: dict[str, ExtractedField],
    vlm_fields: dict[str, Any],
    docling_data: dict[str, Any],
) -> dict[str, ExtractedField]:
    """Merge OCR, VLM, and Docling results, preferring highest confidence."""
    merged = dict(ocr_fields)

    for key, value in vlm_fields.items():
        if value and key in merged:
            # VLM wins if OCR confidence is low
            if merged[key].confidence < 0.8:
                merged[key] = ExtractedField(value=str(value), confidence=0.88, source="vlm")
        elif value:
            merged[key] = ExtractedField(value=str(value), confidence=0.85, source="vlm")

    return merged


def check_expiry(expiry_field: ExtractedField) -> bool:
    """Return True if document is expired."""
    if not expiry_field.value:
        return False
    try:
        from datetime import datetime
        for fmt in ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y"]:
            try:
                expiry = datetime.strptime(expiry_field.value, fmt)
                return expiry < datetime.now()
            except ValueError:
                continue
    except Exception:
        pass
    return False


# ─── Main Extraction Endpoint ─────────────────────────────────────────────────
@app.post("/extract", response_model=KYCExtractionResult)
async def extract_document(request: ExtractionRequest, background_tasks: BackgroundTasks):
    """Full KYC document extraction pipeline."""
    start_ms = int(time.time() * 1000)

    # Load image
    img_bytes: bytes
    if request.image_url:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(request.image_url)
            resp.raise_for_status()
            img_bytes = resp.content
    elif request.image_base64:
        img_bytes = base64.b64decode(request.image_base64)
    else:
        raise HTTPException(status_code=400, detail="Either image_url or image_base64 required")

    # Decode and preprocess
    nparr = np.frombuffer(img_bytes, np.uint8)
    img_array = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_array is None:
        raise HTTPException(status_code=400, detail="Invalid image format")

    processed_img, quality_score = preprocess_image(img_array)

    # Run extraction pipeline
    raw_text = ""
    ocr_confidence = 0.0
    vlm_fields: dict[str, Any] = {}
    docling_data: dict[str, Any] = {}

    if request.mode in (ExtractionMode.FULL, ExtractionMode.FAST):
        raw_text, ocr_confidence = await extract_with_paddle(processed_img)

    if request.mode == ExtractionMode.FULL and DOCLING_ENABLED:
        docling_data = await extract_with_docling(img_bytes)

    if request.mode in (ExtractionMode.FULL, ExtractionMode.VLM_ONLY) and VLM_ENABLED:
        vlm_fields = await extract_with_vlm(img_bytes, request.doc_type)

    # Parse and merge fields
    ocr_fields = parse_fields_from_text(raw_text, request.doc_type)
    merged_fields = merge_results(ocr_fields, vlm_fields, docling_data)

    # AP bill docs: build the canonical structured payload from the VLM fields.
    bill_structured: dict[str, Any] = {}
    if request.doc_type in (DocType.SUPPLIER_INVOICE, DocType.RECEIPT):
        bill_structured = build_bill_structured_data(vlm_fields)

    # Build result
    result = KYCExtractionResult(
        submission_id=request.submission_id,
        doc_type=request.doc_type,
        mode=request.mode,
        image_quality_score=quality_score,
        raw_text=raw_text[:2000],  # Truncate for storage
        processing_ms=int(time.time() * 1000) - start_ms,
        structured_data=bill_structured,
    )

    # Populate fields
    for field_name in [
        "full_name", "date_of_birth", "document_number", "nationality",
        "expiry_date", "issue_date", "gender", "address", "mrz_line1", "mrz_line2",
        "company_name", "rc_number", "account_number", "bank_name",
    ]:
        if field_name in merged_fields:
            setattr(result, field_name, merged_fields[field_name])

    # Tamper indicators from VLM
    if "tamper_indicators" in vlm_fields and isinstance(vlm_fields["tamper_indicators"], list):
        result.tamper_indicators = vlm_fields["tamper_indicators"]

    # Check expiry
    result.is_expired = check_expiry(result.expiry_date)

    # Overall confidence
    field_confidences = [
        f.confidence for f in [
            result.full_name, result.date_of_birth, result.document_number
        ] if f.value
    ]
    result.overall_confidence = (
        sum(field_confidences) / len(field_confidences) if field_confidences else ocr_confidence
    )

    # Publish to Kafka in background
    background_tasks.add_task(publish_result_to_kafka, result)

    logger.info(
        f"[extract] submission={request.submission_id} "
        f"doc_type={request.doc_type} mode={request.mode} "
        f"confidence={result.overall_confidence:.2f} "
        f"quality={quality_score:.2f} ms={result.processing_ms}"
    )

    return result


@app.post("/extract/fast", response_model=KYCExtractionResult)
async def extract_fast(request: ExtractionRequest, background_tasks: BackgroundTasks):
    """Fast extraction using PaddleOCR only (< 500ms)."""
    request.mode = ExtractionMode.FAST
    return await extract_document(request, background_tasks)


@app.post("/extract/vlm", response_model=KYCExtractionResult)
async def extract_vlm(request: ExtractionRequest, background_tasks: BackgroundTasks):
    """VLM-only extraction for complex or damaged documents."""
    request.mode = ExtractionMode.VLM_ONLY
    return await extract_document(request, background_tasks)


# ─── Kafka Publisher ──────────────────────────────────────────────────────────
async def publish_result_to_kafka(result: KYCExtractionResult) -> None:
    """Publish extraction result to Kafka for downstream processing."""
    try:
        from confluent_kafka import Producer
        producer = Producer({"bootstrap.servers": KAFKA_BOOTSTRAP})
        payload = result.model_dump_json().encode()
        producer.produce(
            "paygate.kyc.ocr.completed",
            key=result.submission_id.encode(),
            value=payload,
        )
        producer.flush(timeout=5)
        logger.debug(f"Published OCR result for {result.submission_id} to Kafka")
    except Exception as e:
        logger.error(f"Kafka publish failed: {e}")


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "paddle_ocr": paddle_ocr is not None,
        "docling": docling_converter is not None,
        "vlm_enabled": VLM_ENABLED,
    }


# ─── Mandatory internal service-to-service auth (fail closed) ───────────────
# INTERNAL_API_KEY must be configured; every request other than /health and
# /metrics must present it via the X-Internal-Key header. Constant-time
# comparison to resist timing attacks.
import hmac as _hmac_mod
from fastapi import Request as _AuthRequest
from fastapi.responses import JSONResponse as _AuthJSONResponse

_INTERNAL_AUTH_KEY = os.getenv("INTERNAL_API_KEY", "")
_AUTH_EXEMPT_PATHS = frozenset({"/health", "/healthz", "/metrics"})


@app.middleware("http")
async def _require_internal_api_key(request: _AuthRequest, call_next):
    if request.url.path in _AUTH_EXEMPT_PATHS:
        return await call_next(request)
    if not _INTERNAL_AUTH_KEY:
        return _AuthJSONResponse(
            status_code=503,
            content={"detail": "Service misconfigured: INTERNAL_API_KEY not set"},
        )
    if not _hmac_mod.compare_digest(
        request.headers.get("x-internal-key", ""), _INTERNAL_AUTH_KEY
    ):
        return _AuthJSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8011, workers=4, log_level="warning")
