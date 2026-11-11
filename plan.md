# PayGate — Wave 7: Close All Gap-Register Items

Source: .work/wave6/gaps.json (92 findings) + wave-6 map residuals.

## Stage 1 — Fixers (parallel, disjoint ownership)
- G1 (server TS): writer-less tables → real write paths (consumer_insurance_policies, emi_installments, face_embeddings, regulator_magic_tokens, keycloak_role_sync_logs, loyalty_promotion_log, middleware_health_logs, fx_live_rates, 5 nexthub tables); fake-success mutations (wave80.updateMenuFlow, wave27.verifyDomain, wave30.updateRate, wave32 SSO test) → real persistence or fail-loud; 2 console-only alert persists → DB.
- G2 (go-bridge): tier1to5Router 43 dead proxy routes → implement the bridge routes (or map to existing) so mutations persist; verify against tier1to5Router.ts expectations.
- G3 (topics): 26 topic wiring fixes — add producers for consumed-only topics, consumers for produced-only regulatory topics (or document retirement), fix 2 naming mismatches (audit.events, fraud.alert).
- G4 (services wiring): 9 unreachable services → wire callers (bridge proxy routes / temporal / compose) or mark retired with honest removal; 32 orphan namespaces → triage: wire cheap wins to existing admin pages; document retirement list.
- G5 (mojaloop/tigerbeetle weaknesses): go-services gateway note, recon streaming doc, compile-verify attempt for baseline-broken crates if network allows.

## Stage 2 — Gates + commit + push + report
server tsc, vitest, go build/vet, cargo check, py_compile; migrations 0112+ if new tables; apply+verify; push (MCP; routers.ts still needs PAT); report .md/.docx.
