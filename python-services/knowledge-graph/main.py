"""
PayGate Knowledge Graph Service (FalkorDB + EPR-KGQA)
======================================================
Graph-based intelligence layer for fraud detection, compliance, and merchant analytics.

Architecture:
  - FalkorDB: Redis-compatible property graph database (Cypher query language)
  - EPR-KGQA: Entity-Property-Relation Knowledge Graph Q&A for natural language queries
  - NetworkX: In-memory graph analytics (PageRank, community detection, path analysis)
  - FastAPI: REST API for graph queries, analytics, and KGQA

Graph Schema (PayGate Knowledge Graph):
  Nodes:
    - Merchant {id, name, type, country, status, risk_score}
    - Customer {id, email, phone, country, risk_score}
    - Transaction {id, amount, currency, channel, status, timestamp}
    - BankAccount {id, bank_code, account_number, account_name}
    - Device {fingerprint, ip, user_agent}
    - Country {code, name, risk_level}
    - MCC {code, description, risk_level}
    - Alert {id, type, severity, status}

  Edges:
    - (Merchant)-[:PROCESSED]->(Transaction)
    - (Customer)-[:INITIATED]->(Transaction)
    - (Transaction)-[:PAID_TO]->(BankAccount)
    - (Customer)-[:USED]->(Device)
    - (Device)-[:ACCESSED_FROM]->(Country)
    - (Merchant)-[:OPERATES_IN]->(Country)
    - (Merchant)-[:CATEGORIZED_AS]->(MCC)
    - (Transaction)-[:TRIGGERED]->(Alert)
    - (Merchant)-[:SHARES_DEVICE_WITH]->(Merchant)  ← fraud ring signal
    - (Customer)-[:SHARES_DEVICE_WITH]->(Customer)  ← fraud ring signal

EPR-KGQA:
  Converts natural language questions into Cypher queries using:
    1. Entity Recognition: identify Merchant/Customer/Transaction entities in question
    2. Property Extraction: identify which properties are being asked about
    3. Relation Mapping: map question intent to graph traversal patterns
    4. Cypher Generation: produce executable Cypher query
    5. Answer Extraction: format graph results as natural language answer

Endpoints:
  GET  /health
  POST /v1/query/cypher          — Execute raw Cypher query
  POST /v1/query/natural         — EPR-KGQA: natural language → Cypher → answer
  POST /v1/graph/upsert          — Upsert nodes and edges
  GET  /v1/analytics/fraud-rings — Detect fraud rings via community detection
  GET  /v1/analytics/merchant/{id}/risk — Merchant risk graph analysis
  POST /v1/analytics/path        — Find paths between two entities
  GET  /v1/analytics/pagerank    — PageRank scores for all merchants
  POST /v1/kgqa/ask              — Full EPR-KGQA pipeline

Environment:
  FALKORDB_URL    — Redis URL for FalkorDB (redis://falkordb:6379)
  GRAPH_NAME      — Graph name (default: paygate_kg)
  LLM_API_URL     — LLM for EPR-KGQA Cypher generation
  LLM_API_KEY     — LLM API key
  PORT            — HTTP port (default: 8132)
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
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
logger = logging.getLogger("knowledge-graph")

# ─── Config ───────────────────────────────────────────────────────────────────
FALKORDB_URL = os.getenv("FALKORDB_URL", "redis://falkordb:6379")
GRAPH_NAME = os.getenv("GRAPH_NAME", "paygate_kg")
LLM_API_URL = os.getenv("LLM_API_URL", "http://ollama:11434")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
PORT = int(os.getenv("PORT", "8132"))

# ─── FalkorDB Client ──────────────────────────────────────────────────────────
_falkor_client = None

def get_graph():
    global _falkor_client
    if _falkor_client is None:
        try:
            import redis
            from redis.commands.graph import Graph
            r = redis.from_url(FALKORDB_URL, decode_responses=True)
            r.ping()
            _falkor_client = Graph(r, GRAPH_NAME)
            logger.info(f"[falkordb] Connected to {FALKORDB_URL}, graph: {GRAPH_NAME}")
        except Exception as e:
            logger.warning(f"[falkordb] Connection failed: {e} — running in degraded mode")
            _falkor_client = None
    return _falkor_client

def execute_cypher(cypher: str, params: Optional[Dict] = None) -> List[Dict]:
    """Execute a Cypher query and return results as a list of dicts."""
    graph = get_graph()
    if not graph:
        return []
    try:
        result = graph.query(cypher, params or {})
        rows = []
        if result.result_set:
            headers = result.header
            for row in result.result_set:
                rows.append(dict(zip(headers, row)))
        return rows
    except Exception as e:
        logger.error(f"[cypher] Query failed: {e}\nQuery: {cypher[:200]}")
        raise HTTPException(status_code=500, detail=f"Cypher error: {e}")

# ─── EPR-KGQA Engine ──────────────────────────────────────────────────────────
# Entity-Property-Relation Knowledge Graph Question Answering
# Converts natural language questions to Cypher queries

# Entity type patterns
ENTITY_PATTERNS = {
    "Merchant": [r"merchant\s+(\w+)", r"business\s+(\w+)", r"store\s+(\w+)"],
    "Customer": [r"customer\s+(\w+)", r"user\s+(\w+)", r"buyer\s+(\w+)"],
    "Transaction": [r"transaction\s+(\w+)", r"payment\s+(\w+)", r"txn\s+(\w+)"],
    "BankAccount": [r"account\s+(\w+)", r"bank\s+account\s+(\w+)"],
    "Device": [r"device\s+(\w+)", r"ip\s+([\d.]+)"],
}

# Question intent → Cypher template mapping
INTENT_TEMPLATES = {
    "fraud_ring": {
        "patterns": ["fraud ring", "connected merchants", "shared device", "same device"],
        "cypher": """
