"""
Add 14 missing tables to drizzle/schema.ts.
"""

new_tables = '''
// ─── NIP Virtual Accounts ─────────────────────────────────────────────────────
export const nipVirtualAccounts = pgTable("nip_virtual_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  paymentLinkId: text("payment_link_id"),
  checkoutSessionId: text("checkout_session_id"),
  bankNipCode: text("bank_nip_code").notNull(),
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  amountExpected: bigint("amount_expected", { mode: "number" }),
  currency: text("currency").notNull().default("NGN"),
  reference: text("reference").notNull(),
  status: text("status").notNull().default("pending"),  // pending | credited | expired
  expiresAt: timestamp("expires_at").notNull(),
  creditedAt: timestamp("credited_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("nip_va_merchant_idx").on(t.merchantId),
  index("nip_va_ref_idx").on(t.reference),
  index("nip_va_status_idx").on(t.status),
]);
export type NipVirtualAccount = typeof nipVirtualAccounts.$inferSelect;

// ─── NIP Name Enquiry Cache ───────────────────────────────────────────────────
export const nipNameEnquiryCache = pgTable("nip_name_enquiry_cache", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bankNipCode: text("bank_nip_code").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  bankVerificationNumber: text("bank_verification_number"),
  kycLevel: text("kyc_level"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("nip_nec_bank_acct_uniq").on(t.bankNipCode, t.accountNumber),
  index("nip_nec_expires_idx").on(t.expiresAt),
]);
export type NipNameEnquiryCache = typeof nipNameEnquiryCache.$inferSelect;

// ─── STR Records (Suspicious Transaction Reports) ────────────────────────────
export const strRecords = pgTable("str_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  transactionId: text("transaction_id"),
  strType: text("str_type").notNull(),           // STR | CTR | SATR
  subjectType: text("subject_type").notNull(),   // individual | entity
  subjectData: text("subject_data").notNull(),   // JSON
  transactionData: text("transaction_data").notNull(),  // JSON
  suspicionType: text("suspicion_type").notNull(),
  suspicionGrounds: text("suspicion_grounds").notNull(),
  suspicionIndicators: text("suspicion_indicators").notNull(),  // JSON array
  narrative: text("narrative").notNull(),
  actionTaken: text("action_taken"),
  filedBy: text("filed_by").notNull(),
  filedAt: timestamp("filed_at").notNull(),
  deadlineAt: timestamp("deadline_at").notNull(),
  submissionStatus: text("submission_status").notNull().default("pending"),
  submissionAttempts: integer("submission_attempts").notNull().default(0),
  deadlineBreached: boolean("deadline_breached").notNull().default(false),
  nfiuRef: text("nfiu_ref"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("str_merchant_idx").on(t.merchantId),
  index("str_status_idx").on(t.submissionStatus),
  index("str_deadline_idx").on(t.deadlineAt),
]);
export type StrRecord = typeof strRecords.$inferSelect;

// ─── Interchange Schedule ─────────────────────────────────────────────────────
export const interchangeSchedule = pgTable("interchange_schedule", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  scheme: text("scheme").notNull(),          // visa | mastercard | verve | amex
  cardType: text("card_type").notNull(),     // debit | credit | prepaid | corporate
  channel: text("channel").notNull(),        // card_present | card_not_present | contactless | ecommerce
  mcc: text("mcc"),                          // null = applies to all MCCs
  basisPoints: integer("basis_points").notNull().default(0),
  fixedFeeKobo: integer("fixed_fee_kobo").notNull().default(0),
  minFeeKobo: integer("min_fee_kobo").notNull().default(0),
  maxFeeKobo: integer("max_fee_kobo").notNull().default(0),
  effectiveFrom: timestamp("effective_from").notNull(),
  effectiveTo: timestamp("effective_to"),
  isActive: boolean("is_active").notNull().default(true),
  source: text("source").notNull().default("cbn_schedule"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("interchange_scheme_idx").on(t.scheme),
  index("interchange_active_idx").on(t.isActive),
]);
export type InterchangeScheduleEntry = typeof interchangeSchedule.$inferSelect;

// ─── Interchange Fee Records ──────────────────────────────────────────────────
export const interchangeFeeRecords = pgTable("interchange_fee_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  transactionId: text("transaction_id"),
  scheme: text("scheme").notNull(),
  cardType: text("card_type"),
  channel: text("channel"),
  billingPeriod: text("billing_period").notNull(),  // YYYY-MM
  feeKobo: bigint("fee_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("ifr_merchant_idx").on(t.merchantId),
  index("ifr_period_idx").on(t.billingPeriod),
  index("ifr_scheme_idx").on(t.scheme),
]);
export type InterchangeFeeRecord = typeof interchangeFeeRecords.$inferSelect;

// ─── Scheme Memberships ───────────────────────────────────────────────────────
export const schemeMemberships = pgTable("scheme_memberships", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  scheme: text("scheme").notNull(),           // visa | mastercard | verve | amex
  membershipType: text("membership_type").notNull().default("principal"),
  memberId: text("member_id").notNull(),
  status: text("status").notNull().default("active"),
  effectiveFrom: timestamp("effective_from").notNull(),
  renewalDate: timestamp("renewal_date"),
  contactEmail: text("contact_email"),
  complianceOfficer: text("compliance_officer"),
  binRanges: text("bin_ranges"),              // JSON array
  annualFeeUsd: integer("annual_fee_usd"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("scheme_membership_scheme_idx").on(t.scheme),
  index("scheme_membership_status_idx").on(t.status),
]);
export type SchemeMembership = typeof schemeMemberships.$inferSelect;

// ─── Chargeback Evidence Packages ────────────────────────────────────────────
export const chargebackEvidencePackages = pgTable("chargeback_evidence_packages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  chargebackId: text("chargeback_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  evidenceType: text("evidence_type").notNull(),
  fileName: text("file_name").notNull(),
  fileKey: text("file_key").notNull(),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("cep_chargeback_idx").on(t.chargebackId),
  index("cep_merchant_idx").on(t.merchantId),
]);
export type ChargebackEvidencePackage = typeof chargebackEvidencePackages.$inferSelect;

// ─── Chargeback Timeline ──────────────────────────────────────────────────────
export const chargebackTimeline = pgTable("chargeback_timeline", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  chargebackId: text("chargeback_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  event: text("event").notNull(),
  previousState: text("previous_state"),
  newState: text("new_state"),
  actorId: text("actor_id").notNull(),
  actorType: text("actor_type").notNull().default("user"),
  notes: text("notes"),
  schemeRef: text("scheme_ref"),
  deadlineAt: timestamp("deadline_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("ct_chargeback_idx").on(t.chargebackId),
  index("ct_merchant_idx").on(t.merchantId),
]);
export type ChargebackTimelineEvent = typeof chargebackTimeline.$inferSelect;

// ─── Regulatory Report Submissions ───────────────────────────────────────────
export const regulatoryReportSubmissions = pgTable("regulatory_report_submissions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reportId: text("report_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  formType: text("form_type").notNull(),
  period: text("period").notNull(),
  submissionMethod: text("submission_method").notNull().default("api"),
  regulatorRef: text("regulator_ref"),
  status: text("status").notNull().default("submitted"),
  fileUrl: text("file_url"),
  fileKey: text("file_key"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("rrs_report_idx").on(t.reportId),
  index("rrs_merchant_idx").on(t.merchantId),
]);
export type RegulatoryReportSubmission = typeof regulatoryReportSubmissions.$inferSelect;

// ─── Developer API Keys ───────────────────────────────────────────────────────
export const developerApiKeys = pgTable("developer_api_keys", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  environment: text("environment").notNull().default("test"),  // test | live
  scopes: text("scopes").notNull(),  // JSON array
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("dak_merchant_idx").on(t.merchantId),
  index("dak_prefix_idx").on(t.keyPrefix),
  index("dak_active_idx").on(t.isActive),
]);
export type DeveloperApiKey = typeof developerApiKeys.$inferSelect;

// ─── Developer Webhooks ───────────────────────────────────────────────────────
export const developerWebhooks = pgTable("developer_webhooks", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  events: text("events").notNull(),  // JSON array of event types
  signingSecret: text("signing_secret").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  retryPolicy: text("retry_policy").notNull().default("exponential"),
  maxRetries: integer("max_retries").notNull().default(3),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("dw_merchant_idx").on(t.merchantId),
  index("dw_active_idx").on(t.isActive),
]);
export type DeveloperWebhook = typeof developerWebhooks.$inferSelect;

// ─── Developer Webhook Deliveries ────────────────────────────────────────────
export const developerWebhookDeliveries = pgTable("developer_webhook_deliveries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  webhookId: text("webhook_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(),  // JSON
  status: text("status").notNull().default("pending"),  // pending | delivered | failed
  httpStatus: integer("http_status"),
  responseBody: text("response_body"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("dwd_webhook_idx").on(t.webhookId),
  index("dwd_merchant_idx").on(t.merchantId),
  index("dwd_status_idx").on(t.status),
]);
export type DeveloperWebhookDelivery = typeof developerWebhookDeliveries.$inferSelect;

// ─── Domain Health Snapshots ──────────────────────────────────────────────────
export const domainHealthSnapshots = pgTable("domain_health_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: text("domain").notNull(),
  merchantId: text("merchant_id"),
  status: text("status").notNull().default("healthy"),  // healthy | degraded | down
  latencyMs: integer("latency_ms"),
  sslValid: boolean("ssl_valid"),
  sslExpiresAt: timestamp("ssl_expires_at"),
  httpStatus: integer("http_status"),
  snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("dhs_domain_idx").on(t.domain),
  index("dhs_snapshot_idx").on(t.snapshotAt),
]);
export type DomainHealthSnapshot = typeof domainHealthSnapshots.$inferSelect;

// ─── Cost Centres ─────────────────────────────────────────────────────────────
export const costCentres = pgTable("cost_centres", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  domain: text("domain"),
  budgetAmount: bigint("budget_amount", { mode: "number" }).notNull().default(0),
  currency: text("currency").notNull().default("NGN"),
  spentAmount: bigint("spent_amount", { mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("cc_merchant_idx").on(t.merchantId),
  index("cc_code_idx").on(t.code),
]);
export type CostCentre = typeof costCentres.$inferSelect;
'''

with open('drizzle/schema.ts', 'r') as f:
    content = f.read()

# Append new tables at the end
content = content.rstrip() + '\n' + new_tables

with open('drizzle/schema.ts', 'w') as f:
    f.write(content)

print("Added 14 missing tables to schema.ts")
