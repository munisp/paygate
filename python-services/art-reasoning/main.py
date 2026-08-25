"""
PayGate ART (Adaptive Reasoning and Thinking) Service
======================================================
Autonomous multi-step reasoning engine for complex fintech decisions.

ART extends standard LLM inference with:
  1. Tool-augmented reasoning: LLM selects and calls tools iteratively
  2. Chain-of-Thought (CoT): explicit reasoning steps before final answer
  3. ReAct pattern: Reason → Act → Observe → Repeat until done
  4. Adaptive stopping: terminates when answer confidence is sufficient
  5. Audit trail: every reasoning step is logged for compliance

Use Cases:
  - Fraud investigation: "Why was transaction X flagged? What should we do?"
  - Compliance Q&A: "Does this merchant's activity violate CBN regulations?"
  - Merchant risk assessment: "Should we approve this merchant for BNPL?"
  - Dispute resolution: "Based on evidence, who should win this chargeback?"
  - Payout decision: "Should we hold or release this payout?"

Tools Available to ART:
  - search_transactions(merchant_id, limit) → transaction list
  - get_fraud_score(transaction_id) → fraud score + signals
  - query_knowledge_graph(cypher) → graph query results
  - search_compliance_docs(query) → relevant regulations
  - get_merchant_profile(merchant_id) → merchant details
  - calculate_risk_score(factors) → composite risk score
  - search_similar_cases(description) → similar past cases

Architecture:
  - ReAct loop: up to MAX_STEPS iterations
  - Each step: LLM generates Thought + Action + Action Input
  - Tool executor runs the action and returns Observation
  - Final step: LLM generates Final Answer from accumulated context
  - All steps stored in reasoning_trace for auditability

Endpoints:
  GET  /health
  POST /v1/reason              — Run ART reasoning on a question
  GET  /v1/trace/{trace_id}    — Get full reasoning trace
  POST /v1/investigate/fraud   — Fraud investigation workflow
  POST /v1/assess/merchant     — Merchant risk assessment workflow
  POST /v1/resolve/dispute     — Dispute resolution workflow

Environment:
  LLM_API_URL         — Ollama or OpenAI-compatible LLM URL
  LLM_API_KEY         — LLM API key
  VECTOR_STORE_URL    — Vector store service URL
  KNOWLEDGE_GRAPH_URL — Knowledge graph service URL
  FRAUD_SCORING_URL   — Fraud scoring service URL
  DATABASE_URL        — PostgreSQL for trace storage
  MAX_STEPS           — Maximum ReAct iterations (default: 8)
  PORT                — HTTP port (default: 8133)
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Tuple

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("art-reasoning")

# ─── Config ───────────────────────────────────────────────────────────────────
LLM_API_URL = os.getenv("LLM_API_URL", "http://ollama:11434")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
VECTOR_STORE_URL = os.getenv("VECTOR_STORE_URL", "http://vector-store:8130")
KNOWLEDGE_GRAPH_URL = os.getenv("KNOWLEDGE_GRAPH_URL", "http://knowledge-graph:8132")
FRAUD_SCORING_URL = os.getenv("FRAUD_SCORING_URL", "http://fraud-scoring:8083")  # POST /v1/score
DATABASE_URL = os.getenv("DATABASE_URL", "")
MAX_STEPS = int(os.getenv("MAX_STEPS", "8"))
PORT = int(os.getenv("PORT", "8133"))

# ─── In-memory trace store (use DB in production) ────────────────────────────
_traces: Dict[str, Dict] = {}


class UpstreamServiceUnavailable(Exception):
    """A required upstream dependency could not provide real data.

    Raised instead of returning fabricated scores/profiles/transactions;
    mapped to HTTP 503 at the API layer.
    """


def _simulation_mode() -> bool:
    """Explicit simulation switch — simulated data is only served when opted in."""
    return os.getenv("PAYGATE_SIMULATION_MODE", "").strip().lower() in ("1", "true", "yes")

# ─── Tool Definitions ─────────────────────────────────────────────────────────
TOOLS = {
    "search_transactions": {
        "description": "Search transactions for a merchant. Args: merchant_id (str), limit (int, default 10)",
        "schema": {"merchant_id": "str", "limit": "int"},
    },
    "get_fraud_score": {
        "description": "Get fraud score and risk signals for a transaction from the fraud-scoring service. Args: transaction_id (str), merchant_id (str), amount_kobo (int), channel (str). Fails with an error when the scoring service is unavailable — never invent a score.",
        "schema": {"transaction_id": "str", "merchant_id": "str", "amount_kobo": "int", "channel": "str"},
    },
    "query_knowledge_graph": {
        "description": "Execute a Cypher query on the knowledge graph. Args: cypher (str)",
        "schema": {"cypher": "str"},
    },
    "search_compliance_docs": {
        "description": "Search compliance documents and regulations. Args: query (str)",
        "schema": {"query": "str"},
    },
    "get_merchant_profile": {
        "description": "Get merchant profile and KYB status. Args: merchant_id (str)",
        "schema": {"merchant_id": "str"},
    },
    "calculate_risk_score": {
        "description": "Calculate composite risk score from factors. Args: factors (dict with keys: failed_rate, flagged_rate, alert_count, account_age_days)",
        "schema": {"factors": "dict"},
    },
    "search_similar_cases": {
        "description": "Find similar past fraud/dispute cases. Args: description (str), limit (int, default 5)",
        "schema": {"description": "str", "limit": "int"},
    },
    "final_answer": {
        "description": "Provide the final answer. Args: answer (str), confidence (float 0-1), recommendation (str)",
        "schema": {"answer": "str", "confidence": "float", "recommendation": "str"},
    },
}

TOOLS_DESCRIPTION = "\n".join([
    f"- {name}: {cfg['description']}"
    for name, cfg in TOOLS.items()
])

# ─── Tool Executor ────────────────────────────────────────────────────────────
async def execute_tool(tool_name: str, args: Dict[str, Any]) -> str:
    """Execute a tool and return the observation as a string."""
    try:
        import aiohttp

        if tool_name == "search_transactions":
            merchant_id = args.get("merchant_id", "")
            limit = args.get("limit", 10)
            if not _simulation_mode():
                raise UpstreamServiceUnavailable(
                    "search_transactions has no live transaction data source wired; "
                    "set PAYGATE_SIMULATION_MODE=true to use simulated data explicitly"
                )
            # Simulated data — served only under PAYGATE_SIMULATION_MODE=true
            return json.dumps({
                "merchant_id": merchant_id,
                "transactions": [
                    {"id": f"txn_{i}", "amount": 5000 + i * 1000, "status": "success" if i % 3 != 0 else "failed", "channel": "card"}
                    for i in range(min(limit, 5))
                ],
                "total": limit,
                "simulated": True,
            })

        elif tool_name == "get_fraud_score":
            transaction_id = args.get("transaction_id", "")
            if not transaction_id:
                raise UpstreamServiceUnavailable("get_fraud_score requires transaction_id")
            payload = {
                "tx_id": transaction_id,
                "merchant_id": args.get("merchant_id", ""),
                "amount_kobo": int(args.get("amount_kobo", 0) or 0),
                "currency": args.get("currency", "NGN"),
                "channel": args.get("channel", "api"),
            }
            async with aiohttp.ClientSession() as session:
                try:
                    async with session.post(
                        f"{FRAUD_SCORING_URL}/v1/score",
                        json=payload,
                        headers={"X-Internal-Key": os.getenv("INTERNAL_API_KEY", "")},
                        timeout=aiohttp.ClientTimeout(total=5),
                    ) as resp:
                        if resp.status != 200:
                            raise UpstreamServiceUnavailable(
                                f"fraud-scoring returned HTTP {resp.status}"
                            )
                        return await resp.text()
                except UpstreamServiceUnavailable:
                    raise
                except Exception as e:
                    raise UpstreamServiceUnavailable(f"fraud-scoring unreachable: {e}") from e
            # No fallback: a fabricated fraud score must never be returned.

        elif tool_name == "query_knowledge_graph":
            cypher = args.get("cypher", "RETURN 1")
            async with aiohttp.ClientSession() as session:
                try:
                    async with session.post(
                        f"{KNOWLEDGE_GRAPH_URL}/v1/query/cypher",
                        json={"cypher": cypher},
                        timeout=aiohttp.ClientTimeout(total=10),
                    ) as resp:
                        if resp.status == 200:
                            return await resp.text()
                except Exception:
                    pass
            return json.dumps({"results": [], "message": "Knowledge graph unavailable"})

        elif tool_name == "search_compliance_docs":
            query = args.get("query", "")
            async with aiohttp.ClientSession() as session:
                try:
                    async with session.post(
                        f"{VECTOR_STORE_URL}/v1/search/compliance",
                        json={"query": query, "limit": 5, "score_threshold": 0.5},
                        timeout=aiohttp.ClientTimeout(total=10),
                    ) as resp:
                        if resp.status == 200:
                            return await resp.text()
                except Exception:
                    pass
            return json.dumps({"results": [], "message": "Compliance docs search unavailable"})

        elif tool_name == "get_merchant_profile":
            merchant_id = args.get("merchant_id", "")
            if not _simulation_mode():
                raise UpstreamServiceUnavailable(
                    "get_merchant_profile has no live merchant data source wired; "
                    "set PAYGATE_SIMULATION_MODE=true to use simulated data explicitly"
                )
            # Simulated data — served only under PAYGATE_SIMULATION_MODE=true
            return json.dumps({
                "merchant_id": merchant_id,
                "name": f"Merchant {merchant_id[:8]}",
                "status": "active",
                "kyb_status": "verified",
                "risk_score": 35,
                "account_age_days": 180,
                "monthly_volume_ngn": 5000000,
                "simulated": True,
            })

        elif tool_name == "calculate_risk_score":
            factors = args.get("factors", {})
            failed_rate = float(factors.get("failed_rate", 0))
            flagged_rate = float(factors.get("flagged_rate", 0))
            alert_count = int(factors.get("alert_count", 0))
            account_age = int(factors.get("account_age_days", 365))
            age_factor = max(0, 1 - account_age / 365) * 20
            score = min(100, int(failed_rate * 40 + flagged_rate * 40 + min(alert_count, 5) * 4 + age_factor))
            return json.dumps({
                "risk_score": score,
                "risk_level": "critical" if score > 80 else "high" if score > 60 else "medium" if score > 30 else "low",
                "factors": factors,
            })

        elif tool_name == "search_similar_cases":
            description = args.get("description", "")
            limit = args.get("limit", 5)
            async with aiohttp.ClientSession() as session:
                try:
                    async with session.post(
                        f"{VECTOR_STORE_URL}/v1/search/support",
                        json={"query": description, "limit": limit, "score_threshold": 0.6},
                        timeout=aiohttp.ClientTimeout(total=10),
                    ) as resp:
                        if resp.status == 200:
                            return await resp.text()
                except Exception:
                    pass
            return json.dumps({"results": [], "message": "Similar cases search unavailable"})

        elif tool_name == "final_answer":
            return json.dumps(args)

        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})

    except UpstreamServiceUnavailable:
        raise  # fail loud — mapped to HTTP 503 at the API layer
    except Exception as e:
        return json.dumps({"error": str(e)})

# ─── ReAct Loop ───────────────────────────────────────────────────────────────
REACT_SYSTEM_PROMPT = f"""You are ART (Adaptive Reasoning and Thinking), an AI reasoning agent for PayGate fintech platform.
You solve complex problems by reasoning step by step and using tools.

