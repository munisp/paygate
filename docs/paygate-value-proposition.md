# PayGate Value Proposition: Agent Banking, Retail Kiosks, and Restaurants

**Author:** Manus AI  
**Date:** March 2026  
**Version:** 1.0

---

## Executive Summary

PayGate is a full-stack payment infrastructure platform purpose-built for emerging markets, with particular depth in the Nigerian financial ecosystem. Its architecture spans a React merchant portal, a Go middleware bridge, a NIBSS PTSP settlement layer, ISO 8583 card processing, and a multi-modal terminal fleet (soundbox, POS Lite, POS Smart, USSD). This document explains how PayGate creates differentiated value for three high-growth verticals — **agent banking**, **retail kiosks**, and **restaurants** — and how it integrates technically and commercially with each.

---

## 1. Agent Banking

### 1.1 The Market Context

Agent banking is the dominant financial inclusion channel in sub-Saharan Africa. In Nigeria alone, the CBN-licensed agent banking network processes over ₦50 trillion annually, with NIBSS reporting more than 1.8 billion agent transactions in 2024. Agents operate corner shops, pharmacies, and market stalls, acting as human ATMs and teller windows for the unbanked. The core challenge is that agents need a device that works offline, handles cash-in/cash-out, supports NIP account lookups, and settles reliably at end of day.

### 1.2 How PayGate Integrates

PayGate addresses the agent banking use case through three interlocking capabilities.

**USSD Terminal Support.** The `ussd_terminal` model in the POS terminal fleet allows agents without smartphones or reliable internet to initiate and confirm transactions via USSD dial strings. The Go middleware bridge handles the USSD session state machine, forwarding to the NIP resolution layer and returning confirmation codes that the agent reads aloud to the customer.

**Offline Transaction Queue.** The `POST /v1/pos/offline/flush` endpoint in the middleware bridge allows terminals that have been operating in disconnected mode to batch-upload queued transactions when connectivity is restored. The portal's PTSP settlement flow then picks up these transactions in the next settlement window, ensuring no revenue is lost during outages.

**NIP Account Resolution with Error Logging.** The portal's `nipResolutionErrors` table and associated tRPC procedures (`listNipResolutionErrors`, `markNipErrorResolved`) give agent supervisors a real-time view of failed account lookups, enabling them to resolve disputes before they escalate. The Go bridge's `consumer_account_handler.go` performs the actual NIP name enquiry, caching successful lookups to reduce API round-trips.

### 1.3 Value Delivered

| Dimension | PayGate Capability | Business Outcome |
|---|---|---|
| Connectivity resilience | Offline flush + USSD fallback | Zero transaction loss during outages |
| Settlement certainty | NIBSS PTSP batch confirmation | T+1 settlement with NIBSS reference |
| Compliance | KYC workflow via middleware | CBN agent banking licence compliance |
| Fraud control | Velocity breach and card testing alerts | Reduced chargeback exposure |
| Multi-language audio | Soundbox in EN / YO / HA / IG | Agent confidence in diverse markets |

### 1.4 Integration Architecture

```
Agent Device (USSD / Soundbox / POS Lite)
        │  ISO 8583 / USSD / WebSocket
        ▼
Go Middleware Bridge  ──── NIP Name Enquiry ──── NIBSS
        │                         │
        │  tRPC / REST             │  Settlement batch
        ▼                         ▼
PayGate Merchant Portal ◄── NIBSS Confirmation Webhook
        │
        ▼
PostgreSQL (pos_transactions, ptsp_batches, nip_resolution_errors)
```

---

## 2. Retail Kiosks

### 2.1 The Market Context

Retail kiosks — self-service payment points in supermarkets, fuel stations, and fast-moving consumer goods (FMCG) distribution hubs — require high-throughput, low-latency card acceptance with minimal human intervention. In Nigeria, the proliferation of POS terminals at fuel stations and supermarkets has driven card transaction volumes to record highs, but merchants suffer from poor visibility into terminal health, settlement delays, and reconciliation gaps.

### 2.2 How PayGate Integrates

**POS Smart Terminal.** The `pos_smart` model is an Android-based terminal with a receipt printer, capable of running the PayGate WebSocket client for real-time payment event streaming. Each transaction is pushed to the portal via the Fluvio event bus, giving the merchant a live feed of sales across all kiosk locations.

**Terminal Map View.** The new `TerminalMap` page (Wave 31) provides a geographic overlay of all terminals, colour-coded by health status: green (heartbeat within 5 minutes), amber (stale, 5–30 minutes), and grey (offline, >30 minutes). Kiosk operators can immediately identify which locations need attention without calling each site.

**GPS Location Management.** Operators can click any terminal in the map sidebar and then click the map to set or correct its GPS coordinates. This is stored as integer-encoded latitude/longitude (× 10⁶) in the `pos_terminals` table, enabling future geofencing and proximity-based fraud rules.

**Batch Settlement Reconciliation.** The `ptsp_batches` table and `pos.listBatches` tRPC procedure give kiosk finance teams a single view of all settlement batches, their NIBSS references, and confirmation status. The `pos.confirmBatch` mutation is called automatically by the Go bridge when NIBSS sends the settlement confirmation webhook, updating the batch status in real time.

### 2.3 Value Delivered

