# NextHub ↔ PayGate Integration Architecture

**Author:** Manus AI  
**Date:** July 2026  
**Version:** Wave 221  
**Scope:** How NextHub (the payment hub / switch layer) integrates with PayGate (the merchant-facing PSP) and with physical POS terminals.

---

## 1. Overview

PayGate is a **Payment Service Provider (PSP)** — it gives merchants API keys, a dashboard, payment links, virtual cards, and a settlement account. NextHub is the **payment hub / interbank switch** that sits beneath PayGate and routes money between financial institutions (DFSPs — Digital Financial Service Providers) using the Mojaloop FSPIOP protocol, TigerBeetle for double-entry ledger accounting, and Temporal for long-running workflow orchestration.

The relationship is best understood as three concentric layers:

| Layer | Component | Role |
|---|---|---|
| **Merchant layer** | PayGate Merchant Portal | Merchant-facing SaaS: API keys, checkout, payouts, disputes, analytics |
| **Middleware layer** | Go Bridge (`go-bridge`) | Translates PayGate tRPC calls into TigerBeetle ledger operations, Mojaloop FSPIOP calls, Kafka events, and Permify authorization checks |
| **Hub / switch layer** | NextHub | Interbank switch: DFSP onboarding, settlement windows, net debit caps, PISP consent, FX, bulk transfers, reconciliation |

---

## 2. PayGate as a DFSP on NextHub

When a merchant is onboarded to PayGate, the platform itself is registered as a **DFSP** (Digital Financial Service Provider) on the NextHub switch. This means:

1. **PayGate has a `dfspId`** in the `nexthub_dfsps` table (e.g. `PAYGATE-NG`), a TigerBeetle position account, and a TigerBeetle liquidity account.
2. **Each merchant's settlement account** is a sub-account under the PayGate DFSP. Intra-PayGate transfers (merchant A pays merchant B) never leave the PayGate DFSP — they are settled internally via TigerBeetle without touching the Mojaloop switch.
3. **Cross-DFSP transfers** (a PayGate merchant receiving money from a customer at GTBank or Kuda) flow through the NextHub switch via FSPIOP: party lookup → quote → transfer → callback.

The `nexthub_participants` table tracks each DFSP's onboarding status (PENDING → ACTIVE → SUSPENDED), and the `nexthub_participant_limits` table enforces net debit caps (NDC) and position limits per DFSP per currency.

---

## 3. PayGate ↔ NextHub Integration Points

### 3.1 Transaction Flow (Inbound Payment to a Merchant)

When a customer at GTBank wants to pay a PayGate merchant via NIP (NIBSS Instant Payment):

```
Customer (GTBank app)
  │
  ▼
GTBank DFSP  ──FSPIOP GET /parties──▶  NextHub Switch
                                           │
                                    Party lookup resolves
                                    to PayGate DFSP
                                           │
  ◀──FSPIOP POST /quotes──────────────────┘
  GTBank sends quote request
                                           │
                                    NextHub routes to PayGate
                                    Go Bridge (MOJALOOP_URL)
                                           │
  ◀──FSPIOP POST /transfers───────────────┘
  GTBank commits transfer
                                           │
                                    Go Bridge calls TigerBeetle:
                                    debit GTBank position account
                                    credit PayGate merchant account
                                           │
                                    Kafka event: paygate.transactions.created
                                           │
                                    Portal tRPC: transactions.create
                                    (merchant dashboard updates)
```

The Go Bridge exposes `/v1/mojaloop/transfer` (authenticated) and `/v1/pos/settlement/confirm` (HMAC-verified webhook from NIBSS) as the two primary inbound integration points.

### 3.2 Outbound Payment (Merchant Payout to a Bank Account)

When a merchant requests a payout to their settlement bank account:

```
Merchant Portal
  │  trpc.payouts.create
  ▼
Portal Server (routers.ts)
  │  middlewareBridge.initiateApprovalViaMiddleware
  ▼
Go Bridge  POST /v1/payouts/initiate-approval
  │
  ├── Permify: check payout:approve permission
  ├── TigerBeetle: reserve merchant balance
  ├── Redis: cache approval workflow state
  ├── Kafka: publish paygate.payouts.initiated
  └── (if above threshold) Temporal: start PayoutApprovalWorkflow
        │
        ▼
      Approver reviews in portal
        │  trpc.payouts.approve
        ▼
      Go Bridge  POST /v1/payouts/{id}/approve
        │
        ├── TigerBeetle: post debit from merchant account
        ├── NIBSS NIP: initiate outbound NIP transfer
        ├── Kafka: publish paygate.payouts.approved
        └── notifyOwner: push notification to merchant
```

