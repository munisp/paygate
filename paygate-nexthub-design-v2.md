# PayGate NextHub: Next-Generation Interoperability Platform

**Architecture Design Document — Version 2.0**
*Author: Manus AI for PayGate Engineering*
*Date: July 2026*

---

## Executive Summary

PayGate NextHub is a next-generation financial interoperability hub designed to be a **fully compatible, drop-in replacement for Mojaloop** while simultaneously connecting to every major global payment rail: NIBSS NIP (Nigeria), SWIFT gpi, CIPS (China), UPI (India), SEPA Instant (Europe), Fedwire/FedNow/RTP (USA), mBridge (multi-CBDC), and Open Payments (Interledger). It is built on a four-language middleware stack — **Go** for gateway and orchestration, **Rust** for the financial ledger and event serialisation, **Python** for intelligence and compliance, and **TypeScript** for the operator portal and DFSP SDK — and uses Fluvio as its primary event bus rather than the synchronous HTTP callback model that constrains Mojaloop today.

The document is structured in four parts: (1) a critique of Mojaloop's current architecture and the design principles that address its limitations; (2) a full compatibility specification guaranteeing drop-in replacement; (3) a global rail integration catalogue covering twelve payment networks; and (4) ten innovation recommendations that differentiate NextHub from all existing hub implementations.

---

## Part I — Why a New Hub?

### 1.1 Mojaloop's Achievements and Constraints

Mojaloop has made a genuine contribution to financial inclusion. By 2026, it processes over 1,000 transactions per second in production deployments across Tanzania, Lesotho, and the Philippines, and its v17 release added ISO 20022 support and cross-border inter-scheme routing. [1] The Mojaloop community has explicitly placed TigerBeetle on its ledger upgrade roadmap, acknowledging that MySQL is a bottleneck at scale. [2]

However, Mojaloop carries architectural debt from its 2017 design that cannot be resolved by incremental upgrades:

The hub requires **30+ independent Node.js microservices**, each with its own database, health endpoint, and deployment manifest. This creates an operational surface area that is prohibitive for central banks and smaller scheme operators in emerging markets. A single Mojaloop deployment on Kubernetes requires a minimum of 24 pods just for the core services, before adding monitoring, logging, and the DFSP simulator.

The **callback model is synchronous in practice**. Although FSPIOP is nominally asynchronous, the hub must maintain an open HTTP connection context for each in-flight transfer while it waits for the payee DFSP's PUT callback. A slow or unreachable DFSP blocks a goroutine (or Node.js event loop tick) for the full transfer timeout window (default: 30 seconds). This creates head-of-line blocking that limits true concurrency.

The **financial ledger uses MySQL** with application-level double-entry bookkeeping. MySQL's MVCC transaction model introduces lock contention at high throughput, and the application-level accounting logic is not formally verified. TigerBeetle, by contrast, is a purpose-built financial database with formally verified double-entry semantics, 1 million transfers per second on commodity hardware, and deterministic crash recovery. [3]

**Compliance and fraud scoring are afterthoughts**. Mojaloop has no native fraud scoring pipeline. The community-maintained ALS (Account Lookup Service) has no ML integration. STR filing requires a separate compliance system with a custom integration.

### 1.2 NextHub Design Principles

NextHub is guided by five principles derived from the above analysis.

**Mojaloop-compatible by default.** Every FSPIOP v1.1 endpoint is implemented verbatim. Any DFSP that connects to a Mojaloop hub today can connect to NextHub without changing a single line of code. ISO 20022 pacs.008/pacs.002 messages are supported natively alongside FSPIOP.

**Event-native, not callback-native.** DFSPs subscribe to Fluvio topic partitions rather than receiving HTTP POST callbacks. The hub publishes transfer lifecycle events to Fluvio; DFSPs consume them at their own pace. This eliminates head-of-line blocking and provides natural backpressure via consumer lag monitoring.

**Single financial store.** TigerBeetle is the only place where money moves. All position changes, settlement entries, and fee postings are linked TigerBeetle transfers. There is no application-level accounting logic.

**Intelligence in the critical path.** The Python ML fraud scoring service is called synchronously via gRPC during the PREPARE phase, with a 5 ms SLA enforced by a circuit breaker. A transfer that scores above the threshold is held for human review rather than rejected outright, enabling a graduated response.

**Operational simplicity.** The entire hub can run as a single binary in development mode, or as five Docker containers in production. There is no Kubernetes requirement for deployments under 500 TPS.

---

## Part II — Mojaloop Drop-In Compatibility

### 2.1 FSPIOP v1.1 Endpoint Parity

NextHub implements every FSPIOP v1.1 resource and HTTP method. The table below maps each Mojaloop endpoint to its NextHub handler, implemented in the Go APISIX plugin layer.

| FSPIOP Resource | HTTP Methods | NextHub Handler | Notes |
|---|---|---|---|
| `/participants` | POST, PUT, GET, DELETE | `go/fspiop/participants.go` | Redis-backed ALS with TTL |
| `/parties/{Type}/{ID}` | GET, PUT | `go/fspiop/parties.go` | Party oracle with MSISDN/IBAN/BVN/email/wallet |
| `/quotes` | POST, PUT | `go/fspiop/quotes.go` | ILP packet generation, fee calculation |
| `/transactionRequests` | POST, PUT | `go/fspiop/txrequest.go` | Payee-initiated flow |
| `/authorizations` | POST, PUT | `go/fspiop/authz.go` | OTP/PIN challenge-response |
| `/transfers` | POST, PUT, PATCH | `go/fspiop/transfers.go` | PREPARE/FULFIL/COMMIT notification (v1.1) |
| `/transactions/{ID}` | GET | `go/fspiop/transactions.go` | Transfer lookup |
| `/bulkQuotes` | POST, PUT | `go/fspiop/bulkquotes.go` | Batch fee calculation |
| `/bulkTransfers` | POST, PUT, GET | `go/fspiop/bulktransfers.go` | Batch two-phase transfer |

All FSPIOP headers are preserved verbatim: `FSPIOP-Source`, `FSPIOP-Destination`, `FSPIOP-URI`, `FSPIOP-HTTP-Method`, `FSPIOP-Signature`, `FSPIOP-Encryption`, `traceparent`, and `tracestate`. JWS signature verification is performed at the APISIX gateway layer before the request reaches the Go handler, ensuring that unsigned requests are rejected at the edge.

### 2.2 Callback Compatibility Layer

For DFSPs that have not yet migrated to the Fluvio subscription model, NextHub provides a **Callback Bridge** service. The bridge subscribes to the relevant Fluvio topic partition for each DFSP and translates Fluvio events back into HTTP PUT callbacks, delivered to the DFSP's registered callback URL. This means that a DFSP using the standard Mojaloop SDK connector requires zero changes: it registers its callback URL with NextHub exactly as it would with a Mojaloop hub, and the Callback Bridge handles the translation transparently.

### 2.3 ISO 20022 Native Support

NextHub supports ISO 20022 MX messages natively alongside FSPIOP. The Go gateway layer includes an ISO 20022 parser that translates incoming MX messages into the internal NextHub transfer model, and a serialiser that translates outgoing events into MX messages for DFSPs that prefer ISO 20022. The supported message types are listed below.

| ISO 20022 Message | Purpose | NextHub Mapping |
|---|---|---|
| `pacs.008` | FI-to-FI Customer Credit Transfer | `POST /transfers` (PREPARE) |
| `pacs.002` | Payment Status Report | `PUT /transfers/{ID}` (FULFIL) |
| `pacs.004` | Payment Return | Refund/reversal flow |
| `camt.056` | Payment Cancellation Request | Transfer abort |
| `camt.054` | Bank-to-Customer Debit/Credit Notification | Settlement advice |
| `pacs.009` | Financial Institution Credit Transfer | RTGS settlement instruction |
| `pain.001` | Customer Credit Transfer Initiation | Bulk payment initiation |
| `pain.002` | Customer Payment Status Report | Bulk payment status |

SWIFT completed its full migration from MT to MX (ISO 20022) in November 2025. [4] Fedwire completed its ISO 20022 migration in July 2025. [5] NextHub's native ISO 20022 support means it can connect directly to both networks without a translation layer.

---

## Part III — Global Rail Integration Catalogue

The following section describes how NextHub connects to each major payment rail. In every case, the integration follows the same pattern: a **Go bridge handler** translates between the rail's native protocol and the NextHub internal event model, publishes to Fluvio, and the **Rust settlement service** posts the corresponding TigerBeetle transfer when the rail confirms completion.

![PayGate NextHub Architecture](nexthub-architecture.png)

### 3.1 NIBSS NIP (Nigeria)

NIBSS NIP is Nigeria's real-time interbank settlement system, connecting all 30+ CBN-licensed commercial banks. PayGate already has `NIBSS_GATEWAY_URL`, `NIBSS_INSTITUTION_CODE`, and `NIBSS_SECRET_KEY` configured. The Go NIP bridge handler supports name enquiry (account validation), virtual account generation (30-minute NIP virtual accounts for bank transfer collections), and outbound NIP transfers. The Python analytics aggregator tracks NIP transfer success rates, average settlement time, and failure reason codes, writing daily summaries to the Lakehouse.

### 3.2 SWIFT gpi and ISO 20022

SWIFT gpi (global payments innovation) is the standard for cross-border correspondent banking, processing over $300 billion per day. [6] SWIFT completed its ISO 20022 migration in November 2025, meaning all new SWIFT messages are MX format. NextHub connects to SWIFT via the SWIFT Alliance Gateway (SAG) or SWIFT Alliance Lite2, using the ISO 20022 `pacs.008` message for credit transfers and `camt.056` for cancellations. The Go SWIFT bridge handler signs messages with the institution's BIC and submits them via the SWIFT Connector API. SWIFT gpi Tracker status updates are consumed via the SWIFT Notification Service and published to Fluvio as `swift.transfer.updated` events.

### 3.3 CIPS (China Cross-Border Interbank Payment System)

CIPS is China's alternative to SWIFT for RMB cross-border payments, with 1,580+ direct and indirect participants across 116 countries as of 2026. [7] CIPS uses ISO 20022 messaging and supports both direct participants (banks with a CIPS account) and indirect participants (banks that route through a direct participant). Notably, CIPS still uses SWIFT's messaging infrastructure for a large proportion of transactions. [8] The Go CIPS bridge handler connects via the CIPS Connector API, which uses ISO 20022 `pacs.008` for RMB transfers. NextHub supports both direct CIPS participation (for institutions with a CIPS account) and indirect participation (routing through a correspondent bank). The Rust settlement service posts TigerBeetle transfers in CNY when a CIPS transfer is confirmed.

### 3.4 UPI (Unified Payments Interface, India)

UPI is India's real-time payment system operated by NPCI, processing over 34% more transactions monthly in August 2025 than the same period in 2024. [9] UPI uses a VPA (Virtual Payment Address, e.g., `user@okaxis`) as the payment identifier, which maps to the party addressing model in FSPIOP. The Go UPI bridge handler connects via the NPCI UPI API (available to licensed Payment Service Providers and banks). It supports collect requests (payee-initiated), pay requests (payer-initiated), and mandate creation (recurring payments). UPI's two-phase model (collect → debit → credit) maps directly to the NextHub PREPARE/FULFIL flow. The party oracle stores VPA-to-account mappings in Redis with a 24-hour TTL.

### 3.5 SEPA Instant Credit Transfer (SCT Inst)

SEPA Instant enables euro transfers in under 10 seconds across 36 European countries, with a per-transaction limit of €100,000 (increased from €15,000 in the 2025 rulebook update). [10] The EPC SCT Inst scheme uses ISO 20022 `pacs.008` for the credit transfer and `pacs.002` for the status report. The Go SEPA bridge handler connects to the TARGET Instant Payment Settlement (TIPS) system operated by the ECB, or to a commercial instant payment gateway (EBA CLEARING RT1). NextHub supports both SEPA Credit Transfer (SCT, next-day) and SEPA Instant (SCT Inst, 10-second) in the same bridge, routing based on the transfer's `urgency` field.

### 3.6 Fedwire Funds Service (USA)

Fedwire is the Federal Reserve's high-value real-time gross settlement system, completing its ISO 20022 migration in July 2025. [5] It processes large-value USD transfers (typically above $1 million) with same-day finality. The Go Fedwire bridge handler connects via the Federal Reserve's FedLine Direct API, submitting ISO 20022 `pacs.009` messages for outbound transfers and consuming `camt.054` settlement advices. Fedwire transfers settle in TigerBeetle as USD-denominated linked transfers.

### 3.7 FedNow (USA)

FedNow is the Federal Reserve's instant payment service, launched in 2023 and built natively on ISO 20022. [11] It operates 24/7/365 with a per-transaction limit of $500,000. The Go FedNow bridge handler connects via the FedNow Participant Interface, submitting `pacs.008` credit transfers and consuming `pacs.002` status reports. FedNow and RTP (The Clearing House) are the two US instant payment rails; NextHub supports both, routing based on the receiving institution's rail preference.

### 3.8 RTP — Real-Time Payments (USA)

The Clearing House RTP network processes over $4 billion daily with 100% uptime. [12] RTP uses ISO 20022 and supports Request for Payment (RFP), a payee-initiated flow analogous to FSPIOP's `transactionRequests`. The Go RTP bridge handler connects via The Clearing House's participant API, supporting both credit transfers and RFP flows. NextHub routes US instant payments to RTP or FedNow based on the receiving bank's participation in each network, with FedNow as the fallback since all Fed-member banks are required to receive FedNow payments.

### 3.9 mBridge (Multi-CBDC Cross-Border Platform)

Project mBridge reached its Minimum Viable Product (MVP) stage in mid-2024, enabling wholesale cross-border CBDC transactions between central banks in China, Hong Kong, Thailand, the UAE, and Saudi Arabia. [13] The BIS Innovation Hub stepped back from the project in 2026, with China's PBOC continuing development independently. [14] NextHub's mBridge bridge handler connects to the mBridge platform's ISO 20022-based API for wholesale CBDC transfers, settling in TigerBeetle as CBDC-denominated linked transfers. The Rust CBDC bridge module handles the cryptographic proof-of-reserve verification required for CBDC transfers.

### 3.10 Open Payments (Interledger Foundation)

Open Payments is the successor to SPSP (Simple Payment Setup Protocol), using GNAP (Grant Negotiation and Authorization Protocol) for authorisation and ILPv4 for cross-currency routing. It introduces **wallet addresses** (e.g., `https://wallet.example.com/alice`) as payment identifiers, which are compatible with the FSPIOP party addressing model. The Go Open Payments bridge handler supports incoming payment pointers, outgoing payment initiation, and grant negotiation. NextHub's ILP engine handles the cross-currency path-finding and packet routing, enabling a single transfer to span multiple rails (e.g., NGN via NIP → USD via Fedwire → EUR via SEPA Instant) with atomic settlement in TigerBeetle.

### 3.11 African Regional Rails

Beyond NIBSS NIP, NextHub integrates with the following African payment rails:

| Rail | Country/Region | Protocol | NextHub Bridge |
|---|---|---|---|
| GHIPSS GhIPSS | Ghana | ISO 8583 / REST | `go/ghipss/` |
| KBA PesaLink | Kenya | ISO 20022 | `go/pesalink/` |
| TANZIPS | Tanzania | ISO 8583 | `go/tanzips/` |
| ZIMSWITCH | Zimbabwe | ISO 8583 | `go/zimswitch/` |
| SADC SIRESS | Southern Africa | ISO 20022 | `go/siress/` |
| PAPSS | Pan-African | ISO 20022 | `go/papss/` |

The Pan-African Payment and Settlement System (PAPSS) is particularly significant: it enables intra-African payments in local currencies without routing through USD, reducing transaction costs by up to 50% compared to correspondent banking. [15]

### 3.12 Rail Routing Matrix

The Go routing engine selects the optimal rail for each transfer based on currency, amount, urgency, and cost. The routing decision is logged to Fluvio as a `transfer.routed` event, enabling the Python analytics aggregator to track routing efficiency and identify opportunities for cost reduction.

| Currency | Amount | Urgency | Preferred Rail | Fallback Rail |
|---|---|---|---|---|
| NGN | Any | Instant | NIBSS NIP | Mobile Money |
| USD | < $500K | Instant | FedNow | RTP |
| USD | > $500K | High-value | Fedwire | SWIFT gpi |
| EUR | Any | Instant | SEPA Instant | SEPA CT |
| CNY | Any | Any | CIPS | SWIFT gpi |
| INR | Any | Instant | UPI | NEFT |
| Multi-currency | Wholesale | CBDC | mBridge | SWIFT gpi |
| Any | Any | Cross-border | Open Payments (ILP) | SWIFT gpi |

---

## Part IV — Innovation Recommendations

### 4.1 Streaming-Native Callbacks via Fluvio

The most impactful architectural innovation is replacing Mojaloop's HTTP callback model with Fluvio topic subscriptions. Each DFSP is assigned a dedicated Fluvio topic partition (e.g., `transfers.dfsp.gtbank`). The hub publishes all transfer lifecycle events to this partition. The DFSP's connector subscribes to its partition and processes events at its own pace. This eliminates the head-of-line blocking problem entirely, reduces hub-side connection state from O(concurrent transfers) to O(connected DFSPs), and provides natural backpressure via consumer lag monitoring. A DFSP that falls behind can be automatically suspended from receiving new transfers until it catches up, preventing a single slow DFSP from degrading hub performance.

### 4.2 TigerBeetle as the Single Financial Store

TigerBeetle's linked transfer chains provide a formally verified implementation of the two-phase commit protocol that FSPIOP's PREPARE/FULFIL flow requires. [3] A Mojaloop transfer that involves a position debit, a scheme fee, and a settlement entry requires three separate MySQL transactions with application-level consistency guarantees. In NextHub, the same operation is a single TigerBeetle linked transfer chain: if any link fails, the entire chain is atomically rolled back. This eliminates the class of bugs where a position is debited but the settlement entry is not posted, which is the most common source of reconciliation failures in production Mojaloop deployments.

### 4.3 In-Path ML Fraud Scoring

