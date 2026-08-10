# KYC, KYB & Liveness — Improvement & Enhancement Recommendations

**Prepared for:** PayGate Merchant Portal  
**Date:** May 2026  
**Scope:** Identity verification (KYC), business verification (KYB), and liveness detection across the web portal and React Native mobile app.

---

## Executive Summary

The platform's current KYC/KYB/Liveness stack is functional and covers the core Nigerian regulatory baseline (NIBSS, CAC, FIRS). The Wave 167 noise-fix addressed the most urgent field complaint (inconsistent face motion checks on noisy cameras). This document recommends the next layer of improvements, organised by priority tier, covering accuracy, compliance, user experience, operational tooling, and fraud resilience.

---

## 1. Liveness Detection

### 1.1 Current State

The liveness engine uses a three-layer ensemble: Rust signal scoring, Go gateway scoring, and Python ML scoring. Wave 167 added multi-frame capture (3–5 frames), noise-adaptive thresholds, and a `qualityHint.noiseLevel` field. The `checkLiveness` procedure drops the lowest outlier frame when three or more frames are submitted and applies a +0.12 / +0.06 score boost for high/medium noise environments.

### 1.2 Recommended Improvements

#### Priority 1 — Accuracy

| Improvement | Rationale | Implementation Hint |
|---|---|---|
| **Passive + Active hybrid by default** | Passive-only is defeated by high-quality print attacks; active-only frustrates users on slow devices. A hybrid flow (passive first, escalate to active only on uncertain scores 0.55–0.75) balances security and UX. | Add `mode: "hybrid"` to `checkLiveness`; escalate when `livenessScore < 0.75 && livenessScore > 0.55`. |
| **Server-side frame quality gating** | Currently the client sends frames regardless of blur or low-light. Reject frames with estimated Laplacian variance < 50 server-side and request a retry rather than penalising the score. | Add `frameQualityCheck()` in the Python ML service before scoring. |
| **Temporal consistency check** | Spoof attacks using video loops produce unnaturally consistent inter-frame deltas. Compute the standard deviation of facial landmark positions across frames; flag as spoof if σ < 0.003. | Add `temporalConsistencyScore` to the ensemble result. |
| **3D depth estimation (optional)** | For high-value merchant onboarding, integrate a depth estimation model (e.g., MiDaS) to distinguish flat printed faces from real 3D faces. | Gate behind `tier: "enhanced"` flag on the submission. |

#### Priority 2 — Resilience

| Improvement | Rationale | Implementation Hint |
|---|---|---|
| **Adaptive challenge selection** | Rotate challenge types (blink, smile, head-turn, random digit display) per session to prevent rehearsed attacks. | Seed challenge type from `crypto.randomInt(0, 4)` server-side; return it in the session token. |
| **Device fingerprint binding** | Bind a liveness session to the device's canvas fingerprint and screen resolution. Replay attacks from a different device fail automatically. | Store `deviceFingerprint` hash in `liveness_sessions`; compare on session resume. |
| **Retry throttling with exponential back-off** | Currently there is no server-side limit on liveness retries. An attacker can brute-force frames until one passes. | Add a `retryCount` column to `liveness_sessions`; block after 5 attempts within 15 minutes. |
| **Geo-velocity check** | Flag sessions where the IP geolocation differs by more than 500 km from the merchant's registered address. | Cross-reference `ip_address` with `merchants.address_city` using ip-api.com (already integrated). |

#### Priority 3 — Operational

| Improvement | Rationale | Implementation Hint |
|---|---|---|
| **Admin replay viewer** | The `liveness_sessions` table stores `passiveFrameUrl` and `challengeFrameUrls`. Build a replay UI in the Compliance section so reviewers can watch the session before overriding a decision. | Add a `/compliance/liveness/:sessionId` route that renders the stored frame URLs in sequence. |
| **Liveness score trend chart** | Plot daily average `livenessScore` and `spoofType` distribution on the Security Audit Dashboard to detect emerging attack patterns. | Add `trpc.securityAudit.getLivenessTrend` procedure querying `liveness_sessions` grouped by day. |
| **Automated spoof pattern alerting** | If `spoof_type = "deepfake"` appears more than 3 times in 24 hours for the same merchant, trigger an owner notification. | Add a heartbeat job or webhook-triggered check on `liveness_sessions`. |

---

## 2. KYC (Know Your Customer)

### 2.1 Current State