| Dimension | PayGate Capability | Business Outcome |
|---|---|---|
| Terminal visibility | Map view with health colour coding | Faster fault detection, reduced downtime |
| Settlement transparency | PTSP batch tracking with NIBSS refs | Audit-ready reconciliation |
| High throughput | ISO 8583 card auth via Go bridge | Sub-second card authorisation |
| Multi-site management | Merchant portal with per-terminal stats | Single pane of glass for all kiosks |
| Dispute resolution | Dispute router with middleware escalation | Structured chargeback management |

### 2.4 Integration Architecture

```
Kiosk POS Smart Terminal
        │  ISO 8583 card auth
        ▼
Go Middleware Bridge ──── Fluvio Event Bus ──── Real-time portal feed
        │
        │  WebSocket push
        ▼
PayGate Portal (TerminalMap, POSTerminals, Transactions)
        │
        ▼
NIBSS PTSP Settlement ──► Confirmation Webhook ──► ptsp_batches updated
```

---

## 3. Restaurants

### 3.1 The Market Context

Restaurants present a unique payment challenge: high transaction frequency, split-bill scenarios, tipping, and the need for printed receipts. In Nigeria, QR code payments have surged as an alternative to card swipes, particularly in quick-service restaurants (QSRs) where speed of service is paramount. Restaurants also need BNPL (buy now, pay later) for corporate accounts and mobile money reconciliation for staff salary disbursements.

### 3.2 How PayGate Integrates

**QR and Soundbox Payments.** The `soundbox_basic` model is ideal for restaurant counters: the device plays an audio confirmation in the customer's preferred language (English, Yoruba, Hausa, or Igbo) immediately upon payment. The merchant-level `soundboxLanguage` preference (Wave 31) sets the default across all terminals, while individual terminals can override it. This eliminates the need for staff to verify payment on a screen.

**Payment Links for Table Orders.** The `paymentLinks` router allows restaurants to generate per-table or per-order payment links that customers scan with their phones. The link expires after a configurable window, and the portal tracks click-through and completion rates.

**BNPL for Corporate Dining.** The `bnplLoans` router and associated Go middleware integration allow restaurants to offer deferred payment to corporate clients. The BNPL engine tracks instalment schedules, sends reminders, and updates the loan status in real time.

**Mobile Money Reconciliation.** The `mobileMoneyRecon` router handles reconciliation of mobile money payments (MTN MoMo, Airtel Money) against POS transactions, a common requirement for restaurants that accept multiple payment channels. The `reconcileMoMoViaMiddleware` function in the bridge handles the actual reconciliation logic.

**FX Dashboard for International Guests.** Hotels and upscale restaurants that serve international guests can use the FX dashboard to display prices in multiple currencies and process cross-border payments at live rates via the `fxRates` router.

### 3.3 Value Delivered

| Dimension | PayGate Capability | Business Outcome |
|---|---|---|
| Speed of service | Soundbox audio confirmation | No screen-checking by staff |
| Multi-channel acceptance | QR, card, USSD, mobile money | Higher conversion, fewer abandoned orders |
| Corporate accounts | BNPL with instalment tracking | Larger average order value |
| Multi-currency | FX dashboard with live rates | International guest satisfaction |
| Reconciliation | Mobile money recon router | Accurate end-of-day cash-up |

### 3.4 Integration Architecture

```
Restaurant Counter (Soundbox / POS Lite)
        │  QR scan / card tap
        ▼
Go Middleware Bridge ──── NIP / Card Auth ──── NIBSS / Card Schemes
        │
        │  WebSocket event push
        ▼
PayGate Portal (Transactions, PaymentLinks, BNPL, FX, MoMo Recon)
        │
        ▼
Merchant Notifications (fraud alerts, payout confirmations, BNPL reminders)
```

---

## 4. Cross-Vertical Capabilities

Several PayGate capabilities deliver value across all three verticals simultaneously.

**Merchant Notifications.** The `merchant_notifications` table and associated tRPC procedures provide a structured in-app notification feed for fraud alerts, payout confirmations, KYC status changes, and NIBSS settlement confirmations. This replaces ad-hoc SMS/email alerts with a persistent, auditable record.

**Role-Based Access Control.** The `user.role` field (admin | user) and `adminProcedure` middleware allow merchants to grant staff access to the portal without exposing sensitive financial settings. A restaurant manager can view transactions without being able to initiate payouts.

**Fraud and Risk Engine.** The `fraudAlerts` router and `scoreFraudViaMiddleware` function provide real-time risk scoring for every transaction. The portal's Fraud & Risk page displays velocity breach alerts, card testing patterns, and unusual location flags — all relevant to agent banking (SIM swap fraud), retail kiosks (card cloning), and restaurants (friendly fraud).

**Webhook Delivery.** The `webhooks` router allows merchants to push transaction events to their own ERP, POS, or accounting systems. This is particularly valuable for supermarket chains and restaurant groups that need to reconcile PayGate data with their internal systems.

---

## 5. Roadmap Recommendations

Based on the current architecture, three enhancements would further strengthen PayGate's position in these verticals.

First, **geofencing alerts** would allow merchants to receive notifications when a terminal is used outside its registered location — a critical fraud control for agent banking networks where terminals are sometimes stolen and used elsewhere.

Second, **split-bill payment links** would address the restaurant use case more directly, allowing a single order to be split across multiple payment methods or payers without requiring the merchant to manually divide the transaction.

Third, **agent performance dashboards** would give agent banking super-agents a ranked view of their sub-agents by transaction volume, settlement rate, and fraud incidents — enabling data-driven network management.

---

*This document reflects the PayGate Merchant Portal architecture as of Wave 31 (March 2026). All technical details are derived from the live codebase.*