### 3.3 PISP (Payment Initiation Service Provider) Consent

NextHub supports the Mojaloop PISP extension, allowing third-party apps (e.g. a budgeting app) to initiate payments on behalf of a consumer with their consent. The `nexthub_pisp_consents` table tracks the full consent lifecycle:

| State | Description |
|---|---|
| `REQUESTED` | Consumer has been redirected to their DFSP to grant consent |
| `GRANTED` | DFSP has issued a signed credential (FIDO2 or OTP) |
| `ACTIVE` | PISP can initiate transfers up to the consented scope |
| `REVOKED` | Consumer or DFSP has revoked the consent |
| `EXPIRED` | Consent TTL has elapsed |

The `nexthubPISPRouter` exposes `listConsents`, `getConsent`, `grantConsent`, `revokeConsent`, and `getConsentStats` procedures. A third-party PSP integrating with NextHub as a PISP would call these via the portal API (authenticated with a `developer_api_keys` key scoped to `pisp:write`).

### 3.4 FX and Multi-Currency

The `nexthubFXRouter` manages FX conversion rates between currency corridors. When a cross-border transfer is initiated:

1. The Go Bridge calls `requestMojaloopQuoteViaMiddleware` which hits `/v1/mojaloop/quotes`.
2. The Mojaloop switch returns a quote with an ILP (Interledger Protocol) condition.
3. The FX rate is locked for the quote TTL (typically 30 seconds).
4. On transfer commit, the Go Bridge posts a TigerBeetle credit in the destination currency and a debit in the source currency, using the locked FX rate.

The `nexthubFX` router also exposes `getRate`, `listRates`, `updateRate`, and `getRateHistory` for the portal's FX Dashboard.

### 3.5 Settlement Windows

NextHub runs a **Deferred Net Settlement (DNS)** model with configurable windows:

| Window Type | Frequency | Description |
|---|---|---|
| `DNS_INTRADAY` | Every 4 hours | Intraday net settlement between DFSPs |
| `DNS_EOD` | Daily at 23:00 WAT | End-of-day final settlement |
| `RTGS` | Real-time | High-value transfers above the RTGS threshold |

The settlement flow is: `OPEN → CLOSED → SETTLING → SETTLED`. During `SETTLING`, the Go Bridge triggers a Temporal `SettlementWorkflow` that:
1. Queries the TigerBeetle position accounts for each DFSP.
2. Calculates net positions (credits − debits).
3. Posts multi-leg TigerBeetle entries to zero out positions.
4. Sends NIBSS batch files for external DFSPs.
5. Writes a Parquet audit record to the Lakehouse.

---

## 4. POS Terminal Integration

### 4.1 Architecture

PayGate supports three POS terminal models: `soundbox_basic`, `android_pos`, and `mpos_card`. Each terminal is registered in the `pos_terminals` table with a `merchantId`, `serialNumber`, `location`, and `status`.

```
POS Terminal (Android / Soundbox)
  │
  │  HTTPS POST /v1/pos/transaction  (TLS 1.3, mTLS optional)
  ▼
APISIX API Gateway  ──rate-limit──▶  Go Bridge
                                         │
                                    Validate terminal serial
                                    against pos_terminals table
                                         │
                                    Channel routing:
                                    ┌────┬────┬────┬────┐
                                    │ QR │Card│ NIP│USSD│
                                    └────┴────┴────┴────┘
                                         │
                                    TigerBeetle: debit customer
                                    account, credit merchant account
                                         │
                                    Kafka: paygate.pos.transaction
                                         │
                                    Portal tRPC: posTransactions.record
                                         │
                                    Soundbox audio alert (if enabled):
                                    POST /v1/pos/{terminalId}/audio-alert
                                    (language: en | yo | ha | ig)
```

### 4.2 Payment Channels on POS

Each `pos_transaction` record carries a `channel` field that determines the downstream processing path:

| Channel | Protocol | Settlement Path |
|---|---|---|
| `qr` | PayGate QR (EMVCo-compatible) | TigerBeetle internal + NIBSS batch |
| `card` | ISO 8583 / EMV | NIBSS PTSP batch settlement |
| `nip` | NIP (NIBSS Instant Payment) | Real-time via NIBSS NIP gateway |
| `ussd` | USSD session (Redis state machine) | TigerBeetle internal |