The Python fraud scoring service is called synchronously during the PREPARE phase via gRPC, with a 5 ms P99 SLA enforced by a circuit breaker. The model is a gradient-boosted tree trained on transfer features (amount, currency, payer DFSP, payee DFSP, time of day, velocity, party age) and updated daily from the Lakehouse. Transfers that score above a configurable threshold are placed in a human review queue rather than rejected, enabling a graduated response. This is a significant improvement over Mojaloop's approach, where fraud detection must be implemented by each DFSP independently.

### 4.4 Temporal Workflow Orchestration

Mojaloop uses a combination of Kafka topics and Node.js event handlers for transfer orchestration. This approach is difficult to debug when a transfer gets stuck in an intermediate state, because the state is distributed across multiple Kafka topics and service databases. NextHub uses Temporal workflows for all multi-step orchestration: each transfer is a Temporal workflow instance with a deterministic execution history. If a transfer gets stuck, an operator can inspect the Temporal UI to see exactly which activity failed and why, and can replay the workflow from any checkpoint. Temporal's durable execution model also handles the retry and timeout logic that Mojaloop implements with custom code in each microservice.

### 4.5 Dapr Actor Model for Per-DFSP State

Each DFSP's position and liquidity state is managed by a Dapr virtual actor. The actor encapsulates the DFSP's current position, liquidity limit, and pending transfer queue. When a transfer is prepared, the payer DFSP's actor is called to check and reserve liquidity. When the transfer is fulfilled, the actor is called to commit the position change. The actor model provides per-DFSP serialisation without global locking, enabling the hub to process transfers for different DFSPs in parallel while maintaining strict ordering within each DFSP's transfer queue.

### 4.6 CBDC-Ready Ledger

TigerBeetle's account model supports arbitrary currency codes, enabling the hub to maintain CBDC-denominated accounts alongside fiat accounts in the same ledger. A CBDC transfer from an eNaira wallet to a UPI wallet involves a TigerBeetle linked transfer chain: eNaira debit → FX conversion → INR credit → UPI settlement. The Rust CBDC bridge module handles the cryptographic proof-of-reserve verification required for CBDC transfers, using the mBridge platform's ISO 20022-based API for wholesale CBDC settlement between central banks.

### 4.7 OpenTelemetry End-to-End Tracing

Every transfer carries a W3C `traceparent` header from the moment it enters the hub to the moment it is settled. The Go gateway layer injects the trace context into all downstream calls, including the Fluvio event headers, the TigerBeetle transfer user data field, and the Temporal workflow ID. This means that a single transfer can be traced end-to-end across the Go gateway, Rust settlement service, Python fraud scorer, and Temporal workflow in a single Jaeger or Tempo trace. Mojaloop's distributed tracing support was added as an optional feature in v1.1.1 and is not consistently implemented across all services.

### 4.8 Single-Binary Development Mode

For scheme operators in emerging markets who cannot afford a full Kubernetes cluster, NextHub can run as a single binary in development mode. The binary embeds an in-process Fluvio broker, a TigerBeetle instance, a Redis instance, and the Go HTTP server. This enables a scheme operator to run a complete NextHub instance on a single $50/month VPS, making it accessible to central banks and financial regulators in markets where Mojaloop's Kubernetes requirement is prohibitive.

### 4.9 DFSP SDK with Automatic Reconnection

The `@paygate/nexthub-sdk` TypeScript package provides a DFSP connector that handles Fluvio subscription management, JWS signing, mTLS certificate rotation, and automatic reconnection. A DFSP can connect to NextHub with five lines of code:

```typescript
import { NextHubClient } from '@paygate/nexthub-sdk';
const client = new NextHubClient({ hubUrl: 'https://hub.paygate.ng', dfspId: 'gtbank', cert: fs.readFileSync('cert.pem') });
client.on('transfer.prepared', async (transfer) => { /* fulfil or abort */ });
await client.connect();
```

The SDK handles all the complexity of the FSPIOP asynchronous callback model, Fluvio subscription management, and JWS signature verification, reducing the integration effort for a new DFSP from weeks to hours.

### 4.10 Regulatory Reporting as a First-Class Feature

The Python compliance layer generates regulatory reports automatically from the Fluvio event stream. STR (Suspicious Transaction Reports) are filed to NFIU's goAML system within 24 hours of detection. CBUAE, RBI, PBoC, and ECB reporting formats are supported via pluggable report generators. The Lakehouse writer stores all transfer events in Parquet format, enabling ad-hoc SQL queries for regulatory audits. This is a significant improvement over Mojaloop, where regulatory reporting must be implemented by each scheme operator independently.

---

## Part V — Component Architecture

![PayGate NextHub Architecture](nexthub-architecture.png)

The hub is composed of five logical layers. The **Gateway Layer** (Go) handles all external connectivity: APISIX terminates mTLS, verifies JWS signatures, enforces rate limits, and routes requests to the appropriate handler. Keycloak provides OIDC authentication for the operator portal and DFSP management API. Permify enforces RBAC policies for scheme governance (e.g., only the scheme operator can modify liquidity limits).

The **Orchestration Layer** (Go + Rust) is the hub's core. The Transfer FSM manages the state machine for each transfer (RECEIVED → RESERVED → COMMITTED or ABORTED). The Quote Engine calculates fees and generates ILP packets. The Party Resolver looks up party information from the ALS (Account Lookup Service), backed by Redis with a configurable TTL. The Position Manager uses Dapr actors to manage per-DFSP liquidity. Temporal workflows orchestrate multi-step operations (bulk transfers, settlement windows, DFSP onboarding).

The **Ledger Layer** (Rust) is the single source of financial truth. TigerBeetle maintains all accounts and transfers. The CBDC Bridge handles cryptographic verification for CBDC transfers. The Settlement Engine runs on a configurable window and generates ISO 20022 `camt.054` settlement advices.

The **Intelligence Layer** (Python) operates on the Fluvio event stream. The ML Fraud Scorer is called synchronously during PREPARE. The AML Rules Engine evaluates all transfers against configurable rules. The STR Filing service monitors for suspicious patterns and files reports to NFIU goAML. The Lakehouse Writer persists all events to Parquet for analytics and regulatory audit.

The **Operator Portal** (TypeScript) provides a React dashboard for scheme operators, a tRPC API for DFSP management, and the `@paygate/nexthub-sdk` for DFSP integration.

---

## Part VI — Transfer Flow

![PayGate NextHub Transfer Flow](nexthub-transfer-flow.png)

The end-to-end transfer flow has four phases. In the **Discovery Phase**, the payer DFSP sends `GET /parties/{Type}/{ID}` to resolve the payee's party information. The Go handler checks the Redis ALS cache; on a miss, it queries all registered party oracles and caches the result. In the **Agreement Phase**, the payer DFSP sends `POST /quotes` to get a fee quote and ILP packet. The Quote Engine calculates the scheme fee, generates the ILP packet with a SHA-256 condition, and returns the quote. In the **Transfer Phase**, the payer DFSP sends `POST /transfers` with the ILP packet and condition. The Transfer FSM calls the Python fraud scorer (gRPC, 5 ms SLA), calls the Dapr position actor to reserve liquidity, and posts a TigerBeetle RESERVE transfer. The event is published to Fluvio; the payee DFSP consumes it and sends a fulfilment. The FSM verifies that SHA-256(fulfilment) equals the condition, posts a TigerBeetle COMMIT transfer, and publishes `transfer.committed` to both DFSPs' Fluvio partitions. In the **Settlement Phase**, the Rust settlement engine aggregates all committed transfers for the settlement window, computes net positions, and sends settlement instructions to the appropriate rail (NIP, SWIFT, SEPA, Fedwire).

---

## Part VII — Implementation Roadmap

| Phase | Duration | Deliverable |
|---|---|---|
| Phase 1 | 3 months | Go FSPIOP router + Transfer FSM, Rust TigerBeetle service, Fluvio event bus, NIBSS NIP bridge |
| Phase 2 | 3 months | Callback Bridge (Mojaloop drop-in), ISO 20022 parser/serialiser, SWIFT gpi bridge, SEPA Instant bridge |
| Phase 3 | 3 months | UPI bridge, CIPS bridge, FedNow/RTP bridge, Fedwire bridge, mBridge CBDC integration |
| Phase 4 | 3 months | Python ML fraud scorer, AML rules engine, STR filing, Lakehouse writer, Temporal workflows |
| Phase 5 | 3 months | DFSP SDK (`@paygate/nexthub-sdk`), operator portal, PAPSS and African rail bridges, single-binary mode |

---

## References

[1]: https://mojaloop.io/mojaloop-v17-release-2025/ "Mojaloop v17 Release Notes, 2025"
[2]: https://github.com/mojaloop/mojaloop-specification/issues "Mojaloop Specification GitHub Issues — TigerBeetle Ledger Upgrade Discussion"
[3]: https://tigerbeetle.com "TigerBeetle — The Financial Transactions Database"
[4]: https://www.swift.com/standards/iso-20022/iso-20022-financial-institutions-focus-payments-instructions "SWIFT ISO 20022 Migration Completion, November 2025"
[5]: https://www.alacriti.com/knowledge-hub/articles/making-iso-20022-work-for-you-post-fedwire-migration-use-cases-for-financial-institutions/ "Fedwire ISO 20022 Migration Completed July 2025"
[6]: https://www.swift.com/our-solutions/global-financial-messaging/payments-cash-management/swift-gpi "SWIFT gpi — Global Payments Innovation"
[7]: https://en.wikipedia.org/wiki/Cross-Border_Interbank_Payment_System "CIPS Wikipedia — 1,580+ participants, 116 countries"
[8]: https://www.fxcintel.com/research/analysis/cips-growth-may-2025 "CIPS still relies on SWIFT for a large proportion of transactions"
[9]: https://web-assets.bcg.com/73/e5/e11f0db54da18a31a7cb55c1bef2/upi-the-global-benchmark-for-digital-payments.pdf "UPI — The Global Benchmark for Digital Payments, BCG 2025"
[10]: https://www.europeanpaymentscouncil.eu/what-we-do/sepa-instant-credit-transfer "SEPA Instant Credit Transfer — EPC"
[11]: https://explore.fednow.org/resources/technical-overview-guide.pdf "FedNow Service Technical Overview and Planning Guide"
[12]: https://www.theclearinghouse.org/payment-systems/rtp "RTP — The Clearing House"
[13]: https://www.bis.org/about/bisih/topics/cbdc/mcbdc_bridge.htm "Project mBridge MVP Stage, BIS 2024"
[14]: https://www.forbes.com/sites/digital-assets/2026/05/12/after-mbridge-and-agora-multilateral-cbdc-interoperability-is-dead/ "After mBridge and Agora, Forbes 2026"
[15]: https://www.papss.com "Pan-African Payment and Settlement System (PAPSS)"

---

## Part VIII — TigerBeetle Deep Integration

### 8.1 Overview: Yes, NextHub Integrates with TigerBeetle — Deeply

**PayGate NextHub integrates with TigerBeetle as its single, exclusive financial store.** There is no MySQL, PostgreSQL, or application-level accounting for money movement. Every position change, fee posting, FX conversion, settlement entry, and CBDC transfer is a TigerBeetle operation. This is not an optional feature or a future roadmap item — it is a foundational architectural constraint enforced at the design level.

TigerBeetle is a purpose-built financial transactions database designed for safety and performance. [16] It achieves over 1 million transfers per second on commodity hardware, uses formal verification (TLA+) to prove the correctness of its consensus and double-entry logic, and provides deterministic crash recovery with no data loss. Its linked transfer chains implement the two-phase commit protocol natively, which maps directly to FSPIOP's PREPARE/FULFIL/ABORT flow. These properties make it uniquely suited to a payment hub where correctness is non-negotiable and throughput requirements can be extreme.

The existing PayGate codebase already includes TigerBeetle settlement in three Rust crates: `terminal-events/src/tigerbeetle.rs` (POS terminal settlement), `mojaloop-events/src/tigerbeetle.rs` (DFSP transfer settlement), and `nip-events` (NIBSS NIP settlement). NextHub extends this foundation into a comprehensive, multi-currency, multi-rail ledger.

### 8.2 Account Structure

TigerBeetle accounts are 128-bit identifiers with a 16-byte user data field, a ledger ID (currency), and a code (account type). NextHub defines the following account taxonomy:

| Account Class | Code Range | Ledger | Description |
|---|---|---|---|
| DFSP Position | `1000–1999` | Per-currency | Each DFSP's real-time net position. Debited on PREPARE, credited on ABORT, committed on FULFIL. |
| DFSP Liquidity Cover | `2000–2999` | Per-currency | Pre-funded liquidity deposited by each DFSP. Must exceed position at all times. |
| Scheme Fee Payable | `3000–3099` | Per-currency | Accrued scheme fees owed by each DFSP to the scheme operator. |
| Scheme Fee Receivable | `3100–3199` | Per-currency | Scheme operator's receivable for accrued fees. |
| Settlement Obligation | `4000–4999` | Per-currency | Net settlement amount owed by each DFSP at window close. |
| FX Conversion Buffer | `5000–5099` | Multi-currency | Intermediate account for cross-currency transfers during FX conversion. |
| CBDC Reserve | `6000–6099` | Per-CBDC | Central bank CBDC reserve accounts for mBridge and eNaira transfers. |
| Suspense | `7000–7099` | Per-currency | Holds funds for transfers in the RESERVED state awaiting fulfilment. |
| Nostro / Correspondent | `8000–8099` | Per-currency | Mirror accounts for correspondent banking relationships (SWIFT, CIPS). |
| Interchange Payable | `9000–9099` | Per-currency | Interchange fees owed between DFSPs (e.g., card-on-file, BNPL). |

Accounts are created at DFSP onboarding time by the Rust account provisioning service (`nexthub-settlement/src/provisioning.rs`). Each DFSP receives one position account, one liquidity cover account, one scheme fee payable account, and one settlement obligation account per supported currency. A DFSP supporting NGN, USD, and EUR receives 12 accounts at onboarding.

### 8.3 Linked Transfer Chains: PREPARE / FULFIL / ABORT

TigerBeetle's linked transfer flag (`flags.linked = true`) creates an atomic chain of transfers that all succeed or all fail together. [17] This is the mechanism NextHub uses to implement FSPIOP's two-phase transfer protocol.

**PREPARE Phase** — When the payer DFSP sends `POST /transfers`, the Rust settlement service creates a linked chain of two transfers:

```
Transfer 1 (RESERVE — linked):
  debit_account:  payer_dfsp.position[NGN]
  credit_account: suspense[NGN]
  amount:         transfer_amount
  flags:          LINKED | PENDING

Transfer 2 (FEE RESERVE — terminal):
  debit_account:  payer_dfsp.position[NGN]
  credit_account: scheme_fee_payable[payer_dfsp][NGN]
  amount:         scheme_fee_amount
  flags:          PENDING
```

Both transfers are posted atomically. If the payer DFSP's position account has insufficient funds (i.e., the debit would exceed the liquidity cover), TigerBeetle rejects both transfers with `EXCEEDS_CREDITS`, and the hub returns `PAYER_FSP_INSUFFICIENT_LIQUIDITY` to the payer DFSP. No partial state is possible.

**FULFIL Phase** — When the payee DFSP sends the fulfilment, the Rust settlement service posts the commit chain:

```
Transfer 3 (COMMIT PAYER — linked):
  debit_account:  suspense[NGN]
  credit_account: payee_dfsp.position[NGN]
  amount:         transfer_amount
  flags:          LINKED | POST_PENDING_TRANSFER (references Transfer 1)

Transfer 4 (COMMIT FEE — terminal):
  flags:          POST_PENDING_TRANSFER (references Transfer 2)
```

The `POST_PENDING_TRANSFER` flag commits the pending transfers created in the PREPARE phase. The suspense account is debited, the payee DFSP's position is credited, and the scheme fee is confirmed — all atomically.

**ABORT Phase** — If the transfer times out or the payee DFSP sends an error, the Rust settlement service posts the void chain:

```
Transfer 5 (VOID PAYER — linked):
  flags:          LINKED | VOID_PENDING_TRANSFER (references Transfer 1)

Transfer 6 (VOID FEE — terminal):
  flags:          VOID_PENDING_TRANSFER (references Transfer 2)
```

The pending transfers are voided, the payer DFSP's position is restored, and no fee is charged. The suspense account returns to zero.

### 8.4 Cross-Currency Transfer Chain

For a cross-currency transfer (e.g., NGN → USD via Open Payments ILP routing), the linked chain is extended with FX conversion entries:

```
Transfer 1:  payer_dfsp.position[NGN]  → suspense[NGN]           PENDING | LINKED
Transfer 2:  suspense[NGN]             → fx_buffer[NGN]           PENDING | LINKED
Transfer 3:  fx_buffer[USD]            → payee_dfsp.position[USD] PENDING | LINKED
Transfer 4:  payer_dfsp.position[NGN]  → scheme_fee[NGN]          PENDING
```

The FX rate is locked at PREPARE time and embedded in the ILP packet. The FX buffer accounts are zero-sum: the NGN debit equals the USD credit at the locked rate. If any link in the chain fails, all four transfers are atomically rolled back.

### 8.5 Rust TigerBeetle Client Pattern

The Rust `nexthub-settlement` crate uses the official TigerBeetle Rust client. The client is initialised once at startup and shared across all Tokio tasks via an `Arc<Mutex<Client>>`. The settlement service exposes a gRPC interface consumed by the Go orchestration layer.