KYC covers document upload (NIN, BVN, passport, driver's licence), OCR extraction, face-match against the document photo, and a compliance report. The `kycSubmissions` table tracks status through `pending → under_review → approved / rejected`.

### 2.2 Recommended Improvements

#### Priority 1 — Accuracy & Compliance

| Improvement | Rationale | Implementation Hint |
|---|---|---|
| **BVN cross-validation via NIBSS** | BVN is currently stored but not validated against the NIBSS BVN lookup API in real time. A mismatch between the submitted BVN and the document name is a strong fraud signal. | Call `NIBSS_GATEWAY_URL/bvn/verify` in the `submitKyc` procedure; store `bvnMatchScore` in `kycSubmissions`. |
| **NIN slip OCR + MRZ parsing** | NIN slips contain a Machine Readable Zone (MRZ). Parsing the MRZ provides a second extraction path that is more reliable than free-form OCR on degraded images. | Integrate `mrz-parser` npm package; fall back to LLM OCR if MRZ parse fails. |
| **Document expiry enforcement** | Expired documents are currently accepted. Add a `documentExpiryDate` field to `kycDocuments` and reject submissions where the document expired more than 30 days ago. | Extract expiry date during OCR; add a Zod check in `submitKyc`. |
| **Face-match confidence threshold** | The face-match score threshold is currently a fixed value. Make it configurable per merchant tier (e.g., 0.80 for standard, 0.90 for high-value). | Add `faceMatchThreshold` to the `merchants` table with a default of 0.80. |
| **Adverse media screening** | For high-value merchants, screen the submitted name against PEP (Politically Exposed Persons) and sanctions lists (OFAC, UN, EU). | Integrate YouVerify's adverse media API (`YOUVERIFY_API_KEY` is already in env). |

#### Priority 2 — User Experience

| Improvement | Rationale | Implementation Hint |
|---|---|---|
| **Step-by-step progress indicator** | The KYC flow currently shows a single form. A multi-step wizard (Document → Selfie → Liveness → Review) reduces abandonment by setting clear expectations. | Refactor `LivenessCheck.tsx` into a `KycWizard` component with a `currentStep` state. |
| **Real-time document quality feedback** | Before submitting, analyse the uploaded image for blur, glare, and crop completeness. Show an inline warning if quality is insufficient. | Use `computeQualityHint()` (already in `LivenessCheck.tsx`) on the document image client-side. |
| **Partial save / resume** | If a user closes the browser mid-flow, their progress is lost. Store partial submission state in `kycSubmissions` with `status: "draft"`. | Add a `saveDraft` mutation that upserts the partial record; restore on page load. |
| **SMS/email status notifications** | Users currently have no notification when their KYC status changes. Send a Termii SMS and email on `approved` or `rejected`. | Call `TERMII_API_KEY` in the `updateKycStatus` procedure's `onSuccess` hook. |

#### Priority 3 — Operational

| Improvement | Rationale | Implementation Hint |
|---|---|---|
| **Bulk review queue with keyboard shortcuts** | Compliance reviewers currently open each submission individually. A paginated queue with `j/k` keyboard navigation and one-click approve/reject would significantly reduce review time. | Add a `ReviewQueue` component to `ComplianceKYC.tsx` with `useHotkeys`. |
| **SLA escalation for stale reviews** | Submissions that remain `under_review` for more than 48 hours should auto-escalate to a senior reviewer. | Extend the existing `slaEscalation` worker to include `kyc_submissions`. |
| **Audit trail for overrides** | When a reviewer overrides a KYC decision, the reason and reviewer identity should be logged to `audit_events`. | Add `overrideBy`, `overrideNote`, and `overrideAt` fields to `kycSubmissions` (mirroring `liveness_sessions`). |

---

## 3. KYB (Know Your Business)

### 3.1 Current State

KYB covers CAC RC number lookup, TIN verification, director KYC, and a risk level assignment. The `kybVerifications` and `kybSteps` tables track progress. The `kybDocuments` table stores uploaded certificates.

### 3.2 Recommended Improvements

#### Priority 1 — Accuracy & Compliance

| Improvement | Rationale | Implementation Hint |
|---|---|---|
| **Real-time CAC API integration** | RC numbers are currently stored but not validated against the CAC online registry in real time. A fraudulent RC number can pass the current flow. | Integrate the CAC Public Search API (`https://search.cac.gov.ng/api`); store `cacVerifiedAt` in `kybVerifications`. |
| **Ultimate Beneficial Owner (UBO) mapping** | CBN AML guidelines require identifying all UBOs with ≥5% shareholding. The current flow only collects director names. | Add a `kybUbos` table; require UBO KYC for each owner above the threshold. |
| **SCUML registration check** | Designated Non-Financial Businesses and Professions (DNFBPs) must register with SCUML. Add a check for applicable industry codes. | Map `industry_code` to SCUML-required categories; flag in the risk assessment. |
| **Automated risk scoring** | Risk level is currently set manually. Implement a rules engine that computes a numeric risk score from: industry code, RC age, director PEP status, and geographic risk. | Add a `computeKybRiskScore()` function in `server/kyb.ts`; store `riskScore` (0–100) in `kybVerifications`. |

#### Priority 2 — User Experience

| Improvement | Rationale | Implementation Hint |
|---|---|---|
| **Director KYC sub-flow** | Directors currently submit KYC separately. Embed a director KYC mini-flow within the KYB wizard so the business owner can complete everything in one session. | Add a `directorKycSessions` join table linking `kybVerifications` to `kycSubmissions`. |
| **Document checklist with upload status** | Show a checklist of required documents (CAC certificate, MEMART, TIN certificate, utility bill) with upload status badges. | Add a `requiredDocuments` config object keyed by `business_type`; render as a checklist in `KYBPage.tsx`. |
| **Estimated completion time** | Display an estimated review time (e.g., "Usually reviewed within 2 business days") based on historical `kybVerifications` data. | Compute the 75th percentile of `updatedAt - createdAt` for `status = "approved"` records. |

#### Priority 3 — Operational

| Improvement | Rationale | Implementation Hint |
|---|---|---|
| **Bulk KYB export with risk bands** | The existing CSV export does not include `risk_level` or `riskScore`. Add these columns and a risk band filter to the export. | Extend `exportCSV` in `complianceKycRouter` to JOIN `kybVerifications` on `merchantId`. |
| **KYB renewal reminders** | CAC certificates expire. Send a renewal reminder 90 days before the document expiry date. | Add a heartbeat job that queries `kybDocuments` for expiring documents and calls `notifyOwner`. |
| **Webhook on KYB status change** | Merchants using the platform's API should receive a webhook when their KYB status changes. | Extend the existing webhook dispatch worker to include `kyb.status_changed` events. |

---

## 4. Cross-Cutting Concerns

### 4.1 Data Retention & Privacy

The `liveness_sessions` table stores frame URLs in S3. Under NDPR (Nigeria Data Protection Regulation), biometric data must be deleted within 90 days of collection unless the data subject consents to longer retention. A scheduled deletion job should be added.

**Recommended action:** Add a `retentionExpiresAt` column to `liveness_sessions` (default: `createdAt + 90 days`). Add a nightly heartbeat job that deletes expired S3 objects and nullifies the URL columns.

### 4.2 Accessibility

The liveness camera UI uses `getUserMedia` without a fallback for users who deny camera permissions or use assistive technology. Add an alternative verification path (e.g., notarised document upload) for users who cannot complete liveness.

### 4.3 Internationalisation

The platform currently targets Nigeria. As expansion to other African markets is planned, the following should be parameterised per country:

- Document types accepted (Ghana Card, Kenyan National ID, South African ID)
- Regulatory thresholds (face-match score, retry limits)
- Language of on-screen instructions

### 4.4 Testing Coverage

| Area | Current Coverage | Recommended Addition |
|---|---|---|
| Liveness noise fix | 30 tests (Wave 167) | Add edge cases: 0-frame submission, all-identical frames, NaN score from ML service |
| KYC submission flow | Partial (auth tests only) | Add end-to-end tests for `submitKyc → checkLiveness → updateStatus` pipeline |
| KYB CAC lookup | None | Add mock CAC API tests with valid/invalid/expired RC numbers |
| Retry throttling | None | Add tests for the 5-attempt block within 15 minutes |

---

## 5. Implementation Roadmap

The following table summarises the recommended improvements by wave, estimated effort, and expected impact.

| Wave | Improvements | Effort | Impact |
|---|---|---|---|
| **171** | Passive+active hybrid mode, retry throttling, document expiry enforcement, BVN cross-validation | Medium | High — directly reduces fraud and compliance risk |
| **172** | Admin liveness replay viewer, KYC step wizard, director KYC sub-flow, CAC API integration | Medium | High — improves reviewer efficiency and merchant experience |
| **173** | Temporal consistency check, adverse media screening, UBO mapping, automated KYB risk scoring | High | High — addresses CBN AML requirements |
| **174** | NDPR biometric data retention job, KYB renewal reminders, geo-velocity check, liveness trend chart | Low–Medium | Medium — compliance and operational hygiene |
| **175** | 3D depth estimation, SCUML check, internationalisation framework, accessibility fallback path | High | Medium–High — expansion readiness |

---

## 6. Regulatory Reference

| Regulation | Requirement | Current Status | Gap |
|---|---|---|---|
| CBN KYC Manual (2023) | Tier 3 accounts require BVN + NIN + face verification | Partial — BVN stored, not validated | BVN cross-validation via NIBSS |
| CBN AML/CFT Framework | UBO identification for ≥5% shareholding | Not implemented | UBO mapping (Wave 173) |
| NDPR 2019 | Biometric data deletion within 90 days | Not implemented | Retention job (Wave 174) |
| FATF Recommendation 10 | Ongoing due diligence and record keeping | Partial — audit trail exists | KYC renewal reminders, SLA escalation |
| CAC Act 2020 | Business registration verification | Stored only, not validated | CAC API integration (Wave 172) |

---

*This document should be reviewed quarterly and updated as the regulatory environment evolves. All implementation estimates assume a single full-stack engineer working in the existing tRPC + Drizzle + React stack.*
