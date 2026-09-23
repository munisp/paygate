# Plan — Comprehensive Performance Tuning (wave 3)

Toolchains: DONE (go1.25.4, rust1.89.0, node20+tsc5.9.3 restored via bootstrap_env).

## Stage 1 — Perf audit (4 parallel explore agents)
- P-A server: Express/tRPC middleware chain order, DB N+1 (grep .map with await query loops),
  unindexed hot columns, missing pagination defaults, withCache coverage on hot reads, compression,
  JSON serialization, connection pool config, sync blocking calls.
- P-B go-bridge + rust-services: handler allocations, TB client batching, redis pipeline, HTTP timeouts,
  keepalive, mutex contention, JSON vs proto.
- P-C web client: vite bundle splitting, lazy coverage, trpc/react-query cache config, list rendering,
  image/asset weight, refetch storms (refetchInterval), App.tsx structure.
- P-D mobile: flutter lib + react-native src — network layer (caching, retries, batching), list
  virtualization, render perf, offline cache, image caching, startup cost.

## Stage 2 — Fixes (coder agents, disjoint ownership)
- W9 server perf (server/, drizzle indexes migration 0106)
- W10 go-bridge + rust perf
- W11 web client perf (client/)
- W12 mobile perf (mobile/flutter, mobile/react-native)
Lead: integration, gates, push (API), report.

## Stage 3 — Gates
tsc server/client 0; vitest regressions; go build/vet/test; flutter analyze (if SDK present, else static review);
mobile tsc if RN has tsconfig; migration applied; commit; MCP push; report .md+.docx.
Targets: p95 API < 200ms warm cache hits < 50ms; dashboard overview cached; mobile lists virtualized; no N+1 on hot paths.