Available tools:
{TOOLS_DESCRIPTION}

Format your response EXACTLY as:
Thought: [your reasoning about what to do next]
Action: [tool_name]
Action Input: [JSON object with tool arguments]

OR when you have enough information:
Thought: [final reasoning]
Action: final_answer
Action Input: {{"answer": "...", "confidence": 0.0-1.0, "recommendation": "..."}}

Rules:
- Always start with a Thought
- Use tools to gather evidence before concluding
- Be specific and cite evidence in your final answer
- Confidence should reflect how certain you are (0.0=uncertain, 1.0=certain)
- Recommendation should be actionable (approve/reject/hold/investigate/escalate)"""

async def call_llm(messages: List[Dict]) -> str:
    """Call LLM and return response text."""
    try:
        import aiohttp
        payload = {
            "model": "llama3.2",
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.2, "num_predict": 512},
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{LLM_API_URL}/api/chat",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("message", {}).get("content", "")
    except Exception as e:
        logger.warning(f"[llm] Call failed: {e}")
    return ""

def parse_react_output(text: str) -> Tuple[str, str, Dict]:
    """Parse ReAct format: Thought / Action / Action Input."""
    thought = ""
    action = ""
    action_input = {}

    thought_match = re.search(r"Thought:\s*(.+?)(?=Action:|$)", text, re.DOTALL)
    if thought_match:
        thought = thought_match.group(1).strip()

    action_match = re.search(r"Action:\s*(\w+)", text)
    if action_match:
        action = action_match.group(1).strip()

    input_match = re.search(r"Action Input:\s*(\{.+?\})", text, re.DOTALL)
    if input_match:
        try:
            action_input = json.loads(input_match.group(1))
        except json.JSONDecodeError:
            action_input = {"raw": input_match.group(1)}

    return thought, action, action_input

async def run_react_loop(question: str, context: Optional[str] = None) -> Dict:
    """Run the full ReAct reasoning loop."""
    trace_id = str(uuid.uuid4())
    steps = []
    start = time.time()

    messages = [
        {"role": "system", "content": REACT_SYSTEM_PROMPT},
        {"role": "user", "content": f"Question: {question}" + (f"\n\nContext: {context}" if context else "")},
    ]

    final_answer = None
    confidence = 0.0
    recommendation = ""

    for step_num in range(MAX_STEPS):
        # Get LLM response
        llm_output = await call_llm(messages)
        if not llm_output:
            break

        # Parse ReAct output
        thought, action, action_input = parse_react_output(llm_output)

        step = {
            "step": step_num + 1,
            "thought": thought,
            "action": action,
            "action_input": action_input,
            "observation": "",
        }

        if action == "final_answer":
            final_answer = action_input.get("answer", "")
            confidence = float(action_input.get("confidence", 0.5))
            recommendation = action_input.get("recommendation", "")
            step["observation"] = "Final answer provided"
            steps.append(step)
            break

        if action and action in TOOLS:
            # Execute tool
            observation = await execute_tool(action, action_input)
            step["observation"] = observation

            # Add to conversation
            messages.append({"role": "assistant", "content": llm_output})
            messages.append({"role": "user", "content": f"Observation: {observation}\n\nContinue reasoning."})
        else:
            step["observation"] = f"Unknown action: {action}"
            messages.append({"role": "assistant", "content": llm_output})
            messages.append({"role": "user", "content": "That action is not available. Please use one of the listed tools."})

        steps.append(step)

    if not final_answer:
        final_answer = "Could not reach a conclusion within the reasoning limit."
        confidence = 0.1
        recommendation = "escalate"

    result = {
        "trace_id": trace_id,
        "question": question,
        "answer": final_answer,
        "confidence": confidence,
        "recommendation": recommendation,
        "steps": steps,
        "total_steps": len(steps),
        "duration_ms": int((time.time() - start) * 1000),
    }

    _traces[trace_id] = result
    return result

# ─── Pydantic Models ──────────────────────────────────────────────────────────
class ReasonRequest(BaseModel):
    question: str
    context: Optional[str] = None

class FraudInvestigationRequest(BaseModel):
    transaction_id: str
    merchant_id: str
    amount_kobo: int
    channel: str
    fraud_score: Optional[float] = None
    signals: Optional[List[str]] = None

class MerchantAssessmentRequest(BaseModel):
    merchant_id: str
    purpose: str = "general_risk"  # general_risk | bnpl_approval | payout_approval

class DisputeResolutionRequest(BaseModel):
    dispute_id: str
    transaction_id: str
    merchant_id: str
    customer_claim: str
    merchant_evidence: Optional[str] = None
    amount_kobo: int

# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[startup] ART Reasoning service starting...")
    logger.info(f"[startup] Max steps: {MAX_STEPS}, LLM: {LLM_API_URL}")
    yield
    logger.info("[shutdown] ART Reasoning service stopping...")

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="PayGate ART Reasoning",
    description="Adaptive Reasoning and Thinking engine for fintech decisions",
    version="1.0.0",
    lifespan=lifespan,
)


@app.exception_handler(UpstreamServiceUnavailable)
async def _upstream_unavailable_handler(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=503, content={"detail": str(exc)})

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "max_steps": MAX_STEPS,
        "llm_url": LLM_API_URL,
        "tools": list(TOOLS.keys()),
        "active_traces": len(_traces),
        "timestamp_ms": int(time.time() * 1000),
    }

@app.post("/v1/reason")
async def reason(req: ReasonRequest):
    """Run ART reasoning on any question."""
    result = await run_react_loop(req.question, req.context)
    return result

@app.get("/v1/trace/{trace_id}")
async def get_trace(trace_id: str):
    """Get full reasoning trace by ID."""
    if trace_id not in _traces:
        raise HTTPException(status_code=404, detail="Trace not found")
    return _traces[trace_id]

@app.post("/v1/investigate/fraud")
async def investigate_fraud(req: FraudInvestigationRequest):
    """Fraud investigation workflow using ART reasoning."""
    signals_str = ", ".join(req.signals or []) or "none reported"
    question = (
        f"Investigate this transaction for fraud:\n"
        f"- Transaction ID: {req.transaction_id}\n"
        f"- Merchant ID: {req.merchant_id}\n"
        f"- Amount: {req.amount_kobo / 100:.2f} NGN\n"
        f"- Channel: {req.channel}\n"
        f"- Fraud Score: {req.fraud_score or 'unknown'}\n"
        f"- Risk Signals: {signals_str}\n\n"
        f"Should this transaction be approved, held, or rejected? "
        f"Provide evidence-based reasoning and a clear recommendation."
    )
    result = await run_react_loop(question)
    result["workflow"] = "fraud_investigation"
    result["transaction_id"] = req.transaction_id
    return result

@app.post("/v1/assess/merchant")
async def assess_merchant(req: MerchantAssessmentRequest):
    """Merchant risk assessment workflow."""
    purpose_map = {
        "general_risk": "Assess the overall risk profile of this merchant",
        "bnpl_approval": "Determine if this merchant should be approved for BNPL (Buy Now Pay Later) services",
        "payout_approval": "Determine if this merchant's pending payout should be approved or held",
    }
    purpose_desc = purpose_map.get(req.purpose, purpose_map["general_risk"])

    question = (
        f"{purpose_desc}:\n"
        f"- Merchant ID: {req.merchant_id}\n\n"
        f"Analyze their transaction history, risk score, KYB status, and compliance record. "
        f"Provide a recommendation with confidence score."
    )
    result = await run_react_loop(question)
    result["workflow"] = "merchant_assessment"
    result["merchant_id"] = req.merchant_id
    result["purpose"] = req.purpose
    return result

@app.post("/v1/resolve/dispute")
async def resolve_dispute(req: DisputeResolutionRequest):
    """Dispute resolution workflow using ART reasoning."""
    question = (
        f"Resolve this payment dispute:\n"
        f"- Dispute ID: {req.dispute_id}\n"
        f"- Transaction ID: {req.transaction_id}\n"
        f"- Merchant ID: {req.merchant_id}\n"
        f"- Amount: {req.amount_kobo / 100:.2f} NGN\n"
        f"- Customer Claim: {req.customer_claim}\n"
        f"- Merchant Evidence: {req.merchant_evidence or 'not provided'}\n\n"
        f"Based on the evidence, who should win this dispute? "
        f"Should we side with the customer (full refund), the merchant (reject dispute), "
        f"or offer a partial resolution? Provide clear reasoning."
    )
    result = await run_react_loop(question)
    result["workflow"] = "dispute_resolution"
    result["dispute_id"] = req.dispute_id
    return result

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
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False, workers=4, log_level="warning")