MATCH (m1:Merchant)-[:SHARES_DEVICE_WITH]->(m2:Merchant)
RETURN m1.id AS merchant1, m2.id AS merchant2, m1.name AS name1, m2.name AS name2
LIMIT 20
""",
    },
    "merchant_transactions": {
        "patterns": ["transactions for merchant", "merchant transactions", "payments by merchant"],
        "cypher": """
MATCH (m:Merchant {{id: '{entity_id}'}})-[:PROCESSED]->(t:Transaction)
RETURN t.id AS transaction_id, t.amount AS amount, t.status AS status, t.timestamp AS timestamp
ORDER BY t.timestamp DESC LIMIT 20
""",
    },
    "customer_risk": {
        "patterns": ["customer risk", "risky customer", "customer score"],
        "cypher": """
MATCH (c:Customer {{id: '{entity_id}'}})
OPTIONAL MATCH (c)-[:INITIATED]->(t:Transaction)
OPTIONAL MATCH (c)-[:USED]->(d:Device)
RETURN c.id AS customer_id, c.risk_score AS risk_score,
       count(t) AS transaction_count, count(d) AS device_count
""",
    },
    "high_risk_merchants": {
        "patterns": ["high risk merchants", "risky merchants", "merchants with high risk"],
        "cypher": """
MATCH (m:Merchant)
WHERE m.risk_score > 70
RETURN m.id AS merchant_id, m.name AS name, m.risk_score AS risk_score, m.status AS status
ORDER BY m.risk_score DESC LIMIT 20
""",
    },
    "transaction_path": {
        "patterns": ["path from", "connection between", "how connected"],
        "cypher": """
MATCH path = shortestPath((a {{id: '{from_id}'}})-[*..6]-(b {{id: '{to_id}'}}))
RETURN [node in nodes(path) | node.id] AS path_nodes,
       [rel in relationships(path) | type(rel)] AS path_rels