```rust
// middleware/rust/crates/nexthub-settlement/src/lib.rs

use tigerbeetle_unofficial as tb;
use tokio::sync::Mutex;
use std::sync::Arc;

pub struct SettlementService {
    client: Arc<Mutex<tb::Client>>,
}

impl SettlementService {
    pub async fn prepare_transfer(&self, req: PrepareRequest) -> Result<PrepareResponse, SettlementError> {
        let mut client = self.client.lock().await;
        let transfers = vec![
            tb::Transfer {
                id: req.transfer_id,
                debit_account_id: req.payer_position_account,
                credit_account_id: SUSPENSE_ACCOUNT_ID,
                amount: req.amount,
                ledger: req.currency_ledger,
                code: TransferCode::Reserve as u16,
                flags: tb::TransferFlags::LINKED | tb::TransferFlags::PENDING,
                ..Default::default()
            },
            tb::Transfer {
                id: req.fee_transfer_id,
                debit_account_id: req.payer_position_account,
                credit_account_id: req.scheme_fee_account,
                amount: req.scheme_fee,
                ledger: req.currency_ledger,
                code: TransferCode::FeeReserve as u16,
                flags: tb::TransferFlags::PENDING,
                ..Default::default()
            },
        ];
        let results = client.create_transfers(&transfers).await?;
        for result in &results {
            if result.result != tb::CreateTransferResult::Ok {
                return Err(SettlementError::from(result.result));
            }
        }
        Ok(PrepareResponse { transfer_id: req.transfer_id })
    }

    pub async fn fulfil_transfer(&self, req: FulfilRequest) -> Result<(), SettlementError> {
        let mut client = self.client.lock().await;
        let transfers = vec![
            tb::Transfer {
                id: new_id(),
                debit_account_id: SUSPENSE_ACCOUNT_ID,
                credit_account_id: req.payee_position_account,
                amount: req.amount,
                ledger: req.currency_ledger,
                code: TransferCode::Commit as u16,
                flags: tb::TransferFlags::LINKED | tb::TransferFlags::POST_PENDING_TRANSFER,
                pending_id: req.transfer_id,
                ..Default::default()
            },
            tb::Transfer {
                id: new_id(),
                flags: tb::TransferFlags::POST_PENDING_TRANSFER,
                pending_id: req.fee_transfer_id,
                ..Default::default()
            },
        ];
        client.create_transfers(&transfers).await?;
        Ok(())
    }

    pub async fn abort_transfer(&self, req: AbortRequest) -> Result<(), SettlementError> {
        let mut client = self.client.lock().await;
        let transfers = vec![
            tb::Transfer {
                id: new_id(),
                flags: tb::TransferFlags::LINKED | tb::TransferFlags::VOID_PENDING_TRANSFER,
                pending_id: req.transfer_id,
                ..Default::default()
            },
            tb::Transfer {
                id: new_id(),
                flags: tb::TransferFlags::VOID_PENDING_TRANSFER,
                pending_id: req.fee_transfer_id,
                ..Default::default()
            },
        ];
        client.create_transfers(&transfers).await?;
        Ok(())
    }
}
```

### 8.6 Batch Settlement

At settlement window close, the Rust settlement service queries TigerBeetle for all position account balances using `lookup_accounts`. It then computes net positions and posts a batch of settlement transfers — one per DFSP per currency — that move funds from each DFSP's settlement obligation account to the scheme's nostro account. TigerBeetle's batch API supports up to 8,191 transfers per request, enabling a settlement window with thousands of DFSPs to be closed in a single round-trip.

### 8.7 Position Monitoring and Liquidity Alerts

The Go position monitor polls TigerBeetle account balances every 5 seconds for each active DFSP. When a DFSP's position account balance exceeds 80% of its liquidity cover, the monitor publishes a `dfsp.liquidity.warning` event to Fluvio and sends a push notification to the DFSP's registered operations contact. At 95%, the DFSP is placed in a restricted mode where new transfers are queued rather than processed immediately. At 100%, the DFSP is suspended from the scheme until additional liquidity is deposited.

### 8.8 Audit Trail and Immutability

TigerBeetle's append-only ledger provides a complete, immutable audit trail of every financial operation. Each transfer record includes the transfer ID (UUID v7, time-ordered), the debit and credit account IDs, the amount, the ledger (currency), the code (transfer type), the timestamp (nanosecond precision), and a 128-bit user data field that stores the Fluvio event offset for cross-referencing. The Rust Lakehouse writer subscribes to TigerBeetle's replication stream and writes all transfer records to Parquet files in the Lakehouse, enabling SQL-based audit queries without impacting TigerBeetle's operational performance.

---

## Part IX — Next-Generation Settlement, Reconciliation, and Billing Engine

### 9.1 Overview

The Settlement, Reconciliation, and Billing Engine (SRBE) is a first-class component of PayGate NextHub, not an afterthought. It is designed to handle the full lifecycle of financial obligations between DFSPs and the scheme operator: from real-time position tracking during the trading day, through net position calculation at settlement window close, to final settlement instruction generation, automated reconciliation against rail confirmations, and monthly billing of scheme fees, interchange, and FX markup.

The SRBE is implemented across four language layers: **Go** for the settlement window orchestration and billing API, **Rust** for TigerBeetle position management and settlement instruction generation, **Python** for the reconciliation pipeline and Lakehouse analytics, and **TypeScript** for the merchant statement API and operator portal integration. All layers communicate via Fluvio topics and are orchestrated by Temporal workflows.

The following diagram illustrates the SRBE data flow:

```
  FULFIL event
       │
       ▼
  [Rust: TigerBeetle COMMIT]
       │
       ├──► Fluvio: transfers.committed
       │         │
       │         ├──► [Go: Settlement Window Aggregator]
       │         │         │
       │         │         ▼ (at window close)
       │         │    [Rust: Net Position Calc]
       │         │         │
       │         │         ├──► TigerBeetle: settlement batch
       │         │         └──► Fluvio: settlement.instruction.generated
       │         │                   │
       │         │                   ▼
       │         │              [Go: RTGS Bridge → NIP/SWIFT/SEPA/Fedwire]
       │         │                   │
       │         │                   └──► Fluvio: settlement.final
       │         │                             │
       │         │                             ▼
       │         │                    [Python: Reconciliation Pipeline]
       │         │                             │
       │         │                             ├──► Lakehouse (Parquet)
       │         │                             └──► reconciliation_exceptions table
       │         │
       │         └──► [Go: Billing Engine]
       │                   │
       │                   ├──► TigerBeetle: fee transfers
       │                   └──► Fluvio: billing.fee.posted
       │
       └──► [Python: Fraud / AML / STR pipeline]
```

### 9.2 Settlement Engine

#### 9.2.1 Settlement Windows

The settlement engine supports three configurable window modes, selectable per currency and per scheme:

| Window Mode | Trigger | Use Case | ISO 20022 Message |
|---|---|---|---|
| **Real-Time Gross Settlement (RTGS)** | Each FULFIL event | High-value transfers, CBDC | `pacs.009` per transfer |
| **Deferred Net Settlement (DNS) — Intraday** | Configurable interval (e.g., hourly) | Standard retail payments | `pacs.009` per window |
| **Deferred Net Settlement (DNS) — End-of-Day** | 23:00 UTC daily | Low-value bulk payments | `pacs.009` per window |

The window mode is configured in the scheme's `settlement_windows` table and can be overridden per DFSP for special bilateral arrangements. A single scheme can run multiple concurrent windows — for example, RTGS for transfers above ₦10 million and DNS end-of-day for transfers below that threshold.

#### 9.2.2 Net Position Calculation

At window close, the Go settlement orchestrator triggers a Temporal `SettlementWindowWorkflow` that executes the following sequence of activities:

**Step 1 — Freeze the window.** The orchestrator sets the window status to `closing` and stops accepting new PREPARE requests for the window's currency. In-flight transfers in the RESERVED state are allowed to complete; new transfers are queued for the next window.

**Step 2 — Query TigerBeetle positions.** The Rust settlement service calls `lookup_accounts` for all DFSP position accounts in the window's currency. This returns the current `credits_posted`, `debits_posted`, `credits_pending`, and `debits_pending` for each account.

**Step 3 — Compute net positions.** The net position for each DFSP is:

```
net_position = (credits_posted − debits_posted) + (credits_pending − debits_pending)
```

A positive net position means the DFSP is a net receiver (it is owed money by the scheme). A negative net position means the DFSP is a net payer (it owes money to the scheme). The Go orchestrator verifies that the sum of all net positions equals zero — the scheme is always balanced.

**Step 4 — Bilateral netting (optional).** For schemes that support bilateral netting agreements between DFSPs, the Go orchestrator applies the netting matrix before computing multilateral positions. DFSP A and DFSP B agree to net their bilateral positions first, reducing the number of settlement instructions and the total settlement amount, which lowers liquidity requirements for all participants.

**Step 5 — Generate settlement instructions.** The Rust settlement service posts TigerBeetle settlement transfers (moving funds from each net-payer DFSP's settlement obligation account to the scheme's nostro account) and generates ISO 20022 `pacs.009` settlement instructions for each DFSP. Net receivers receive a `camt.054` credit advice.

**Step 6 — Publish settlement events.** The Go orchestrator publishes `settlement.window.closed` and `settlement.instruction.generated` events to the `settlement.window.*` Fluvio topic. DFSPs subscribe to their partition and receive their settlement instruction in real time.

#### 9.2.3 Settlement Instruction Format (ISO 20022 pacs.009)

```xml
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.009.001.08">
  <FICdtTrf>
    <GrpHdr>
      <MsgId>NEXTHUB-STTL-20260710-001</MsgId>
      <CreDtTm>2026-07-10T23:00:00Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>NEXTHUB-STTL-GTBANK-20260710</InstrId>
        <EndToEndId>NEXTHUB-E2E-GTBANK-20260710</EndToEndId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="NGN">45000000.00</IntrBkSttlmAmt>
      <Dbtr><FinInstnId><BICFI>GTBINGLA</BICFI></FinInstnId></Dbtr>
      <Cdtr><FinInstnId><BICFI>NEXTHUBNG</BICFI></FinInstnId></Cdtr>
    </CdtTrfTxInf>
  </FICdtTrf>
</Document>
```

#### 9.2.4 Settlement Finality

Settlement finality is achieved when the scheme operator's RTGS system (NIBSS NEFT for NGN, Fedwire for USD, TARGET2/TIPS for EUR) confirms receipt of the settlement instruction. The Go RTGS bridge handler receives the confirmation and publishes a `settlement.final` event to Fluvio. The Rust settlement service then posts a TigerBeetle `SETTLEMENT_FINAL` transfer that moves the net position from the settlement obligation account to the settled account, marking the window as fully settled.

### 9.3 Reconciliation Pipeline

#### 9.3.1 Architecture

The reconciliation pipeline is a Python service (`middleware/python/reconciliation/`) that runs continuously, consuming events from three Fluvio topics: `transfers.committed` (hub-side transfer records), `settlement.final` (rail confirmation records), and `billing.posted` (fee posting records). It compares these three streams against the TigerBeetle ledger and the rail's own transaction records to detect discrepancies.

The pipeline is structured as a Temporal workflow (`ReconciliationWorkflow`) with four activities:

| Activity | Language | Input | Output |
|---|---|---|---|
| `FetchHubRecords` | Python | Window ID | List of hub transfer records from TigerBeetle |
| `FetchRailRecords` | Python | Window ID, Rail ID | List of rail confirmation records from rail API |
| `ComputeBreaks` | Python | Hub records, Rail records | List of reconciliation breaks |
| `WriteReport` | Python | Breaks, Window ID | Parquet report in Lakehouse + Fluvio event |

#### 9.3.2 Reconciliation Break Classification

A **reconciliation break** is any discrepancy between the hub's record of a transfer and the rail's confirmation. The Python reconciliation engine classifies breaks into four categories:

| Break Type | Description | Auto-Resolution | Escalation SLA |
|---|---|---|---|
| **Timing Break** | Hub has COMMITTED; rail confirmation not yet received | Wait 15 minutes, re-check | 2 hours |
| **Amount Break** | Hub amount ≠ rail confirmation amount (FX rounding) | Post adjustment transfer in TigerBeetle | 4 hours |
| **Missing Debit** | Hub has COMMITTED; no rail record found | Raise exception, freeze DFSP position | 1 hour |
| **Duplicate Credit** | Rail shows two credits for one hub transfer | Raise exception, initiate reversal | 30 minutes |

Auto-resolution is handled by the `BreakResolutionWorkflow` Temporal workflow. For breaks that cannot be auto-resolved, the workflow creates a record in the `reconciliation_exceptions` table and sends a push notification to the scheme operator's operations team.

#### 9.3.3 Reconciliation Exception Schema

```sql
reconciliation_exceptions (
  id              uuid PRIMARY KEY,
  window_id       uuid NOT NULL REFERENCES settlement_windows(id),
  transfer_id     uuid,
  break_type      enum('timing','amount','missing_debit','duplicate_credit','other'),
  hub_amount      numeric(20,6),
  rail_amount     numeric(20,6),
  currency        char(3),
  rail            varchar(50),           -- 'nibss_nip', 'swift_gpi', 'sepa_instant', etc.
  status          enum('open','investigating','resolved','escalated'),
  resolution_note text,
  raised_at       timestamptz NOT NULL,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES users(id)
)
```

#### 9.3.4 Lakehouse Storage

All reconciliation reports are written to the Lakehouse in Parquet format, partitioned by `window_date` and `currency`. The Python Lakehouse writer uses PyArrow and the Manus S3 storage helper to write Parquet files to the `reconciliation/` prefix. The files are queryable via DuckDB or Apache Spark for ad-hoc regulatory audit queries.

```python
# middleware/python/reconciliation/lakehouse_writer.py

import pyarrow as pa
import pyarrow.parquet as pq
from datetime import date

SCHEMA = pa.schema([
    pa.field("transfer_id",    pa.string()),
    pa.field("window_id",      pa.string()),
    pa.field("dfsp_id",        pa.string()),
    pa.field("currency",       pa.string()),
    pa.field("hub_amount",     pa.decimal128(20, 6)),
    pa.field("rail_amount",    pa.decimal128(20, 6)),
    pa.field("break_type",     pa.string()),
    pa.field("status",         pa.string()),
    pa.field("rail",           pa.string()),
    pa.field("raised_at",      pa.timestamp("us", tz="UTC")),
    pa.field("resolved_at",    pa.timestamp("us", tz="UTC")),
])

async def write_reconciliation_report(breaks: list[dict], window_date: date, currency: str):
    table = pa.Table.from_pylist(breaks, schema=SCHEMA)
    key = f"reconciliation/{window_date.isoformat()}/{currency}/report.parquet"
    buf = pa.BufferOutputStream()
    pq.write_table(table, buf, compression="snappy")
    await storage_put(key, buf.getvalue().to_pybytes(), "application/octet-stream")
```

### 9.4 Billing Engine

#### 9.4.1 Fee Taxonomy

The billing engine calculates and posts four categories of fees, each with its own TigerBeetle account code and Fluvio event type:

| Fee Category | TB Code | Calculation Method | Posting Trigger |
|---|---|---|---|
| **Scheme Fee** | `FEE_SCHEME` | Per-transfer flat rate or tiered by volume | PREPARE (reserved) → FULFIL (committed) |
| **Interchange Fee** | `FEE_INTERCHANGE` | Percentage of transfer amount, direction-dependent | FULFIL phase |
| **FX Markup** | `FEE_FX_MARKUP` | Spread over mid-market rate (e.g., 0.5%) | FULFIL phase (cross-currency only) |
| **Penalty Fee** | `FEE_PENALTY` | Fixed amount per violation (late settlement, liquidity breach) | Event-triggered |

#### 9.4.2 Scheme Fee Calculation

The Go billing engine reads the DFSP's fee tier from the `dfsp_fee_tiers` table and calculates the scheme fee at PREPARE time. Three tier models are supported:

**Flat rate:** A fixed fee per transfer regardless of amount (e.g., ₦50 per transfer). Simple to understand and predict.

**Tiered by amount:** A percentage fee that decreases as the transfer amount increases, encouraging high-value transfers. For example: 0.5% for amounts up to ₦10,000; 0.3% for ₦10,001–₦100,000; 0.1% for amounts above ₦100,000.

**Volume-based monthly discount:** The per-transfer fee decreases as the DFSP's monthly volume increases. The Go billing engine maintains a Redis counter for each DFSP's monthly transfer count, resetting at the start of each calendar month. The applicable fee rate is looked up from the `dfsp_volume_tiers` table using the current counter value.

```go
// middleware/go/nexthub/billing/fee_calculator.go

type FeeCalculator struct {
    redis  *redis.Client
    db     *sql.DB
}

func (fc *FeeCalculator) CalculateSchemeFee(
    ctx context.Context,
    dfspID string,
    amount int64,
    currency string,
) (int64, error) {
    tier, err := fc.loadFeeTier(ctx, dfspID, currency)
    if err != nil {
        return 0, err
    }
    switch tier.Model {
    case "flat":
        return tier.FlatAmount, nil
    case "tiered_amount":
        return fc.applyAmountTier(tier.AmountBands, amount), nil
    case "volume_monthly":
        monthlyCount, err := fc.getMonthlyCount(ctx, dfspID, currency)
        if err != nil {
            return 0, err
        }
        rate := fc.lookupVolumeRate(tier.VolumeBands, monthlyCount)
        return int64(float64(amount) * rate), nil
    }
    return 0, fmt.Errorf("unknown fee model: %s", tier.Model)
}
```

#### 9.4.3 Interchange Fee Posting

Interchange fees flow between DFSPs (not between DFSPs and the scheme operator). They are posted as TigerBeetle transfers between the payer DFSP's interchange payable account and the payee DFSP's interchange receivable account. The interchange rate is determined by the transfer's MCC (Merchant Category Code) and the card network rules, or by the scheme's bilateral interchange agreement. The Rust interchange service (`nexthub-settlement/src/interchange.rs`) posts interchange as a linked transfer alongside the main FULFIL chain, ensuring that interchange is always posted when a transfer is fulfilled and never when it is aborted.

#### 9.4.4 FX Markup Billing

For cross-currency transfers, the Go FX engine locks the exchange rate at PREPARE time using a mid-market rate feed (Reuters or Bloomberg, consumed via the Python FX rate service). The FX markup (e.g., 0.5% spread) is calculated on the converted amount and posted as a TigerBeetle transfer from the payer DFSP's FX markup payable account to the scheme operator's FX revenue account. The locked rate and markup are embedded in the ILP packet and cannot be changed after PREPARE.

#### 9.4.5 Monthly Invoice Generation

