# PayGate Billing Engine — Architecture

**Version:** 1.0  
**Date:** 2026-05-09  
**Status:** Production Design

---

## 1. Overview

The PayGate Billing Engine is a real-time, event-driven system that captures every payment transaction, computes fees according to the tenant's pricing configuration, posts double-entry ledger entries to TigerBeetle, enforces role-based access control on all billing configuration, audits every change, and streams aggregated data to the lakehouse for analytics.

The financial model tool (`paygate-financial-model.html`) defines the *pricing parameters*. The billing engine *executes* those parameters against live transaction data.

---

## 2. Service Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        APISIX + OpenAppSec                               │
│                    (API Gateway + WAF/RASP)                               │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
   ┌──────▼──────┐   ┌───────▼──────┐   ┌──────▼──────────┐
   │  Portal UI  │   │  Billing API │   │  Onboarding API  │
   │ (TypeScript)│   │  (Go/tRPC)   │   │  (Go/Temporal)   │
   └──────┬──────┘   └───────┬──────┘   └──────┬───────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │  Dapr sidecar mesh
          ┌──────────────────┼──────────────────┐
          │                  │                  │
   ┌──────▼──────┐   ┌───────▼──────┐   ┌──────▼──────────┐
   │  Go Event   │   │  Rust Billing │   │  Go Audit/RBAC  │
   │  Ingestor   │   │  Core Engine  │   │  Service        │
   │  (Kafka +   │   │  (fee calc +  │   │  (Keycloak +    │
   │   Fluvio)   │   │   TB posting) │   │   Permify +     │
   └──────┬──────┘   └───────┬──────┘   │   OpenSearch)   │
          │                  │          └──────┬───────────┘
          │                  │                 │
   ┌──────▼──────────────────▼─────────────────▼──────────┐
   │                   Redis (hot cache)                    │
   │         billing configs, rate limits, session          │
   └──────────────────────────┬───────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
   ┌──────▼──────┐   ┌────────▼──────┐   ┌───────▼──────┐
   │ PostgreSQL  │   │ TigerBeetle   │   │  OpenSearch  │
   │ (billing    │   │ (double-entry │   │  (audit log, │
   │  configs,   │   │  ledger)      │   │   search)    │
   │  tenants,   │   └───────────────┘   └──────────────┘
   │  invoices)  │
   └─────────────┘
          │
   ┌──────▼──────────────────────────────────────────────┐
   │         Python Settlement + Lakehouse Pipeline        │
   │    (Mojaloop settlement bridge + Kafka→lakehouse)     │
   └─────────────────────────────────────────────────────┘
```

---

## 3. Data Flow — Per-Transaction Billing

```
Payment Event (Kafka topic: payment.completed)
    │
    ▼
Go Event Ingestor
    │  1. Deserialize CloudEvent
    │  2. Look up tenant billing config from Redis (fallback: PostgreSQL)
    │  3. Forward to Rust Billing Core via Dapr service invocation
    │
    ▼
Rust Billing Core
    │  1. Apply fee schedule: fee = min(max(txn_amount × rate, floor), cap)
    │  2. Deduct interchange cost (NIBSS/bank cost per txn)
    │  3. Compute platform share and reseller share
    │  4. Compute sign-on fee amortization if applicable
    │  5. Build TigerBeetle transfer batch
    │  6. Post to TigerBeetle (atomic double-entry)
    │  7. Emit billing.computed event → Kafka
    │
    ▼
TigerBeetle Ledger Accounts
    ├── merchant_payable:{tenant_id}:{merchant_id}
    ├── platform_revenue:{tenant_id}
    ├── reseller_payable:{tenant_id}:{reseller_id}
    ├── interchange_cost:{tenant_id}
    └── sign_on_fee_revenue:{tenant_id}
    │
    ▼
Kafka topic: billing.computed
    ├── → OpenSearch (audit + search)
    ├── → Redis (running totals cache)
    └── → Python Lakehouse Pipeline (aggregation + analytics)