### 4.3 PTSP Settlement (Card Transactions)

Card transactions on POS terminals are settled via the PTSP (Payment Terminal Service Provider) batch process:

```
End of Day
  │
  ▼
Portal: posTransactions.closeBatch
  │  Creates ptsp_settlement_batches record (status: pending)
  ▼
Go Bridge: POST /v1/settlements/trigger
  │  Aggregates all card transactions for the day
  │  Generates NIBSS batch file (ISO 8583 batch format)
  ▼
NIBSS Gateway
  │  Processes batch (T+1)
  ▼
NIBSS Webhook: POST /v1/pos/settlement/confirm
  │  HMAC-SHA256 verified (X-NIBSS-Signature header)
  │  Updates ptsp_settlement_batches status to confirmed/failed
  ▼
Portal: posTransactions.confirmBatch
  │  Updates pos_transactions.settlement_status = 'settled'
  │  Updates pos_terminals.totalVolumeKobo (cached counter)
  ▼
notifyOwner: "Batch {batchId} settled — ₦{amount}"
```

### 4.4 Soundbox Audio Alerts

Soundbox terminals (the most common POS form factor in Nigeria) receive audio payment confirmations. The `pos_terminals` table stores `audioAlertsEnabled` and `audioLanguage` (en | yo | ha | ig). After a successful transaction, the Go Bridge publishes a `paygate.pos.audio_alert` Kafka event that the Soundbox firmware subscribes to via a persistent WebSocket connection.

### 4.5 Offline Resilience

The `offlineResilienceRouter` (Wave 124) handles the case where a POS terminal loses connectivity. Transactions are queued locally on the terminal (SQLite) and replayed when connectivity is restored. The Go Bridge deduplicates replayed transactions using the `idempotency_requests` table (keyed on `terminalId + localSequenceNumber`).

---

## 5. PSP Integration (Third-Party PSPs Using NextHub)

A third-party PSP (e.g. Flutterwave, Paystack, or a new fintech) can integrate with NextHub as a **DFSP participant** rather than as a merchant. The integration steps are:

### 5.1 DFSP Onboarding

1. **Register DFSP** via `nexthubDfsps.create` — provide `dfspId`, `dfspName`, `dfspType` (bank | mno | fintech | cbdc), `callbackUrl`, and TLS client certificate.
2. **Set NDC limits** via `nexthubParticipants.setLimits` — configure `netDebitCap`, `positionLimit`, and `alertThreshold`.
3. **Configure fee tiers** via `nexthubBilling.upsertFeeTier` — choose flat, tiered, or volume-discount fee model for each fee category (SCHEME_FEE, INTERCHANGE, FX_MARKUP, PENALTY).
4. **Complete onboarding checklist** — the 7-step `ParticipantLifecycle` tracker in the portal UI tracks: Registration → Connectivity Test → Technical Testing → Compliance Review → NDC Configuration → Pilot → Production.

### 5.2 FSPIOP Callback Registration

The PSP registers a `callbackUrl` that NextHub calls for:

| Callback | Description |
|---|---|
| `PUT /parties/{Type}/{ID}` | Party lookup response |
| `PUT /quotes/{ID}` | Quote response |
| `PUT /transfers/{ID}` | Transfer fulfillment |
| `PUT /transfers/{ID}/error` | Transfer error |
| `PUT /consents/{ID}` | PISP consent update |

The Go Bridge validates callbacks using JWS RS256 signatures (the Mojaloop JWS standard).

### 5.3 Real-Time Position Monitoring

The `nexthub_participant_positions` table is updated after every transfer. When a DFSP's `ndcUtilisation` exceeds the `alertThreshold` (default 80%), the portal:
1. Shows an NDC alert badge in the sidebar.
2. Sends an owner notification via `notifyOwner`.
3. If `suspendOnBreach` is true and utilisation reaches 100%, the DFSP is automatically suspended (status → `SUSPENDED`) until liquidity is topped up.

### 5.4 Billing and Invoicing

Monthly invoices are generated by `nexthubBilling.generateInvoice`. The invoice aggregates `fee_postings` for the billing period, applies the DFSP's fee tier model, and produces a `nexthub_invoices` record. PSPs can download invoices as PDF from the portal.

---

## 6. Domain Vertical Integration

NextHub is not limited to generic payment switching. The seven domain verticals (Waves 211–217) each integrate with NextHub in domain-specific ways:

| Domain | NextHub Integration |
|---|---|
| **Remittance** | Uses Mojaloop cross-border extension + BRICS Pay Rust signer for PAPSS/CIPS/UPI/PIX corridors |
| **Healthcare** | FHIR R4 claim adjudication results trigger TigerBeetle ERA (Electronic Remittance Advice) payments |
| **Insurance** | ACORD AL3 premium collection events post to TigerBeetle; claims payouts flow through NextHub settlement |
| **Supply Chain Finance** | GS1 EPCIS 2.0 goods receipt events trigger invoice discounting; TigerBeetle posts early payment |
| **G2P Disbursements** | OpenG2P batch disbursements use NextHub bulk transfer API; each beneficiary is a DFSP sub-account |
| **Energy VEND** | DLMS/COSEM meter vend events trigger NIP micro-payments; STS token generation is post-settlement |
| **CBDC** | ISO 20022 + mBridge + OpenCBDC atomic swaps use the 6-step CBDC atomic swap Temporal workflow |

---

## 7. Developer API Integration

Third-party developers integrate with PayGate (and by extension NextHub) via the **Developer Settings** page (`/settings/developer`):

1. **Generate an API key** (test or live environment, scoped to specific capabilities: `payments:write`, `payouts:read`, `pisp:write`, etc.).
2. **Register a webhook** to receive real-time events (transaction.created, payout.settled, dispute.opened, etc.) with HMAC-SHA256 signing.
3. **Monitor delivery logs** — every webhook delivery is recorded in `developer_webhook_deliveries` with status, HTTP response code, latency, and payload. Failed deliveries can be retried manually or will be retried automatically (exponential backoff, max 5 attempts).

The `wave221_developer.ts` router exposes all these capabilities as tRPC procedures, and the `developer_api_keys` table stores keys with bcrypt-hashed secrets (only the prefix is shown after creation).

---

## 8. Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PayGate Merchant Portal                       │
│  (React + tRPC + Express)                                            │
│                                                                      │
│  Merchant Dashboard │ POS Manager │ Developer Settings │ NextHub UI  │
└──────────────┬──────────────────────────────────────────────────────┘
               │ tRPC over HTTPS
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Go Bridge (Middleware)                        │
│                                                                      │
│  TigerBeetle │ Mojaloop FSPIOP │ NIBSS NIP │ Permify │ Kafka │ Redis │
└──────┬───────┴────────┬────────┴─────┬─────┴────────────────────────┘
       │                │              │
       ▼                ▼              ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────────────────────────┐
│ TigerBeetle  │ │  NextHub    │ │  NIBSS Gateway                   │
│ (Ledger)     │ │  Switch     │ │  (NIP / PTSP batch settlement)   │
│              │ │  (Mojaloop) │ └──────────────────────────────────┘
│ 8 account    │ │             │
│ codes, 7     │ │  DFSP A     │
│ transfer     │ │  DFSP B     │
│ codes        │ │  DFSP C     │
└──────────────┘ └─────────────┘
```

---

## 9. Key Tables Reference

| Table | Purpose |
|---|---|
| `nexthub_dfsps` | Registered DFSPs (banks, MNOs, fintechs, CBDCs) |
| `nexthub_participants` | Participant onboarding status and endpoint URLs |
| `nexthub_participant_limits` | NDC, position limits, alert thresholds |
| `nexthub_participant_positions` | Real-time position tracking per DFSP per currency |
| `nexthub_liquidity_windows` | Intraday liquidity windows |
| `nexthub_pisp_consents` | PISP consent lifecycle (REQUESTED → ACTIVE → REVOKED) |
| `nexthub_transfers` | All inter-DFSP transfers (FSPIOP correlation) |
| `settlement_windows` | DNS settlement window lifecycle |
| `settlement_net_positions` | Net position per DFSP per settlement window |
| `nexthub_invoices` | Monthly billing invoices per DFSP |
| `fee_postings` | Individual fee postings per transfer |
| `dfsp_fee_tiers` | Fee tier configuration per DFSP |
| `pos_terminals` | Registered POS terminals per merchant |
| `pos_transactions` | Individual POS payment events |
| `ptsp_settlement_batches` | NIBSS PTSP card settlement batches |
| `developer_api_keys` | Third-party API keys (scoped, env-aware) |
| `developer_webhooks` | Registered webhook endpoints |
| `developer_webhook_deliveries` | Delivery log per webhook event |

---

*Document generated from codebase analysis of PayGate Merchant Portal Wave 221.*