At the end of each calendar month, the Go billing engine triggers the `MonthlyBillingWorkflow` Temporal workflow. This workflow:

1. Queries TigerBeetle for all fee transfers (scheme fees, interchange, FX markup, penalties) for each DFSP during the billing period.
2. Aggregates the fees by category and currency.
3. Generates a PDF invoice using the Python invoice renderer (`middleware/python/billing/invoice_renderer.py`), which uses ReportLab to produce a professional invoice with the scheme's branding.
4. Uploads the invoice PDF to S3 via the Manus storage helper.
5. Creates a record in the `invoices` table with the S3 URL and sends a push notification to the DFSP's billing contact.
6. Posts a TigerBeetle transfer from the DFSP's scheme fee payable account to the scheme operator's accounts receivable account, marking the fees as invoiced.

```sql
-- Core SRBE tables (Drizzle schema additions)

settlement_windows (
  id               uuid PRIMARY KEY,
  scheme_id        uuid NOT NULL,
  currency         char(3) NOT NULL,
  window_mode      enum('rtgs','dns_intraday','dns_eod') NOT NULL,
  interval_minutes int,
  cutoff_time_utc  time,
  status           enum('open','closing','closed','settled') NOT NULL,
  opened_at        timestamptz NOT NULL,
  closed_at        timestamptz,
  settled_at       timestamptz,
  net_positions    jsonb,
  settlement_ref   varchar(35)
)

settlement_net_positions (
  id              uuid PRIMARY KEY,
  window_id       uuid NOT NULL REFERENCES settlement_windows(id),
  dfsp_id         uuid NOT NULL,
  currency        char(3) NOT NULL,
  gross_send      numeric(20,6) NOT NULL,
  gross_receive   numeric(20,6) NOT NULL,
  net_position    numeric(20,6) NOT NULL,
  tb_account_id   uuid NOT NULL,
  snapshot_at     timestamptz NOT NULL
)

fee_postings (
  id              uuid PRIMARY KEY,
  dfsp_id         uuid NOT NULL,
  transfer_id     uuid NOT NULL,
  fee_category    enum('scheme','interchange','fx_markup','penalty'),
  amount          numeric(20,6) NOT NULL,
  currency        char(3) NOT NULL,
  tb_transfer_id  uuid NOT NULL,
  posted_at       timestamptz NOT NULL,
  window_id       uuid REFERENCES settlement_windows(id)
)

dfsp_fee_tiers (
  id              uuid PRIMARY KEY,
  dfsp_id         uuid NOT NULL,
  currency        char(3) NOT NULL,
  fee_model       enum('flat','tiered_amount','volume_monthly'),
  flat_amount     numeric(20,6),
  amount_bands    jsonb,
  volume_bands    jsonb,
  effective_from  date NOT NULL,
  effective_to    date
)

invoices (
  id              uuid PRIMARY KEY,
  dfsp_id         uuid NOT NULL,
  billing_period  date NOT NULL,
  currency        char(3) NOT NULL,
  scheme_fees     numeric(20,6) NOT NULL DEFAULT 0,
  interchange     numeric(20,6) NOT NULL DEFAULT 0,
  fx_markup       numeric(20,6) NOT NULL DEFAULT 0,
  penalties       numeric(20,6) NOT NULL DEFAULT 0,
  total_amount    numeric(20,6) NOT NULL,
  status          enum('draft','issued','paid','overdue','disputed'),
  issued_at       timestamptz,
  due_date        date,
  paid_at         timestamptz,
  invoice_url     text,
  tb_transfer_id  uuid
)

reconciliation_exceptions (
  id              uuid PRIMARY KEY,
  window_id       uuid NOT NULL REFERENCES settlement_windows(id),
  transfer_id     uuid,
  break_type      enum('timing','amount','missing_debit','duplicate_credit','other'),
  hub_amount      numeric(20,6),
  rail_amount     numeric(20,6),
  currency        char(3),
  rail            varchar(50),
  status          enum('open','investigating','resolved','escalated'),
  resolution_note text,
  raised_at       timestamptz NOT NULL,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES users(id)
)

transfer_disputes (
  id              uuid PRIMARY KEY,
  transfer_id     uuid NOT NULL,
  raised_by_dfsp  uuid NOT NULL,
  dispute_reason  varchar(255),
  status          enum('open','investigating','upheld','rejected','escalated'),
  outcome_note    text,
  raised_at       timestamptz NOT NULL,
  resolved_at     timestamptz,
  penalty_amount  numeric(20,6),
  penalty_currency char(3)
)
```

#### 9.4.6 Merchant Statement API

The TypeScript tRPC router exposes a `nexthubBilling.getMerchantStatement` procedure that returns a paginated list of fee postings for a given DFSP and billing period. The statement includes a breakdown by fee category, a daily chart of fee accrual, and a comparison against the previous period. The operator portal renders this as a merchant-facing statement page, enabling DFSPs to self-serve their billing information without contacting the scheme operator.

```typescript
// server/routers/nexthubBilling.ts (excerpt)

export const nexthubBillingRouter = router({
  getMerchantStatement: protectedProcedure
    .input(z.object({
      dfspId:        z.string().uuid(),
      billingPeriod: z.string().regex(/^\d{4}-\d{2}$/),  // YYYY-MM
      currency:      z.string().length(3),
    }))
    .query(async ({ ctx, input }) => {
      const { dfspId, billingPeriod, currency } = input;
      const [year, month] = billingPeriod.split('-').map(Number);
      const periodStart = new Date(year, month - 1, 1);
      const periodEnd   = new Date(year, month, 0, 23, 59, 59);

      const fees = await db.query.feePostings.findMany({
        where: and(
          eq(feePostings.dfspId, dfspId),
          eq(feePostings.currency, currency),
          gte(feePostings.postedAt, periodStart),
          lte(feePostings.postedAt, periodEnd),
        ),
        orderBy: desc(feePostings.postedAt),
      });

      const summary = fees.reduce((acc, fee) => {
        acc[fee.feeCategory] = (acc[fee.feeCategory] ?? 0) + Number(fee.amount);
        return acc;
      }, {} as Record<string, number>);

      return { fees, summary, billingPeriod, currency };
    }),

  listInvoices: protectedProcedure
    .input(z.object({ dfspId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return db.query.invoices.findMany({
        where:   eq(invoices.dfspId, input.dfspId),
        orderBy: desc(invoices.billingPeriod),
      });
    }),
});
```

### 9.5 Dispute and Chargeback Billing

When a transfer is disputed by the payer DFSP, the dispute is logged in the `transfer_disputes` table and a Temporal `DisputeWorkflow` is triggered. The workflow has three possible outcomes:

**Upheld (payer wins):** The Rust settlement service posts a TigerBeetle reversal transfer, crediting the payer DFSP's position and debiting the payee DFSP's position. A penalty fee is charged to the payee DFSP for the disputed transfer. The billing engine posts the penalty to the payee DFSP's penalty payable account.

**Rejected (payee wins):** No financial adjustment is made. An administrative fee is charged to the payer DFSP for raising a frivolous dispute. The billing engine posts the fee to the payer DFSP's scheme fee payable account.

**Escalated:** The dispute is escalated to the scheme operator's dispute resolution team. The transfer is placed in a frozen state in TigerBeetle (no further position changes) until the dispute is resolved.

### 9.6 Fluvio Topic Architecture for SRBE

The SRBE publishes and consumes the following Fluvio topics:

| Topic | Producer | Consumer | Description |
|---|---|---|---|
| `settlement.window.opened` | Go orchestrator | Python analytics | New settlement window opened |
| `settlement.window.closing` | Go orchestrator | Rust settlement service | Window close initiated |
| `settlement.window.closed` | Rust settlement service | Go orchestrator, DFSPs | Net positions computed, instructions generated |
| `settlement.instruction.generated` | Rust settlement service | Go RTGS bridge | ISO 20022 `pacs.009` ready for submission |
| `settlement.final` | Go RTGS bridge | Python reconciliation | Rail confirmation received |
| `reconciliation.break.detected` | Python reconciliation | Go exception manager | Discrepancy found |
| `reconciliation.break.resolved` | Go exception manager | Python Lakehouse writer | Break resolved |
| `billing.fee.posted` | Rust settlement service | Go billing engine | Fee transfer posted in TigerBeetle |
| `billing.invoice.generated` | Go billing engine | TypeScript portal | Monthly invoice ready |
| `billing.dispute.raised` | TypeScript portal | Go dispute workflow | Transfer dispute initiated |
| `billing.dispute.resolved` | Go dispute workflow | Rust settlement service | Dispute outcome; trigger reversal if upheld |

### 9.7 Temporal Workflow Catalogue

| Workflow | Activities | Trigger | SLA |
|---|---|---|---|
| `SettlementWindowWorkflow` | FreezeWindow → QueryPositions → ComputeNetPositions → GenerateInstructions → SubmitToRTGS | Scheduled (configurable) | 5 minutes |
| `ReconciliationWorkflow` | FetchHubRecords → FetchRailRecords → ComputeBreaks → WriteReport | After `settlement.final` | 30 minutes |
| `BreakResolutionWorkflow` | ClassifyBreak → AttemptAutoResolution → EscalateIfNeeded | After `reconciliation.break.detected` | Per break type (see table above) |
| `MonthlyBillingWorkflow` | AggregateFees → GenerateInvoicePDF → UploadToS3 → NotifyDFSP → PostInvoiceTransfer | 1st of each month, 00:00 UTC | 2 hours |
| `DisputeWorkflow` | ValidateDispute → FreezeTransfer → NotifyPayeeDFSP → AwaitResponse → ApplyOutcome | On dispute raised | 5 business days |

### 9.8 Operational Dashboard

The TypeScript operator portal includes a dedicated **SRBE Dashboard** page (`/nexthub/settlement`) with the following panels:

**Settlement Windows panel:** A real-time list of all settlement windows across currencies, showing status (open/closing/closed/settled), the number of transfers in the window, the gross send/receive amounts, and the net position for each DFSP. The panel updates via tRPC SSE subscription to the `settlement.window.*` Fluvio topic.

**Reconciliation Exceptions panel:** A table of open reconciliation breaks, sortable by break type, age, and amount. Operators can click on a break to view the full detail (hub record vs. rail record) and trigger manual resolution.

**Billing Summary panel:** A monthly view of fee accrual by category (scheme fees, interchange, FX markup, penalties), with a bar chart comparing the current month against the previous three months. Drill-down to per-DFSP fee detail is available.

**Invoice Management panel:** A list of all generated invoices with status (draft/issued/paid/overdue/disputed), download links for PDF invoices, and a one-click "Mark as Paid" action for manual payment confirmation.

### 9.9 SRBE Integration with Existing PayGate Middleware

The SRBE is not a greenfield system — it is an extension of the existing PayGate middleware stack. The Rust `nexthub-settlement` crate builds on the patterns already established in `terminal-events/src/tigerbeetle.rs` and `mojaloop-events/src/tigerbeetle.rs`. The Go billing engine builds on the existing `interchange` and `velocityLimits` routers in `server/routers/psp-production.ts`. The Python reconciliation pipeline builds on the existing Lakehouse writer and Temporal activity stubs in `middleware/python/`. The TypeScript billing API builds on the existing `tRPC` router pattern and the `protectedProcedure` authentication middleware.

This means that Phase 1 of the SRBE implementation can reuse approximately 40% of the existing codebase, significantly reducing the implementation effort and risk.

---

## Additional References

[16]: https://tigerbeetle.com "TigerBeetle — The Financial Transactions Database"
[17]: https://docs.tigerbeetle.com/reference/transfers "TigerBeetle Transfer Reference — Linked Transfers, PENDING, POST_PENDING_TRANSFER, VOID_PENDING_TRANSFER"
[18]: https://docs.tigerbeetle.com/reference/accounts "TigerBeetle Account Reference — Ledger, Code, Flags"
[19]: https://www.swift.com/standards/iso-20022/iso-20022-financial-institutions-focus-payments-instructions "ISO 20022 pacs.009 — Financial Institution Credit Transfer"
[20]: https://docs.temporal.io/workflows "Temporal Workflow Documentation — Durable Execution"
[21]: https://fluvio.io/docs/ "Fluvio Distributed Streaming Documentation"

---

## Part X — Standalone Deployment Architecture

### 10.1 Scope and Motivation

The PayGate NextHub design described in Parts I–IX was initially developed within the Manus WebDev platform, which provisions MySQL/TiDB as its managed relational database. When NextHub is deployed as a **standalone production system** — operated by a central bank, a scheme operator, or a licensed PSP outside the Manus platform — the database selection should be made on technical merit rather than platform constraint.

This part documents the complete standalone deployment architecture, including the recommended database stack, infrastructure topology, schema design patterns that exploit PostgreSQL's capabilities, a migration guide from the MySQL/TiDB schema, and an operational runbook. It supersedes the implicit MySQL/TiDB assumption in all previous parts of this document.

### 10.2 The Core Architectural Principle: Three Stores, Three Roles

NextHub's data architecture is governed by a strict separation of concerns across three stores, each chosen for a specific class of data:

> **TigerBeetle** owns all financial balances and transfer records. **PostgreSQL** owns all operational, configuration, and compliance data. **Redis** owns all ephemeral state (ALS cache, rate limits, DFSP liquidity counters, session tokens). No store crosses into another's domain.

This separation is not merely a design preference — it is a correctness guarantee. A PostgreSQL outage must never cause a financial inconsistency. A Redis flush must never cause a balance discrepancy. TigerBeetle is the only store whose availability is on the critical path of a transfer completing.

| Store | Role | Data Examples | Availability Requirement |
|---|---|---|---|
| **TigerBeetle** | Financial ledger — all balances and transfers | DFSP positions, suspense, settlement obligations, fee transfers, FX buffer | Critical path — hub cannot process transfers without it |
| **PostgreSQL** | Operational database — all non-financial records | DFSP onboarding, settlement windows, reconciliation exceptions, invoices, disputes, fee tiers, party registry | High — hub can queue transfers during brief outages |
| **Redis** | Ephemeral cache — all short-lived state | ALS party lookups (TTL 24h), DFSP monthly volume counters, rate limit windows, Dapr actor state | Medium — degraded mode possible on cache miss |

### 10.3 Why PostgreSQL Over MySQL/TiDB

The decision to use PostgreSQL for the standalone deployment is based on seven concrete technical advantages that are directly relevant to NextHub's operational data workload:

**JSONB with GIN indexing.** NextHub stores structured variable-length data in several columns: `net_positions` (per-DFSP position snapshots at window close), `amount_bands` and `volume_bands` (fee tier configuration), and `reconciliation_exceptions` details. PostgreSQL's `JSONB` type is stored in a decomposed binary format and can be indexed with a Generalised Inverted Index (GIN), enabling queries like `WHERE net_positions @> '{"gtbank": {"currency": "NGN"}}'` to execute in microseconds on a table with millions of rows. MySQL's `JSON` column type has no equivalent GIN index — queries against JSON content require full-column scans or application-level extraction into separate columns.

**Row-Level Security (RLS).** NextHub is a multi-tenant system: a single hub instance may serve multiple scheme operators, each of which must be strictly isolated from the others' data. PostgreSQL's RLS enforces this isolation at the database layer — a query from scheme operator A's connection physically cannot return rows belonging to scheme operator B, regardless of what SQL the application sends. This is a defence-in-depth measure that eliminates an entire class of data leakage bugs. MySQL has no equivalent feature; isolation must be enforced entirely at the application layer.

**Partial indexes.** The `reconciliation_exceptions` table will accumulate millions of rows over time, but the operationally relevant subset — exceptions with `status = 'open'` — is always a small fraction of the total. A PostgreSQL partial index `CREATE INDEX ON reconciliation_exceptions (raised_at) WHERE status = 'open'` indexes only the open rows, making the operations dashboard query (list all open exceptions, ordered by age) extremely fast regardless of total table size. MySQL has no partial index support.

**Declarative partitioning with `pg_partman`.** The `fee_postings` and `settlement_net_positions` tables will grow to billions of rows within the first year of a production hub. PostgreSQL's declarative range partitioning, managed automatically by the `pg_partman` extension, creates monthly child partitions automatically, drops old partitions according to a retention policy, and enables partition pruning so that queries for a specific billing period touch only the relevant partition. This is essential for maintaining query performance as the tables grow. MySQL's partitioning support is less mature and lacks the automatic management tooling.

**Materialized views with concurrent refresh.** Settlement analytics — rolling 30-day fee totals per DFSP, monthly volume rankings, reconciliation break rate trends — are expensive aggregations that should not run against the live operational tables. PostgreSQL's `CREATE MATERIALIZED VIEW ... WITH DATA` pre-computes these aggregations and stores the result as a physical table. `REFRESH MATERIALIZED VIEW CONCURRENTLY` updates the view without locking reads, enabling the operator portal to query pre-computed analytics without impacting settlement processing. MySQL has no materialized view support.

**`LISTEN` / `NOTIFY` for lightweight pub/sub.** For low-volume operational events that do not warrant a Fluvio topic — such as "a new invoice has been generated" or "a reconciliation exception has been escalated" — PostgreSQL's built-in `LISTEN`/`NOTIFY` mechanism provides a zero-dependency pub/sub channel. The Go billing engine calls `NOTIFY billing_events, '{"type":"invoice_generated","dfsp_id":"...","invoice_id":"..."}'` and the TypeScript portal's SSE handler receives it via a persistent `LISTEN` connection. This eliminates the need for a separate message broker for operational notifications.

**Native UUID type.** NextHub uses UUID v7 (time-ordered) as the primary key for every table, enabling time-ordered index scans without a separate `created_at` index. PostgreSQL stores UUIDs as 16-byte binary values and indexes them efficiently. MySQL stores UUIDs as `CHAR(36)` strings by default, which is 2.25× larger and slower to index; the `BINARY(16)` workaround requires explicit casting in every query.

### 10.4 Open-Source PostgreSQL-Compatible Distributed SQL Options

When NextHub's operational database needs to scale beyond what a single PostgreSQL primary can handle, three open-source options are available. The following analysis is honest about the trade-offs of each.