```

---

## 4. Tenant Onboarding Billing Provisioning (Temporal Workflow)

When a new tenant or white-label customer is created:

```
Temporal Workflow: ProvisionTenantBilling
    │
    ├── Activity: CreateKeycloakRoles
    │       billing:admin, billing:viewer, billing:config:write,
    │       billing:config:read, billing:report:read
    │
    ├── Activity: CreatePermifyPolicies
    │       Role → Resource → Action mappings for billing resources
    │
    ├── Activity: CreateBillingConfig (PostgreSQL)
    │       pricing_model, fee_rate, fee_cap, fee_floor,
    │       platform_share_pct, reseller_share_pct,
    │       nibss_cost_per_txn, sign_on_fee, subscription_fee
    │
    ├── Activity: CreateTigerBeetleAccounts
    │       4 ledger accounts per tenant (see above)
    │
    ├── Activity: SeedRedisCache
    │       Warm billing config into Redis for zero-latency lookup
    │
    ├── Activity: RegisterKafkaTopics
    │       payment.completed:{tenant_id}, billing.computed:{tenant_id}
    │
    └── Activity: NotifyOwner
            "Tenant {name} billing provisioned successfully"
```

---

## 5. Role-Based Access Control

| Role | Permissions |
|---|---|
| `billing:admin` | Read + write billing config, view all reports, manage reseller splits |
| `billing:config:write` | Modify pricing parameters only |
| `billing:config:read` | View pricing parameters only |
| `billing:report:read` | View revenue reports, P&L, ledger balances |
| `billing:viewer` | View current period summary only |

All role assignments are managed in Keycloak. Fine-grained resource-level policies are enforced by Permify. Every API call to the billing config endpoints passes through the Go Audit/RBAC service before reaching the database.

---

## 6. Audit Trail

Every billing configuration change emits an `AuditEvent` to OpenSearch with:

- `tenant_id`, `actor_id`, `actor_role`
- `resource_type` (e.g., `billing_config`)
- `resource_id`
- `action` (create / update / delete)
- `before_state` (JSON snapshot)
- `after_state` (JSON snapshot)
- `timestamp` (UTC Unix ms)
- `ip_address`, `user_agent`

A notification is sent to the tenant admin and platform owner via the existing `notifyOwner` helper whenever a billing config is modified.

---

## 7. Pricing Models Supported

| Model | Description | Config Fields |
|---|---|---|
| Per-Transaction | Fee per txn, platform/reseller split | `fee_rate`, `fee_cap`, `fee_floor`, `platform_share_pct`, `reseller_share_pct`, `nibss_cost_per_txn` |
| Subscription | Fixed monthly fee per merchant | `subscription_fee`, `subscription_platform_share_pct` |
| Hybrid | Both simultaneously | All of the above |
| Sign-On Fee | One-time at merchant activation | `sign_on_fee`, `sign_on_platform_share_pct` |

---

## 8. Technology Rationale

| Technology | Role | Why |
|---|---|---|
| **Rust** | Billing computation core | Zero-cost abstractions, deterministic arithmetic (no float rounding), sub-millisecond latency |
| **Go** | Event ingestor, Temporal worker, Audit/RBAC service | Excellent Kafka/gRPC/Temporal ecosystem, low memory footprint |
| **Python** | Mojaloop bridge, lakehouse pipeline | Rich financial/data libraries, Mojaloop SDK availability |
| **TypeScript** | Portal UI | Existing project stack, tRPC type safety |
| **TigerBeetle** | Ledger | Purpose-built for financial double-entry, ACID, 1M+ TPS |
| **Kafka + Fluvio** | Event streaming | Kafka for durability/ecosystem; Fluvio for low-latency real-time processing |
| **Temporal** | Workflow orchestration | Durable execution for multi-step onboarding, retry semantics |
| **Keycloak + Permify** | AuthN + AuthZ | Keycloak for identity/SSO; Permify for fine-grained RBAC policies |
| **Redis** | Hot cache | Sub-millisecond billing config lookup on every transaction |
| **OpenSearch** | Audit log + search | Full-text search over audit events, dashboards |
| **PostgreSQL** | Source of truth | Billing configs, tenant records, invoices |
| **Dapr** | Service mesh | Sidecar-based service discovery, pub/sub, state management |
| **APISIX + OpenAppSec** | API gateway + WAF | Rate limiting, auth, RASP protection |
| **Mojaloop** | Interbank settlement | ISO 20022 / ILP settlement for NIP/NIBSS transactions |
| **Lakehouse** | Analytics | Long-term aggregated billing data for the financial model |
