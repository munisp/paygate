# PayGate — Wave 5: In-Memory Map Audit & Persistence Remediation

## Goal
Find every in-memory store (`new Map(`, `new Set(`, module-level caches, `sync.Map`, `map[...]...` globals, `HashMap`/`RwLock` statics, Python dict/module globals) across TS/JS, Go, Rust, Python. Classify each:
- **CRITICAL** — business data (money, ledger, transactions, accounts, mandates, balances, idempotency keys) → must persist to Postgres (real table) or TigerBeetle/Redis per domain.
- **MEDIUM** — session/auth/security state (rate-limit counters, OTP, tokens, replay guards, audit) → Redis (shared, TTL) or DB write-through (per 0107 pattern).
- **BENIGN** — pure cache with a correct miss path (fail-open lookup cache) → keep, document; or bounded with eviction.
- **TEST-ONLY** — in test files → leave.

## Discipline (carried)
FIX_ALL_IN_SCOPE. No mocks/stubs/placeholders on production paths. Fail-loud. PGlite-backed tests where feasible. Adversarial verification. Gates per language. Report BLOCKED honestly.

## Stage 1 — Audit (4 parallel read-only auditors)
- M1: server/ + client/ TS/JS (excluding node_modules, dist) — every Map/Set/module cache; for each: file:line, what it stores, read/write paths, restart impact, classification, persistence target.
- M2: go-bridge/ Go — package-level maps/slices holding state, sync.Map, in-mem fallbacks.
- M3: rust-services/ Rust — statics, lazy_static/OnceLock, HashMap in AppState, in-mem stores (note baseline-broken crates).
- M4: python-services/ + mobile (Dart/Kotlin/Swift if present) — module globals, in-mem stores, and mobile persistence gaps (in-memory caches that should be disk/secure storage).
Output: unified table (file:line | language | stores | classification | persistence target | fix sketch).

## Stage 2 — Fixes (disjoint ownership)
- W17: server CRITICAL items → real drizzle tables + migrations 0108+, write-through + hydration (0107 pattern), PGlite/vitest coverage.
- W18: server MEDIUM items → Redis-backed (fail-closed for money-path counters; fail-open only for pure caches) or DB write-through.
- W19: go-bridge + rust-services fixes (respect baseline-broken crates: pattern parity + honest report).
- W20: python + mobile fixes.

## Stage 3 — Gates + commit + push + report
Gates: server tsc, vitest money paths, go build/vet, cargo check (4 compilable crates), py_compile. Commit wave 5, push (PAT if fresh one provided, else MCP), report .md + .docx.