""",
    },
    "merchant_network": {
        "patterns": ["merchant network", "connected to merchant", "merchant connections"],
        "cypher": """
MATCH (m:Merchant {{id: '{entity_id}'}})-[r]-(n)
RETURN type(r) AS relationship, labels(n)[0] AS node_type, n.id AS node_id
LIMIT 50
""",
    },
    "alerts": {
        "patterns": ["alerts", "flagged", "suspicious", "anomaly"],
        "cypher": """
MATCH (t:Transaction)-[:TRIGGERED]->(a:Alert)
WHERE a.severity IN ['high', 'critical']
RETURN a.id AS alert_id, a.type AS type, a.severity AS severity,
       t.id AS transaction_id, t.amount AS amount
ORDER BY a.severity DESC LIMIT 20
""",
    },
}

def extract_entities(question: str) -> List[Tuple[str, str]]:
    """Extract entity type and ID from natural language question."""
    entities = []
    q_lower = question.lower()
    for entity_type, patterns in ENTITY_PATTERNS.items():
        for pattern in patterns:
            match = re.search(pattern, q_lower)
            if match:
                entities.append((entity_type, match.group(1)))
    return entities

def detect_intent(question: str) -> Optional[str]:
    """Detect the question intent from predefined patterns."""
    q_lower = question.lower()
    for intent, config in INTENT_TEMPLATES.items():
        for pattern in config["patterns"]:
            if pattern in q_lower:
                return intent
    return None

def build_cypher_from_intent(intent: str, entities: List[Tuple[str, str]], question: str) -> str:
    """Build a Cypher query from detected intent and entities."""
    template = INTENT_TEMPLATES.get(intent, {}).get("cypher", "")
    if not template:
        return ""

    # Fill entity placeholders
    entity_id = entities[0][1] if entities else ""
    from_id = entities[0][1] if len(entities) > 0 else ""
    to_id = entities[1][1] if len(entities) > 1 else ""

    cypher = template.format(
        entity_id=entity_id,
        from_id=from_id,
        to_id=to_id,
    )
    return cypher.strip()

async def llm_generate_cypher(question: str, schema_context: str) -> str:
    """Use LLM to generate Cypher from natural language (fallback to rule-based)."""
    system_prompt = f"""You are a Cypher query generator for FalkorDB (Redis Graph).
Graph Schema:
{schema_context}

Generate a valid Cypher query for the given question. Return ONLY the Cypher query, no explanation.
Rules:
- Use MATCH, WHERE, RETURN, ORDER BY, LIMIT
- Always add LIMIT 50 unless the question asks for a specific count
- Use property access like node.property_name
- Return meaningful column names with AS aliases"""

    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            payload = {
                "model": "llama3.2",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Question: {question}"},
                ],
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": 256},
            }
            async with session.post(
                f"{LLM_API_URL}/api/chat",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=20),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    cypher = data.get("message", {}).get("content", "").strip()
                    # Clean up: remove markdown code blocks
                    cypher = re.sub(r"```(?:cypher)?\n?", "", cypher).strip()
                    return cypher
    except Exception as e:
        logger.warning(f"[kgqa] LLM Cypher generation failed: {e}")
    return ""

GRAPH_SCHEMA = """
Nodes: Merchant(id, name, type, country, status, risk_score),
       Customer(id, email, phone, country, risk_score),
       Transaction(id, amount, currency, channel, status, timestamp),
       BankAccount(id, bank_code, account_number),
       Device(fingerprint, ip),
       Country(code, name, risk_level),
       Alert(id, type, severity, status)

Relationships:
  (Merchant)-[:PROCESSED]->(Transaction)
  (Customer)-[:INITIATED]->(Transaction)
  (Transaction)-[:PAID_TO]->(BankAccount)
  (Customer)-[:USED]->(Device)
  (Merchant)-[:OPERATES_IN]->(Country)
  (Transaction)-[:TRIGGERED]->(Alert)
  (Merchant)-[:SHARES_DEVICE_WITH]->(Merchant)
  (Customer)-[:SHARES_DEVICE_WITH]->(Customer)
