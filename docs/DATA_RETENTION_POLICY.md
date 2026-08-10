# PayGate Data Retention Policy

**Version:** 1.0  
**Effective Date:** 2026-06-25  
**Owner:** PayGate Financial Services — Compliance & Data Protection Team  
**Review Cycle:** Annual (or upon material regulatory change)

---

## 1. Purpose and Scope

This policy defines the retention periods, storage controls, and deletion procedures for all personal, financial, and biometric data processed by the PayGate platform. It applies to all data stored in the primary MySQL/TiDB database, the TigerBeetle ledger, S3 object storage, Redis cache, OpenSearch indices, and Kafka/Fluvio event streams.

PayGate operates under the following regulatory frameworks:

| Framework | Jurisdiction | Applicable Data Categories |
|---|---|---|
| Nigeria Data Protection Act (NDPA) 2023 | Nigeria | All personal data of Nigerian residents |
| CBN Regulatory Framework for BVN | Nigeria | BVN, KYC, identity documents |
| PCI DSS v4.0 | Global | Cardholder data, PANs, CVVs |
| FATF Recommendations | Global | AML/CFT records, sanctions screening |
| ISO 27001:2022 | Global | Information security management |

---

## 2. Data Categories and Retention Periods

### 2.1 Financial Transaction Records

| Data Type | Table(s) | Retention Period | Legal Basis |
|---|---|---|---|
| Payment transactions | `transactions` | 7 years | CBN AML/CFT Regulations 2022, NDPA |
| Payout records | `payouts` | 7 years | CBN |
| Ledger entries (TigerBeetle) | TigerBeetle cluster | 7 years (immutable) | CBN, FATF Rec. 11 |
| Refund records | `refunds` | 7 years | CBN |
| Dispute records | `disputes` | 7 years from resolution | CBN |
| Settlement records | `settlements` | 7 years | CBN |
| BNPL loan records | `bnpl_loans` | 7 years from loan close | CBN Consumer Protection |
| Wallet balances (snapshots) | `wallet_snapshots` | 7 years | CBN |

### 2.2 Identity and KYC/KYB Data

| Data Type | Table(s) | Retention Period | Legal Basis |
|---|---|---|---|
| KYC submissions (documents, photos) | `kyc_submissions` | 5 years after account closure | NDPA Art. 24, CBN KYC |
| BVN verification records | `kyc_submissions.bvnVerified` | 5 years | CBN BVN Framework |
| Business verification (KYB) | `kyb_submissions` | 5 years after account closure | NDPA, CAMA 2020 |
| Liveness detection results | `kyc_submissions.livenessScore` | 2 years | NDPA (proportionality) |
| Face match scores | `kyc_submissions.faceMatchScore` | 2 years | NDPA (biometric data) |
| Face embeddings (ArcFace vectors) | `face_embeddings` | 2 years | NDPA Art. 27 (biometric) |
| ID document images (S3) | S3 `kyc-docs/` prefix | 5 years after account closure | CBN KYC |

> **Biometric Data Special Rule:** Face embeddings and liveness scores are classified as **sensitive personal data** under NDPA Art. 27. They must be encrypted at rest (AES-256), access-logged, and deleted within 2 years of the last KYC event or upon account closure, whichever is sooner.

### 2.3 User Account and Profile Data

| Data Type | Table(s) | Retention Period | Legal Basis |
|---|---|---|---|
| User accounts | `users` | Duration of account + 2 years | NDPA |
| Merchant profiles | `merchants` | Duration of account + 5 years | CBN |
| Consumer profiles | `consumers` | Duration of account + 2 years | NDPA |
| Session tokens (Redis) | Redis `session:*` keys | 24 hours (TTL enforced) | NDPA (minimisation) |
| OAuth tokens | `oauth_sessions` | 30 days (TTL enforced) | NDPA |
| Audit logs (user actions) | `audit_logs` | 5 years | NDPA, CBN |

### 2.4 Security and Fraud Data

| Data Type | Table(s) | Retention Period | Legal Basis |
|---|---|---|---|
| Fraud alerts | `fraud_alerts` | 5 years | FATF Rec. 20, CBN |
| AML screening results | `aml_checks` | 7 years | FATF Rec. 11 |
| FATF/UN sanctions screening | `sanctions_checks` | 7 years | FATF |
| IP reputation logs | `threat_intel_logs` | 1 year | NDPA (proportionality) |
| Rate limit events (Redis) | Redis `rl:*` keys | 15 minutes (TTL enforced) | Operational |
| CSRF tokens (Redis) | Redis `csrf:*` keys | 24 hours (TTL enforced) | Operational |
| Webhook delivery logs | `webhook_delivery_logs` | 90 days | Operational |

### 2.5 Communication and Notification Data

| Data Type | Table(s) | Retention Period | Legal Basis |
|---|---|---|---|
| Push notification logs | `push_notification_logs` | 90 days | NDPA (minimisation) |
| SMS/OTP logs | `otp_logs` | 30 days | NDPA |
| Email delivery logs | External SMTP logs | 30 days | NDPA |
| In-app notification history | `notifications` | 1 year | NDPA |