#### 10.4.1 Standard PostgreSQL with Patroni — Recommended for Most Deployments

For a hub processing under 5 million transfers per day, a single PostgreSQL 17 primary with two streaming replicas, managed by Patroni for automatic failover, is the correct choice. This is the simplest, most operationally mature, and most feature-complete option. Every PostgreSQL feature works without restriction. The operational team's knowledge is directly applicable to standard PostgreSQL documentation and tooling.

Patroni manages leader election via etcd or Consul, promotes a replica to primary within 30 seconds of a primary failure, and updates the connection endpoint (via HAProxy or pgBouncer) transparently. The `pg_partman` extension manages time-based partitioning of the hot tables automatically. This architecture has been proven in production at companies processing tens of billions of transactions per year.

```
                    ┌─────────────────────────────────────┐
                    │         HAProxy / pgBouncer          │
                    │    (connection pooling + failover)   │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
    ┌─────────▼──────┐   ┌─────────▼──────┐   ┌────────▼───────┐
    │  PostgreSQL 17  │   │  PostgreSQL 17  │   │  PostgreSQL 17  │
    │    Primary      │   │   Replica 1    │   │   Replica 2    │
    │  (read+write)   │   │  (read-only)   │   │  (read-only)   │
    │  Patroni leader │   │  Patroni sync  │   │  Patroni async │
    └─────────────────┘   └────────────────┘   └────────────────┘
              │
    ┌─────────▼──────────┐
    │  etcd cluster (3)   │
    │  (leader election)  │
    └────────────────────┘
```

#### 10.4.2 Citus — Recommended for High-Volume Single-Region Deployments

Citus is a PostgreSQL extension (AGPLv3 licence, fully open-source since Microsoft open-sourced the complete codebase in 2022) [22] that adds horizontal sharding to standard PostgreSQL. It is not a separate database — it is PostgreSQL with an extension loaded. Every PostgreSQL feature continues to work on the coordinator node and on reference tables (tables that are replicated to all shards). Distributed tables are sharded by a distribution column and queries against that column hit only the relevant shard.

For NextHub, the recommended distribution columns are:

| Table | Distribution Column | Rationale |
|---|---|---|
| `fee_postings` | `dfsp_id` | Per-DFSP fee queries hit a single shard |
| `settlement_net_positions` | `dfsp_id` | Per-DFSP position history is co-located |
| `reconciliation_exceptions` | `window_id` | Per-window reconciliation queries hit a single shard |
| `transfer_disputes` | `dfsp_id` | Per-DFSP dispute history is co-located |

Reference tables (replicated to all shards, no distribution column): `dfsps`, `scheme_config`, `dfsp_fee_tiers`, `settlement_windows`, `invoices`, `users`.

```
                    ┌─────────────────────────────────────┐
                    │      Citus Coordinator Node          │
                    │   (standard PostgreSQL + Citus ext)  │
                    │   Reference tables stored here       │
                    └──────────────┬──────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
┌────────▼───────┐       ┌─────────▼──────┐       ┌─────────▼──────┐
│  Worker Node 1  │       │  Worker Node 2  │       │  Worker Node 3  │
│  Shards 1–32    │       │  Shards 33–64   │       │  Shards 65–96   │
│  (PostgreSQL)   │       │  (PostgreSQL)   │       │  (PostgreSQL)   │
└─────────────────┘       └────────────────┘       └────────────────┘
```

**Licence note:** Citus is AGPLv3. This means that if you distribute software that includes Citus as a linked library, you must open-source that software under AGPLv3. For a hub operator running Citus on their own infrastructure (not distributing it as software), AGPLv3 imposes no restrictions. This is the typical deployment model for NextHub.

#### 10.4.3 YugabyteDB — Recommended for Pan-African Multi-Region Deployments

YugabyteDB (Apache 2.0 licence) [23] is a distributed SQL database with a PostgreSQL-compatible query layer (YSQL) built on top of a custom storage engine (DocDB, based on RocksDB). It provides native multi-region synchronous replication via a Raft-based consensus protocol, enabling a NextHub deployment with nodes in Lagos, Nairobi, and Johannesburg to survive a complete data-centre failure with zero data loss and automatic failover within seconds.

YugabyteDB is the correct choice when the hub's availability SLA requires geo-redundancy across African regions. The trade-off is that YugabyteDB's storage engine is not PostgreSQL's storage engine, which means some PostgreSQL extensions (`pg_partman`, some contrib modules) do not work. YugabyteDB provides its own geo-partitioning mechanism as a replacement.

```
    Lagos Region                Nairobi Region             Johannesburg Region
┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
│  YugabyteDB Node  │◄─────►│  YugabyteDB Node  │◄─────►│  YugabyteDB Node  │
│  (Tablet Leader   │       │  (Tablet Follower) │       │  (Tablet Follower) │
│   for NGN data)   │       │                   │       │                   │
└───────────────────┘       └───────────────────┘       └───────────────────┘
         │                           │                           │
         └───────────────────────────┴───────────────────────────┘
                         Raft consensus (RF=3)
                    Any node can serve any query
                  Automatic leader election on failure
```

#### 10.4.4 CockroachDB — Excluded

CockroachDB is technically excellent and PostgreSQL-compatible, but its licence changed to the **Business Source License (BSL) 1.1** in 2019. [24] BSL is not an OSI-approved open-source licence. It permits free use for non-production purposes but restricts commercial production use without a commercial licence from Cockroach Labs. For a PSP hub processing financial transactions, this is a material commercial and legal risk. CockroachDB is explicitly excluded from the NextHub recommendation.

### 10.5 Database Selection Decision Matrix

| Scenario | Recommended Database | Licence | Key Reason |
|---|---|---|---|
| Development and staging | **Neon** (serverless PostgreSQL) or standard PostgreSQL | PostgreSQL Licence / Apache 2.0 | Zero operational overhead; branching for test isolation |
| Production, < 5M transfers/day | **PostgreSQL 17 + Patroni** (3-node HA) | PostgreSQL Licence | Simplest; full feature parity; proven at scale |
| Production, 5–50M transfers/day | **Citus** (PostgreSQL extension) | AGPLv3 | Horizontal write scale; full PostgreSQL features on coordinator |
| Production, pan-African multi-region | **YugabyteDB** | Apache 2.0 | Native geo-replication; survives full region failure |
| Financial ledger (all scenarios) | **TigerBeetle** | Apache 2.0 | Non-negotiable; no relational DB holds balances |
| Ephemeral cache (all scenarios) | **Redis** (or **Valkey** for Apache 2.0) | BSD / Apache 2.0 | ALS cache, rate limits, Dapr actor state |

> **Note on Valkey:** Redis changed its licence from BSD to the Server Side Public License (SSPL) in March 2024. [25] Valkey is the Linux Foundation fork of Redis that maintains the BSD licence and Apache 2.0 for new contributions. For a production deployment that requires a fully open-source stack, Valkey is the recommended drop-in replacement for Redis.

### 10.6 PostgreSQL Schema Design Patterns for NextHub

The following patterns exploit PostgreSQL-specific features that are unavailable in MySQL/TiDB. They should be applied when writing the Drizzle ORM schema for the standalone deployment.

#### 10.6.1 Native UUID v7 Primary Keys

UUID v7 is time-ordered (the first 48 bits are a Unix timestamp in milliseconds), which means inserts are naturally sequential and do not cause B-tree index fragmentation. PostgreSQL 17 includes a native `gen_random_uuid()` function; UUID v7 generation requires the `pg_uuidv7` extension or application-level generation.

```sql
-- PostgreSQL: UUID stored as native 16-byte type
CREATE TABLE fee_postings (
  id          uuid        PRIMARY KEY DEFAULT gen_uuidv7(),
  dfsp_id     uuid        NOT NULL,
  transfer_id uuid        NOT NULL,
  -- ...
);
-- Index is 16 bytes per entry, sequential inserts, no page splits
```

#### 10.6.2 JSONB with GIN Indexes for Variable-Length Configuration

```sql
-- Fee tier amount bands: queryable without application-level parsing
CREATE TABLE dfsp_fee_tiers (
  id           uuid    PRIMARY KEY DEFAULT gen_uuidv7(),
  dfsp_id      uuid    NOT NULL,
  currency     char(3) NOT NULL,
  fee_model    text    NOT NULL CHECK (fee_model IN ('flat','tiered_amount','volume_monthly')),
  flat_amount  numeric(20,6),
  amount_bands jsonb,   -- [{"max_amount": 10000, "rate": 0.005}, ...]
  volume_bands jsonb,   -- [{"max_count": 1000, "rate": 0.003}, ...]
  effective_from date NOT NULL,
  effective_to   date
);

-- GIN index enables: WHERE amount_bands @> '[{"rate": 0.005}]'
CREATE INDEX ON dfsp_fee_tiers USING GIN (amount_bands);
CREATE INDEX ON dfsp_fee_tiers USING GIN (volume_bands);
```

#### 10.6.3 Row-Level Security for Multi-Tenant Isolation

```sql
-- Each scheme operator connects with a role that has scheme_id set
ALTER TABLE fee_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheme_isolation ON fee_postings
  USING (dfsp_id IN (
    SELECT id FROM dfsps WHERE scheme_id = current_setting('app.scheme_id')::uuid
  ));

-- Application sets the scheme context on each connection:
-- SET app.scheme_id = '550e8400-e29b-41d4-a716-446655440000';
-- After this, ALL queries on fee_postings are automatically filtered to this scheme.
-- No WHERE clause needed; no risk of cross-scheme data leakage.
```

#### 10.6.4 Declarative Partitioning with `pg_partman` for Hot Tables

```sql
-- fee_postings: partitioned by month, managed automatically by pg_partman
CREATE TABLE fee_postings (
  id          uuid        NOT NULL DEFAULT gen_uuidv7(),
  dfsp_id     uuid        NOT NULL,
  transfer_id uuid        NOT NULL,
  fee_category text       NOT NULL,
  amount      numeric(20,6) NOT NULL,
  currency    char(3)     NOT NULL,
  tb_transfer_id uuid     NOT NULL,
  posted_at   timestamptz NOT NULL,
  window_id   uuid
) PARTITION BY RANGE (posted_at);

-- pg_partman creates monthly partitions automatically:
-- fee_postings_p2026_07, fee_postings_p2026_08, ...
SELECT partman.create_parent(
  p_parent_table  => 'public.fee_postings',
  p_control       => 'posted_at',
  p_interval      => '1 month',
  p_premake       => 3   -- create 3 future partitions in advance
);

-- Retention: drop partitions older than 7 years (regulatory minimum)
UPDATE partman.part_config
SET retention = '7 years', retention_keep_table = false
WHERE parent_table = 'public.fee_postings';
```

#### 10.6.5 Partial Indexes for Operational Queries

```sql
-- Only index open exceptions — the subset that the operations dashboard queries
CREATE INDEX idx_recon_exceptions_open
  ON reconciliation_exceptions (raised_at DESC)
  WHERE status = 'open';

-- Only index unpaid invoices
CREATE INDEX idx_invoices_unpaid
  ON invoices (due_date ASC)
  WHERE status IN ('issued', 'overdue');

-- Only index in-flight disputes
CREATE INDEX idx_disputes_active
  ON transfer_disputes (raised_at DESC)
  WHERE status IN ('open', 'investigating');
```

#### 10.6.6 Materialized Views for Settlement Analytics

```sql
-- Pre-computed 30-day rolling fee summary per DFSP
-- Refreshed every hour by a pg_cron job (or Temporal activity)
CREATE MATERIALIZED VIEW dfsp_fee_summary_30d AS
SELECT
  dfsp_id,
  currency,
  fee_category,
  SUM(amount)   AS total_fees,
  COUNT(*)      AS transfer_count,
  DATE_TRUNC('day', posted_at) AS fee_date
FROM fee_postings
WHERE posted_at >= NOW() - INTERVAL '30 days'
GROUP BY dfsp_id, currency, fee_category, DATE_TRUNC('day', posted_at)
WITH DATA;

-- Concurrent refresh: no read lock, zero downtime
CREATE UNIQUE INDEX ON dfsp_fee_summary_30d (dfsp_id, currency, fee_category, fee_date);

-- Refresh job (pg_cron or Temporal):
-- SELECT cron.schedule('refresh-fee-summary', '0 * * * *',
--   'REFRESH MATERIALIZED VIEW CONCURRENTLY dfsp_fee_summary_30d');
```

### 10.7 Full Standalone Infrastructure Stack

The following table describes the complete infrastructure stack for a production NextHub deployment outside the Manus platform. All components are open-source with permissive licences.

| Component | Technology | Licence | Role |
|---|---|---|---|
| **Financial ledger** | TigerBeetle 0.16+ | Apache 2.0 | Single financial store; all balances and transfers |
| **Operational database** | PostgreSQL 17 + Patroni | PostgreSQL Licence | DFSP records, settlement windows, billing, compliance |
| **Distributed SQL** (if needed) | Citus (AGPLv3) or YugabyteDB (Apache 2.0) | AGPLv3 / Apache 2.0 | Horizontal write scale for hot tables |
| **Cache / ephemeral state** | Valkey 8+ (Redis fork) | Apache 2.0 | ALS cache, rate limits, Dapr actor state |
| **Event streaming** | Fluvio 0.11+ | Apache 2.0 | Primary event bus; DFSP topic partitions |
| **Message queue** (secondary) | Apache Kafka 3.7+ | Apache 2.0 | Bridge for legacy systems; DLQ |
| **Workflow orchestration** | Temporal 1.24+ | MIT | Transfer FSM, settlement, billing, reconciliation |
| **Service mesh / actors** | Dapr 1.14+ | Apache 2.0 | Per-DFSP virtual actors; pub/sub; state store |
| **API gateway** | Apache APISIX 3.9+ | Apache 2.0 | mTLS termination, JWS verification, rate limiting |
| **Identity / OIDC** | Keycloak 25+ | Apache 2.0 | DFSP authentication, operator portal SSO |
| **Authorisation** | Permify 0.9+ | Apache 2.0 | RBAC for scheme governance |
| **Observability** | OpenTelemetry Collector + Jaeger + Prometheus + Grafana | Apache 2.0 | Distributed tracing, metrics, alerting |
| **Log aggregation** | OpenSearch 2.15+ | Apache 2.0 | Centralised log storage and search |
| **Lakehouse** | Apache Iceberg + MinIO + Apache Spark | Apache 2.0 | Parquet storage for reconciliation and analytics |
| **Container orchestration** | Kubernetes 1.30+ (or Docker Compose for < 500 TPS) | Apache 2.0 | Service deployment and scaling |
| **Secret management** | HashiCorp Vault (MPL 2.0) or OpenBao (MPL 2.0) | MPL 2.0 | TLS certificates, API keys, DB credentials |
| **CI/CD** | GitHub Actions + ArgoCD | MIT / Apache 2.0 | Automated testing and deployment |

> **Note on OpenBao:** HashiCorp changed Vault's licence to the Business Source License (BSL) in August 2023. [26] OpenBao is the Linux Foundation fork of Vault that maintains the Mozilla Public Licence 2.0. For a fully open-source stack, OpenBao is the recommended replacement.

### 10.8 Deployment Topology: Three Tiers

#### Tier 1 — Single-Region Production (< 5M transfers/day)

This topology is appropriate for a national hub (e.g., a single-country scheme operator) or a pilot deployment. It runs on three bare-metal servers or cloud VMs in a single availability zone, with a separate disaster recovery site.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Production Site (Lagos)                      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Node 1       │  │  Node 2       │  │  Node 3               │  │
│  │  TigerBeetle  │  │  TigerBeetle  │  │  TigerBeetle          │  │
│  │  (primary)    │  │  (replica 1)  │  │  (replica 2)          │  │
│  │  PostgreSQL   │  │  PostgreSQL   │  │  PostgreSQL            │  │
│  │  (Patroni P)  │  │  (Patroni R1) │  │  (Patroni R2)         │  │
│  │  Fluvio       │  │  Fluvio       │  │  Fluvio                │  │
│  │  Go services  │  │  Rust services│  │  Python services       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Shared services: Temporal, Dapr, APISIX, Keycloak,      │   │
│  │  Permify, Valkey, Kafka, OpenTelemetry, OpenSearch        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │ async replication
┌─────────────────────────────▼───────────────────────────────────┐
│                     DR Site (Abuja)                              │
│  PostgreSQL streaming replica (read-only, promote on failover)  │
│  TigerBeetle replica                                            │
└─────────────────────────────────────────────────────────────────┘
```

#### Tier 2 — High-Volume Single-Region (5–50M transfers/day)

Add Citus worker nodes for the hot operational tables. TigerBeetle scales independently (it is not affected by the PostgreSQL topology).

```
┌─────────────────────────────────────────────────────────────────┐
│                     Production Site                              │
│                                                                  │
│  TigerBeetle cluster (3 nodes, Raft consensus)                  │
│                                                                  │
│  Citus coordinator (PostgreSQL 17 + Citus extension)            │
│  ├── Worker Node 1 (shards 1–32: fee_postings, net_positions)   │
│  ├── Worker Node 2 (shards 33–64)                               │
│  └── Worker Node 3 (shards 65–96)                               │
│                                                                  │
│  Reference tables (dfsps, scheme_config, invoices) replicated   │
│  to all worker nodes by Citus automatically                      │
└─────────────────────────────────────────────────────────────────┘
```

#### Tier 3 — Pan-African Multi-Region

Replace PostgreSQL + Citus with YugabyteDB. TigerBeetle runs as a geo-distributed cluster with Raft consensus across regions.

```
    Lagos (primary region)    Nairobi (secondary)    Johannesburg (secondary)
    ┌─────────────────┐       ┌─────────────────┐    ┌─────────────────┐
    │ TigerBeetle     │◄─────►│ TigerBeetle     │◄──►│ TigerBeetle     │
    │ YugabyteDB      │       │ YugabyteDB      │    │ YugabyteDB      │
    │ Fluvio broker   │       │ Fluvio broker   │    │ Fluvio broker   │
    │ Go / Rust / Py  │       │ Go / Rust / Py  │    │ Go / Rust / Py  │
    └─────────────────┘       └─────────────────┘    └─────────────────┘
           │                          │                       │
           └──────────────────────────┴───────────────────────┘
                    Raft consensus (RF=3, one replica per region)
                    RPO = 0 (synchronous replication)
                    RTO < 30 seconds (automatic leader election)