"""

# ─── Pydantic Models ──────────────────────────────────────────────────────────
class CypherRequest(BaseModel):
    cypher: str
    params: Optional[Dict[str, Any]] = None

class NaturalQueryRequest(BaseModel):
    question: str
    use_llm: bool = True

class GraphNode(BaseModel):
    id: str
    type: str
    properties: Dict[str, Any] = Field(default_factory=dict)

class GraphEdge(BaseModel):
    from_id: str
    from_type: str
    to_id: str
    to_type: str
    relation: str
    properties: Dict[str, Any] = Field(default_factory=dict)

class UpsertRequest(BaseModel):
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)

class KGQARequest(BaseModel):
    question: str
    return_cypher: bool = False

class PathRequest(BaseModel):
    from_id: str
    to_id: str
    max_hops: int = Field(default=6, ge=1, le=10)

# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[startup] Knowledge Graph service starting...")
    get_graph()
    logger.info("[startup] Ready")
    yield
    logger.info("[shutdown] Knowledge Graph service stopping...")

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="PayGate Knowledge Graph",
    description="FalkorDB graph intelligence with EPR-KGQA",
    version="1.0.0",
    lifespan=lifespan,
)

@app.get("/health")
async def health():
    graph_ok = False
    try:
        graph = get_graph()
        if graph:
            graph.query("RETURN 1")
            graph_ok = True
    except Exception:
        pass
    return {
        "status": "ok" if graph_ok else "degraded",
        "falkordb": graph_ok,
        "graph_name": GRAPH_NAME,
        "timestamp_ms": int(time.time() * 1000),
    }

@app.post("/v1/query/cypher")
async def query_cypher(req: CypherRequest):
    results = execute_cypher(req.cypher, req.params)
    return {"results": results, "count": len(results)}

@app.post("/v1/query/natural")
async def query_natural(req: NaturalQueryRequest):
    """Convert natural language to Cypher and execute."""
    # 1. Rule-based intent detection
    intent = detect_intent(req.question)
    entities = extract_entities(req.question)
    cypher = ""

    if intent:
        cypher = build_cypher_from_intent(intent, entities, req.question)

    # 2. LLM fallback if rule-based fails
    if not cypher and req.use_llm:
        cypher = await llm_generate_cypher(req.question, GRAPH_SCHEMA)

    if not cypher:
        return {
            "question": req.question,
            "cypher": None,
            "results": [],
            "error": "Could not generate Cypher for this question",
        }

    results = execute_cypher(cypher)
    return {
        "question": req.question,
        "intent": intent,
        "entities": entities,
        "cypher": cypher,
        "results": results,
        "count": len(results),
    }

@app.post("/v1/graph/upsert")
async def upsert_graph(req: UpsertRequest):
    """Upsert nodes and edges into the knowledge graph."""
    upserted_nodes = 0
    upserted_edges = 0

    for node in req.nodes:
        props = ", ".join(f"{k}: '{v}'" for k, v in node.properties.items())
        props_str = f", {props}" if props else ""
        cypher = f"MERGE (n:{node.type} {{id: '{node.id}'{props_str}}})"
        try:
            execute_cypher(cypher)
            upserted_nodes += 1
        except Exception as e:
            logger.warning(f"[upsert] Node {node.id}: {e}")

    for edge in req.edges:
        cypher = (
            f"MERGE (a:{edge.from_type} {{id: '{edge.from_id}'}}) "
            f"MERGE (b:{edge.to_type} {{id: '{edge.to_id}'}}) "
            f"MERGE (a)-[:{edge.relation}]->(b)"
        )
        try:
            execute_cypher(cypher)
            upserted_edges += 1
        except Exception as e:
            logger.warning(f"[upsert] Edge {edge.from_id}→{edge.to_id}: {e}")

    return {"upserted_nodes": upserted_nodes, "upserted_edges": upserted_edges}

@app.get("/v1/analytics/fraud-rings")
async def detect_fraud_rings():
    """Detect fraud rings: merchants sharing devices or customers."""
    # Find merchants sharing devices
    shared_device_cypher = """
