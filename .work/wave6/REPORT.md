# Wave 6 — Data-Loss Gap Sweep (post waves 1–5)

Deliverable: `gaps.json` (92 entries). Read-only sweep; no repo files modified, no git used.

## Counts per kind
| kind | count |
|---|---|
| mutation_no_persist | 28 |
| topic_no_consumer | 18 |
| table_no_writer_documented_external (info) | 14 |
| table_no_writer | 13 |
| topic_no_producer | 6 |
| swallowed_write_error | 5 (+1 resolved-note) |
| webhook_no_durable_storage | 3 |
| topic_name_mismatch | 2 |
| webhook_fire_and_forget_persist | 1 |
| event_flow_ok (info) | 1 |

Severity: 42 high / 29 medium / 4 low / 17 info.

## Top-10 worst
1. **tier1to5Router proxies into the void (20 mutations, high)** — 43 of 52 bridgePost/bridgeGet paths (e.g. `/lending/apply`, `/billing/subscribe`, `/dcc/lock-rate`, `/reconciliation/run`, `/kyb/submit`, `/session-risk/fingerprint`, `/loyalty/redeem`, `/webhooks/register`) have NO route in go-bridge's 335 mux routes or any other service; mutations throw "Bridge error 404" and persist nothing.
2. **server/routers.ts:1372 (high)** — payout error path `UPDATE payouts SET status='workflow_pending' ... .catch(() => {})`: silent total loss of the failure-park write on a money path.
3. **Regulatory topics produced but never consumed (high)** — `str.filed`, `str.submitted` (double-produced: psp-production.ts:1134 + go-bridge cbn_str.go:232), `velocity_limit.updated`, `chargeback.submitted_to_scheme`, `regulatory.generate_form_a/b/c`. Server has zero `startConsumer()` call sites.
4. **Consumed-but-never-produced topics (high)** — `paygate.transactions`, `paygate.payments`, `paygate.settlements` feed aml-monitor / reconciliation-engine / opensearch-indexer but no producer exists; `paygate.nibss.confirmation`, `paygate.mojaloop.callback`, `paygate.settlement.confirmed` consumers idle.
5. **Topic-name mismatches (high)** — `paygate.audit.events` (producer) vs `paygate-audit-events` (lakehouse consumer); `paygate.fraud.alert` vs `paygate.fraud_alerts` (opensearch-indexer). Audit lakehouse and fraud index receive nothing.
6. **nibss_webhook.go (high)** — inbound NIBSS settlement confirmation is HMAC-verified and forwarded with no durable receipt/idempotency record; forward failure loses the only copy.
7. **face_embeddings (high)** — zero writers/readers outside schema + existence tests; biometric KYC data never persisted (deepface-sidecar doesn't write it).
8. **regulator_magic_tokens (high)** — zero references; regulator magic-link tokens not durably stored.
9. **consumer_insurance_policies / emi_installments (high)** — crud119 reads them and creates child rows (claims, contracts) but the parent rows can never be created.
10. **wave80Router.updateMenuFlow:1276 (high)** — USSD menu update returns `{success:true}` with zero persistence.

## Verified NOT gaps (post wave-4/5 state)
- webhookDispatch/webhookRetry: deliveries mirrored to `webhook_deliveries` + `webhook_delivery_log`; DLQ = attemptCount≥7 with list/redrive.
- 14 read-only tables carry A2-HIGH-1 writer notes (external producers) — recorded as `info`.
- crud120/crud120b audit publishes use `publishAuditEventLoud` (loud failure, not `.catch(()=>{})`).
- wave80.initiateTransfer, crud119 cross-border create, wave29.runBatchPromotion are documented fail-loud stubs.

## Method notes
382 pgTable extracted; writer detection = repo-wide grep for insert/update/INSERT INTO proximity across server/, go-bridge/, rust-services/, python-services/, go-services (aliases verified manually, e.g. `securityEvents` alias clears nexthub_security_events). Mutation scan: 377 mutations across wave26–32, wave80, tier1to5, crud119/120/120b brace-matched and checked for persist/emit keywords; flagged entries manually verified. Residual risk: multi-line writer calls may under-flag a few tables; FUSE timeouts forced cached-hit verification for some candidates.