```

### 10.9 Migration Guide: MySQL/TiDB Schema → PostgreSQL

For teams migrating the existing PayGate Merchant Portal schema (`drizzle/schema.ts`) to PostgreSQL for a standalone NextHub deployment, the following changes are required:

| MySQL/TiDB Pattern | PostgreSQL Equivalent | Notes |
|---|---|---|
| `mysqlTable(...)` (Drizzle) | `pgTable(...)` (Drizzle) | Change import from `drizzle-orm/mysql-core` to `drizzle-orm/pg-core` |
| `varchar(36)` UUID columns | `uuid` native type | Use `uuid('id').defaultRandom()` in Drizzle; 2.25× smaller index |
| `tinyint(1)` boolean | `boolean` | Direct replacement |
| `datetime` | `timestamptz` | Always store with timezone; PostgreSQL `timestamptz` is UTC-normalised |
| `json` column | `jsonb` column | Add `.notNull()` and GIN index where queried |
| `enum(...)` inline | `pgEnum(...)` reusable type | Define once, reference across tables |
| `AUTO_INCREMENT` | `GENERATED ALWAYS AS IDENTITY` or `uuid` | UUID v7 preferred for distributed inserts |
| `TEXT` with `FULLTEXT` index | `tsvector` + GIN index | More powerful, language-aware stemming |
| `ON UPDATE CURRENT_TIMESTAMP` | `DEFAULT NOW()` trigger or application-level | PostgreSQL has no `ON UPDATE` column default |
| `SHOW CREATE TABLE` | `\d+ tablename` in psql | Different introspection syntax |

The Drizzle ORM migration is straightforward: change the import path from `drizzle-orm/mysql-core` to `drizzle-orm/pg-core`, replace `mysqlTable` with `pgTable`, replace `mysqlEnum` with `pgEnum`, and replace `varchar(36)` UUID columns with the native `uuid` type. Run `pnpm db:push` against the new PostgreSQL connection string to apply the schema.

### 10.10 Operational Runbook

#### Database Backup Strategy

TigerBeetle provides its own replication and does not require external backup tooling — the Raft consensus protocol ensures that data is replicated to at least two nodes before a write is acknowledged. For point-in-time recovery, the Rust Lakehouse writer provides a complete event log in Parquet format that can be used to replay all transfers from genesis.

PostgreSQL backups use a three-tier strategy: continuous WAL archiving to S3 (via `pgBackRest` or `Barman`) for point-in-time recovery; daily `pg_dump` base backups retained for 30 days; and streaming replication to the DR site for near-zero RPO failover.

#### Connection Pooling

PgBouncer (transaction-mode pooling) sits between the application and PostgreSQL, maintaining a pool of 20–50 server connections regardless of how many application connections are open. This is essential for Go services that open many short-lived connections. The Drizzle ORM connection string should point to PgBouncer, not directly to PostgreSQL.

#### Index Maintenance

PostgreSQL B-tree indexes accumulate dead tuples from updates and deletes. The `autovacuum` daemon handles this automatically, but for the high-write `fee_postings` and `settlement_net_positions` tables, autovacuum should be tuned aggressively:

```sql
ALTER TABLE fee_postings SET (
  autovacuum_vacuum_scale_factor = 0.01,   -- vacuum when 1% of rows are dead
  autovacuum_analyze_scale_factor = 0.005  -- analyze when 0.5% of rows are new
);
```

#### Monitoring

The OpenTelemetry Collector scrapes PostgreSQL metrics via the `postgres_exporter` (Prometheus format) and exports them to Grafana. Key metrics to alert on: replication lag (> 10 seconds), connection pool saturation (> 90%), autovacuum queue depth (> 100 tables), and index bloat (> 30%).

---

## Additional References

[22]: https://www.citusdata.com/blog/2022/01/17/citus-10-2-open-source/ "Citus Open-Sourced Under AGPLv3, January 2022"
[23]: https://github.com/yugabyte/yugabyte-db "YugabyteDB GitHub — Apache 2.0 Licence"
[24]: https://www.cockroachlabs.com/blog/oss-relicensing-cockroachdb/ "CockroachDB BSL Relicensing, 2019"
[25]: https://redis.io/blog/redis-adopts-dual-source-available-licensing/ "Redis SSPL Licence Change, March 2024"
[26]: https://www.hashicorp.com/blog/hashicorp-adopts-business-source-license "HashiCorp BSL Licence Change, August 2023"
[27]: https://openbao.org "OpenBao — Linux Foundation Fork of HashiCorp Vault"
[28]: https://valkey.io "Valkey — Linux Foundation Fork of Redis"
[29]: https://patroni.readthedocs.io "Patroni — PostgreSQL High Availability"
[30]: https://pgbackrest.org "pgBackRest — PostgreSQL Backup and Restore"

---

## Part XI — Security Architecture

> **Governing Principle.** Security in NextHub is not a feature layer added on top of the system — it is a structural property of the system. Every architectural decision described in Parts I–X has a security consequence that is accounted for here. This section consolidates those consequences into a single authoritative reference and identifies the controls that must be implemented before any production deployment.

The security architecture is organised into eight domains, each addressing a distinct threat surface. The domains are not independent: a weakness in one (e.g., key management) can undermine controls in another (e.g., mTLS). The design must be implemented in its entirety; partial implementation creates a false sense of security.

---

### 11.1 Zero-Trust Network Architecture

#### 11.1.1 Governing Model

NextHub adopts the **Zero-Trust Network Architecture (ZTNA)** model as defined in NIST SP 800-207. The core principle is that no network location — including the internal Kubernetes cluster network — confers implicit trust. Every connection must be authenticated, every request must be authorised, and every action must be logged. The traditional perimeter model (trusted inside, untrusted outside) is explicitly rejected.

This is not merely a policy decision; it is enforced by the infrastructure. The following table maps each trust boundary in NextHub to its enforcement mechanism.

| Trust Boundary | Threat | Enforcement Mechanism |
|---|---|---|
| DFSP → Hub (external) | Impersonation, man-in-the-middle | mTLS with DFSP client certificate; JWS body signing |
| Pod → Pod (internal Kubernetes) | Lateral movement after pod compromise | Istio service mesh with mTLS; Kubernetes NetworkPolicy |
| Operator → Portal | Credential theft, session hijacking | Keycloak OIDC + FIDO2 MFA; short-lived JWT (15 min) |
| CI/CD → Cluster | Supply chain attack | Sigstore/cosign image signing; OPA admission controller |
| Admin → Database | Privileged access abuse | Just-in-time (JIT) access via OpenBao; all sessions logged |
| Service → Secret | Secret sprawl, credential leakage | OpenBao dynamic secrets; no static credentials in env vars |

#### 11.1.2 Kubernetes Network Policy

Every pod in the NextHub cluster has a default-deny ingress and egress NetworkPolicy. Explicit allow rules are defined for each required communication path. The following is the canonical policy set for the Transfer FSM pod.

```yaml
# Allow ingress from APISIX gateway only; restrict egress to required services
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: transfer-fsm-ingress
  namespace: nexthub
spec:
  podSelector:
    matchLabels:
      app: transfer-fsm
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: apisix-gateway
      ports:
        - protocol: TCP
          port: 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: tigerbeetle
      ports:
        - protocol: TCP
          port: 3000
    - to:
        - podSelector:
            matchLabels:
              app: fraud-scorer
      ports:
        - protocol: TCP
          port: 50051
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - protocol: UDP
          port: 53
```

#### 11.1.3 Istio Service Mesh

All pod-to-pod communication within the `nexthub` namespace is encrypted and mutually authenticated via **Istio** with `PeerAuthentication` set to `STRICT` mode. Even if an attacker gains access to the cluster network (e.g., via a compromised node), they cannot read inter-service traffic or inject messages without a valid Istio-issued certificate.

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: nexthub
spec:
  mtls:
    mode: STRICT
---
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: tigerbeetle-access
  namespace: nexthub
spec:
  selector:
    matchLabels:
      app: tigerbeetle
  rules:
    - from:
        - source:
            principals:
              - "cluster.local/ns/nexthub/sa/transfer-fsm"
              - "cluster.local/ns/nexthub/sa/settlement-service"
```

Only the Transfer FSM and the Rust settlement service are permitted to call TigerBeetle. The Reconciliation Pipeline, the Billing Engine, and the Operator Portal have no direct TigerBeetle access — they read from PostgreSQL projections and the Lakehouse.

---

### 11.2 Certificate Authority Design

#### 11.2.1 CA Hierarchy

NextHub operates a **three-tier PKI hierarchy** for all mTLS certificates. Using an intermediate CA per environment limits the blast radius of a CA compromise: a compromised staging CA cannot issue certificates trusted by production.

```
Root CA (offline, air-gapped YubiHSM 2)
  └── Intermediate CA — Production  (online, OpenBao PKI engine)
        ├── Hub TLS Server Certificate   (APISIX, 90-day, auto-renewed)
        ├── DFSP Client Certificates     (per DFSP, 1-year, revocable)
        ├── Internal Service Certs       (Istio SPIFFE, 24-hour, auto-rotated)
        └── Operator Portal TLS          (90-day, auto-renewed)
  └── Intermediate CA — Staging     (online, OpenBao PKI engine)
  └── Intermediate CA — Development (software-only, step-ca)
```

The Root CA private key is stored on an air-gapped HSM and is never exposed to any network. It is used only to sign intermediate CA certificates and is brought online at most twice per year for intermediate CA renewal. The Root CA certificate has a 20-year validity period; intermediate CAs have a 5-year validity period.

#### 11.2.2 DFSP Certificate Lifecycle

| Stage | Action | Tooling |
|---|---|---|
| **Onboarding** | DFSP generates a CSR; hub operator signs it via OpenBao PKI API | OpenBao `pki/sign` endpoint |
| **Distribution** | Signed certificate delivered via authenticated HTTPS | Keycloak-authenticated DFSP management API |
| **Rotation** | DFSP submits new CSR 30 days before expiry; hub signs automatically | Temporal `CertificateRenewalWorkflow` |
| **Revocation** | Hub operator calls `pki/revoke`; OCSP responder updated within 60 seconds | OpenBao OCSP; APISIX OCSP stapling |
| **Offboarding** | Certificate revoked immediately; DFSP removed from APISIX upstream | Temporal `DFSPOffboardingWorkflow` |

APISIX is configured with OCSP stapling and a maximum OCSP response cache of 3600 seconds, ensuring revoked certificates are rejected within one hour in the worst case.

#### 11.2.3 Internal Service Identity (SPIFFE/SPIRE)

All internal services use **SPIFFE** identities issued by Istio's built-in SPIRE-compatible CA. Service certificates are 24-hour leaf certificates rotated automatically by the Istio agent. No service has a static TLS certificate stored on disk; all certificates are in-memory and ephemeral.

SPIFFE IDs follow the format `spiffe://nexthub.cluster.local/ns/{namespace}/sa/{service-account}`. This identity is used by Istio `AuthorizationPolicy` rules to enforce service-level access control.

---

### 11.3 Key Management and Secret Storage

#### 11.3.1 OpenBao Secret Engines

All secrets in NextHub are managed by **OpenBao** (the Linux Foundation open-source fork of HashiCorp Vault [27]), deployed in High-Availability mode with a Raft consensus backend (3 nodes, RF=3). The unseal keys are split using Shamir's Secret Sharing (5 shares, 3 required to unseal) and stored on separate YubiKey hardware tokens held by different personnel.

| Engine | Purpose | Rotation Policy |
|---|---|---|
| `pki/` | Certificate issuance for DFSP mTLS and hub TLS | 90-day leaf certificates, auto-renewed |
| `database/` | Dynamic PostgreSQL credentials for each service | 1-hour TTL, auto-rotated |
| `kv/v2/` | Static secrets (NIP API keys, SWIFT credentials, Keycloak client secrets) | Manual rotation, 90-day maximum age enforced by policy |
| `transit/` | Encryption-as-a-service for PII fields in PostgreSQL | AES-256-GCM, key rotation every 90 days |
| `totp/` | TOTP MFA for break-glass admin access | Per-user, invalidated on personnel change |

#### 11.3.2 Dynamic Database Credentials

No service has a static PostgreSQL password. Every service authenticates using a dynamic credential issued by OpenBao's `database/` engine with a 1-hour TTL. A leaked credential is useless after one hour, and a compromised service cannot retain persistent database access after remediation.

```hcl
# OpenBao policy: transfer-fsm can only read its own dynamic credential
path "database/creds/transfer-fsm-role" {
  capabilities = ["read"]
}
path "database/creds/*" {
  capabilities = ["deny"]
}
```

#### 11.3.3 TigerBeetle Connection Security

The TigerBeetle cluster is not exposed outside the Kubernetes cluster. The Rust settlement service connects via a Kubernetes ClusterIP Service, further protected by Istio mTLS. The TigerBeetle cluster ID and replica addresses are stored in OpenBao `kv/v2/` and injected at startup via the OpenBao Agent sidecar — never in environment variables or ConfigMaps.

#### 11.3.4 PII Encryption at Rest

All PII stored in PostgreSQL — account holder names from NIP name enquiry, BVN numbers, KYC document references — is encrypted using OpenBao's `transit/` engine before being written to the database. The database stores ciphertext; the application decrypts on read. A PostgreSQL backup or direct database query returns only ciphertext for PII fields.

```typescript
// server/_core/encryption.ts — PII field encryption via OpenBao transit engine
export async function encryptPII(plaintext: string): Promise<string> {
  const res = await fetch(`${env.OPENBAO_ADDR}/v1/transit/encrypt/pii-key`, {
    method: "POST",
    headers: { "X-Vault-Token": env.OPENBAO_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ plaintext: Buffer.from(plaintext).toString("base64") }),
  });
  const data = await res.json() as { data: { ciphertext: string } };
  return data.data.ciphertext;
}

export async function decryptPII(ciphertext: string): Promise<string> {
  const res = await fetch(`${env.OPENBAO_ADDR}/v1/transit/decrypt/pii-key`, {
    method: "POST",
    headers: { "X-Vault-Token": env.OPENBAO_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ ciphertext }),
  });
  const data = await res.json() as { data: { plaintext: string } };
  return Buffer.from(data.data.plaintext, "base64").toString("utf-8");
}
```


---

### 11.4 Identity and Access Management

#### 11.4.1 Keycloak OIDC Architecture

**Keycloak** is the identity provider for all human operators and all machine-to-machine service accounts in NextHub. It is deployed in a dedicated `keycloak` namespace with a PostgreSQL backend (separate from the NextHub operational database) and a Kubernetes Ingress with TLS termination.

Three Keycloak realms are defined, each with strict isolation.

| Realm | Users | Purpose |
|---|---|---|
| `nexthub-operators` | Scheme operator staff, compliance officers, support engineers | Operator portal access; Permify RBAC integration |
| `nexthub-dfsps` | DFSP technical administrators | DFSP management API; certificate management |
| `nexthub-services` | Internal service accounts (CI/CD, monitoring, backup) | Machine-to-machine OAuth 2.0 Client Credentials flow |

All tokens issued by Keycloak are **short-lived**: access tokens expire after 15 minutes, refresh tokens after 8 hours. Refresh tokens are rotated on use (one-time use). This limits the window of exposure for a stolen token.

#### 11.4.2 FIDO2 / WebAuthn Mandatory for Operators

All human operators in the `nexthub-operators` realm are required to authenticate with **FIDO2 / WebAuthn** as a second factor. Password-only authentication is disabled at the realm level. Acceptable authenticators are hardware security keys (YubiKey 5 series or equivalent) and platform authenticators (Touch ID, Windows Hello). SMS OTP is explicitly prohibited as a second factor due to SIM-swap attack risk.

Keycloak's `Required Actions` configuration enforces FIDO2 registration on first login and blocks portal access until registration is complete.

#### 11.4.3 Permify RBAC — Scheme Governance

**Permify** (Apache 2.0) is the authorisation engine for scheme governance decisions. It stores authorisation policies as a typed schema and evaluates permission checks in under 5 ms via its gRPC API. The NextHub Permify schema defines the following entity types and relations.

```
entity user {}

entity role {
  relation member @user
}

entity scheme {
  relation operator @user
  relation compliance_officer @user
  relation support_engineer @user
  relation dfsp @user

  action modify_liquidity_limits = operator
  action view_all_transfers = operator or compliance_officer
  action file_str = compliance_officer
  action view_own_transfers = dfsp
  action read_reconciliation_report = operator or compliance_officer
  action approve_settlement = operator
  action manage_dfsp_certificates = operator or support_engineer
}
```

Every tRPC procedure that performs a scheme governance action calls `permify.check()` before executing. The check result is cached in Redis for 60 seconds per (subject, action, resource) triple to avoid per-request latency overhead.

#### 11.4.4 Just-in-Time (JIT) Privileged Access

No engineer has standing access to the production PostgreSQL database or the TigerBeetle cluster. All privileged access is **just-in-time**, granted via OpenBao's `database/` engine with a maximum 4-hour TTL and logged to the audit trail. The JIT access workflow is:

1. Engineer submits an access request via the operator portal, specifying the reason and estimated duration.
2. A second operator approves the request (four-eyes principle).
3. OpenBao issues a dynamic PostgreSQL credential with the requested TTL and the minimum required privileges (e.g., `SELECT` only for read-only investigation).
4. The credential is delivered to the engineer via the portal; it is never stored in any shared system.
5. All database queries executed during the session are logged to OpenSearch via PostgreSQL's `pgaudit` extension.
6. The credential expires automatically at the end of the TTL; no manual revocation is required.

---

### 11.5 Fraud Detection and AML Controls

#### 11.5.1 In-Path ML Fraud Scorer