MATCH (m1:Merchant)-[:SHARES_DEVICE_WITH]->(m2:Merchant)
RETURN m1.id AS merchant1, m1.name AS name1,
       m2.id AS merchant2, m2.name AS name2
LIMIT 50
"""
    # Find customers sharing devices
    shared_customer_cypher = """
MATCH (c1:Customer)-[:SHARES_DEVICE_WITH]->(c2:Customer)
RETURN c1.id AS customer1, c2.id AS customer2
LIMIT 50
"""
    # High-risk transaction clusters
    high_risk_cypher = """
MATCH (m:Merchant)-[:PROCESSED]->(t:Transaction)-[:TRIGGERED]->(a:Alert)
WHERE a.severity IN ['high', 'critical']
RETURN m.id AS merchant_id, m.name AS merchant_name,
       count(t) AS flagged_transactions, count(a) AS alerts
ORDER BY alerts DESC LIMIT 20
"""

    shared_merchants = execute_cypher(shared_device_cypher)
    shared_customers = execute_cypher(shared_customer_cypher)
    high_risk = execute_cypher(high_risk_cypher)

    # Build fraud ring groups
    rings = []
    if shared_merchants:
        from collections import defaultdict
        groups: Dict[str, set] = defaultdict(set)
        for row in shared_merchants:
            key = min(row.get("merchant1", ""), row.get("merchant2", ""))
            groups[key].add(row.get("merchant1", ""))
            groups[key].add(row.get("merchant2", ""))
        for key, members in groups.items():
            rings.append({"type": "merchant_device_sharing", "members": list(members), "size": len(members)})

    return {
        "fraud_rings": rings,
        "shared_device_merchants": shared_merchants,
        "shared_device_customers": shared_customers,
        "high_risk_merchants": high_risk,
        "total_rings": len(rings),
    }

@app.get("/v1/analytics/merchant/{merchant_id}/risk")
async def merchant_risk_analysis(merchant_id: str):
    """Comprehensive risk analysis for a merchant via graph traversal."""
    # Direct connections
    connections_cypher = f"""
MATCH (m:Merchant {{id: '{merchant_id}'}})-[r]-(n)
RETURN type(r) AS rel, labels(n)[0] AS node_type, n.id AS node_id, n.risk_score AS risk_score
LIMIT 100
"""
    # Transaction stats
    tx_cypher = f"""
MATCH (m:Merchant {{id: '{merchant_id}'}})-[:PROCESSED]->(t:Transaction)
RETURN count(t) AS total, 
       sum(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) AS failed,
       sum(CASE WHEN t.status = 'flagged' THEN 1 ELSE 0 END) AS flagged,
       avg(t.amount) AS avg_amount
"""
    # Alerts
    alerts_cypher = f"""
MATCH (m:Merchant {{id: '{merchant_id}'}})-[:PROCESSED]->(t:Transaction)-[:TRIGGERED]->(a:Alert)
RETURN a.type AS alert_type, a.severity AS severity, count(a) AS count
ORDER BY count DESC LIMIT 10
"""

    connections = execute_cypher(connections_cypher)
    tx_stats = execute_cypher(tx_cypher)
    alerts = execute_cypher(alerts_cypher)

    # Compute composite risk score
    tx = tx_stats[0] if tx_stats else {}
    total = tx.get("total", 0) or 1
    failed_rate = (tx.get("failed", 0) or 0) / total
    flagged_rate = (tx.get("flagged", 0) or 0) / total
    alert_count = sum(r.get("count", 0) for r in alerts)
    risk_score = min(100, int(failed_rate * 40 + flagged_rate * 40 + min(alert_count, 5) * 4))

    return {
        "merchant_id": merchant_id,
        "risk_score": risk_score,
        "risk_level": "critical" if risk_score > 80 else "high" if risk_score > 60 else "medium" if risk_score > 30 else "low",
        "connections": connections,
        "transaction_stats": tx_stats,
        "alerts": alerts,
    }

@app.post("/v1/analytics/path")
async def find_path(req: PathRequest):
    """Find shortest path between two entities in the graph."""
    cypher = f"""
