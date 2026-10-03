# PayGate — Wave 6: End-to-End Feature↔Service↔Data Map + Data-Loss Verification + Visualization

## Goal
1. Verify every frontend surface (web PWA, Flutter, RN) maps to a backend service/router.
2. Verify every backend service maps to database tables (CRUD) and its middleware components (Kafka, Redis, Temporal, Keycloak, Permify, Mojaloop, OpenSearch, TigerBeetle, Dapr, Fluvio, APISIX, OpenAppSec, Sedona/GeoLibre, lakehouse).
3. Verify no data loss: every mutation persists; every table has a writer; every event has a consumer.
4. Deliver a VISUAL interactive map of features → services → middleware → tables (browser deliverable) + written gap report.

## Stage 1 — Mapping extraction (3 parallel agents, read-only)
- X1: server tRPC → build JSON: for each of ~256 router namespaces: file, procedure count, DB tables read/written (from drizzle imports/SQL), middleware/integration clients used (redis/kafka/temporal/etc. by import), frontend consumers (grep web client + flutter + RN for `trpc.<ns>`).
- X2: services layer → go-bridge packages, 13 rust-services, python-services: each service's routes, tables read/written, middleware deps (env vars/clients), who calls it (TS server or bridge proxy), event topics produced/consumed.
- X3: data-loss sweep → mutations without persistence, tables with no writer (refresh wave-4 list post-waves 4/5), Kafka/Fluvio topics without consumers, webhook/event flows without durable storage. Output gaps JSON.

Output format (all three): JSON files under /mnt/agents/output/paygate/.work/wave6/ — features.json, services.json, gaps.json with fields: name, type, consumers[], tablesRead[], tablesWrite[], middleware[], status(ok/orphan/no-writer/no-consumer/blocked).

## Stage 2 — Consolidation (lead)
Merge into one map.json; cross-validate counts vs wave-4/5 audit results (44% orphan proc baseline, 30 read-only tables → 10 fixed, etc.). Adversarial spot-check 10 random entries against source.

## Stage 3 — Visualization (1 agent)
Interactive single-page HTML app (self-contained, vis-network or cytoscape via vendored JS or hand-rolled canvas; no external CDN dependency risk — inline data): layered graph UI [Frontend surfaces] → [tRPC namespaces / services] → [middleware] → [DB tables], with filters (orphans, no-writer tables, missing middleware), search, and gap highlighting. Also a data-flow diagram page (mermaid-style or SVG) for the main money paths. Deliver via website_version_manager (type html).

## Stage 4 — Report
.md + .docx gap & data-flow report with REF tags.