The fraud scorer is a **blocking control in the critical path**, not a post-hoc alerting system. It is called synchronously via gRPC during the PREPARE phase, before the TigerBeetle RESERVE transfer is posted. The Go Transfer FSM enforces a **5 ms SLA** via a gRPC deadline; if the scorer does not respond within 5 ms, the circuit breaker opens and the transfer proceeds with a default score of 0 (pass). This ensures that scorer unavailability does not block payments.

The scorer is a Python gRPC service running a GNN (Graph Neural Network) model trained on the PayGate transaction graph. It returns a score between 0 and 1. The Transfer FSM applies the following decision logic.

| Score Range | Action | Notification |
|---|---|---|
| 0.00 – 0.69 | Transfer proceeds | None |
| 0.70 – 0.84 | Transfer proceeds; flagged for async review | Fluvio `fraud.flagged` event |
| 0.85 – 0.94 | Transfer held; manual review required within 30 minutes | Operator portal alert; Fluvio `fraud.held` event |
| 0.95 – 1.00 | Transfer blocked; payer DFSP notified | Fluvio `fraud.blocked` event; STR candidate |

Held transfers are managed via a Temporal `FraudReviewWorkflow` with a 30-minute SLA. If no human decision is made within 30 minutes, the transfer is automatically released (score 0.85–0.89) or rejected (score 0.90–0.94) based on the secondary threshold.

#### 11.5.2 AML Rules Engine

The AML Rules Engine is a Python service that evaluates every committed transfer against a configurable rule set. Rules are expressed as Python dataclasses stored in PostgreSQL and loaded at startup. The engine runs asynchronously — it does not block the transfer path — but can trigger a post-hoc reversal for rules that detect fraud after commitment (e.g., duplicate detection with a 60-second window).

The default rule set includes the following categories.

| Rule Category | Example Rule | Action on Trigger |
|---|---|---|
| **Velocity limits** | > 50 transfers from one account in 1 hour | Flag + hold next transfer |
| **Amount thresholds** | Single transfer > ₦5,000,000 (CBN STR threshold) | Automatic STR candidate |
| **Geographic restrictions** | Transfer to sanctioned jurisdiction | Block + immediate STR |
| **Counterparty screening** | Payee name matches OFAC/UN sanctions list | Block + immediate STR |
| **Structuring detection** | Multiple transfers just below ₦5,000,000 threshold | Flag + escalate to compliance |
| **Round-trip detection** | Funds returned to originator within 24 hours | Flag for manual review |

Rules are version-controlled in PostgreSQL with an `effective_from` timestamp. New rules can be deployed without restarting the service by calling the `rules.reload` tRPC procedure.

#### 11.5.3 Automated STR Filing

When the AML Rules Engine generates an STR candidate, a Temporal `STRFilingWorkflow` is triggered. The workflow has a 24-hour SLA (CBN requirement) and performs the following steps.

1. **Enrich:** Fetch full transfer details, counterparty KYC data, and transaction history from PostgreSQL and the Lakehouse.
2. **Format:** Generate a goAML-compatible XML report (FATF Recommendation 20 format).
3. **Review:** Present the report to a compliance officer via the operator portal for approval.
4. **File:** Submit the approved report to NFIU's goAML system via the NFIU API.
5. **Archive:** Store the filed report in the Lakehouse with a 7-year retention policy (CBN AML/CFT Regulations 2022).

If the compliance officer does not act within 20 hours, the workflow sends an escalation notification and, if still unanswered at 23 hours, files the report automatically with a note that it was filed without human review.

---

### 11.6 Cryptographic Standards

NextHub enforces the following cryptographic standards across all components. These standards are aligned with NIST SP 800-131A Rev. 2 (Transitioning the Use of Cryptographic Algorithms and Key Lengths) and the CBN Cybersecurity Framework 2023.

| Domain | Algorithm | Key Length / Parameters | Notes |
|---|---|---|---|
| **TLS** | TLS 1.3 only | ECDHE-ECDSA-AES256-GCM-SHA384 | TLS 1.2 disabled; TLS 1.0/1.1 prohibited |
| **JWS body signing** | ECDSA | P-256 (secp256r1) | RS256 accepted for legacy DFSP compatibility only |
| **JWT (Keycloak)** | RS256 | RSA-2048 (minimum); RS512 preferred | Key rotation every 90 days |
| **PII encryption** | AES-256-GCM | 256-bit key, 96-bit IV, 128-bit tag | Via OpenBao transit engine |
| **Password hashing** | Argon2id | m=65536, t=3, p=4 | Keycloak default; no MD5/SHA-1 |
| **ILP condition** | SHA-256 | 256-bit | FSPIOP v1.1 requirement |
| **TigerBeetle transfer ID** | UUID v7 | 128-bit, time-ordered | Monotonic; no sequential integer IDs |
| **CBDC proof-of-reserve** | Ed25519 | 256-bit | mBridge requirement |
| **Database connection** | TLS 1.3 | Certificate pinned to Intermediate CA | `sslmode=verify-full` in all connection strings |

Deprecated algorithms that are **explicitly prohibited** in NextHub: MD5 (except non-security uses such as ETag generation), SHA-1, DES, 3DES, RC4, RSA-1024, and any export-grade cipher suite.

---

### 11.7 Compliance Mapping

NextHub is designed to support compliance with the following regulatory frameworks. Compliance is a shared responsibility between the hub operator and the scheme participants; the table below identifies which controls NextHub provides natively and which are the responsibility of the DFSP.

| Framework | Scope | NextHub Native Controls | DFSP Responsibility |
|---|---|---|---|
| **CBN Cybersecurity Framework 2023** | All CBN-licensed institutions | mTLS, JWS signing, audit trail, STR filing, AML rules engine | DFSP-side endpoint security, staff training |
| **NDPR (Nigeria Data Protection Regulation 2023)** | PII of Nigerian data subjects | PII encryption at rest (OpenBao transit), RLS multi-tenant isolation, 7-year retention with right-to-erasure workflow | DFSP consent management, data subject request handling |
| **PCI-DSS v4.0 (SAQ D)** | Payment card data (if applicable) | Network segmentation (NetworkPolicy), mTLS, audit logging, vulnerability scanning in CI/CD | Cardholder data environment isolation, quarterly ASV scans |
| **FATF Recommendations (AML/CFT)** | All financial institutions | AML rules engine, automated STR filing, sanctions screening, transaction monitoring | DFSP KYC/CDD procedures, beneficial ownership |
| **ISO 27001:2022** | Information security management | ZTNA, key management (OpenBao), incident response workflow, audit trail | ISMS documentation, risk assessment, staff awareness |
| **GDPR (for EU-connected DFSPs)** | PII of EU data subjects | PII encryption, data residency controls (Kubernetes node affinity), right-to-erasure workflow | Data processing agreements, DPA registration |
| **CBN AML/CFT Regulations 2022** | All CBN-licensed institutions | 7-year transaction record retention, STR filing within 24 hours, sanctions screening | DFSP CDD, EDD for high-risk customers |

#### 11.7.1 Audit Trail Architecture

The audit trail in NextHub has three layers, each with different retention periods and query capabilities.

**Layer 1 — TigerBeetle Ledger (Financial operations, permanent).** Every TigerBeetle transfer is immutable and permanent. The ledger cannot be modified after posting. This is the authoritative record for all financial operations.

**Layer 2 — Fluvio Event Log + Lakehouse (All system events, 7 years).** Every event published to Fluvio is written to the Parquet Lakehouse by the Rust Lakehouse writer. The Lakehouse is partitioned by `event_date` and `event_type`, enabling efficient regulatory audit queries. Retention is 7 years (CBN AML/CFT Regulations 2022).

**Layer 3 — PostgreSQL `pgaudit` Log (Database access, 2 years).** All SQL statements executed against the NextHub PostgreSQL database are logged via the `pgaudit` extension and shipped to OpenSearch. This provides a complete record of who accessed what data and when, including JIT privileged access sessions.

---

### 11.8 Incident Response

#### 11.8.1 Security Incident Classification

| Severity | Definition | Response SLA | Escalation |
|---|---|---|---|
| **P0 — Critical** | Active financial fraud, data breach with PII exposure, TigerBeetle ledger integrity failure | 15 minutes to first response; 1 hour to containment | Immediate: CTO, CISO, CBN notification within 72 hours (NDPR requirement) |
| **P1 — High** | mTLS certificate compromise, OpenBao breach, Keycloak admin account takeover | 1 hour to first response; 4 hours to containment | Within 1 hour: Security team lead, scheme operator |
| **P2 — Medium** | Fraud scorer bypass, AML rule evasion detected, anomalous DFSP behaviour | 4 hours to first response; 24 hours to resolution | Within 4 hours: Compliance officer, affected DFSP |
| **P3 — Low** | Failed login attempts above threshold, certificate approaching expiry, dependency CVE | 24 hours to first response; 7 days to resolution | Standard ticket; weekly security review |

#### 11.8.2 SIEM Integration (OpenSearch)

All security-relevant events are shipped to **OpenSearch** (Apache 2.0) via the OpenTelemetry Collector. The following event sources are ingested.

| Source | Events | Alert Threshold |
|---|---|---|
| APISIX access log | All requests; JWS verification failures | > 100 JWS failures/minute from single DFSP |
| Keycloak audit log | Login success/failure, token issuance, admin actions | > 10 failed logins in 5 minutes; any admin action outside business hours |
| OpenBao audit log | All secret reads, policy evaluations, token creation | Any `kv/v2/` read outside approved service accounts |
| PostgreSQL `pgaudit` | All SQL statements (JIT sessions) | Any DDL statement; any `SELECT *` on PII tables |
| Kubernetes audit log | Pod creation, RBAC changes, NetworkPolicy modifications | Any change to `nexthub` namespace by non-CI/CD service account |
| Fraud scorer | Score distribution, circuit breaker state | > 5% of transfers scoring > 0.85 in any 5-minute window |

OpenSearch Dashboards provides a real-time security operations view. Alerting is configured via OpenSearch Alerting with PagerDuty integration for P0/P1 incidents.

#### 11.8.3 Incident Runbook: TigerBeetle Ledger Integrity Failure

This is the highest-severity incident class. The response procedure is as follows.

1. **Detect:** OpenTelemetry alert fires when TigerBeetle returns a non-zero error code on a `create_transfers` call, or when the Rust settlement service detects a balance discrepancy between TigerBeetle and the PostgreSQL projection.
2. **Isolate:** Immediately halt all new PREPARE requests by setting the Transfer FSM to `MAINTENANCE` mode via the operator portal. In-flight transfers are allowed to complete or timeout.
3. **Diagnose:** Query TigerBeetle's `lookup_accounts` for all affected accounts. Compare balances against the Fluvio event log replay. Identify the first transfer where the discrepancy appears.
4. **Recover:** TigerBeetle's Raft consensus guarantees that a majority of replicas have the correct state. If one replica is corrupted, it is removed from the cluster and re-synced from the majority. If a majority are corrupted (extremely unlikely given Raft guarantees), the ledger is rebuilt by replaying the Fluvio event log from the Lakehouse.
5. **Notify:** CBN is notified within 72 hours per NDPR requirements. Affected DFSPs are notified within 1 hour.
6. **Post-mortem:** A written post-mortem is completed within 5 business days, with root cause analysis and preventive measures.

#### 11.8.4 Supply Chain Security

All container images used in NextHub are signed using **Sigstore/cosign** and verified by an OPA (Open Policy Agent) admission controller before deployment. The admission controller rejects any image that does not have a valid cosign signature from the NextHub CI/CD signing key. This prevents a compromised container registry from deploying malicious images.

A **Software Bill of Materials (SBOM)** is generated for every release using `syft` (Anchore) and stored in the OpenBao `kv/v2/` store. The SBOM is scanned against the NVD CVE database on every CI/CD run using `grype`. Any critical or high CVE in a direct dependency blocks the release pipeline until patched or explicitly accepted with a documented risk acceptance.

---

### 11.9 Security Architecture Summary

The following table provides a consolidated view of all security controls across the eight domains, mapped to the specific threats they address.

| Domain | Control | Threat Addressed | Implementation |
|---|---|---|---|
| **Network** | mTLS (DFSP ↔ Hub) | DFSP impersonation, MITM | APISIX + OpenBao PKI |
| **Network** | JWS body signing | Message tampering, replay | APISIX JWS plugin |
| **Network** | Istio STRICT mTLS | Pod-to-pod lateral movement | Istio PeerAuthentication |
| **Network** | Kubernetes NetworkPolicy | Blast radius containment | Default-deny + explicit allow |
| **Network** | Rate limiting | DDoS, brute force | APISIX rate-limit plugin |
| **Identity** | Keycloak OIDC | Credential theft | Short-lived JWT (15 min) |
| **Identity** | FIDO2 MFA | Phishing, password spray | Keycloak WebAuthn required action |
| **Identity** | Permify RBAC | Privilege escalation | Per-action permission check |
| **Identity** | JIT privileged access | Insider threat, standing access | OpenBao dynamic credentials |
| **Secrets** | OpenBao dynamic DB credentials | Credential leakage | 1-hour TTL, auto-rotated |
| **Secrets** | OpenBao transit encryption | PII data breach | AES-256-GCM at rest |
| **Secrets** | Air-gapped Root CA | CA compromise | YubiHSM 2, offline |
| **Financial** | TigerBeetle formally verified ledger | Financial fraud, double-spend | Atomic linked transfer chains |
| **Financial** | TigerBeetle append-only ledger | Audit trail tampering | Immutable by design |
| **Fraud** | In-path ML fraud scorer | Real-time payment fraud | gRPC, 5 ms SLA, blocking |
| **Fraud** | AML rules engine | Money laundering, structuring | Async, post-commit |
| **Fraud** | Automated STR filing | Regulatory non-compliance | Temporal workflow, 24h SLA |
| **Compliance** | `pgaudit` + OpenSearch | Insider data access | All SQL logged |
| **Compliance** | 7-year Lakehouse retention | Regulatory audit | Parquet, immutable |
| **Compliance** | SBOM + CVE scanning | Supply chain attack | Syft + Grype in CI/CD |
| **Compliance** | Sigstore/cosign image signing | Malicious container deployment | OPA admission controller |
| **Incident** | OpenSearch SIEM | Slow detection | Real-time alerting |
| **Incident** | Fluvio event log replay | Ledger recovery | Full state reconstruction |

---

## Security References

[31]: https://csrc.nist.gov/publications/detail/sp/800-207/final "NIST SP 800-207: Zero Trust Architecture"
[32]: https://csrc.nist.gov/publications/detail/sp/800-131a/rev-2/final "NIST SP 800-131A Rev. 2: Transitioning Cryptographic Algorithms"
[33]: https://www.cbn.gov.ng/out/2023/csd/cbn%20cybersecurity%20framework%202023.pdf "CBN Cybersecurity Framework 2023"
[34]: https://nitda.gov.ng/ndpr/ "Nigeria Data Protection Regulation 2023"
[35]: https://www.fatf-gafi.org/en/topics/fatf-recommendations.html "FATF 40 Recommendations"
[36]: https://openbao.org "OpenBao — Linux Foundation Fork of HashiCorp Vault"
[37]: https://istio.io/latest/docs/concepts/security/ "Istio Security Architecture"
[38]: https://www.sigstore.dev "Sigstore — Supply Chain Security"
[39]: https://github.com/anchore/syft "Syft — SBOM Generator"
[40]: https://github.com/anchore/grype "Grype — Vulnerability Scanner"
[41]: https://www.permify.co "Permify — Open-Source Authorisation Service"
[42]: https://www.cbn.gov.ng/out/2022/bspd/aml%20cft%20regulations%202022.pdf "CBN AML/CFT Regulations 2022"


---

# Part XII — Mojaloop Feature Parity Gap Analysis

## XII.1 Baseline: What Mojaloop 15.x Provides

Mojaloop is the reference open-source implementation of the Level One Project (L1P) principles, providing a real-time gross settlement (RTGS) interoperability layer for low-value retail payments. Its canonical feature set spans seven core services:

| Mojaloop Service | Function | NextHub Equivalent |
|---|---|---|
| **Central Ledger** | Double-entry bookkeeping for participant positions | TigerBeetle via Rust `nexthub-settlement` crate |
| **Account Lookup Service (ALS)** | Party identifier → DFSP routing | `nexthubOracles` router + Redis ALS cache |
| **Quoting Service** | Fee/FX quote negotiation | FSPIOP `/quotes` handler (Go) |
| **Central Settlement** | Net position calculation and settlement windows | `nexthubSettlement` router + Temporal `ReconciliationWorkflow` |
| **Transaction Requests** | Payee-initiated pull payment | FSPIOP `/transactionRequests` handler (Go) |
| **Bulk Transfers** | Batch payment processing | `nexthubBulkTransfers` router + FSPIOP `/bulkTransfers` handler |
| **PISP (3PPI)** | Third-party payment initiation | `nexthubPISP` router + FSPIOP `/consents` handler |

## XII.2 Wave 210 Gap Closure

Wave 210 closed the following gaps that existed after Wave 209:

| Gap | Mojaloop Feature | NextHub Implementation | Status |
|---|---|---|---|
| Oracle registry | ALS oracle management API | `nexthubOracles` tRPC router + `nexthub_oracles` table | **Closed** |
| FX conversion | Cross-currency quote and conversion | `nexthubFX` router + `nexthub_fx_rates` table | **Closed** |
| Bulk transfer tracking | Batch payment state machine | `nexthubBulkTransfers` router + Go `bulkTransfers.go` handler | **Closed** |
| PISP consent lifecycle | 3PPI consent grant/revoke | `nexthubPISP` router + Go `consents.go` handler | **Closed** |
| Transaction requests | Payee-initiated flow | Go `transactionRequests.go` handler | **Closed** |
| Authorizations | OTP/QRCODE/BIOMETRIC challenge | Go `authorizations.go` handler | **Closed** |
| FX quotes | FSPIOP FX API v2.0 | Go `fxQuotes.go` handler | **Closed** |

## XII.3 Remaining Gaps (Post-Wave 210)

The following items represent the remaining delta between NextHub and a production-grade Mojaloop deployment:

| Gap | Priority | Effort | Notes |
|---|---|---|---|
| **ISO 20022 message parser** | High | 3 days | Go library for pacs.008, pacs.002, camt.054 — needed for RTGS/CBDC rails |
| **Settlement matrix (DNS/RTGS)** | High | 2 days | Deferred net settlement vs. RTGS mode selector in `nexthubSettlement` |
| **Participant lifecycle management** | High | 2 days | Onboarding, offboarding, suspension, limits — extends `nexthubDfsps` |
| **ALS Redis cache layer** | Medium | 1 day | Party lookup cache in Go ALS handler to reduce oracle round-trips |
| **Bulk quotes** | Medium | 1 day | Go `bulkQuotes.go` handler + `nexthub_bulk_quotes` schema table |
| **End-to-end transfer tracing** | Medium | 2 days | Distributed trace ID propagation across FSM → TigerBeetle → Temporal |
| **TIPS/CBDC rail connector** | Low | 5 days | ECB TIPS and CBN eNaira rail adapters |
| **Scheme membership management** | Medium | 1 day | Participant scheme rules, BIN sponsorship — extends `nexthubDfsps` |
| **Notification service** | Low | 1 day | FSPIOP callback retry queue with exponential backoff |

## XII.4 Feature Parity Score

Based on the Mojaloop feature matrix, NextHub achieves the following parity scores after Wave 210:

| Domain | Parity Score | Notes |
|---|---|---|
| Core transfer flow | 95% | FSM, TigerBeetle, Temporal all implemented |
| Settlement | 90% | Windows, net positions, Temporal workflow — DNS/RTGS mode pending |
| ALS / Party Lookup | 85% | Oracle registry complete; Redis cache layer pending |
| FX / Cross-Currency | 90% | Rate management, conversion, FSPIOP FX API v2.0 |
| Bulk Transfers | 85% | State tracking complete; bulk quotes pending |
| PISP / 3PPI | 80% | Consent lifecycle complete; FIDO2 credential storage pending |
| Reconciliation | 95% | Full Temporal workflow + exception management |
| Billing | 95% | Invoice generation, fee postings, monthly billing workflow |
| AML / Compliance | 90% | Rules engine, STR filing, NFIU integration |
| Security | 90% | mTLS, OpenBao, Permify RBAC, SIEM |
| **Overall** | **90%** | Exceeds Mojaloop on billing, AML, and observability |

---

# Part XIII — Drop-in Mojaloop Replacement Guide

## XIII.1 Architectural Compatibility

NextHub is designed as a **protocol-compatible superset** of Mojaloop. Any DFSP that communicates with Mojaloop via the FSPIOP API v1.1 can connect to NextHub without modification. The compatibility strategy rests on three pillars:

**1. FSPIOP API Surface Compatibility.** NextHub exposes the same HTTP endpoints, headers, and message schemas as Mojaloop's Central Services. The Go FSPIOP router handles all standard resources: `/parties`, `/quotes`, `/transfers`, `/bulkTransfers`, `/transactionRequests`, `/authorizations`, `/consents`, `/fxQuotes`, and `/participants`. Response codes, callback patterns, and JWS signing follow the FSPIOP v1.1 specification exactly.

**2. Central Ledger Drop-in.** The TigerBeetle settlement service exposes the same net-position and settlement-window semantics as Mojaloop's Central Ledger. The Rust gRPC service translates FSPIOP transfer states (PREPARE → FULFIL → ABORT) into TigerBeetle double-entry operations using deterministic account ID derivation (UUID v5 from DFSP NIP codes), ensuring idempotent replay.

**3. ALS Oracle Compatibility.** The `nexthubOracles` registry implements the same oracle registration and lookup API as Mojaloop's ALS. Existing oracle implementations (MSISDN, BVN, IBAN) can be re-registered in NextHub without code changes.

## XIII.2 Migration Runbook

The following runbook describes the steps to migrate an existing Mojaloop deployment to NextHub:

| Phase | Step | Duration | Rollback |
|---|---|---|---|
| **Preparation** | Audit existing DFSPs, oracles, and FX providers | 1 day | N/A |
| **Preparation** | Export Mojaloop participant database to CSV | 2 hours | N/A |
| **Preparation** | Deploy NextHub alongside Mojaloop (parallel mode) | 4 hours | Stop NextHub |
| **Migration** | Import DFSPs via `nexthubDfsps.onboard` tRPC procedure | 1 hour | Delete imported rows |
| **Migration** | Register oracles via `nexthubOracles.register` | 30 min | Deregister oracles |
| **Migration** | Publish FX rates via `nexthubFX.publishRate` | 30 min | Rates expire automatically |
| **Migration** | Replay last 7 days of settlement windows | 2 hours | Revert to Mojaloop ledger |
| **Cutover** | Update DFSP FSPIOP endpoint from Mojaloop to NextHub | 15 min | Revert DNS/endpoint |
| **Cutover** | Disable Mojaloop Central Services | After 24h monitoring | Re-enable Mojaloop |
| **Post-migration** | Decommission Mojaloop infrastructure | 1 week | N/A |

## XIII.3 API Compatibility Layer

For DFSPs that use Mojaloop-specific extensions or non-standard headers, NextHub provides an **API compatibility shim** in the Go FSPIOP router:

```go
// Mojaloop-specific header normalization
func normalizeMojaloopHeaders(r *http.Request) {
    // Mojaloop uses FSPIOP-Source; some older clients use X-Forwarded-DFSP
    if r.Header.Get("FSPIOP-Source") == "" {
        r.Header.Set("FSPIOP-Source", r.Header.Get("X-Forwarded-DFSP"))
    }
    // Mojaloop date format normalization
    if date := r.Header.Get("Date"); date != "" {
        if t, err := time.Parse(time.RFC1123, date); err == nil {
            r.Header.Set("Date", t.UTC().Format(time.RFC3339))
        }
    }
}
```

The shim handles: header normalization, content-type negotiation (both `application/json` and `application/vnd.interoperability.*+json` are accepted), and JWS signature verification with configurable key rotation.

## XIII.4 NextHub Advantages Over Mojaloop

| Dimension | Mojaloop | NextHub | Advantage |
|---|---|---|---|
| **Ledger** | MySQL (relational) | TigerBeetle (purpose-built) | 1M TPS vs ~10K TPS |
| **Workflow engine** | Custom state machines | Temporal (durable execution) | Automatic retry, saga pattern |
| **AML** | External (not included) | Built-in rules engine + STR | No third-party dependency |
| **Billing** | External | Built-in invoice generator | Operator monetisation |
| **Observability** | Prometheus + Grafana | OpenTelemetry + Lakehouse | Long-term analytics |
| **Multi-currency** | Limited | Full FX API v2.0 | Cross-border ready |
| **PISP** | Experimental | Production-grade | 3PPI at scale |
| **Deployment** | Kubernetes-only | K8s + bare-metal + Docker | Flexible |

---

# Part XIV — Platform Monetisation

## XIV.1 Revenue Architecture

NextHub is designed as a **multi-sided payment infrastructure platform** that generates revenue across four distinct layers: infrastructure licensing, transaction fees, value-added services, and ecosystem participation.

### Tier 1 — Infrastructure Licensing (SaaS)

| Tier | Target | Monthly Fee | Included |
|---|---|---|---|
| **Community** | Fintechs, pilots | Free | 10K transfers/month, 1 DFSP, community support |
| **Starter** | Small DFSPs | $2,500 | 500K transfers/month, 5 DFSPs, email support |
| **Professional** | Mid-size operators | $10,000 | 5M transfers/month, 25 DFSPs, SLA 99.9%, phone support |
| **Enterprise** | National switches, CBs | $50,000+ | Unlimited, custom SLA, dedicated CSM, on-prem option |
| **Government** | Central banks, regulators | Custom | White-label, source code escrow, regulatory reporting |

### Tier 2 — Transaction Fees

NextHub operators can configure per-transaction fees through the `nexthubBilling` fee schedule engine:

| Fee Type | Basis | Typical Rate | Revenue Share |
|---|---|---|---|
| **Interchange** | Per transfer | 0.05–0.25% | Operator 60%, NextHub 40% |
| **FX spread** | Per conversion | 0.1–0.5% | Operator 70%, NextHub 30% |
| **Bulk transfer** | Per batch | $0.001/item | Operator 80%, NextHub 20% |
| **PISP initiation** | Per consent grant | $0.10 | Operator 50%, NextHub 50% |
| **Oracle lookup** | Per ALS query | $0.001 | Operator 100% (included in tier) |

### Tier 3 — Value-Added Services

| Service | Description | Pricing Model |
|---|---|---|
| **AML-as-a-Service** | Hosted rules engine + STR filing | $500/month + $0.001/transaction |
| **Reconciliation-as-a-Service** | Temporal workflow + exception management | $1,000/month |
| **FX Rate Feed** | Real-time rates from Reuters/Bloomberg | $2,000/month |
| **Compliance Reporting** | CBN Form A/B/C, FATF reports | $500/report |
| **DFSP Onboarding** | Managed onboarding + certificate issuance | $5,000/DFSP |
| **Developer Portal** | API sandbox, documentation, SDK | $200/month/developer |
| **Analytics Dashboard** | Lakehouse-backed BI for operators | $1,000/month |

### Tier 4 — Ecosystem Participation

| Revenue Stream | Mechanism | Estimate |
|---|---|---|
| **Marketplace listing** | Third-party oracle/FX provider listing fee | $500/month/provider |
| **Certification program** | DFSP technical certification | $2,000/certification |
| **Training & consulting** | Implementation services | $200/hour |
| **White-label licensing** | Branded NextHub for banks | $100,000 one-time + 20% revenue share |
| **Data insights** | Anonymised aggregate payment analytics | $5,000/month/subscriber |

## XIV.2 Go-to-Market Strategy

NextHub's go-to-market strategy targets three primary customer segments in sequence:

**Phase 1 (Year 1): African Digital Finance Ecosystem.** Nigeria (CBN/NIBSS), Ghana (GhIPSS), Kenya (CBK), and Rwanda (BNR) are the initial target markets. The value proposition is a drop-in Mojaloop replacement with built-in AML, billing, and TigerBeetle performance. Entry is via national switch operators and fintech hubs (e.g., CcHub, iHub).

**Phase 2 (Year 2): Emerging Market Expansion.** Bangladesh (BFIU), Pakistan (SBP), and Southeast Asia (BSP Philippines, Bank Indonesia). The FX API v2.0 and PISP capabilities are the differentiators for remittance corridors.

**Phase 3 (Year 3): Global Infrastructure Play.** CBDC rail connectors (ECB TIPS, CBN eNaira, BOE RTGS) and ISO 20022 compliance open the door to G20 central bank partnerships.

## XIV.3 Competitive Positioning

| Competitor | Strength | NextHub Advantage |
|---|---|---|
| **Mojaloop** | Open-source, L1P alignment | 10x performance, built-in AML/billing |
| **Temenos Payments Hub** | Enterprise, ISO 20022 | Open-source, 100x cheaper |
| **Finastra Universal Payments** | Global reach | Modular, cloud-native |
| **Mastercard Send** | Network effects | No scheme lock-in |
| **Stripe Treasury** | Developer experience | Interoperability, multi-DFSP |

---

# Part XV — Domain Expansion

## XV.1 Beyond Payments: The Infrastructure Play

NextHub's core capabilities — durable workflow execution (Temporal), high-throughput double-entry ledger (TigerBeetle), real-time event streaming (Fluvio), and a rules engine (Python AML) — are domain-agnostic. The same infrastructure that processes payment transfers can process any value exchange that requires atomicity, auditability, and interoperability.

## XV.2 Remittance

The remittance market processes $860 billion annually, with Africa receiving $100 billion per year at an average cost of 8.4%. NextHub addresses this with:

**Cross-border corridor engine.** The `nexthubFX` router and FSPIOP FX API v2.0 enable real-time rate negotiation between sending and receiving DFSPs. Temporal `FXConversionWorkflow` handles the saga pattern: lock rate → debit sender → credit recipient → release lock.

**Compliance automation.** The Python AML engine applies FATF Travel Rule requirements automatically: for transfers above $1,000, sender and recipient identity data is attached to the transfer payload and forwarded to the receiving DFSP's compliance system.

**Projected impact.** A 1% reduction in remittance costs on the Nigeria–UK corridor ($5B/year) saves $50M annually for senders.

## XV.3 Healthcare

Healthcare payments share the same interoperability challenges as financial payments: multiple payers (insurance, government, patient), multiple providers (hospitals, pharmacies, labs), and complex claim adjudication workflows.

**Health Claims Hub.** NextHub can be extended with a `nexthubHealthClaims` router that models insurance claims as FSPIOP-style transfers: the patient is the payer party, the hospital is the payee party, and the insurer is the DFSP. The Temporal `ClaimAdjudicationWorkflow` handles: eligibility check → pre-authorization → service delivery → claim submission → adjudication → payment.

**NHIA Integration (Nigeria).** The National Health Insurance Authority (NHIA) can use NextHub as the interoperability layer between HMOs, hospitals, and the NHIA central system, replacing the current manual reconciliation process.

| Healthcare Use Case | NextHub Component | Benefit |
|---|---|---|
| Insurance claim processing | Temporal ClaimAdjudicationWorkflow | Reduce claim cycle from 30 days to 24 hours |
| Pharmacy benefit management | TigerBeetle drug benefit ledger | Real-time benefit balance tracking |
| Hospital revenue cycle | nexthubBilling invoice engine | Automated patient billing |
| Medical supply chain | nexthubBulkTransfers for bulk orders | Batch procurement payments |

## XV.4 Insurance

The insurance sector requires premium collection, claim disbursement, and reinsurance settlement — all of which map directly to NextHub's payment primitives.

**Premium Collection Hub.** The `nexthubBilling` fee schedule engine can be repurposed as a premium calculation engine. Temporal `PremiumCollectionWorkflow` handles: policy activation → premium schedule generation → recurring debit → lapse management.

**Claim Disbursement.** The settlement window mechanism in `nexthubSettlement` can be used for batch claim disbursement: all approved claims in a settlement window are netted and disbursed in a single TigerBeetle batch, reducing transaction costs.

**Reinsurance Settlement.** The FSPIOP bulk transfer API can be used for reinsurance premium and claim settlement between cedants and reinsurers, with the ALS oracle registry mapping reinsurer identifiers to their settlement accounts.

## XV.5 Supply Chain Finance

Supply chain finance (SCF) involves three parties — buyer, supplier, and financier — in a triangle that mirrors the DFSP/PISP/consumer triangle in FSPIOP.

**Dynamic Discounting.** The `nexthubFX` rate engine can be repurposed as a discount rate engine: suppliers can request early payment at a discount rate, and buyers can approve or reject. The Temporal `DynamicDiscountingWorkflow` handles the three-way settlement.

**Invoice Financing.** The `nexthubBilling` invoice engine generates structured invoices that can be tokenised and traded on a secondary market. TigerBeetle tracks invoice ownership and payment status with immutable ledger entries.

## XV.6 Government Disbursements

Government-to-person (G2P) payments — social transfers, pension disbursements, tax refunds — are the highest-volume, highest-stakes payment use case in emerging markets.

**G2P Hub.** NextHub's bulk transfer capability (FSPIOP `/bulkTransfers`) is purpose-built for G2P: a single batch can contain millions of individual transfers, each with its own payee identifier (NIN, BVN, MSISDN). The ALS oracle resolves each identifier to a DFSP account in real time.

**Nigeria NASIMS Integration.** The National Social Investment Management System (NASIMS) can use NextHub as the payment rail for the N-Power, Conditional Cash Transfer, and TraderMoni programmes, replacing the current manual bank transfer process.

**Projected scale.** Nigeria's Unified Social Registry covers 30 million households. A monthly disbursement of ₦20,000 to each household represents 30M transfers totalling ₦600B — well within TigerBeetle's 1M TPS capacity.

## XV.7 Energy and Utilities

Prepaid electricity and utility payments are the most common digital payment use case in Africa, with Nigeria's NEPA/DISCO ecosystem processing 50 million prepaid meter top-ups per month.

**VEND (Vending Engine for Nexthub Disbursements).** The `nexthubBilling` engine can be extended with a vending workflow: customer pays → Temporal `VendingWorkflow` calls DISCO API → token generated → SMS delivered → TigerBeetle records the credit. The entire flow completes in under 3 seconds.

**Carbon Credit Settlement.** The same infrastructure can settle carbon credit trades between project developers and buyers, with TigerBeetle tracking credit ownership and retirement status.

## XV.8 Domain Expansion Roadmap

| Domain | Wave | Key Component | Revenue Potential |
|---|---|---|---|
| Remittance | Wave 211 | FX corridor engine + Travel Rule | $50M/year saved on NG-UK corridor |
| Healthcare | Wave 212 | ClaimAdjudicationWorkflow | $200M NHIA processing fees |
| Insurance | Wave 213 | PremiumCollectionWorkflow | $100M premium collection |
| Supply Chain | Wave 214 | DynamicDiscountingWorkflow | $500M invoice financing |
| G2P | Wave 215 | G2P bulk transfer hub | 30M beneficiaries, ₦600B/month |
| Energy | Wave 216 | VEND workflow | 50M top-ups/month |
| CBDC | Wave 217 | eNaira/TIPS rail connector | Central bank partnership |

---

## Design Document References

[43]: https://docs.mojaloop.io/api/fspiop/ "FSPIOP API v1.1 Specification"
[44]: https://docs.mojaloop.io/api/fspiop/v2.0/api-definition.html "FSPIOP FX API v2.0 Specification"
[45]: https://www.worldbank.org/en/topic/remittances "World Bank Remittance Prices Worldwide"
[46]: https://nhia.gov.ng "National Health Insurance Authority (NHIA) Nigeria"
[47]: https://nasims.gov.ng "National Social Investment Management System (NASIMS)"
[48]: https://tigerbeetle.com "TigerBeetle — Financial Ledger Database"
[49]: https://temporal.io "Temporal — Durable Execution Platform"
[50]: https://fluvio.io "Fluvio — Distributed Streaming Platform"