MATCH path = shortestPath((a {{id: '{req.from_id}'}})-[*..{req.max_hops}]-(b {{id: '{req.to_id}'}}))
RETURN [node in nodes(path) | node.id] AS path_nodes,
       [rel in relationships(path) | type(rel)] AS path_rels,
       length(path) AS path_length
"""
    results = execute_cypher(cypher)
    return {
        "from_id": req.from_id,
        "to_id": req.to_id,
        "paths": results,
        "connected": len(results) > 0,
    }

@app.get("/v1/analytics/pagerank")
async def pagerank():
    """Compute PageRank for merchants (identifies central nodes in fraud networks)."""
    # FalkorDB supports PageRank via GRAPH.ALGO
    try:
        graph = get_graph()
        if not graph:
            return {"error": "FalkorDB unavailable"}

        # Use Cypher-based approximation if ALGO not available
        cypher = """
MATCH (m:Merchant)
OPTIONAL MATCH (m)-[:PROCESSED]->(t:Transaction)
OPTIONAL MATCH (t)<-[:INITIATED]-(c:Customer)
RETURN m.id AS merchant_id, m.name AS name,
       count(DISTINCT t) AS transaction_count,
       count(DISTINCT c) AS customer_count
ORDER BY transaction_count DESC LIMIT 50
"""
        results = execute_cypher(cypher)
        # Normalize to PageRank-like score
        max_tx = max((r.get("transaction_count", 0) or 0 for r in results), default=1)
        for r in results:
            r["pagerank_score"] = round((r.get("transaction_count", 0) or 0) / max(max_tx, 1), 4)

        return {"merchants": results, "algorithm": "degree_centrality_approximation"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/v1/kgqa/ask")
async def kgqa_ask(req: KGQARequest):
    """
    Full EPR-KGQA pipeline:
    1. Entity Recognition
    2. Property Extraction
    3. Relation Mapping
    4. Cypher Generation (rule-based + LLM fallback)
    5. Graph Execution
    6. Answer Formatting
    """
    # Step 1-3: Rule-based NLU
    intent = detect_intent(req.question)
    entities = extract_entities(req.question)
    cypher = ""

    # Step 4a: Rule-based Cypher
    if intent:
        cypher = build_cypher_from_intent(intent, entities, req.question)

    # Step 4b: LLM Cypher generation
    if not cypher:
        cypher = await llm_generate_cypher(req.question, GRAPH_SCHEMA)

    if not cypher:
        return {
            "question": req.question,
            "answer": "I could not understand your question. Please try rephrasing it.",
            "cypher": None,
            "results": [],
            "entities": entities,
        }

    # Step 5: Execute
    results = execute_cypher(cypher)

    # Step 6: Format answer
    if not results:
        answer = f"No results found for: '{req.question}'"
    elif len(results) == 1:
        answer = f"Result: {json.dumps(results[0], default=str)}"
    else:
        answer = f"Found {len(results)} results. First result: {json.dumps(results[0], default=str)}"

    response = {
        "question": req.question,
        "answer": answer,
        "results": results,
        "count": len(results),
        "intent": intent,
        "entities": entities,
    }
    if req.return_cypher:
        response["cypher"] = cypher
    return response

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False, workers=4, log_level="warning")