### 2.6 Event Streams and Analytics

| Data Type | System | Retention Period | Notes |
|---|---|---|---|
| Kafka transaction events | Kafka `rt-transactions` | 7 days (topic retention) | Consumed into DB within 1 day |
| Fluvio real-time events | Fluvio topics | 24 hours (topic retention) | Ephemeral; not persisted |
| OpenSearch transaction index | OpenSearch | 90 days (ILM policy) | Aggregates in DB are permanent |
| OpenSearch audit log index | OpenSearch | 1 year (ILM policy) | Mirrors `audit_logs` table |
| Analytics aggregates | `analytics_*` tables | 3 years | Anonymised after 1 year |

### 2.7 API Keys and Credentials

| Data Type | Table(s) | Retention Period | Notes |
|---|---|---|---|
| Merchant API keys | `api_keys` | Until revoked + 90 days | Hashed (SHA-256); never stored plaintext |
| Webhook secrets | `webhooks` | Until revoked + 90 days | Hashed |
| mTLS certificates | `infra/certs/` | 10 years validity; rotate every 90 days | Auto-rotated by K8s CronJob |

---

## 3. Deletion Procedures

### 3.1 Automated Deletion

The following automated workers enforce retention limits:

| Worker | File | Schedule | Action |
|---|---|---|---|
| Notification purge | `server/notificationPurge.ts` | Daily 02:00 UTC | Deletes notifications older than 1 year |
| Push token cleanup | `server/pushTokenCleanup.ts` | Daily 03:00 UTC | Removes expired/invalid push tokens |
| Idempotency cleanup | `server/idempotencyCleanup.ts` | Daily 04:00 UTC | Purges idempotency keys older than 24h |
| Session expiry | Redis TTL (24h) | Continuous | Auto-expires session keys |
| OTP expiry | Redis TTL (10min) | Continuous | Auto-expires OTP codes |

### 3.2 Manual Deletion (Right to Erasure)

Upon a verified NDPA Art. 26 erasure request:

1. Verify identity of the data subject via BVN + OTP.
2. Check for legal hold obligations (active disputes, regulatory investigations).
3. If no hold: anonymise `users`, `consumers`, `merchants` rows (replace PII with `[DELETED]`).
4. Delete `kyc_submissions` documents from S3 and nullify biometric columns.
5. Delete `face_embeddings` rows for the subject.
6. Retain financial transaction records (7-year legal obligation) with merchant ID only.
7. Log the erasure action in `audit_logs` with `action = 'gdpr_erasure'`.
8. Respond to the data subject within 30 days (NDPA requirement).

### 3.3 Account Closure

On merchant account closure:

1. Set `merchants.status = 'closed'` and `closedAt = NOW()`.
2. Schedule KYC document deletion for `closedAt + 5 years`.
3. Schedule user profile anonymisation for `closedAt + 2 years`.
4. Retain all financial records for 7 years from the last transaction date.
5. Revoke all API keys and webhook secrets immediately.

---

## 4. Data Minimisation

PayGate applies the following data minimisation controls:

- **Biometric data** is never stored in plaintext. Face embeddings are stored as encrypted JSON arrays; raw images are stored only in S3 with access logging.
- **Card data** is never stored. All card processing is delegated to Stripe (PCI DSS Level 1 certified). PayGate stores only the last 4 digits and card brand.
- **BVN** is stored as a SHA-256 hash after verification. The plaintext BVN is never persisted.
- **Passwords** are never stored. Authentication is handled exclusively via Keycloak OIDC and Manus OAuth.

---

## 5. Cross-Border Data Transfers

| Transfer | Destination | Safeguard |
|---|---|---|
| Stripe payment processing | USA | Standard Contractual Clauses (SCCs) |
| AWS S3 (KYC documents) | eu-west-1 (Ireland) | NDPA Art. 43 adequacy; SCCs |
| OpenTelemetry traces | Configurable | Data Processing Agreement required |

All cross-border transfers of Nigerian residents' personal data require either an adequacy decision, SCCs, or explicit consent under NDPA Art. 43.

---

## 6. Security Controls for Retained Data

| Control | Implementation |
|---|---|
| Encryption at rest | AES-256 (TiDB TDE, S3 SSE-S3) |
| Encryption in transit | TLS 1.3 (all services), mTLS (internal service mesh) |
| Access control | Permify PBAC; principle of least privilege |
| Audit logging | All data access logged to `audit_logs` and OpenSearch |
| Backup encryption | AES-256; Keycloak realm backups encrypted |
| Key rotation | mTLS certs rotated every 90 days (K8s CronJob) |

---

## 7. Policy Review and Contacts

This policy is reviewed annually by the Data Protection Officer (DPO) and updated upon:

- Material changes to NDPA, CBN, or PCI DSS requirements.
- Introduction of new data categories or processing activities.
- Significant changes to the platform architecture.

**Data Protection Officer:** dpo@paygate.ng  
**Security Team:** security@paygate.ng  
**Compliance Team:** compliance@paygate.ng

---

*This document was last updated on 2026-06-25 and supersedes all previous data retention schedules.*
