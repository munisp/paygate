import {
  pgTable, pgEnum, serial, text, integer, bigint, varchar,
  boolean, timestamp, jsonb, real, unique, index, uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["pending", "active", "suspended", "closed"]);
export const tenantPlanEnum = pgEnum("tenant_plan", ["starter", "growth", "enterprise"]);
export const merchantStatusEnum = pgEnum("merchant_status", ["pending", "active", "suspended", "closed"]);
export const txStatusEnum = pgEnum("tx_status", ["pending", "processing", "completed", "failed", "reversed"]);
export const txChannelEnum = pgEnum("tx_channel", ["card", "bank_transfer", "mobile_money", "ussd", "qr", "bnpl"]);
export const payoutStatusEnum = pgEnum("payout_status", ["pending_approval", "pending", "processing", "completed", "failed", "cancelled", "rejected"]);
export const settlementFreqEnum = pgEnum("settlement_freq", ["daily", "weekly", "monthly"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["open", "under_review", "resolved_merchant", "resolved_customer", "closed"]);
export const cardStatusEnum = pgEnum("card_status", ["active", "frozen", "terminated"]);
export const cardBrandEnum = pgEnum("card_brand", ["visa", "mastercard"]);
export const envEnum = pgEnum("env_type", ["test", "live"]);
export const riskLevelEnum = pgEnum("risk_level", ["low", "medium", "high"]);
export const teamRoleEnum = pgEnum("team_role", ["admin", "developer", "viewer"]);
export const teamStatusEnum = pgEnum("team_status", ["invited", "active", "disabled"]);

// ─── Tenants ──────────────────────────────────────────────────────────────────
// A tenant is a payment business / fintech that uses PayGate as its infrastructure.
// Each tenant has its own isolated merchants, consumers, transactions, and configuration.
// Provisioned exclusively by the Admin Portal.

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),                          // e.g. "ten_acme_pay"
  name: text("name").notNull(),                         // "Acme Payments Ltd"
  slug: text("slug").notNull().unique(),                // "acme-pay" — used in subdomains & API keys
  status: tenantStatusEnum("status").default("pending").notNull(),
  plan: tenantPlanEnum("plan").default("starter").notNull(),
  // Contact
  email: text("email").notNull(),
  phone: text("phone"),
  country: text("country").default("NG").notNull(),
  // Branding
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").default("#6366f1"),
  // Limits (set by admin, overridable per plan)
  maxMerchants: integer("max_merchants").default(10).notNull(),
  maxConsumers: integer("max_consumers").default(10000).notNull(),
  maxDailyVolume: bigint("max_daily_volume", { mode: "number" }).default(100_000_000).notNull(), // kobo
  // Feature flags
  bnplEnabled: boolean("bnpl_enabled").default(false).notNull(),
  crossBorderEnabled: boolean("cross_border_enabled").default(false).notNull(),
  virtualCardsEnabled: boolean("virtual_cards_enabled").default(false).notNull(),
  // Middleware routing
  kafkaTopicPrefix: text("kafka_topic_prefix"),         // e.g. "acme-pay" → "acme-pay.transaction.completed"
  permifyTenantId: text("permify_tenant_id"),           // Permify tenant namespace
  tigerBeetleLedgerId: bigint("tigerbeetle_ledger_id", { mode: "number" }), // TigerBeetle ledger partition
  // Provisioned by
  provisionedBy: text("provisioned_by"),                // admin user ID
  provisionedAt: timestamp("provisioned_at"),
  suspendedAt: timestamp("suspended_at"),
  suspendReason: text("suspend_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("tenants_status_idx").on(t.status),
  index("tenants_slug_idx").on(t.slug),
]);
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

// ─── Tenant Configuration ─────────────────────────────────────────────────────
// Per-tenant system configuration: fee schedules, FX spreads, settlement rules, rate limits.
// Managed by the Admin Portal; read-only from merchant/consumer portals.

export const tenantConfig = pgTable("tenant_config", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  // Fee schedule (basis points, 1 bp = 0.01%)
  cardFeesBps: integer("card_fees_bps").default(150).notNull(),        // 1.5%
  bankTransferFeesBps: integer("bank_transfer_fees_bps").default(50).notNull(), // 0.5%
  mobileMoneyFeesBps: integer("mobile_money_fees_bps").default(100).notNull(), // 1.0%
  crossBorderFeesBps: integer("cross_border_fees_bps").default(200).notNull(), // 2.0%
  bnplFeesBps: integer("bnpl_fees_bps").default(300).notNull(),        // 3.0%
  // FX spread (basis points above mid-market)
  fxSpreadBps: integer("fx_spread_bps").default(150).notNull(),
  // Settlement
  settlementFrequency: settlementFreqEnum("settlement_frequency").default("daily").notNull(),
  settlementCutoffHour: integer("settlement_cutoff_hour").default(18).notNull(), // 6pm UTC
  settlementMinAmount: bigint("settlement_min_amount", { mode: "number" }).default(10000).notNull(),
  // BNPL
  bnplMaxInstallments: integer("bnpl_max_installments").default(12).notNull(),
  bnplMaxLoanAmount: bigint("bnpl_max_loan_amount", { mode: "number" }).default(5_000_000).notNull(),
  bnplInterestRateBps: integer("bnpl_interest_rate_bps").default(200).notNull(),
  // Rate limits (requests per minute)
  apiRateLimitRpm: integer("api_rate_limit_rpm").default(1000).notNull(),
  // Payout approval
  payoutApprovalThreshold: bigint("payout_approval_threshold", { mode: "number" }).default(500000).notNull(),
  payoutApprovalEnabled: boolean("payout_approval_enabled").default(false).notNull(),
  // SLA
  settlementSlaHours: integer("settlement_sla_hours").default(2).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by"),
});
export type TenantConfig = typeof tenantConfig.$inferSelect;
export type InsertTenantConfig = typeof tenantConfig.$inferInsert;

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: text("open_id").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("login_method"),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").default("user").notNull(),
  // Multi-tenancy: which tenant this user belongs to (null = platform-level admin)
  tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  lastSignedIn: timestamp("last_signed_in"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("users_tenant_idx").on(t.tenantId),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Merchants ────────────────────────────────────────────────────────────────

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  businessName: text("business_name").notNull(),
  businessType: text("business_type"),
  email: text("email"),
  phone: text("phone"),
  country: text("country").default("NG").notNull(),
  currency: text("currency").default("NGN").notNull(),
  status: merchantStatusEnum("status").default("pending").notNull(),
  isLive: boolean("is_live").default(false).notNull(),
  onboardingStep: integer("onboarding_step").default(0).notNull(),
  webhookUrl: text("webhook_url"),
  logoUrl: text("logo_url"),
  notifyOnFraudAlert: boolean("notify_on_fraud_alert").default(true).notNull(),
  notifyOnPayout: boolean("notify_on_payout").default(true).notNull(),
  notifyOnDispute: boolean("notify_on_dispute").default(true).notNull(),
  payoutApprovalThreshold: bigint("payout_approval_threshold", { mode: "number" }).default(500000).notNull(),
  payoutApprovalEnabled: boolean("payout_approval_enabled").default(false).notNull(),
  settlementFrequency: settlementFreqEnum("settlement_frequency").default("daily").notNull(),
  settlementMinAmount: bigint("settlement_min_amount", { mode: "number" }).default(10000).notNull(),
  settlementBankCode: text("settlement_bank_code"),
  settlementAccountNumber: text("settlement_account_number"),
  settlementAccountName: text("settlement_account_name"),
  // USSD support
  merchantCode: text("merchant_code").unique(),  // Short code for USSD pay-merchant (e.g. PG-1234)
  ussdPin: text("ussd_pin"),                      // bcrypt hash of 4-digit USSD PIN
  soundboxLanguage: text("soundbox_language").default("en").notNull(), // en | yo | ha | ig
  // Reconciliation alert badge threshold — sidebar badge shows when open alert count >= this value
  reconAlertBadgeEnabled: boolean("recon_alert_badge_enabled").default(true).notNull(),
  reconAlertThreshold: integer("recon_alert_threshold").default(1).notNull(),
  // Compliance settings
  minLivenessScore: real("min_liveness_score").default(0.7).notNull(),
  kybRequired: boolean("kyb_required").default(true).notNull(),
  kycAutoApproveThreshold: real("kyc_auto_approve_threshold").default(0.95).notNull(),
  amlScreeningEnabled: boolean("aml_screening_enabled").default(true).notNull(),
  sanctionsCheckEnabled: boolean("sanctions_check_enabled").default(true).notNull(),
  pepCheckEnabled: boolean("pep_check_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("merchants_tenant_idx").on(t.tenantId),
  index("merchants_owner_idx").on(t.ownerId),
]);
export type Merchant = typeof merchants.$inferSelect;
export type InsertMerchant = typeof merchants.$inferInsert;

// ─── Transactions ─────────────────────────────────────────────────────────────

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  reference: text("reference").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: text("currency").default("NGN").notNull(),
  status: txStatusEnum("status").default("pending").notNull(),
  channel: txChannelEnum("channel").default("card").notNull(),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  description: text("description"),
  feeAmount: bigint("fee_amount", { mode: "number" }).default(0).notNull(),
  netAmount: bigint("net_amount", { mode: "number" }).default(0).notNull(),
  metadata: jsonb("metadata"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("transactions_tenant_ref_uniq").on(t.tenantId, t.reference),
  index("transactions_tenant_idx").on(t.tenantId),
  index("transactions_merchant_idx").on(t.merchantId),
  index("transactions_status_idx").on(t.status),
  index("transactions_created_idx").on(t.createdAt),
]);

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

// ─── Customers ────────────────────────────────────────────────────────────────

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  email: text("email").notNull(),
  name: text("name"),
  phone: text("phone"),
  riskLevel: riskLevelEnum("risk_level").default("low").notNull(),
  totalTransactions: integer("total_transactions").default(0).notNull(),
  totalSpend: bigint("total_spend", { mode: "number" }).default(0).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("customers_tenant_idx").on(t.tenantId),
  index("customers_merchant_idx").on(t.merchantId),
  unique("customers_tenant_merchant_email_uniq").on(t.tenantId, t.merchantId, t.email),
]);

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

// ─── Payouts ──────────────────────────────────────────────────────────────────

export const payouts = pgTable("payouts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  reference: text("reference").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: text("currency").default("NGN").notNull(),
  status: payoutStatusEnum("status").default("pending").notNull(),
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  narration: text("narration"),
  feeAmount: bigint("fee_amount", { mode: "number" }).default(0).notNull(),
  failureReason: text("failure_reason"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("payouts_tenant_ref_uniq").on(t.tenantId, t.reference),
  index("payouts_tenant_idx").on(t.tenantId),
  index("payouts_merchant_idx").on(t.merchantId),
]);

export type Payout = typeof payouts.$inferSelect;
export type InsertPayout = typeof payouts.$inferInsert;

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  environment: envEnum("environment").default("test").notNull(),
  permissions: jsonb("permissions").$type<string[]>().default([]).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("api_keys_tenant_idx").on(t.tenantId),
  index("api_keys_merchant_idx").on(t.merchantId),
]);

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export const webhooks = pgTable("webhooks", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().default([]).notNull(),
  secret: text("secret").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastDeliveredAt: timestamp("last_delivered_at"),
  failureCount: integer("failure_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("webhooks_tenant_idx").on(t.tenantId),
  index("webhooks_merchant_idx").on(t.merchantId),
]);

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = typeof webhooks.$inferInsert;

// ─── Disputes ─────────────────────────────────────────────────────────────────

export const disputes = pgTable("disputes", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  transactionId: text("transaction_id").references(() => transactions.id),
  reference: text("reference").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: text("currency").default("NGN").notNull(),
  status: disputeStatusEnum("status").default("open").notNull(),
  reason: text("reason"),
  merchantResponse: text("merchant_response"),
  evidence: jsonb("evidence"),
  dueDate: timestamp("due_date"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("disputes_tenant_ref_uniq").on(t.tenantId, t.reference),
  index("disputes_tenant_idx").on(t.tenantId),
  index("disputes_merchant_idx").on(t.merchantId),
]);

export type Dispute = typeof disputes.$inferSelect;
export type InsertDispute = typeof disputes.$inferInsert;

// ─── Virtual Cards ────────────────────────────────────────────────────────────

export const virtualCards = pgTable("virtual_cards", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  maskedPan: text("masked_pan").notNull(),
  brand: cardBrandEnum("brand").default("visa").notNull(),
  expiryMonth: integer("expiry_month").notNull(),
  expiryYear: integer("expiry_year").notNull(),
  currency: text("currency").default("USD").notNull(),
  status: cardStatusEnum("status").default("active").notNull(),
  balance: bigint("balance", { mode: "number" }).default(0).notNull(),
  spendLimit: bigint("spend_limit", { mode: "number" }),
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("virtual_cards_tenant_idx").on(t.tenantId),
  index("virtual_cards_merchant_idx").on(t.merchantId),
]);

export type VirtualCard = typeof virtualCards.$inferSelect;
export type InsertVirtualCard = typeof virtualCards.$inferInsert;

// ─── Payment Links ────────────────────────────────────────────────────────────

export const paymentLinks = pgTable("payment_links", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  amount: bigint("amount", { mode: "number" }),
  currency: text("currency").default("NGN").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").default(0).notNull(),
  redirectUrl: text("redirect_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("payment_links_tenant_slug_uniq").on(t.tenantId, t.slug),
  index("payment_links_tenant_idx").on(t.tenantId),
  index("payment_links_merchant_idx").on(t.merchantId),
]);

export type PaymentLink = typeof paymentLinks.$inferSelect;
export type InsertPaymentLink = typeof paymentLinks.$inferInsert;

// ─── Team Members ─────────────────────────────────────────────────────────────

export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  userId: integer("user_id").references(() => users.id),
  email: text("email").notNull(),
  name: text("name"),
  role: teamRoleEnum("role").default("viewer").notNull(),
  status: teamStatusEnum("status").default("invited").notNull(),
  inviteToken: text("invite_token"),
  inviteExpiresAt: timestamp("invite_expires_at"),
  joinedAt: timestamp("joined_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("team_members_tenant_idx").on(t.tenantId),
  index("team_members_merchant_idx").on(t.merchantId),
  unique("team_members_tenant_merchant_email_uniq").on(t.tenantId, t.merchantId, t.email),
]);

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

// ─── Webhook Deliveries ───────────────────────────────────────────────────────

export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", ["pending", "success", "failed", "retrying"]);

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  webhookId: text("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  latencyMs: integer("latency_ms"),
  status: webhookDeliveryStatusEnum("status").default("pending").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  nextRetryAt: timestamp("next_retry_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("webhook_deliveries_tenant_idx").on(t.tenantId),
  index("webhook_deliveries_webhook_idx").on(t.webhookId),
  index("webhook_deliveries_merchant_idx").on(t.merchantId),
]);
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type InsertWebhookDelivery = typeof webhookDeliveries.$inferInsert;

// ─── Fraud Alerts ─────────────────────────────────────────────────────────────
export const fraudAlertTypeEnum = pgEnum("fraud_alert_type", [
  "velocity_breach", "card_testing", "unusual_location", "account_takeover",
  "chargeback_pattern", "identity_mismatch", "device_fingerprint", "ip_blacklist",
]);
export const fraudAlertStatusEnum = pgEnum("fraud_alert_status", ["open", "investigating", "resolved", "false_positive"]);

export const fraudAlerts = pgTable("fraud_alerts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  transactionId: text("transaction_id").references(() => transactions.id),
  customerId: text("customer_id").references(() => customers.id),
  alertType: fraudAlertTypeEnum("alert_type").notNull(),
  riskScore: integer("risk_score").notNull().default(0),
  status: fraudAlertStatusEnum("status").default("open").notNull(),
  description: text("description"),
  metadata: jsonb("metadata"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("fraud_alerts_tenant_idx").on(t.tenantId),
  index("fraud_alerts_merchant_idx").on(t.merchantId),
  index("fraud_alerts_status_idx").on(t.status),
]);
export type FraudAlert = typeof fraudAlerts.$inferSelect;
export type InsertFraudAlert = typeof fraudAlerts.$inferInsert;

// ─── KYC Submissions ──────────────────────────────────────────────────────────
export const kycStatusEnum = pgEnum("kyc_status", ["not_started", "pending", "under_review", "approved", "rejected", "expired"]);
export const kycDocTypeEnum = pgEnum("kyc_doc_type", ["passport", "national_id", "drivers_license", "utility_bill", "bank_statement", "cac_certificate"]);

export const kycSubmissions = pgTable("kyc_submissions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  customerId: text("customer_id").references(() => customers.id),
  docType: kycDocTypeEnum("doc_type").notNull(),
  status: kycStatusEnum("status").default("pending").notNull(),
  documentUrl: text("document_url"),
  selfieUrl: text("selfie_url"),
  rejectionReason: text("rejection_reason"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  expiresAt: timestamp("expires_at"),
  // Liveness detection fields
  livenessScore: real("liveness_score"),
  livenessMode: text("liveness_mode"), // 'passive' | 'active'
  livenessChallengeType: text("liveness_challenge_type"), // 'blink' | 'nod' | 'smile'
  livenessPassedAt: timestamp("liveness_passed_at"),
  livenessSessionId: text("liveness_session_id"),
  // Liveness override (reviewer can manually override a borderline score)
  livenessOverride: boolean("liveness_override"),         // true = reviewer accepted despite low score
  livenessOverrideNote: text("liveness_override_note"),   // mandatory note when overriding
  livenessOverrideBy: text("liveness_override_by"),       // reviewer openId
  livenessOverrideAt: timestamp("liveness_override_at"),  // when override was recorded
  // OCR extraction results
  ocrExtractedData: jsonb("ocr_extracted_data"),
  ocrConfidence: real("ocr_confidence"),
  ocrProcessedAt: timestamp("ocr_processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("kyc_tenant_idx").on(t.tenantId),
  index("kyc_merchant_idx").on(t.merchantId),
  index("kyc_status_idx").on(t.status),
  index("kyc_liveness_idx").on(t.livenessScore),
]);
export type KycSubmission = typeof kycSubmissions.$inferSelect;
export type InsertKycSubmission = typeof kycSubmissions.$inferInsert;

// ─── BNPL Loans ───────────────────────────────────────────────────────────────
export const bnplStatusEnum = pgEnum("bnpl_status", ["pending", "active", "completed", "paid", "defaulted", "cancelled"]);

export const bnplLoans = pgTable("bnpl_loans", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  transactionId: text("transaction_id").references(() => transactions.id),
  customerId: text("customer_id").references(() => customers.id),
  principalAmount: bigint("principal_amount", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  installments: integer("installments").notNull().default(3),
  installmentAmount: bigint("installment_amount", { mode: "number" }).notNull(),
  interestRate: integer("interest_rate").notNull().default(0),
  status: bnplStatusEnum("status").default("pending").notNull(),
  nextPaymentAt: timestamp("next_payment_at"),
  completedAt: timestamp("completed_at"),
  defaultedAt: timestamp("defaulted_at"),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  paidAmount: bigint("paid_amount", { mode: "number" }).default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("bnpl_tenant_idx").on(t.tenantId),
  index("bnpl_merchant_idx").on(t.merchantId),
  index("bnpl_status_idx").on(t.status),
]);
export type BnplLoan = typeof bnplLoans.$inferSelect;
export type InsertBnplLoan = typeof bnplLoans.$inferInsert;

// ─── Mobile Money Reconciliation ──────────────────────────────────────────────
export const mmReconStatusEnum = pgEnum("mm_recon_status", ["matched", "unmatched", "disputed", "pending"]);

export const mobileMoneyRecon = pgTable("mobile_money_recon", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  transactionId: text("transaction_id").references(() => transactions.id),
  provider: text("provider").notNull(),
  providerRef: text("provider_ref").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  status: mmReconStatusEnum("status").default("pending").notNull(),
  reconciledAt: timestamp("reconciled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("mm_recon_tenant_idx").on(t.tenantId),
  index("mm_recon_merchant_idx").on(t.merchantId),
  index("mm_recon_status_idx").on(t.status),
]);
export type MobileMoneyReconRecord = typeof mobileMoneyRecon.$inferSelect;
export type InsertMobileMoneyReconRecord = typeof mobileMoneyRecon.$inferInsert;

// ─── FX Rates ─────────────────────────────────────────────────────────────────
// FX rates are global (not tenant-scoped) but tenants may have custom spreads via tenant_config.
export const fxRates = pgTable("fx_rates", {
  id: serial("id").primaryKey(),
  baseCurrency: text("base_currency").notNull().default("NGN"),
  targetCurrency: text("target_currency").notNull(),
  rate: text("rate").notNull(),
  source: text("source").notNull().default("exchangerate-api"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
}, (t) => [
  index("fx_rates_base_target_idx").on(t.baseCurrency, t.targetCurrency),
  index("fx_rates_fetched_idx").on(t.fetchedAt),
]);
export type FxRate = typeof fxRates.$inferSelect;
export type InsertFxRate = typeof fxRates.$inferInsert;

// ─── Consumer Wallets ─────────────────────────────────────────────────────────
export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  merchantId: text("merchant_id").references(() => merchants.id),
  currency: text("currency").notNull().default("NGN"),
  balance: text("balance").notNull().default("0"),
  ledgerBalance: text("ledger_balance").notNull().default("0"),
  status: text("status").notNull().default("active"),
  tier: text("tier").notNull().default("basic"),
  dailyLimit: text("daily_limit").notNull().default("50000"),
  monthlyLimit: text("monthly_limit").notNull().default("500000"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("wallets_tenant_idx").on(t.tenantId),
  index("wallets_user_idx").on(t.userId),
  index("wallets_merchant_idx").on(t.merchantId),
]);
export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;

// ─── Wallet Transactions ──────────────────────────────────────────────────────
export const walletTransactions = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  walletId: integer("wallet_id").references(() => wallets.id).notNull(),
  type: text("type").notNull(),
  amount: text("amount").notNull(),
  currency: text("currency").notNull().default("NGN"),
  balanceBefore: text("balance_before").notNull(),
  balanceAfter: text("balance_after").notNull(),
  description: text("description").notNull(),
  reference: text("reference").notNull(),
  channel: text("channel").notNull(),
  counterpartyId: text("counterparty_id"),
  counterpartyName: text("counterparty_name"),
  status: text("status").notNull().default("completed"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("wallet_tx_tenant_idx").on(t.tenantId),
  index("wallet_tx_wallet_idx").on(t.walletId),
  unique("wallet_tx_tenant_ref_uniq").on(t.tenantId, t.reference),
  index("wallet_tx_created_idx").on(t.createdAt),
]);
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = typeof walletTransactions.$inferInsert;

// ─── Cross-Border Transfers ───────────────────────────────────────────────────
export const crossBorderTransfers = pgTable("cross_border_transfers", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").references(() => merchants.id),
  walletId: integer("wallet_id").references(() => wallets.id),
  transferId: text("transfer_id").notNull(),
  quoteId: text("quote_id"),
  sourceCurrency: text("source_currency").notNull(),
  targetCurrency: text("target_currency").notNull(),
  sourceAmount: text("source_amount").notNull(),
  targetAmount: text("target_amount").notNull(),
  exchangeRate: text("exchange_rate").notNull(),
  fee: text("fee").notNull().default("0"),
  corridor: text("corridor").notNull(),
  rail: text("rail").notNull().default("mojaloop"),
  status: text("status").notNull().default("pending"),
  senderName: text("sender_name"),
  senderAccount: text("sender_account"),
  receiverName: text("receiver_name"),
  receiverAccount: text("receiver_account"),
  receiverFspId: text("receiver_fsp_id"),
  errorCode: text("error_code"),
  errorDescription: text("error_description"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("xborder_tenant_transfer_uniq").on(t.tenantId, t.transferId),
  index("xborder_tenant_idx").on(t.tenantId),
  index("xborder_merchant_idx").on(t.merchantId),
  index("xborder_status_idx").on(t.status),
  index("xborder_rail_idx").on(t.rail),
  index("xborder_created_idx").on(t.createdAt),
]);
export type CrossBorderTransfer = typeof crossBorderTransfers.$inferSelect;
export type InsertCrossBorderTransfer = typeof crossBorderTransfers.$inferInsert;

// ─── Idempotency Requests ─────────────────────────────────────────────────────
export const idempotencyRequests = pgTable("idempotency_requests", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull(),
  operation: text("operation").notNull(),
  requestHash: text("request_hash").notNull(),
  responseStatus: integer("response_status").notNull(),
  responseBody: jsonb("response_body"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("idempotency_tenant_key_merchant_idx").on(t.id, t.tenantId, t.merchantId),
  index("idempotency_operation_idx").on(t.operation),
  index("idempotency_expires_idx").on(t.expiresAt),
]);
export type IdempotencyRequest = typeof idempotencyRequests.$inferSelect;
export type InsertIdempotencyRequest = typeof idempotencyRequests.$inferInsert;

// ─── Settlements ──────────────────────────────────────────────────────────────
// Tracks settlement batches from TigerBeetle → bank transfer.
// SLA is configurable per tenant (default 2 hours for CBN NIP compliance).
export const settlementStatusEnum = pgEnum("settlement_status", [
  "pending", "processing", "completed", "failed", "sla_breached",
]);

export const settlements = pgTable("settlements", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  reference: text("reference").notNull().unique(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  status: settlementStatusEnum("status").notNull().default("pending"),
  // SLA tracking
  slaDeadlineAt: timestamp("sla_deadline_at"),
  slaBreachedAt: timestamp("sla_breached_at"),
  slaAlertSentAt: timestamp("sla_alert_sent_at"),
  // Middleware / Temporal
  workflowId: text("workflow_id"),
  bridgeRef: text("bridge_ref"),
  failureReason: text("failure_reason"),
  // SLA severity escalation
  severity: text("severity").default("normal"),  // normal | high | critical
  resolvedAt: timestamp("resolved_at"),
  notes: text("notes"),
  // Timestamps
  initiatedAt: timestamp("initiated_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("settlements_tenant_idx").on(t.tenantId),
  index("settlements_merchant_idx").on(t.merchantId),
  index("settlements_status_idx").on(t.status),
  index("settlements_sla_deadline_idx").on(t.slaDeadlineAt),
  index("settlements_reference_idx").on(t.reference),
]);
export type Settlement = typeof settlements.$inferSelect;
export type InsertSettlement = typeof settlements.$inferInsert;

// ─── NIP Bank Directory ───────────────────────────────────────────────────────
// CBN NIP (Nigeria Inter-Bank Settlement System Instant Payment) bank directory.
// Cached locally and refreshed periodically from the NIBSS gateway.
export const nipBanks = pgTable("nip_banks", {
  id: text("id").primaryKey(),
  bankCode: text("bank_code").notNull().unique(),
  bankName: text("bank_name").notNull(),
  shortName: text("short_name"),
  nipCode: text("nip_code"),
  category: text("category").default("commercial"), // commercial, microfinance, mobile_money
  isActive: integer("is_active").notNull().default(1),
  supportsNip: integer("supports_nip").notNull().default(1),
  supportsUssd: integer("supports_ussd").notNull().default(0),
  logoUrl: text("logo_url"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("nip_banks_code_idx").on(t.bankCode),
  index("nip_banks_active_idx").on(t.isActive),
]);
export type NipBank = typeof nipBanks.$inferSelect;
export type InsertNipBank = typeof nipBanks.$inferInsert;

// ─── NIP Account Enquiry Cache ────────────────────────────────────────────────
// Caches NIP name enquiry results to reduce NIBSS API calls.
// TTL: 24 hours (account names rarely change).
export const nipAccountCache = pgTable("nip_account_cache", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  bankCode: text("bank_code").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  sessionId: text("session_id"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("nip_account_cache_key_idx").on(t.tenantId, t.bankCode, t.accountNumber),
  index("nip_account_cache_expires_idx").on(t.expiresAt),
]);
export type NipAccountCache = typeof nipAccountCache.$inferSelect;
export type InsertNipAccountCache = typeof nipAccountCache.$inferInsert;

// ─── NIP Resolution Error Log ─────────────────────────────────────────────────
// Tracks every failed account name enquiry attempt for audit and retry analysis.
export const nipResolutionErrors = pgTable("nip_resolution_errors", {
  id: serial("id").primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  merchantId: varchar("merchant_id", { length: 64 }).notNull(),
  bankCode: varchar("bank_code", { length: 10 }).notNull(),
  accountNumber: varchar("account_number", { length: 10 }).notNull(),
  attemptNumber: integer("attempt_number").notNull().default(1),
  errorCode: varchar("error_code", { length: 50 }),
  errorMessage: text("error_message"),
  errorSource: varchar("error_source", { length: 50 }).default("nibss"), // nibss | bridge | timeout | validation
  resolvedAt: timestamp("resolved_at"),       // set when a later retry succeeds
  resolvedAccountName: text("resolved_account_name"), // populated on successful retry
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("nip_errors_tenant_idx").on(t.tenantId),
  index("nip_errors_merchant_idx").on(t.merchantId),
  index("nip_errors_bank_account_idx").on(t.bankCode, t.accountNumber),
  index("nip_errors_created_idx").on(t.createdAt),
]);
export type NipResolutionError = typeof nipResolutionErrors.$inferSelect;
export type InsertNipResolutionError = typeof nipResolutionErrors.$inferInsert;


// ─── In-App Notifications ─────────────────────────────────────────────────────
// Stores merchant-facing real-time notifications (disputes, payouts, KYC, etc.)
// Delivered via SSE at /api/notifications/stream and polled via tRPC.
export const merchantNotifications = pgTable("merchant_notifications", {
  id: serial("id").primaryKey(),
  merchantId: varchar("merchant_id", { length: 64 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  entityId: varchar("entity_id", { length: 64 }),
  entityType: varchar("entity_type", { length: 32 }),
  isRead: boolean("is_read").notNull().default(false),
  /** priority: low | medium | high | critical — drives badge colour and sort order */
  priority: varchar("priority", { length: 16 }).notNull().default("medium"),
  /** deep-link path for the mobile app, e.g. /transactions/txn_abc */
  actionUrl: varchar("action_url", { length: 512 }),
  /** JSON metadata (amount, currency, transactionId, etc.) */
  metadata: text("metadata"),
  /** soft-delete — dismissed by user but not erased from DB */
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("notif_merchant_idx").on(t.merchantId),
  index("notif_merchant_read_idx").on(t.merchantId, t.isRead),
  index("notif_created_idx").on(t.createdAt),
  index("notif_priority_idx").on(t.merchantId, t.priority),
]);
export type MerchantNotification = typeof merchantNotifications.$inferSelect;
export type InsertMerchantNotification = typeof merchantNotifications.$inferInsert;

// ─── Mobile Device Push Tokens ────────────────────────────────────────────────
// Stores FCM/APNs tokens for mobile push notification delivery.
// One row per device per merchant. Token is upserted on each app launch.
export const devicePushTokens = pgTable("device_push_tokens", {
  id: serial("id").primaryKey(),
  merchantId: varchar("merchant_id", { length: 64 }).notNull(),
  userId: integer("user_id").notNull(),
  /** FCM token (Android + iOS via Firebase) or APNs token (iOS direct) */
  token: text("token").notNull(),
  platform: varchar("platform", { length: 8 }).notNull().default("fcm"),
  deviceId: varchar("device_id", { length: 128 }),
  appVersion: varchar("app_version", { length: 32 }),
  isActive: boolean("is_active").notNull().default(true),
  /** Web Push Protocol (VAPID) subscription — for browser/PWA notifications */
  webPushEndpoint: text("web_push_endpoint"),
  webPushP256dh: text("web_push_p256dh"),
  webPushAuth: text("web_push_auth"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("push_tokens_merchant_idx").on(t.merchantId),
  index("push_tokens_user_idx").on(t.userId),
  index("push_tokens_token_idx").on(t.token),
  uniqueIndex("push_tokens_device_unique").on(t.userId, t.deviceId),
]);
export type DevicePushToken = typeof devicePushTokens.$inferSelect;
export type InsertDevicePushToken = typeof devicePushTokens.$inferInsert;

// ─── Subscriptions (Recurring Payments) ──────────────────────────────────────
// Nigerian context: merchants can set up recurring charges for customers
// (e.g. monthly subscriptions, weekly savings plans, utility auto-pay).
// Scheduler fires processdue every minute to charge due subscriptions via NIP.

export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "paused", "cancelled", "completed", "failed"]);
export const subscriptionIntervalEnum = pgEnum("subscription_interval", ["daily", "weekly", "monthly", "quarterly", "annually"]);

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull(),
  // Customer details
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  // Plan details
  planName: text("plan_name").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(), // amount in kobo (NGN smallest unit)
  currency: text("currency").notNull().default("NGN"),
  interval: subscriptionIntervalEnum("interval").notNull().default("monthly"),
  totalCycles: integer("total_cycles"), // null = indefinite
  completedCycles: integer("completed_cycles").notNull().default(0),
  // Scheduling
  startAt: timestamp("start_at").notNull(),
  nextRunAt: timestamp("next_run_at").notNull(),
  lastRunAt: timestamp("last_run_at"),
  // Status
  status: subscriptionStatusEnum("status").notNull().default("active"),
  failureReason: text("failure_reason"),
  // NIP payment details
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  accountName: text("account_name"),
  // Metadata
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("subscriptions_merchant_idx").on(t.merchantId),
  index("subscriptions_status_idx").on(t.status),
  index("subscriptions_next_run_idx").on(t.nextRunAt),
]);
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// ─── Subscription Charges (execution log) ────────────────────────────────────
export const subscriptionCharges = pgTable("subscription_charges", {
  id: text("id").primaryKey(),
  subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("pending"), // pending | success | failed
  nipSessionId: text("nip_session_id"),
  failureReason: text("failure_reason"),
  chargedAt: timestamp("charged_at").defaultNow().notNull(),
}, (t) => [
  index("sub_charges_sub_idx").on(t.subscriptionId),
  index("sub_charges_merchant_idx").on(t.merchantId),
]);
export type SubscriptionCharge = typeof subscriptionCharges.$inferSelect;
export type InsertSubscriptionCharge = typeof subscriptionCharges.$inferInsert;

// ─── POS Terminals (Nigerian Soundbox / Card Machine equivalent) ──────────────
// Nigerian context: Moniepoint/OPay-style POS terminals that merchants deploy
// at physical locations. Each terminal sends payment events to the portal via webhook.
// Also supports audio alert simulation (Soundbox equivalent via WebSocket push).

export const posTerminalStatusEnum = pgEnum("pos_terminal_status", ["active", "inactive", "maintenance", "stolen"]);
export const posTerminalModelEnum = pgEnum("pos_terminal_model", [
  "soundbox_basic",    // Audio-only QR/NIP notification device
  "pos_lite",          // Card + QR (Verve/Mastercard/Visa)
  "pos_smart",         // Android POS with receipt printer
  "ussd_terminal",     // USSD-only offline terminal
]);

export const posTerminals = pgTable("pos_terminals", {
  id: text("id").primaryKey(),                         // e.g. "pos_abc123"
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull(),
  serialNumber: text("serial_number").notNull().unique(),
  model: posTerminalModelEnum("model").notNull().default("soundbox_basic"),
  label: text("label"),                                // "Main Counter", "Gate 2", etc.
  location: text("location"),                          // Physical address / branch name
  latitude: integer("latitude"),                           // GPS latitude * 1e6 (stored as integer)
  longitude: integer("longitude"),                          // GPS longitude * 1e6 (stored as integer)
  status: posTerminalStatusEnum("status").notNull().default("active"),
  // Connectivity
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  firmwareVersion: text("firmware_version"),
  ipAddress: text("ip_address"),
  // Audio alert config (Soundbox equivalent)
  audioAlertsEnabled: boolean("audio_alerts_enabled").notNull().default(true),
  audioLanguage: text("audio_language").notNull().default("en"),  // en | yo | ha | ig
  // Totals (cached for dashboard)
  totalTransactions: integer("total_transactions").notNull().default(0),
  totalVolumeKobo: bigint("total_volume_kobo", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("pos_merchant_idx").on(t.merchantId),
  index("pos_status_idx").on(t.status),
  index("pos_serial_idx").on(t.serialNumber),
]);
export type PosTerminal = typeof posTerminals.$inferSelect;
export type InsertPosTerminal = typeof posTerminals.$inferInsert;

// ─── POS Terminal Transactions ────────────────────────────────────────────────
// Records each payment event received from a POS terminal.
// Links back to the main transactions table via transactionId.
export const posTransactions = pgTable("pos_transactions", {
  id: text("id").primaryKey(),
  terminalId: text("terminal_id").notNull().references(() => posTerminals.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull(),
  transactionId: text("transaction_id"),               // links to transactions table
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  channel: text("channel").notNull().default("qr"),    // qr | card | nip | ussd
  maskedPan: text("masked_pan"),                       // e.g. "****1234" for card
  nipSessionId: text("nip_session_id"),
  status: text("status").notNull().default("completed"),
  receiptData: jsonb("receipt_data"),
  settlementStatus: text("settlement_status").notNull().default("pending"),
  settlementBatchId: text("settlement_batch_id"),
  nibssReference: text("nibss_reference"),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("pos_tx_terminal_idx").on(t.terminalId),
  index("pos_tx_merchant_idx").on(t.merchantId),
]);
export type PosTransaction = typeof posTransactions.$inferSelect;
export type InsertPosTransaction = typeof posTransactions.$inferInsert;

// ─── PTSP Settlement Batches ──────────────────────────────────────────────────
// Tracks NIBSS batch settlement lifecycle: pending → submitted → confirmed/failed
export const ptspBatchStatusEnum = pgEnum("ptsp_batch_status", [
  "pending", "submitted", "confirmed", "failed", "partial",
]);
export const ptspBatches = pgTable("ptsp_batches", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  settlementDate: text("settlement_date").notNull(),   // YYYY-MM-DD
  status: ptspBatchStatusEnum("status").notNull().default("pending"),
  nibssReference: text("nibss_reference"),
  totalAmountKobo: bigint("total_amount_kobo", { mode: "number" }).notNull().default(0),
  transactionCount: integer("transaction_count").notNull().default(0),
  submittedAt: timestamp("submitted_at"),
  confirmedAt: timestamp("confirmed_at"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("ptsp_batch_merchant_idx").on(t.merchantId),
  index("ptsp_batch_date_idx").on(t.settlementDate),
  index("ptsp_batch_status_idx").on(t.status),
]);
export type PtspBatch = typeof ptspBatches.$inferSelect;
export type InsertPtspBatch = typeof ptspBatches.$inferInsert;

// ─── Geofence Rules ───────────────────────────────────────────────────────────
export const geofenceRules = pgTable("geofence_rules", {
  id: text("id").primaryKey().$defaultFn(() => `gfr_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
  merchantId: text("merchant_id").notNull(),
  terminalId: text("terminal_id"),          // null = applies to all merchant terminals
  name: text("name").notNull(),
  centerLat: integer("center_lat").notNull(), // × 1e6
  centerLng: integer("center_lng").notNull(), // × 1e6
  radiusMeters: integer("radius_meters").notNull().default(500),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("geofence_merchant_idx").on(t.merchantId),
]);
export type GeofenceRule = typeof geofenceRules.$inferSelect;
export type InsertGeofenceRule = typeof geofenceRules.$inferInsert;

// ─── Agent Network ────────────────────────────────────────────────────────────
export const agentNetwork = pgTable("agent_network", {
  id: serial("id").primaryKey(),
  superAgentMerchantId: text("super_agent_merchant_id").notNull(),
  subAgentMerchantId: text("sub_agent_merchant_id").notNull(),
  status: text("status").notNull().default("active"),  // active | suspended | pending
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  totalVolumeKobo: bigint("total_volume_kobo", { mode: "number" }).notNull().default(0),
  transactionCount: integer("transaction_count").notNull().default(0),
  fraudIncidents: integer("fraud_incidents").notNull().default(0),
  settlementRate: integer("settlement_rate").notNull().default(100), // percentage 0-100
}, (t) => [
  index("agent_network_super_idx").on(t.superAgentMerchantId),
]);
export type AgentNetwork = typeof agentNetwork.$inferSelect;

// ─── Restaurant Tables ────────────────────────────────────────────────────────
export const restaurantTableStatusEnum = pgEnum("restaurant_table_status", [
  "available", "occupied", "reserved", "cleaning",
]);
export const restaurantTables = pgTable("restaurant_tables", {
  id: text("id").primaryKey().$defaultFn(() => `tbl_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
  merchantId: text("merchant_id").notNull(),
  tableNumber: text("table_number").notNull(),
  capacity: integer("capacity").notNull().default(4),
  section: text("section").notNull().default("main"),
  status: restaurantTableStatusEnum("status").notNull().default("available"),
  posX: integer("pos_x").notNull().default(0),  // floor plan x position (px)
  posY: integer("pos_y").notNull().default(0),  // floor plan y position (px)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("restaurant_table_merchant_idx").on(t.merchantId),
]);
export type RestaurantTable = typeof restaurantTables.$inferSelect;
export type InsertRestaurantTable = typeof restaurantTables.$inferInsert;

// ─── Restaurant Orders ────────────────────────────────────────────────────────
export const restaurantOrderStatusEnum = pgEnum("restaurant_order_status", [
  "open", "sent_to_kitchen", "ready", "paid", "voided",
]);
export const restaurantOrders = pgTable("restaurant_orders", {
  id: text("id").primaryKey().$defaultFn(() => `ord_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
  merchantId: text("merchant_id").notNull(),
  tableId: text("table_id"),
  status: restaurantOrderStatusEnum("status").notNull().default("open"),
  covers: integer("covers").notNull().default(1),
  totalKobo: bigint("total_kobo", { mode: "number" }).notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("restaurant_order_merchant_idx").on(t.merchantId),
  index("restaurant_order_table_idx").on(t.tableId),
]);
export type RestaurantOrder = typeof restaurantOrders.$inferSelect;
export type InsertRestaurantOrder = typeof restaurantOrders.$inferInsert;

// ─── Restaurant Order Items ───────────────────────────────────────────────────
export const restaurantOrderItems = pgTable("restaurant_order_items", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull(),
  name: text("name").notNull(),
  qty: integer("qty").notNull().default(1),
  unitPriceKobo: bigint("unit_price_kobo", { mode: "number" }).notNull(),
  courseNumber: integer("course_number").notNull().default(1),
  status: text("status").notNull().default("pending"),  // pending | ready | served
  notes: text("notes"),
}, (t) => [
  index("order_item_order_idx").on(t.orderId),
]);
export type RestaurantOrderItem = typeof restaurantOrderItems.$inferSelect;

// ─── Split Bill Sessions ──────────────────────────────────────────────────────
export const splitBillSessions = pgTable("split_bill_sessions", {
  id: text("id").primaryKey().$defaultFn(() => `sbs_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
  orderId: text("order_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  totalKobo: bigint("total_kobo", { mode: "number" }).notNull(),
  splitCount: integer("split_count").notNull(),
  paidCount: integer("paid_count").notNull().default(0),
  status: text("status").notNull().default("pending"),  // pending | partial | complete
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("split_bill_order_idx").on(t.orderId),
]);
export type SplitBillSession = typeof splitBillSessions.$inferSelect;

export const splitBillShares = pgTable("split_bill_shares", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  shareKobo: bigint("share_kobo", { mode: "number" }).notNull(),
  paymentLinkId: text("payment_link_id"),
  paidAt: timestamp("paid_at"),
  shareIndex: integer("share_index").notNull(),
}, (t) => [
  index("split_share_session_idx").on(t.sessionId),
]);
export type SplitBillShare = typeof splitBillShares.$inferSelect;

// ─── Menu Categories ──────────────────────────────────────────────────────────
export const menuCategories = pgTable("menu_categories", {
  id: text("id").primaryKey().$defaultFn(() => `mcat_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("menu_cat_merchant_idx").on(t.merchantId),
]);
export type MenuCategory = typeof menuCategories.$inferSelect;
export type InsertMenuCategory = typeof menuCategories.$inferInsert;

// ─── Menu Items ───────────────────────────────────────────────────────────────
export const menuItems = pgTable("menu_items", {
  id: text("id").primaryKey().$defaultFn(() => `mitm_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
  categoryId: text("category_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  priceKobo: bigint("price_kobo", { mode: "number" }).notNull(),
  available: boolean("available").notNull().default(true),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("menu_item_cat_idx").on(t.categoryId),
  index("menu_item_merchant_idx").on(t.merchantId),
]);
export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;

// ─── Loyalty Programs ─────────────────────────────────────────────────────────
export const loyaltyPrograms = pgTable("loyalty_programs", {
  id: text("id").primaryKey().$defaultFn(() => `lp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
  merchantId: text("merchant_id").notNull().unique(),
  pointsPerKobo: integer("points_per_kobo").notNull().default(1),  // points earned per kobo spent
  redeemRate: integer("redeem_rate").notNull().default(100),        // kobo per point when redeeming
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type LoyaltyProgram = typeof loyaltyPrograms.$inferSelect;

export const loyaltyAccounts = pgTable("loyalty_accounts", {
  id: text("id").primaryKey().$defaultFn(() => `la_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
  merchantId: text("merchant_id").notNull(),
  customerId: integer("customer_id").notNull(),
  pointsBalance: bigint("points_balance", { mode: "number" }).notNull().default(0),
  lifetimePoints: bigint("lifetime_points", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("loyalty_account_merchant_idx").on(t.merchantId),
  index("loyalty_account_customer_idx").on(t.customerId),
]);
export type LoyaltyAccount = typeof loyaltyAccounts.$inferSelect;

export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: serial("id").primaryKey(),
  accountId: text("account_id").notNull(),
  type: text("type").notNull(),  // earn | redeem | expire | adjust
  points: bigint("points", { mode: "number" }).notNull(),
  orderId: text("order_id"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("loyalty_tx_account_idx").on(t.accountId),
]);
export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;

// ─── KDS Stations ─────────────────────────────────────────────────────────────
export const kdsStations = pgTable("kds_stations", {
  id: text("id").primaryKey().$defaultFn(() => `kds_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("kds_merchant_idx").on(t.merchantId),
]);
export type KdsStation = typeof kdsStations.$inferSelect;
export type InsertKdsStation = typeof kdsStations.$inferInsert;

// ─── Inventory Items ──────────────────────────────────────────────────────────
export const inventoryItems = pgTable("inventory_items", {
  id: text("id").primaryKey().$defaultFn(() => `inv_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("unit"),  // kg, litre, unit, etc.
  currentStock: integer("current_stock").notNull().default(0),
  reorderLevel: integer("reorder_level").notNull().default(10),
  costPerUnit: bigint("cost_per_unit", { mode: "number" }).notNull().default(0),  // kobo
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("inventory_merchant_idx").on(t.merchantId),
]);
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = typeof inventoryItems.$inferInsert;

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: serial("id").primaryKey(),
  itemId: text("item_id").notNull(),
  type: text("type").notNull(),  // restock | consume | waste | adjust
  quantity: integer("quantity").notNull(),
  orderId: text("order_id"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("inv_tx_item_idx").on(t.itemId),
]);
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: serial("id").primaryKey(),
  menuItemId: text("menu_item_id").notNull(),
  inventoryItemId: text("inventory_item_id").notNull(),
  quantityPerServing: integer("quantity_per_serving").notNull(),  // in base unit × 100
}, (t) => [
  index("recipe_menu_item_idx").on(t.menuItemId),
]);
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;

// ─── Staff Members ────────────────────────────────────────────────────────────
export const staffMembers = pgTable("staff_members", {
  id: text("id").primaryKey().$defaultFn(() => `stf_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("server"),  // manager | server | chef | cashier
  hourlyRateKobo: bigint("hourly_rate_kobo", { mode: "number" }).notNull().default(0),
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("staff_merchant_idx").on(t.merchantId),
]);
export type StaffMember = typeof staffMembers.$inferSelect;
export type InsertStaffMember = typeof staffMembers.$inferInsert;

export const staffShifts = pgTable("staff_shifts", {
  id: serial("id").primaryKey(),
  staffId: text("staff_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  clockIn: timestamp("clock_in").notNull(),
  clockOut: timestamp("clock_out"),
  tipsKobo: bigint("tips_kobo", { mode: "number" }).notNull().default(0),
  hoursWorked: integer("hours_worked"),  // minutes
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("shift_staff_idx").on(t.staffId),
  index("shift_merchant_idx").on(t.merchantId),
]);
export type StaffShift = typeof staffShifts.$inferSelect;

export const payrollRuns = pgTable("payroll_runs", {
  id: text("id").primaryKey().$defaultFn(() => `pay_${Date.now()}_${Math.random().toString(36).slice(2,8)}`),
  merchantId: text("merchant_id").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: text("status").notNull().default("draft"),  // draft | approved | paid
  totalKobo: bigint("total_kobo", { mode: "number" }).notNull().default(0),
  staffCount: integer("staff_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("payroll_merchant_idx").on(t.merchantId),
]);
export type PayrollRun = typeof payrollRuns.$inferSelect;

// ─── Audit Events ─────────────────────────────────────────────────────────────
// Tamper-evident audit trail for compliance — every significant action is logged.
export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  actorId: text("actor_id").notNull(),          // user openId or "system"
  actorName: text("actor_name").notNull(),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),             // e.g. "payout.created", "settings.updated"
  resource: text("resource").notNull(),         // e.g. "payout", "webhook", "api_key"
  resourceId: text("resource_id"),              // ID of the affected resource
  metadata: jsonb("metadata"),                  // extra context (amount, old/new values, etc.)
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("audit_merchant_idx").on(t.merchantId),
  index("audit_actor_idx").on(t.actorId),
  index("audit_action_idx").on(t.action),
  index("audit_created_idx").on(t.createdAt),
]);
export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = typeof auditEvents.$inferInsert;

// ─── Purchase Orders ──────────────────────────────────────────────────────────
// Inventory reorder workflow — created when stock falls below reorder level.
export const purchaseOrders = pgTable("purchase_orders", {
  id: text("id").primaryKey(),                  // e.g. "po_1741234567_abc123"
  merchantId: text("merchant_id").notNull(),
  inventoryItemId: text("inventory_item_id"),   // linked inventory item
  itemName: text("item_name").notNull(),
  vendorName: text("vendor_name"),
  quantity: integer("quantity").notNull(),
  unit: text("unit").notNull().default("unit"),
  unitCostKobo: bigint("unit_cost_kobo", { mode: "number" }).notNull().default(0),
  totalCostKobo: bigint("total_cost_kobo", { mode: "number" }).notNull().default(0),
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // pending | approved | received | cancelled
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("po_merchant_idx").on(t.merchantId),
  index("po_status_idx").on(t.status),
]);
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

// ─── Fraud Alert Comments ─────────────────────────────────────────────────────
export const fraudAlertComments = pgTable("fraud_alert_comments", {
  id: text("id").primaryKey(),
  alertId: text("alert_id").notNull().references(() => fraudAlerts.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("fac_alert_idx").on(t.alertId),
  index("fac_merchant_idx").on(t.merchantId),
]);
export type FraudAlertComment = typeof fraudAlertComments.$inferSelect;
export type InsertFraudAlertComment = typeof fraudAlertComments.$inferInsert;

// ─── BNPL Plans ───────────────────────────────────────────────────────────────
export const bnplPlans = pgTable("bnpl_plans", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  name: text("name").notNull(),
  installments: integer("installments").notNull().default(3),
  interestRate: integer("interest_rate").notNull().default(0),
  minAmount: bigint("min_amount", { mode: "number" }).notNull().default(5000),
  maxAmount: bigint("max_amount", { mode: "number" }).notNull().default(500000),
  currency: text("currency").notNull().default("NGN"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("bnpl_plan_merchant_idx").on(t.merchantId),
]);
export type BnplPlan = typeof bnplPlans.$inferSelect;
export type InsertBnplPlan = typeof bnplPlans.$inferInsert;

// ─── Reconciliation Alerts ────────────────────────────────────────────────────
// Records balance mismatches detected by the TigerBeetle↔PostgreSQL reconciliation
// worker (go-bridge/cmd/reconciler). Each row represents a single mismatch event
// for a merchant+currency pair at a point in time.
export const reconciliationAlerts = pgTable("reconciliation_alerts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  currency: text("currency").notNull(),
  pgBalance: bigint("pg_balance", { mode: "number" }).notNull(),
  tbBalance: bigint("tb_balance", { mode: "number" }).notNull(),
  delta: bigint("delta", { mode: "number" }).notNull(),
  status: text("status", { enum: ["open", "investigating", "resolved", "dismissed"] })
    .notNull()
    .default("open"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("recon_alert_merchant_idx").on(t.merchantId),
  index("recon_alert_status_idx").on(t.status),
  index("recon_alert_created_idx").on(t.createdAt),
]);
export type ReconciliationAlert = typeof reconciliationAlerts.$inferSelect;
export type InsertReconciliationAlert = typeof reconciliationAlerts.$inferInsert;

// ─── QR Payments ──────────────────────────────────────────────────────────────
export const qrPayments = pgTable("qr_payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  amount: bigint("amount", { mode: "number" }),
  currency: text("currency").notNull().default("NGN"),
  description: text("description"),
  status: text("status", { enum: ["pending", "claimed", "expired", "cancelled"] }).notNull().default("pending"),
  expiresAt: timestamp("expires_at"),
  claimedBy: integer("claimed_by").references(() => users.id),
  claimedAt: timestamp("claimed_at"),
  transactionRef: text("transaction_ref"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("qr_merchant_idx").on(t.merchantId),
  index("qr_status_idx").on(t.status),
]);
export type QrPayment = typeof qrPayments.$inferSelect;
export type InsertQrPayment = typeof qrPayments.$inferInsert;

// ─── Consumer Wallets ─────────────────────────────────────────────────────────
export const consumerWallets = pgTable("consumer_wallets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull().references(() => users.id),
  currency: text("currency").notNull().default("NGN"),
  balanceKobo: bigint("balance_kobo", { mode: "number" }).notNull().default(0),
  ledgerAccountId: text("ledger_account_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("cw_user_idx").on(t.userId),
  index("cw_user_currency_idx").on(t.userId, t.currency),
]);
export type ConsumerWallet = typeof consumerWallets.$inferSelect;
export type InsertConsumerWallet = typeof consumerWallets.$inferInsert;

// ─── Wallet Transactions ──────────────────────────────────────────────────────
export const p2pTransfers = pgTable("p2p_transfers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  senderId: integer("sender_id").notNull().references(() => users.id),
  senderWalletId: text("sender_wallet_id").notNull().references(() => consumerWallets.id),
  recipientAccountNumber: text("recipient_account_number").notNull(),
  recipientBankCode: text("recipient_bank_code").notNull(),
  recipientBankName: text("recipient_bank_name"),
  recipientName: text("recipient_name").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  narration: text("narration"),
  nipSessionId: text("nip_session_id"),
  nipRef: text("nip_ref"),
  status: text("status", { enum: ["pending", "processing", "completed", "failed", "reversed"] }).notNull().default("pending"),
  failureReason: text("failure_reason"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("p2p_sender_idx").on(t.senderId),
  index("p2p_status_idx").on(t.status),
  index("p2p_created_idx").on(t.createdAt),
]);
export type P2pTransfer = typeof p2pTransfers.$inferSelect;
export type InsertP2pTransfer = typeof p2pTransfers.$inferInsert;

// ─── Saved Beneficiaries ──────────────────────────────────────────────────────
export const savedBeneficiaries = pgTable("saved_beneficiaries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull().references(() => users.id),
  accountNumber: text("account_number").notNull(),
  bankCode: text("bank_code").notNull(),
  bankName: text("bank_name").notNull(),
  accountName: text("account_name").notNull(),
  nickname: text("nickname"),
  transferCount: integer("transfer_count").notNull().default(1),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("sb_user_idx").on(t.userId),
]);
export type SavedBeneficiary = typeof savedBeneficiaries.$inferSelect;
export type InsertSavedBeneficiary = typeof savedBeneficiaries.$inferInsert;

// ─── Red Envelopes (Hongbao) ──────────────────────────────────────────────────
export const redEnvelopes = pgTable("red_envelopes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  senderId: integer("sender_id").notNull().references(() => users.id),
  senderWalletId: text("sender_wallet_id").notNull().references(() => consumerWallets.id),
  totalAmountKobo: bigint("total_amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  slots: integer("slots").notNull().default(5),
  claimedSlots: integer("claimed_slots").notNull().default(0),
  message: text("message"),
  status: text("status", { enum: ["active", "fully_claimed", "expired", "cancelled"] }).notNull().default("active"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("re_sender_idx").on(t.senderId),
  index("re_status_idx").on(t.status),
]);
export type RedEnvelope = typeof redEnvelopes.$inferSelect;
export type InsertRedEnvelope = typeof redEnvelopes.$inferInsert;

// ─── Red Envelope Claims ──────────────────────────────────────────────────────
export const redEnvelopeClaims = pgTable("red_envelope_claims", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  envelopeId: text("envelope_id").notNull().references(() => redEnvelopes.id, { onDelete: "cascade" }),
  claimantId: integer("claimant_id").notNull().references(() => users.id),
  claimantWalletId: text("claimant_wallet_id").notNull().references(() => consumerWallets.id),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  claimedAt: timestamp("claimed_at").defaultNow().notNull(),
}, (t) => [
  index("rec_envelope_idx").on(t.envelopeId),
  index("rec_claimant_idx").on(t.claimantId),
]);
export type RedEnvelopeClaim = typeof redEnvelopeClaims.$inferSelect;
export type InsertRedEnvelopeClaim = typeof redEnvelopeClaims.$inferInsert;

// ─── Bill Payments ────────────────────────────────────────────────────────────
export const billPayments = pgTable("bill_payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull().references(() => users.id),
  walletId: text("wallet_id").notNull().references(() => consumerWallets.id),
  category: text("category").notNull(),
  billerCode: text("biller_code").notNull(),
  billerName: text("biller_name").notNull(),
  customerReference: text("customer_reference").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  providerRef: text("provider_ref"),
  status: text("status", { enum: ["pending", "processing", "completed", "failed"] }).notNull().default("pending"),
  failureReason: text("failure_reason"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("bp_user_idx").on(t.userId),
  index("bp_status_idx").on(t.status),
  index("bp_created_idx").on(t.createdAt),
]);
export type BillPayment = typeof billPayments.$inferSelect;
export type InsertBillPayment = typeof billPayments.$inferInsert;

// ─── Consumer Wallet Transactions ─────────────────────────────────────────────
export const consumerWalletTxns = pgTable("consumer_wallet_txns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  walletId: text("wallet_id").notNull().references(() => consumerWallets.id),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type", { enum: ["topup", "debit", "p2p_send", "p2p_receive", "qr_pay", "bill_pay", "red_envelope_send", "red_envelope_receive", "refund"] }).notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  balanceAfterKobo: bigint("balance_after_kobo", { mode: "number" }).notNull(),
  description: text("description"),
  reference: text("reference"),
  counterpartyName: text("counterparty_name"),
  counterpartyAccount: text("counterparty_account"),
  status: text("status", { enum: ["pending", "completed", "failed", "reversed"] }).notNull().default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("cwt_wallet_idx").on(t.walletId),
  index("cwt_user_idx").on(t.userId),
  index("cwt_created_idx").on(t.createdAt),
]);
export type ConsumerWalletTxn = typeof consumerWalletTxns.$inferSelect;
export type InsertConsumerWalletTxn = typeof consumerWalletTxns.$inferInsert;

// ─── Wave 68: Money Requests (Request Money / Pay-Me Links) ──────────────────
export const moneyRequests = pgTable("money_requests", {
  id: text("id").primaryKey(),
  requesterId: integer("requester_id").notNull().references(() => users.id),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  note: text("note"),
  status: text("status", { enum: ["pending", "paid", "cancelled", "expired"] }).notNull().default("pending"),
  payerUserId: integer("payer_user_id").references(() => users.id),
  payerName: text("payer_name"),
  paidAt: timestamp("paid_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("mr_requester_idx").on(t.requesterId),
  index("mr_status_idx").on(t.status),
]);
export type MoneyRequest = typeof moneyRequests.$inferSelect;

// ─── Wave 68: Consumer Contacts / Friends ────────────────────────────────────
export const consumerContacts = pgTable("consumer_contacts", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  contactUserId: integer("contact_user_id").references(() => users.id),
  nickname: text("nickname"),
  phone: text("phone"),
  accountNumber: text("account_number"),
  bankCode: text("bank_code"),
  bankName: text("bank_name"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("cc_user_idx").on(t.userId),
]);

// ─── Wave 68: Consumer Loyalty ────────────────────────────────────────────────
export const consumerLoyaltyAccounts = pgTable("consumer_loyalty_accounts", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  pointsBalance: integer("points_balance").notNull().default(0),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  tier: text("tier", { enum: ["bronze", "silver", "gold", "platinum"] }).notNull().default("bronze"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ConsumerLoyaltyAccount = typeof consumerLoyaltyAccounts.$inferSelect;

export const consumerLoyaltyTxns = pgTable("consumer_loyalty_txns", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type", { enum: ["earn", "redeem", "expire", "bonus"] }).notNull(),
  points: integer("points").notNull(),
  description: text("description"),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("clt_user_idx").on(t.userId),
]);

// ─── Wave 68: Coupons / Vouchers ─────────────────────────────────────────────
export const coupons = pgTable("coupons", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type", { enum: ["percent", "fixed", "free_transfer"] }).notNull(),
  value: integer("value").notNull(),
  minAmountKobo: bigint("min_amount_kobo", { mode: "number" }).notNull().default(0),
  maxDiscountKobo: bigint("max_discount_kobo", { mode: "number" }),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").notNull().default(0),
  perUserLimit: integer("per_user_limit").notNull().default(1),
  validFrom: timestamp("valid_from").notNull(),
  validUntil: timestamp("valid_until").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type Coupon = typeof coupons.$inferSelect;

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: text("id").primaryKey(),
  couponId: text("coupon_id").notNull().references(() => coupons.id),
  userId: integer("user_id").notNull().references(() => users.id),
  amountSavedKobo: bigint("amount_saved_kobo", { mode: "number" }).notNull(),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("cr_coupon_idx").on(t.couponId),
  index("cr_user_idx").on(t.userId),
]);

// ─── Wave 68: Consumer Virtual Cards ─────────────────────────────────────────
export const consumerCards = pgTable("consumer_cards", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  walletId: text("wallet_id").notNull().references(() => consumerWallets.id),
  maskedPan: text("masked_pan").notNull(),
  cardBrand: text("card_brand", { enum: ["visa", "mastercard"] }).notNull().default("visa"),
  expiryMonth: text("expiry_month").notNull(),
  expiryYear: text("expiry_year").notNull(),
  cardholderName: text("cardholder_name").notNull(),
  spendingLimitKobo: bigint("spending_limit_kobo", { mode: "number" }),
  isActive: boolean("is_active").notNull().default(true),
  isFrozen: boolean("is_frozen").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("cc_card_user_idx").on(t.userId),
]);
export type ConsumerCard = typeof consumerCards.$inferSelect;

// ─── Wave 68: Consumer Recurring Payments ────────────────────────────────────
export const consumerRecurringPayments = pgTable("consumer_recurring_payments", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type", { enum: ["bill", "p2p"] }).notNull(),
  billerCode: text("biller_code"),
  customerReference: text("customer_reference"),
  recipientAccountNumber: text("recipient_account_number"),
  recipientBankCode: text("recipient_bank_code"),
  recipientName: text("recipient_name"),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  frequency: text("frequency", { enum: ["daily", "weekly", "monthly"] }).notNull(),
  nextRunAt: timestamp("next_run_at").notNull(),
  lastRunAt: timestamp("last_run_at"),
  runCount: integer("run_count").notNull().default(0),
  maxRuns: integer("max_runs"),
  isActive: boolean("is_active").notNull().default(true),
  label: text("label"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("crp_user_idx").on(t.userId),
  index("crp_next_run_idx").on(t.nextRunAt),
]);
export type ConsumerRecurringPayment = typeof consumerRecurringPayments.$inferSelect;

// ─── Wave 68: Consumer Split Bill ────────────────────────────────────────────
export const consumerSplitSessions = pgTable("consumer_split_sessions", {
  id: text("id").primaryKey(),
  creatorId: integer("creator_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  totalAmountKobo: bigint("total_amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  status: text("status", { enum: ["open", "settled", "cancelled"] }).notNull().default("open"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("css_creator_idx").on(t.creatorId),
]);
export type ConsumerSplitSession = typeof consumerSplitSessions.$inferSelect;

export const consumerSplitParticipants = pgTable("consumer_split_participants", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => consumerSplitSessions.id),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  shareAmountKobo: bigint("share_amount_kobo", { mode: "number" }).notNull(),
  status: text("status", { enum: ["pending", "paid", "declined"] }).notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  walletTxnId: text("wallet_txn_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("csp_session_idx").on(t.sessionId),
]);
export type ConsumerSplitParticipant = typeof consumerSplitParticipants.$inferSelect;

// ─── Wave 68: Consumer OTP / Phone Verification ──────────────────────────────
export const consumerPhoneVerifications = pgTable("consumer_phone_verifications", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  phone: text("phone").notNull(),
  otpHash: text("otp_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("cpv_user_idx").on(t.userId),
]);

// ─── Wave 68: Consumer PIN (server-side bcrypt) ───────────────────────────────
export const consumerPins = pgTable("consumer_pins", {
  userId: integer("user_id").primaryKey().references(() => users.id),
  pinHash: text("pin_hash").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Wave 68: Consumer KYC Records ───────────────────────────────────────────
export const consumerKycRecords = pgTable("consumer_kyc_records", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  phone: text("phone"),
  bvn: text("bvn"),
  nin: text("nin"),
  selfieUrl: text("selfie_url"),
  idDocUrl: text("id_doc_url"),
  status: text("status", { enum: ["pending", "approved", "rejected", "manual_review"] }).notNull().default("pending"),
  providerRef: text("provider_ref"),
  rejectionReason: text("rejection_reason"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("ckr_user_idx").on(t.userId),
]);
export type ConsumerKycRecord = typeof consumerKycRecords.$inferSelect;


// --- USDC Payout Engine ---

export const merchantSolanaWallets = pgTable("merchant_solana_wallets", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  label: text("label").default("default"),
  network: text("network", { enum: ["mainnet", "devnet"] }).notNull().default("mainnet"),
  isActive: boolean("is_active").notNull().default(true),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("msw_merchant_idx").on(t.merchantId),
  index("msw_address_idx").on(t.walletAddress),
]);
export type MerchantSolanaWallet = typeof merchantSolanaWallets.$inferSelect;

export const usdcPayouts = pgTable("usdc_payouts", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  recipientWallet: text("recipient_wallet").notNull(),
  amountLamports: bigint("amount_lamports", { mode: "number" }).notNull(),
  tbPendingTransferId: text("tb_pending_transfer_id"),
  tbPostedTransferId: text("tb_posted_transfer_id"),
  solanaSignature: text("solana_signature"),
  solanaSlot: bigint("solana_slot", { mode: "number" }),
  temporalWorkflowId: text("temporal_workflow_id"),
  temporalRunId: text("temporal_run_id"),
  status: text("status", {
    enum: ["pending", "reserved", "broadcasting", "confirming", "settled", "failed", "voided"],
  }).notNull().default("pending"),
  failureReason: text("failure_reason"),
  fraudScore: integer("fraud_score"),
  fraudSignals: text("fraud_signals").array(),
  reference: text("reference"),
  network: text("network", { enum: ["mainnet", "devnet"] }).notNull().default("mainnet"),
  initiatedAt: timestamp("initiated_at").defaultNow().notNull(),
  settledAt: timestamp("settled_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("up_merchant_idx").on(t.merchantId),
  index("up_status_idx").on(t.status),
  index("up_signature_idx").on(t.solanaSignature),
  index("up_workflow_idx").on(t.temporalWorkflowId),
]);
export type USDCPayout = typeof usdcPayouts.$inferSelect;

export const usdcDeposits = pgTable("usdc_deposits", {
  id: text("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  merchantId: text("merchant_id"),
  amountLamports: bigint("amount_lamports", { mode: "number" }).notNull(),
  solanaSignature: text("solana_signature").notNull().unique(),
  solanaSlot: bigint("solana_slot", { mode: "number" }),
  network: text("network", { enum: ["mainnet", "devnet"] }).notNull().default("mainnet"),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
}, (t) => [
  index("ud_wallet_idx").on(t.walletAddress),
  index("ud_merchant_idx").on(t.merchantId),
  index("ud_signature_idx").on(t.solanaSignature),
]);
export type USDCDeposit = typeof usdcDeposits.$inferSelect;

// ─── Consumer Disputes ────────────────────────────────────────────────────────
export const consumerDisputes = pgTable("consumer_disputes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull().references(() => users.id),
  walletTxnId: text("wallet_txn_id").references(() => consumerWalletTxns.id),
  merchantDisputeId: text("merchant_dispute_id"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  category: text("category", { enum: ["unauthorized", "duplicate", "not_received", "wrong_amount", "fraud", "other"] }).notNull().default("other"),
  status: text("status", { enum: ["open", "under_review", "resolved", "rejected", "escalated"] }).notNull().default("open"),
  resolution: text("resolution"),
  evidenceUrls: text("evidence_urls"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("cd_user_idx").on(t.userId),
  index("cd_status_idx").on(t.status),
]);
export type ConsumerDispute = typeof consumerDisputes.$inferSelect;
export type InsertConsumerDispute = typeof consumerDisputes.$inferInsert;

// ─── Consumer Fraud Flags ─────────────────────────────────────────────────────
export const consumerFraudFlags = pgTable("consumer_fraud_flags", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull().references(() => users.id),
  walletTxnId: text("wallet_txn_id").references(() => consumerWalletTxns.id),
  riskScore: integer("risk_score").notNull().default(0),
  flagReason: text("flag_reason").notNull(),
  flagType: text("flag_type", { enum: ["velocity", "geo_anomaly", "device_change", "large_amount", "ml_model", "manual"] }).notNull().default("ml_model"),
  status: text("status", { enum: ["active", "reviewed", "dismissed", "escalated"] }).notNull().default("active"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("cff_user_idx").on(t.userId),
  index("cff_status_idx").on(t.status),
  index("cff_score_idx").on(t.riskScore),
]);
export type ConsumerFraudFlag = typeof consumerFraudFlags.$inferSelect;
export type InsertConsumerFraudFlag = typeof consumerFraudFlags.$inferInsert;

// ─── Consumer Idempotency Keys ────────────────────────────────────────────────
export const consumerIdempotencyKeys = pgTable("consumer_idempotency_keys", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull().references(() => users.id),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  operation: text("operation").notNull(),
  responsePayload: text("response_payload"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("cik_user_idx").on(t.userId),
  index("cik_key_idx").on(t.idempotencyKey),
]);
export type ConsumerIdempotencyKey = typeof consumerIdempotencyKeys.$inferSelect;

// ─── Consumer Outbox (transactional outbox pattern) ───────────────────────────
export const consumerOutbox = pgTable("consumer_outbox", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  aggregateId: text("aggregate_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status", { enum: ["pending", "processed", "failed"] }).default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("co_status_idx").on(t.status),
  index("co_aggregate_idx").on(t.aggregateId),
  index("co_created_idx").on(t.createdAt),
]);
export type ConsumerOutboxEvent = typeof consumerOutbox.$inferSelect;

// ─── Merchant Profiles (KYB) ──────────────────────────────────────────────────
export const merchantProfiles = pgTable("merchant_profiles", {
  merchantId: text("merchant_id").primaryKey(),
  businessName: text("business_name").notNull(),
  rcNumber: text("rc_number"),
  taxId: text("tax_id"),
  address: text("address"),
  state: text("state"),
  country: text("country").default("NG"),
  kycStatus: text("kyc_status").default("pending"),
  kybStatus: text("kyb_status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("mp_merchant_idx").on(t.merchantId)]);
export type MerchantProfile = typeof merchantProfiles.$inferSelect;

// ─── Merchant Directors ───────────────────────────────────────────────────────
export const merchantDirectors = pgTable("merchant_directors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  fullName: text("full_name").notNull(),
  bvn: text("bvn"),
  nin: text("nin"),
  dateOfBirth: text("date_of_birth"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("md_merchant_idx").on(t.merchantId)]);
export type MerchantDirector = typeof merchantDirectors.$inferSelect;

// ─── KYB Verifications ────────────────────────────────────────────────────────
export const kybVerifications = pgTable("kyb_verifications", {
  verificationId: text("verification_id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  businessName: text("business_name").notNull(),
  rcNumber: text("rc_number"),
  taxId: text("tax_id"),
  businessType: text("business_type"),
  industryCode: text("industry_code"),
  status: text("status").default("pending"),
  riskLevel: text("risk_level"),
  initiatedBy: text("initiated_by"),
  startedAt: timestamp("started_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("kyb_merchant_idx").on(t.merchantId),
  index("kyb_status_idx").on(t.status),
]);
export type KYBVerification = typeof kybVerifications.$inferSelect;

// ─── KYB Steps ────────────────────────────────────────────────────────────────
export const kybSteps = pgTable("kyb_steps", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  verificationId: text("verification_id").notNull(),
  stepName: text("step_name").notNull(),
  status: text("status").default("pending"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("kybs_verification_idx").on(t.verificationId)]);
export type KYBStep = typeof kybSteps.$inferSelect;

// ─── Compliance Reports ───────────────────────────────────────────────────────
export const complianceReports = pgTable("compliance_reports", {
  reportId: text("report_id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  verificationId: text("verification_id"),
  reportType: text("report_type").notNull(),
  status: text("status").default("pending"),
  riskLevel: text("risk_level"),
  findings: text("findings"),
  generatedAt: timestamp("generated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("cr_merchant_idx").on(t.merchantId),
  index("cr_status_idx").on(t.status),
]);
export type ComplianceReport = typeof complianceReports.$inferSelect;

// ─── Merchant Loans ───────────────────────────────────────────────────────────
export const merchantLoans = pgTable("merchant_loans", {
  loanId: text("loan_id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  status: text("status").default("pending_review"),
  requestedKobo: bigint("requested_kobo", { mode: "number" }).notNull(),
  approvedKobo: bigint("approved_kobo", { mode: "number" }).default(0),
  amountKobo: bigint("amount_kobo", { mode: "number" }).default(0),
  outstandingKobo: bigint("outstanding_kobo", { mode: "number" }).default(0),
  creditScore: integer("credit_score").default(0),
  riskBand: text("risk_band"),
  rateAnnualPct: text("rate_annual_pct").default("0"),
  termDays: integer("term_days").default(90),
  purposeCode: text("purpose_code"),
  notes: text("notes"),
  dueDate: text("due_date"),
  disbursedAt: timestamp("disbursed_at"),
  transferId: text("transfer_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("ml_merchant_idx").on(t.merchantId),
  index("ml_status_idx").on(t.status),
]);
export type MerchantLoan = typeof merchantLoans.$inferSelect;

// ─── Loan Instalments ─────────────────────────────────────────────────────────
export const loanInstalments = pgTable("loan_instalments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  loanId: text("loan_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  dueDate: text("due_date").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  paidKobo: bigint("paid_kobo", { mode: "number" }).default(0),
  status: text("status").default("pending"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("li_loan_idx").on(t.loanId),
  index("li_merchant_idx").on(t.merchantId),
]);
export type LoanInstalment = typeof loanInstalments.$inferSelect;

// ─── Loan Repayments ──────────────────────────────────────────────────────────
export const loanRepayments = pgTable("loan_repayments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  loanId: text("loan_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  transferId: text("transfer_id"),
  method: text("method"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("lr_loan_idx").on(t.loanId)]);
export type LoanRepayment = typeof loanRepayments.$inferSelect;

// ─── Split Rules ──────────────────────────────────────────────────────────────
export const splitRules = pgTable("split_rules", {
  ruleId: text("rule_id").primaryKey(),
  ruleName: text("rule_name").notNull(),
  description: text("description"),
  recipients: jsonb("recipients").notNull(),
  createdBy: text("created_by"),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("sr_active_idx").on(t.isActive)]);
export type SplitRule = typeof splitRules.$inferSelect;

// ─── Split Payments ───────────────────────────────────────────────────────────
export const splitPayments = pgTable("split_payments", {
  splitPaymentId: text("split_payment_id").primaryKey(),
  splitRuleId: text("split_rule_id").notNull(),
  totalAmountKobo: bigint("total_amount_kobo", { mode: "number" }).notNull(),
  reference: text("reference"),
  legs: jsonb("legs").notNull(),
  status: text("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("sp_rule_idx").on(t.splitRuleId),
  index("sp_status_idx").on(t.status),
]);
export type SplitPayment = typeof splitPayments.$inferSelect;

// ─── DCC Transactions ─────────────────────────────────────────────────────────
export const dccTransactions = pgTable("dcc_transactions", {
  conversionId: text("conversion_id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  originalAmountKobo: bigint("original_amount_kobo", { mode: "number" }).notNull(),
  convertedAmountKobo: bigint("converted_amount_kobo", { mode: "number" }).notNull(),
  midRate: text("mid_rate").notNull(),
  customerRate: text("customer_rate").notNull(),
  marginPct: text("margin_pct").notNull(),
  transferId: text("transfer_id"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("dcc_merchant_idx").on(t.merchantId),
  index("dcc_status_idx").on(t.status),
]);
export type DCCTransaction = typeof dccTransactions.$inferSelect;

// ─── SDK Tokens (Embedded Finance) ───────────────────────────────────────────
export const sdkTokens = pgTable("sdk_tokens", {
  tokenId: text("token_id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  scopes: jsonb("scopes"),
  isRevoked: integer("is_revoked").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("st_merchant_idx").on(t.merchantId),
  index("st_hash_idx").on(t.tokenHash),
]);
export type SDKToken = typeof sdkTokens.$inferSelect;

// ─── Webhook Endpoints (Embedded Finance) ────────────────────────────────────
export const webhookEndpoints = pgTable("webhook_endpoints", {
  endpointId: text("endpoint_id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: jsonb("events"),
  isActive: integer("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("we_merchant_idx").on(t.merchantId),
  index("we_active_idx").on(t.isActive),
]);
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;

// ─── Webhook Delivery Log ─────────────────────────────────────────────────────
export const webhookDeliveryLog = pgTable("webhook_delivery_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  endpointId: text("endpoint_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload"),
  statusCode: integer("status_code"),
  success: integer("success").default(0),
  attempt: integer("attempt").default(1),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("wdl_endpoint_idx").on(t.endpointId),
  index("wdl_merchant_idx").on(t.merchantId),
]);
export type WebhookDeliveryLog = typeof webhookDeliveryLog.$inferSelect;

// ─── Consumer Finance Loans (BNPL v2) ────────────────────────────────────────
export const consumerFinanceLoans = pgTable("consumer_finance_loans", {
  loanId: text("loan_id").primaryKey(),
  customerId: text("customer_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  outstandingKobo: bigint("outstanding_kobo", { mode: "number" }).notNull(),
  status: text("status").default("pending"),
  termDays: integer("term_days").default(30),
  rateAnnualPct: text("rate_annual_pct").default("0"),
  dueDate: text("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("cfl_customer_idx").on(t.customerId),
  index("cfl_merchant_idx").on(t.merchantId),
  index("cfl_status_idx").on(t.status),
]);
export type ConsumerFinanceLoan = typeof consumerFinanceLoans.$inferSelect;

// ─── Invoices ─────────────────────────────────────────────────────────────────
export const invoices = pgTable("invoices", {
  invoiceId: text("invoice_id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  customerId: text("customer_id"),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  lineItems: jsonb("line_items").notNull(),
  subtotalKobo: bigint("subtotal_kobo", { mode: "number" }).notNull(),
  taxKobo: bigint("tax_kobo", { mode: "number" }).default(0),
  totalKobo: bigint("total_kobo", { mode: "number" }).notNull(),
  currency: text("currency").default("NGN"),
  status: text("status").default("draft"),
  dueDate: text("due_date"),
  paidAt: timestamp("paid_at"),
  paymentLinkUrl: text("payment_link_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("inv_merchant_idx").on(t.merchantId),
  index("inv_status_idx").on(t.status),
]);
export type Invoice = typeof invoices.$inferSelect;

// ─── Invoice Payments ─────────────────────────────────────────────────────────
export const invoicePayments = pgTable("invoice_payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  invoiceId: text("invoice_id").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  method: text("method"),
  reference: text("reference"),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
}, (t) => [index("ip_invoice_idx").on(t.invoiceId)]);
export type InvoicePayment = typeof invoicePayments.$inferSelect;

// ─── Insurance Policies ───────────────────────────────────────────────────────
export const insurancePolicies = pgTable("insurance_policies", {
  policyId: text("policy_id").primaryKey(),
  customerId: text("customer_id").notNull(),
  merchantId: text("merchant_id"),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  provider: text("provider").notNull(),
  premiumKobo: bigint("premium_kobo", { mode: "number" }).notNull(),
  coverageType: text("coverage_type").notNull(),
  status: text("status").default("active"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("ins_customer_idx").on(t.customerId),
  index("ins_status_idx").on(t.status),
]);
export type InsurancePolicy = typeof insurancePolicies.$inferSelect;

// ─── Carbon Credits ───────────────────────────────────────────────────────────
export const carbonCredits = pgTable("carbon_credits", {
  creditId: text("credit_id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  projectId: text("project_id").notNull(),
  projectName: text("project_name").notNull(),
  tonnes: text("tonnes").notNull(),
  pricePerTonneKobo: bigint("price_per_tonne_kobo", { mode: "number" }).notNull(),
  totalKobo: bigint("total_kobo", { mode: "number" }).notNull(),
  vintage: text("vintage"),
  standard: text("standard"),
  status: text("status").default("pending"),
  retiredAt: timestamp("retired_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("cc_merchant_idx").on(t.merchantId),
  index("cc_status_idx").on(t.status),
]);
export type CarbonCredit = typeof carbonCredits.$inferSelect;

// ─── NFT Badges ───────────────────────────────────────────────────────────────
export const nftBadges = pgTable("nft_badges", {
  badgeId: text("badge_id").primaryKey(),
  recipientId: text("recipient_id").notNull(),
  recipientType: text("recipient_type").default("merchant"),
  badgeType: text("badge_type").notNull(),
  badgeName: text("badge_name").notNull(),
  metadata: jsonb("metadata"),
  mintTxHash: text("mint_tx_hash"),
  network: text("network").default("solana"),
  status: text("status").default("minting"),
  mintedAt: timestamp("minted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("nb_recipient_idx").on(t.recipientId),
  index("nb_status_idx").on(t.status),
]);
export type NFTBadge = typeof nftBadges.$inferSelect;

// ─── Escrow Contracts ─────────────────────────────────────────────────────────
export const escrowContracts = pgTable("escrow_contracts", {
  escrowId: text("escrow_id").primaryKey(),
  buyerMerchantId: text("buyer_merchant_id").notNull(),
  sellerMerchantId: text("seller_merchant_id").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").default("NGN"),
  conditions: jsonb("conditions"),
  status: text("status").default("funded"),
  releasedAt: timestamp("released_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("ec_buyer_idx").on(t.buyerMerchantId),
  index("ec_seller_idx").on(t.sellerMerchantId),
  index("ec_status_idx").on(t.status),
]);
export type EscrowContract = typeof escrowContracts.$inferSelect;

// ─── Tax Withholding Records ──────────────────────────────────────────────────
export const taxWithholdingRecords = pgTable("tax_withholding_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  transactionId: text("transaction_id"),
  grossAmountKobo: bigint("gross_amount_kobo", { mode: "number" }).notNull(),
  taxAmountKobo: bigint("tax_amount_kobo", { mode: "number" }).default(0),
  netAmountKobo: bigint("net_amount_kobo", { mode: "number" }).notNull(),
  taxType: text("tax_type").default("WHT"),
  taxRatePct: text("tax_rate_pct").notNull(),
  period: text("period").notNull(),
  status: text("status").default("pending"),
  remittedAt: timestamp("remitted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("twr_merchant_idx").on(t.merchantId),
  index("twr_period_idx").on(t.period),
]);
export type TaxWithholdingRecord = typeof taxWithholdingRecords.$inferSelect;

// ─── Regulatory Sandbox Configs ───────────────────────────────────────────────
export const regulatorySandboxConfigs = pgTable("regulatory_sandbox_configs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  sandboxType: text("sandbox_type").notNull(),
  config: jsonb("config"),
  isActive: integer("is_active").default(1),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("rsc_merchant_idx").on(t.merchantId)]);
export type RegulatorySandboxConfig = typeof regulatorySandboxConfigs.$inferSelect;

// ─── Bulk Payment Schedules ───────────────────────────────────────────────────
export const bulkPaymentSchedules = pgTable("bulk_payment_schedules", {
  scheduleId: text("schedule_id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  scheduleName: text("schedule_name").notNull(),
  recipients: jsonb("recipients").notNull(),
  totalAmountKobo: bigint("total_amount_kobo", { mode: "number" }).notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").default("pending"),
  processedCount: integer("processed_count").default(0),
  failedCount: integer("failed_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("bps_merchant_idx").on(t.merchantId),
  index("bps_status_idx").on(t.status),
  index("bps_scheduled_idx").on(t.scheduledAt),
]);
export type BulkPaymentSchedule = typeof bulkPaymentSchedules.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Wave 77 — New Feature Tables
// ─────────────────────────────────────────────────────────────────────────────

// ─── Digital Gold ─────────────────────────────────────────────────────────────
export const digitalGoldHoldings = pgTable("digital_gold_holdings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  goldGrams: text("gold_grams").notNull().default("0"),
  purchasedGrams: text("purchased_grams").notNull().default("0"),
  avgPurchasePricePerGram: bigint("avg_purchase_price_per_gram", { mode: "number" }).default(0),
  currentPricePerGram: bigint("current_price_per_gram", { mode: "number" }).default(0),
  currentValueKobo: bigint("current_value_kobo", { mode: "number" }).default(0),
  unrealizedPnLKobo: bigint("unrealized_pnl_kobo", { mode: "number" }).default(0),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("dgh_merchant_idx").on(t.merchantId)]);
export type DigitalGoldHolding = typeof digitalGoldHoldings.$inferSelect;

export const digitalGoldTransactions = pgTable("digital_gold_transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  type: text("type").notNull(),
  goldGrams: text("gold_grams").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  pricePerGram: bigint("price_per_gram", { mode: "number" }).notNull(),
  status: text("status").default("completed"),
  reference: text("reference").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("dgt_merchant_idx").on(t.merchantId)]);
export type DigitalGoldTransaction = typeof digitalGoldTransactions.$inferSelect;

export const goldSipPlans = pgTable("gold_sip_plans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  frequency: text("frequency").notNull(),
  status: text("status").default("active"),
  nextRunAt: timestamp("next_run_at"),
  totalInvestedKobo: bigint("total_invested_kobo", { mode: "number" }).default(0),
  totalGoldGrams: text("total_gold_grams").default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("gsp_merchant_idx").on(t.merchantId)]);
export type GoldSipPlan = typeof goldSipPlans.$inferSelect;

// ─── Mutual Funds ─────────────────────────────────────────────────────────────
export const mutualFundHoldings = pgTable("mutual_fund_holdings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  fundId: text("fund_id").notNull(),
  fundName: text("fund_name").notNull(),
  units: text("units").notNull().default("0"),
  avgNavAtPurchase: text("avg_nav_at_purchase").notNull().default("0"),
  currentNav: text("current_nav").default("0"),
  investedAmountKobo: bigint("invested_amount_kobo", { mode: "number" }).default(0),
  currentValueKobo: bigint("current_value_kobo", { mode: "number" }).default(0),
  unrealizedPnLKobo: bigint("unrealized_pnl_kobo", { mode: "number" }).default(0),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("mfh_merchant_idx").on(t.merchantId), index("mfh_fund_idx").on(t.fundId)]);
export type MutualFundHolding = typeof mutualFundHoldings.$inferSelect;

export const mutualFundTransactions = pgTable("mutual_fund_transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  fundId: text("fund_id").notNull(),
  type: text("type").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  units: text("units").notNull(),
  navAtTransaction: text("nav_at_transaction").notNull(),
  status: text("status").default("completed"),
  reference: text("reference").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("mft_merchant_idx").on(t.merchantId)]);
export type MutualFundTransaction = typeof mutualFundTransactions.$inferSelect;

// ─── Consumer Insurance ───────────────────────────────────────────────────────
export const consumerInsurancePolicies = pgTable("consumer_insurance_policies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  customerId: text("customer_id"),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  provider: text("provider").notNull(),
  premiumKobo: bigint("premium_kobo", { mode: "number" }).notNull(),
  coverageKobo: bigint("coverage_kobo", { mode: "number" }).notNull(),
  status: text("status").default("active"),
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("cip_merchant_idx").on(t.merchantId), index("cip_customer_idx").on(t.customerId)]);
export type ConsumerInsurancePolicy = typeof consumerInsurancePolicies.$inferSelect;

export const consumerInsuranceClaims = pgTable("consumer_insurance_claims", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  policyId: text("policy_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  description: text("description").notNull(),
  claimAmountKobo: bigint("claim_amount_kobo", { mode: "number" }).notNull(),
  approvedAmountKobo: bigint("approved_amount_kobo", { mode: "number" }).default(0),
  status: text("status").default("submitted"),
  evidenceUrls: jsonb("evidence_urls"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("cic_policy_idx").on(t.policyId), index("cic_merchant_idx").on(t.merchantId)]);
export type ConsumerInsuranceClaim = typeof consumerInsuranceClaims.$inferSelect;

// ─── Pension / NPS ────────────────────────────────────────────────────────────
export const pensionAccounts = pgTable("pension_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  rsaPin: text("rsa_pin").unique(),
  pfa: text("pfa").notNull().default("PayGate PFA"),
  fundType: text("fund_type").default("fund_ii"),
  balanceKobo: bigint("balance_kobo", { mode: "number" }).default(0),
  employerContributionKobo: bigint("employer_contribution_kobo", { mode: "number" }).default(0),
  employeeContributionKobo: bigint("employee_contribution_kobo", { mode: "number" }).default(0),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("pa_merchant_idx").on(t.merchantId)]);
export type PensionAccount = typeof pensionAccounts.$inferSelect;

export const pensionContributions = pgTable("pension_contributions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pensionAccountId: text("pension_account_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  type: text("type").notNull(),
  status: text("status").default("processed"),
  reference: text("reference").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("pc_account_idx").on(t.pensionAccountId)]);
export type PensionContribution = typeof pensionContributions.$inferSelect;

// ─── Cashback & Rewards ───────────────────────────────────────────────────────
export const cashbackBalances = pgTable("cashback_balances", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull().unique(),
  cashbackBalanceKobo: bigint("cashback_balance_kobo", { mode: "number" }).default(0),
  totalEarnedKobo: bigint("total_earned_kobo", { mode: "number" }).default(0),
  totalRedeemedKobo: bigint("total_redeemed_kobo", { mode: "number" }).default(0),
  pendingKobo: bigint("pending_kobo", { mode: "number" }).default(0),
  tier: text("tier").default("bronze"),
  cashbackRate: text("cashback_rate").default("0.02"),
  maxCashbackKobo: bigint("max_cashback_kobo", { mode: "number" }).default(50000),
  minTransactionKobo: bigint("min_transaction_kobo", { mode: "number" }).default(10000),
  enabled: integer("enabled").default(1),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("cb_merchant_idx").on(t.merchantId)]);
export type CashbackBalance = typeof cashbackBalances.$inferSelect;

export const cashbackTransactions = pgTable("cashback_transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  type: text("type").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  description: text("description"),
  relatedTransactionId: text("related_transaction_id"),
  status: text("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("cbt_merchant_idx").on(t.merchantId)]);
export type CashbackTransaction = typeof cashbackTransactions.$inferSelect;

// ─── Soundbox (Voice Payments) ────────────────────────────────────────────────
export const soundboxDevices = pgTable("soundbox_devices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  deviceId: text("device_id").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").default("online"),
  volume: integer("volume").default(80),
  language: text("language").default("en"),
  customMessage: text("custom_message"),
  lastSeen: timestamp("last_seen").defaultNow(),
  totalTransactions: integer("total_transactions").default(0),
  totalVolumeKobo: bigint("total_volume_kobo", { mode: "number" }).default(0),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("sd_merchant_idx").on(t.merchantId)]);
export type SoundboxDevice = typeof soundboxDevices.$inferSelect;

// ─── Wealth Management ────────────────────────────────────────────────────────
export const wealthRiskProfiles = pgTable("wealth_risk_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull().unique(),
  riskScore: integer("risk_score").default(5),
  riskCategory: text("risk_category").default("moderate"),
  investmentHorizon: text("investment_horizon").default("5-10 years"),
  lastAssessed: timestamp("last_assessed").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("wrp_merchant_idx").on(t.merchantId)]);
export type WealthRiskProfile = typeof wealthRiskProfiles.$inferSelect;

export const wealthGoals = pgTable("wealth_goals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  category: text("category").default("general"),
  targetAmountKobo: bigint("target_amount_kobo", { mode: "number" }).notNull(),
  currentAmountKobo: bigint("current_amount_kobo", { mode: "number" }).default(0),
  deadline: timestamp("deadline"),
  status: text("status").default("active"),
  progressPct: text("progress_pct").default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("wg_merchant_idx").on(t.merchantId)]);
export type WealthGoal = typeof wealthGoals.$inferSelect;

// ─── EMI Checkout ─────────────────────────────────────────────────────────────
export const emiContracts = pgTable("emi_contracts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  customerId: text("customer_id"),
  orderId: text("order_id").notNull(),
  planId: text("plan_id").notNull(),
  tenure: integer("tenure").notNull(),
  principalKobo: bigint("principal_kobo", { mode: "number" }).notNull(),
  interestRate: text("interest_rate").default("0"),
  processingFeeKobo: bigint("processing_fee_kobo", { mode: "number" }).default(0),
  totalAmountKobo: bigint("total_amount_kobo", { mode: "number" }).notNull(),
  monthlyInstallmentKobo: bigint("monthly_installment_kobo", { mode: "number" }).notNull(),
  paidInstallments: integer("paid_installments").default(0),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("ec_merchant_idx").on(t.merchantId), index("ec_order_idx").on(t.orderId)]);
export type EmiContract = typeof emiContracts.$inferSelect;

export const emiInstallments = pgTable("emi_installments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  emiContractId: text("emi_contract_id").notNull(),
  installmentNo: integer("installment_no").notNull(),
  dueDate: timestamp("due_date").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  paidAmountKobo: bigint("paid_amount_kobo", { mode: "number" }).default(0),
  status: text("status").default("pending"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("ei_contract_idx").on(t.emiContractId)]);
export type EmiInstallment = typeof emiInstallments.$inferSelect;

// ─── Bulk Collections ─────────────────────────────────────────────────────────
export const bulkCollections = pgTable("bulk_collections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  status: text("status").default("pending"),
  totalAmountKobo: bigint("total_amount_kobo", { mode: "number" }).default(0),
  count: integer("count").default(0),
  collected: integer("collected").default(0),
  collectedAmountKobo: bigint("collected_amount_kobo", { mode: "number" }).default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("bc_merchant_idx").on(t.merchantId)]);
export type BulkCollection = typeof bulkCollections.$inferSelect;

export const bulkCollectionItems = pgTable("bulk_collection_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  collectionId: text("collection_id").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  status: text("status").default("pending"),
  paymentLinkUrl: text("payment_link_url"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("bci_collection_idx").on(t.collectionId)]);
export type BulkCollectionItem = typeof bulkCollectionItems.$inferSelect;

// ─── Salary Accounts ─────────────────────────────────────────────────────────
export const salaryAccounts = pgTable("salary_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  employeeId: text("employee_id").notNull(),
  employeeName: text("employee_name").notNull(),
  employeeEmail: text("employee_email").notNull(),
  accountNumber: text("account_number").unique(),
  bankCode: text("bank_code").default("044"),
  bankName: text("bank_name").default("Access Bank"),
  salaryKobo: bigint("salary_kobo", { mode: "number" }).notNull(),
  balanceKobo: bigint("balance_kobo", { mode: "number" }).default(0),
  advanceUsedKobo: bigint("advance_used_kobo", { mode: "number" }).default(0),
  maxAdvanceKobo: bigint("max_advance_kobo", { mode: "number" }).default(0),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("sa_merchant_idx").on(t.merchantId), index("sa_employee_idx").on(t.employeeId)]);
export type SalaryAccount = typeof salaryAccounts.$inferSelect;

export const salaryTransactions = pgTable("salary_transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  salaryAccountId: text("salary_account_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  type: text("type").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  description: text("description"),
  reference: text("reference").unique(),
  status: text("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("st_account_idx").on(t.salaryAccountId)]);
export type SalaryTransaction = typeof salaryTransactions.$inferSelect;

// ─── Privacy Payments ─────────────────────────────────────────────────────────
export const privacySettings = pgTable("privacy_settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull().unique(),
  privacyMode: text("privacy_mode").default("standard"),
  hideBusinessName: integer("hide_business_name").default(0),
  hideBankDetails: integer("hide_bank_details").default(0),
  usePrivateAlias: integer("use_private_alias").default(0),
  privateAlias: text("private_alias"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("ps_merchant_idx").on(t.merchantId)]);
export type PrivacySettings = typeof privacySettings.$inferSelect;

export const privacyAliases = pgTable("privacy_aliases", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  alias: text("alias").notNull().unique(),
  expiresAt: timestamp("expires_at"),
  status: text("status").default("active"),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("pal_merchant_idx").on(t.merchantId)]);
export type PrivacyAlias = typeof privacyAliases.$inferSelect;

// ─── Reports Center ───────────────────────────────────────────────────────────
export const reportJobs = pgTable("report_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  type: text("type").notNull(),
  format: text("format").notNull(),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  filters: jsonb("filters"),
  status: text("status").default("pending"),
  rowCount: integer("row_count").default(0),
  downloadUrl: text("download_url"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (t) => [index("rj_merchant_idx").on(t.merchantId), index("rj_status_idx").on(t.status)]);
export type ReportJob = typeof reportJobs.$inferSelect;

export const scheduledReports = pgTable("scheduled_reports", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  type: text("type").notNull(),
  frequency: text("frequency").notNull(),
  format: text("format").notNull(),
  email: text("email").notNull(),
  status: text("status").default("active"),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("sr_merchant_idx").on(t.merchantId)]);
export type ScheduledReport = typeof scheduledReports.$inferSelect;

// ─── Nodal Accounts ───────────────────────────────────────────────────────────
export const nodalAccounts = pgTable("nodal_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  accountNumber: text("account_number").unique(),
  bankName: text("bank_name").notNull(),
  bankCode: text("bank_code").notNull(),
  purpose: text("purpose").notNull(),
  description: text("description"),
  balanceKobo: bigint("balance_kobo", { mode: "number" }).default(0),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("na_merchant_idx").on(t.merchantId)]);
export type NodalAccount = typeof nodalAccounts.$inferSelect;

export const nodalTransactions = pgTable("nodal_transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  nodalAccountId: text("nodal_account_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  type: text("type").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  narration: text("narration"),
  counterpartyName: text("counterparty_name"),
  counterpartyAccount: text("counterparty_account"),
  counterpartyBank: text("counterparty_bank"),
  reference: text("reference").unique(),
  status: text("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("nt_account_idx").on(t.nodalAccountId)]);
export type NodalTransaction = typeof nodalTransactions.$inferSelect;

// ─── Smart Retail POS ─────────────────────────────────────────────────────────
export const retailPosConfigs = pgTable("retail_pos_configs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull().unique(),
  storeName: text("store_name").notNull(),
  storeAddress: text("store_address"),
  currency: text("currency").default("NGN"),
  taxRate: text("tax_rate").default("0.075"),
  receiptFooter: text("receipt_footer"),
  enableInventoryAlerts: integer("enable_inventory_alerts").default(1),
  lowStockThreshold: integer("low_stock_threshold").default(10),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("rpc_merchant_idx").on(t.merchantId)]);
export type RetailPosConfig = typeof retailPosConfigs.$inferSelect;

export const retailSales = pgTable("retail_sales", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  customerId: text("customer_id"),
  items: jsonb("items").notNull(),
  subtotalKobo: bigint("subtotal_kobo", { mode: "number" }).notNull(),
  taxKobo: bigint("tax_kobo", { mode: "number" }).default(0),
  totalKobo: bigint("total_kobo", { mode: "number" }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  receiptUrl: text("receipt_url"),
  reference: text("reference").unique(),
  status: text("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("rs_merchant_idx").on(t.merchantId), index("rs_created_idx").on(t.createdAt)]);
export type RetailSale = typeof retailSales.$inferSelect;

// ─── International Remittance ─────────────────────────────────────────────────
export const intlRemittanceTransfers = pgTable("intl_remittance_transfers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  corridorId: text("corridor_id").notNull(),
  sendAmountUSD: text("send_amount_usd").notNull(),
  receiveAmount: text("receive_amount").notNull(),
  receiveCurrency: text("receive_currency").notNull(),
  exchangeRate: text("exchange_rate").notNull(),
  feeUSD: text("fee_usd").notNull(),
  recipientName: text("recipient_name").notNull(),
  recipientAccountNumber: text("recipient_account_number").notNull(),
  recipientBankCode: text("recipient_bank_code").notNull(),
  recipientCountry: text("recipient_country").notNull(),
  purpose: text("purpose"),
  trackingNumber: text("tracking_number").unique(),
  status: text("status").default("processing"),
  provider: text("provider"),
  estimatedDelivery: timestamp("estimated_delivery"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("irt_merchant_idx").on(t.merchantId), index("irt_tracking_idx").on(t.trackingNumber)]);
export type IntlRemittanceTransfer = typeof intlRemittanceTransfers.$inferSelect;

// ─── Subscription Billing V2 ──────────────────────────────────────────────────
export const subscriptionPlansV2 = pgTable("subscription_plans_v2", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  priceKobo: bigint("price_kobo", { mode: "number" }).notNull(),
  currency: text("currency").default("NGN"),
  interval: text("interval").notNull(),
  intervalCount: integer("interval_count").default(1),
  trialDays: integer("trial_days").default(0),
  features: jsonb("features"),
  activeSubscribers: integer("active_subscribers").default(0),
  status: text("status").default("active"),
  stripeProductId: text("stripe_product_id"),
  stripePriceId: text("stripe_price_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("spv2_merchant_idx").on(t.merchantId)]);
export type SubscriptionPlanV2 = typeof subscriptionPlansV2.$inferSelect;

export const subscriptionSubscribers = pgTable("subscription_subscribers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  planId: text("plan_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  customerId: text("customer_id"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  status: text("status").default("active"),
  startDate: timestamp("start_date").defaultNow().notNull(),
  nextBillingDate: timestamp("next_billing_date"),
  cancelledAt: timestamp("cancelled_at"),
  pausedAt: timestamp("paused_at"),
  totalPaidKobo: bigint("total_paid_kobo", { mode: "number" }).default(0),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("ss_plan_idx").on(t.planId), index("ss_merchant_idx").on(t.merchantId)]);
export type SubscriptionSubscriber = typeof subscriptionSubscribers.$inferSelect;

// ─── Portal Subscriptions (Stripe-gated premium plans) ───────────────────────
export const portalSubscriptions = pgTable("portal_subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull().unique(),
  plan: text("plan").default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").default("active"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: integer("cancel_at_period_end").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("psub_merchant_idx").on(t.merchantId)]);
export type PortalSubscription = typeof portalSubscriptions.$inferSelect;


// ─── Wave 80: Open Banking V2 ─────────────────────────────────────────────────
export const openBankingConsentsV2 = pgTable("open_banking_consents_v2", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  bankCode: text("bank_code").notNull(),
  bankName: text("bank_name").notNull(),
  scopes: text("scopes").notNull().default("accounts"),
  status: text("status").notNull().default("pending"),
  consentToken: text("consent_token"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("ob_v2_merchant_idx").on(t.merchantId)]);
export type OpenBankingConsentV2 = typeof openBankingConsentsV2.$inferSelect;

export const openBankingAccountsV2 = pgTable("open_banking_accounts_v2", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  consentId: text("consent_id").notNull(),
  bankCode: text("bank_code").notNull(),
  accountNumber: text("account_number").notNull(),
  accountType: text("account_type").notNull().default("current"),
  currency: text("currency").notNull().default("NGN"),
  balance: integer("balance").notNull().default(0),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("ob_v2_acc_merchant_idx").on(t.merchantId)]);
export type OpenBankingAccountV2 = typeof openBankingAccountsV2.$inferSelect;

// ─── Wave 80: Carbon Credits V2 ──────────────────────────────────────────────
export const carbonCreditsV2 = pgTable("carbon_credits_v2", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  projectName: text("project_name").notNull(),
  projectType: text("project_type").notNull().default("reforestation"),
  country: text("country").notNull().default("NG"),
  vintageYear: integer("vintage_year").notNull().default(2024),
  quantity: integer("quantity").notNull().default(0),
  pricePerTonne: integer("price_per_tonne").notNull().default(0),
  status: text("status").notNull().default("available"),
  certificationBody: text("certification_body").default("Gold Standard"),
  serialNumber: text("serial_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("cc_v2_merchant_idx").on(t.merchantId)]);
export type CarbonCreditV2 = typeof carbonCreditsV2.$inferSelect;

export const carbonCreditTransactionsV2 = pgTable("carbon_credit_transactions_v2", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  creditId: text("credit_id").notNull(),
  type: text("type").notNull().default("purchase"),
  quantity: integer("quantity").notNull().default(0),
  totalAmount: integer("total_amount").notNull().default(0),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("cc_v2_tx_merchant_idx").on(t.merchantId)]);
export type CarbonCreditTransactionV2 = typeof carbonCreditTransactionsV2.$inferSelect;

// ─── Wave 80: Agent Banking V4 ───────────────────────────────────────────────
export const agentBankingV4Agents = pgTable("agent_banking_v4_agents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  agentCode: text("agent_code").notNull().unique(),
  agentName: text("agent_name").notNull(),
  phone: text("phone").notNull(),
  state: text("state").notNull().default("Lagos"),
  lga: text("lga").notNull().default("Ikeja"),
  status: text("status").notNull().default("active"),
  tier: text("tier").notNull().default("standard"),
  floatBalance: integer("float_balance").notNull().default(0),
  dailyLimit: integer("daily_limit").notNull().default(500000),
  totalTransactions: integer("total_transactions").notNull().default(0),
  totalVolume: integer("total_volume").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("ab_v4_merchant_idx").on(t.merchantId)]);
export type AgentBankingV4Agent = typeof agentBankingV4Agents.$inferSelect;

// ─── Wave 80: Super-Agent V2 ─────────────────────────────────────────────────
export const superAgentV2Networks = pgTable("super_agent_v2_networks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  networkName: text("network_name").notNull(),
  totalAgents: integer("total_agents").notNull().default(0),
  activeAgents: integer("active_agents").notNull().default(0),
  totalFloat: integer("total_float").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("sa_v2_merchant_idx").on(t.merchantId)]);
export type SuperAgentV2Network = typeof superAgentV2Networks.$inferSelect;

// ─── Wave 80: Escrow V2 ──────────────────────────────────────────────────────
export const escrowContractsV2 = pgTable("escrow_contracts_v2", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  buyerId: text("buyer_id"),
  sellerId: text("seller_id"),
  title: text("title").notNull(),
  description: text("description"),
  amount: integer("amount").notNull().default(0),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("pending"),
  releaseConditions: text("release_conditions"),
  disputeReason: text("dispute_reason"),
  milestones: text("milestones"),
  expiresAt: timestamp("expires_at"),
  releasedAt: timestamp("released_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("escrow_v2_merchant_idx").on(t.merchantId)]);
export type EscrowContractV2 = typeof escrowContractsV2.$inferSelect;

// ─── Wave 80: Marketplace Pay ────────────────────────────────────────────────
export const marketplaceOrders = pgTable("marketplace_orders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  buyerEmail: text("buyer_email").notNull(),
  sellerMerchantId: text("seller_merchant_id"),
  items: text("items").notNull().default("[]"),
  subtotal: integer("subtotal").notNull().default(0),
  platformFee: integer("platform_fee").notNull().default(0),
  totalAmount: integer("total_amount").notNull().default(0),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("pending"),
  paymentMethod: text("payment_method").default("card"),
  escrowId: text("escrow_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("mp_order_merchant_idx").on(t.merchantId)]);
export type MarketplaceOrder = typeof marketplaceOrders.$inferSelect;

// ─── Wave 80: Loyalty V3 ─────────────────────────────────────────────────────
export const loyaltyV3Programs = pgTable("loyalty_v3_programs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  programName: text("program_name").notNull(),
  pointsPerNaira: integer("points_per_naira").notNull().default(1),
  redemptionRate: integer("redemption_rate").notNull().default(100),
  expiryDays: integer("expiry_days").notNull().default(365),
  tiers: text("tiers").notNull().default("[]"),
  status: text("status").notNull().default("active"),
  totalMembers: integer("total_members").notNull().default(0),
  totalPointsIssued: integer("total_points_issued").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("loyalty_v3_merchant_idx").on(t.merchantId)]);
export type LoyaltyV3Program = typeof loyaltyV3Programs.$inferSelect;

export const loyaltyV3Members = pgTable("loyalty_v3_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  programId: text("program_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  customerId: text("customer_id").notNull(),
  customerEmail: text("customer_email").notNull(),
  pointsBalance: integer("points_balance").notNull().default(0),
  lifetimePoints: integer("lifetime_points").notNull().default(0),
  tier: text("tier").notNull().default("bronze"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (t) => [index("loyalty_v3_member_merchant_idx").on(t.merchantId)]);
export type LoyaltyV3Member = typeof loyaltyV3Members.$inferSelect;

// ─── Wave 80: Crypto Off-Ramp V2 ─────────────────────────────────────────────
export const cryptoOfframpV2Transactions = pgTable("crypto_offramp_v2_transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  cryptoAsset: text("crypto_asset").notNull().default("USDT"),
  cryptoAmount: text("crypto_amount").notNull().default("0"),
  fiatCurrency: text("fiat_currency").notNull().default("NGN"),
  fiatAmount: integer("fiat_amount").notNull().default(0),
  exchangeRate: text("exchange_rate").notNull().default("0"),
  bankCode: text("bank_code"),
  accountNumber: text("account_number"),
  status: text("status").notNull().default("pending"),
  txHash: text("tx_hash"),
  walletAddress: text("wallet_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("crypto_offramp_v2_merchant_idx").on(t.merchantId)]);
export type CryptoOfframpV2Transaction = typeof cryptoOfframpV2Transactions.$inferSelect;

// ─── Wave 80: NFC Tap-to-Pay ─────────────────────────────────────────────────
export const nfcDevices = pgTable("nfc_devices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  deviceId: text("device_id").notNull().unique(),
  deviceName: text("device_name").notNull(),
  deviceType: text("device_type").notNull().default("android"),
  status: text("status").notNull().default("active"),
  lastSeen: timestamp("last_seen"),
  totalTransactions: integer("total_transactions").notNull().default(0),
  totalVolume: integer("total_volume").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("nfc_device_merchant_idx").on(t.merchantId)]);
export type NfcDevice = typeof nfcDevices.$inferSelect;

export const nfcTransactions = pgTable("nfc_transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  deviceId: text("device_id").notNull(),
  amount: integer("amount").notNull().default(0),
  currency: text("currency").notNull().default("NGN"),
  cardScheme: text("card_scheme").notNull().default("mastercard"),
  maskedPan: text("masked_pan"),
  status: text("status").notNull().default("approved"),
  responseCode: text("response_code").default("00"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("nfc_tx_merchant_idx").on(t.merchantId)]);
export type NfcTransaction = typeof nfcTransactions.$inferSelect;

// ─── Wave 80: Invoice Financing V2 ───────────────────────────────────────────
export const invoiceFinancingV2Applications = pgTable("invoice_financing_v2_applications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  invoiceId: text("invoice_id"),
  invoiceAmount: integer("invoice_amount").notNull().default(0),
  requestedAmount: integer("requested_amount").notNull().default(0),
  approvedAmount: integer("approved_amount"),
  interestRate: text("interest_rate").notNull().default("3.5"),
  tenorDays: integer("tenor_days").notNull().default(30),
  status: text("status").notNull().default("pending"),
  disbursedAt: timestamp("disbursed_at"),
  repaidAt: timestamp("repaid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("inv_fin_v2_merchant_idx").on(t.merchantId)]);
export type InvoiceFinancingV2Application = typeof invoiceFinancingV2Applications.$inferSelect;

// ─── Wave 80: Payroll V3 ─────────────────────────────────────────────────────
export const payrollV3Runs = pgTable("payroll_v3_runs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  runName: text("run_name").notNull(),
  period: text("period").notNull(),
  totalEmployees: integer("total_employees").notNull().default(0),
  totalGross: integer("total_gross").notNull().default(0),
  totalDeductions: integer("total_deductions").notNull().default(0),
  totalNet: integer("total_net").notNull().default(0),
  status: text("status").notNull().default("draft"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("payroll_v3_merchant_idx").on(t.merchantId)]);
export type PayrollV3Run = typeof payrollV3Runs.$inferSelect;

export const payrollV3Employees = pgTable("payroll_v3_employees", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  employeeId: text("employee_id").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  department: text("department").notNull().default("General"),
  bankCode: text("bank_code").notNull(),
  accountNumber: text("account_number").notNull(),
  grossSalary: integer("gross_salary").notNull().default(0),
  taxPin: text("tax_pin"),
  pensionPin: text("pension_pin"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("payroll_v3_emp_merchant_idx").on(t.merchantId)]);
export type PayrollV3Employee = typeof payrollV3Employees.$inferSelect;

// ─── Wave 80: Tax Filing ─────────────────────────────────────────────────────
export const taxFilingRecords = pgTable("tax_filing_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  taxType: text("tax_type").notNull().default("VAT"),
  period: text("period").notNull(),
  taxableAmount: integer("taxable_amount").notNull().default(0),
  taxAmount: integer("tax_amount").notNull().default(0),
  status: text("status").notNull().default("draft"),
  filedAt: timestamp("filed_at"),
  receiptNumber: text("receipt_number"),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("tax_filing_merchant_idx").on(t.merchantId)]);
export type TaxFilingRecord = typeof taxFilingRecords.$inferSelect;

// ─── Wave 80: Regulatory Reporting ───────────────────────────────────────────
export const regulatoryReports = pgTable("regulatory_reports", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  reportType: text("report_type").notNull().default("CBN_MONTHLY"),
  period: text("period").notNull(),
  regulator: text("regulator").notNull().default("CBN"),
  status: text("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  reportData: text("report_data"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("reg_report_merchant_idx").on(t.merchantId)]);
export type RegulatoryReport = typeof regulatoryReports.$inferSelect;

// ─── Wave 80: USDC V2 ────────────────────────────────────────────────────────
export const usdcV2Wallets = pgTable("usdc_v2_wallets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull().unique(),
  walletAddress: text("wallet_address").notNull(),
  network: text("network").notNull().default("polygon"),
  balanceUsdc: text("balance_usdc").notNull().default("0"),
  balanceNgn: integer("balance_ngn").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("usdc_v2_wallet_merchant_idx").on(t.merchantId)]);
export type UsdcV2Wallet = typeof usdcV2Wallets.$inferSelect;

export const usdcV2Transactions = pgTable("usdc_v2_transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  type: text("type").notNull().default("receive"),
  amountUsdc: text("amount_usdc").notNull().default("0"),
  amountNgn: integer("amount_ngn"),
  txHash: text("tx_hash"),
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  network: text("network").notNull().default("polygon"),
  status: text("status").notNull().default("confirmed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("usdc_v2_tx_merchant_idx").on(t.merchantId)]);
export type UsdcV2Transaction = typeof usdcV2Transactions.$inferSelect;

// ─── Wave 80: Multi-Currency Ledger ──────────────────────────────────────────
export const multiCurrencyLedgerAccounts = pgTable("multi_currency_ledger_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  currency: text("currency").notNull(),
  balance: integer("balance").notNull().default(0),
  availableBalance: integer("available_balance").notNull().default(0),
  reservedBalance: integer("reserved_balance").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("mcl_merchant_idx").on(t.merchantId)]);
export type MultiCurrencyLedgerAccount = typeof multiCurrencyLedgerAccounts.$inferSelect;

export const multiCurrencyLedgerEntries = pgTable("multi_currency_ledger_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  accountId: text("account_id").notNull(),
  type: text("type").notNull().default("credit"),
  amount: integer("amount").notNull().default(0),
  currency: text("currency").notNull(),
  description: text("description"),
  reference: text("reference"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("mcl_entry_merchant_idx").on(t.merchantId)]);
export type MultiCurrencyLedgerEntry = typeof multiCurrencyLedgerEntries.$inferSelect;

// ─── Wave 80: Realtime Notifications ─────────────────────────────────────────
export const realtimeNotificationPreferences = pgTable("realtime_notification_preferences", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull().unique(),
  webhookEnabled: integer("webhook_enabled").notNull().default(1),
  emailEnabled: integer("email_enabled").notNull().default(1),
  smsEnabled: integer("sms_enabled").notNull().default(0),
  pushEnabled: integer("push_enabled").notNull().default(1),
  inAppEnabled: integer("in_app_enabled").notNull().default(1),
  eventPayment: integer("event_payment").notNull().default(1),
  eventDispute: integer("event_dispute").notNull().default(1),
  eventPayout: integer("event_payout").notNull().default(1),
  eventFraud: integer("event_fraud").notNull().default(1),
  eventKyc: integer("event_kyc").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("rtn_pref_merchant_idx").on(t.merchantId)]);
export type RealtimeNotificationPreference = typeof realtimeNotificationPreferences.$inferSelect;

export const realtimeNotificationHistory = pgTable("realtime_notification_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  channel: text("channel").notNull().default("email"),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  status: text("status").notNull().default("delivered"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("rtn_hist_merchant_idx").on(t.merchantId)]);
export type RealtimeNotificationHistoryRecord = typeof realtimeNotificationHistory.$inferSelect;

// ─── USSD Sessions ────────────────────────────────────────────────────────────
export const ussdStatusEnum = pgEnum("ussd_status", ["active", "completed", "failed", "timeout"]);

export const ussdSessions = pgTable("ussd_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().default("ten_default"),
  sessionId: text("session_id").notNull(),
  msisdn: text("msisdn").notNull(),
  serviceCode: text("service_code").notNull().default("*737*1#"),
  status: ussdStatusEnum("status").notNull().default("active"),
  steps: integer("steps").notNull().default(0),
  lastInput: text("last_input"),
  amountKobo: integer("amount_kobo"),
  currency: text("currency").notNull().default("NGN"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("ussd_merchant_idx").on(t.merchantId),
  index("ussd_session_id_idx").on(t.sessionId),
  index("ussd_msisdn_idx").on(t.msisdn),
]);
export type UssdSession = typeof ussdSessions.$inferSelect;
export type InsertUssdSession = typeof ussdSessions.$inferInsert;

// ─── Consumer Notification Preferences ───────────────────────────────────────
// Per-user, per-category, per-channel toggles for the consumer PWA.
export const consumerNotificationPrefs = pgTable("consumer_notification_prefs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  // Channel toggles
  pushEnabled:    boolean("push_enabled").notNull().default(true),
  inAppEnabled:   boolean("in_app_enabled").notNull().default(true),
  emailEnabled:   boolean("email_enabled").notNull().default(true),
  smsEnabled:     boolean("sms_enabled").notNull().default(false),
  // Category toggles (push)
  pushPayments:   boolean("push_payments").notNull().default(true),
  pushFraud:      boolean("push_fraud").notNull().default(true),
  pushPromotions: boolean("push_promotions").notNull().default(false),
  pushSystem:     boolean("push_system").notNull().default(true),
  pushDisputes:   boolean("push_disputes").notNull().default(true),
  pushLoans:      boolean("push_loans").notNull().default(true),
  // Category toggles (in-app)
  inAppPayments:   boolean("in_app_payments").notNull().default(true),
  inAppFraud:      boolean("in_app_fraud").notNull().default(true),
  inAppPromotions: boolean("in_app_promotions").notNull().default(true),
  inAppSystem:     boolean("in_app_system").notNull().default(true),
  inAppDisputes:   boolean("in_app_disputes").notNull().default(true),
  inAppLoans:      boolean("in_app_loans").notNull().default(true),
  // Category toggles (email)
  emailPayments:   boolean("email_payments").notNull().default(true),
  emailFraud:      boolean("email_fraud").notNull().default(true),
  emailPromotions: boolean("email_promotions").notNull().default(false),
  emailSystem:     boolean("email_system").notNull().default(true),
  emailDisputes:   boolean("email_disputes").notNull().default(true),
  emailLoans:      boolean("email_loans").notNull().default(false),
  // Quiet hours
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
  quietHoursStart:   text("quiet_hours_start").notNull().default("22:00"),
  quietHoursEnd:     text("quiet_hours_end").notNull().default("07:00"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("consumer_notif_pref_user_idx").on(t.userId)]);
export type ConsumerNotificationPrefs = typeof consumerNotificationPrefs.$inferSelect;
export type InsertConsumerNotificationPrefs = typeof consumerNotificationPrefs.$inferInsert;

// ─── Admin Notification Preferences ──────────────────────────────────────────
// Per-admin toggles for system-level alerts and operational notifications.
export const adminNotificationPrefs = pgTable("admin_notification_prefs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  // Channel toggles
  pushEnabled:  boolean("push_enabled").notNull().default(true),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  slackEnabled: boolean("slack_enabled").notNull().default(false),
  // System alert categories
  alertNewMerchant:      boolean("alert_new_merchant").notNull().default(true),
  alertKycSubmission:    boolean("alert_kyc_submission").notNull().default(true),
  alertKycApproval:      boolean("alert_kyc_approval").notNull().default(true),
  alertHighRiskTxn:      boolean("alert_high_risk_txn").notNull().default(true),
  alertFraudEscalation:  boolean("alert_fraud_escalation").notNull().default(true),
  alertDisputeOpened:    boolean("alert_dispute_opened").notNull().default(true),
  alertDisputeEscalated: boolean("alert_dispute_escalated").notNull().default(true),
  alertPayoutApproval:   boolean("alert_payout_approval").notNull().default(true),
  alertSystemError:      boolean("alert_system_error").notNull().default(true),
  alertBridgeDown:       boolean("alert_bridge_down").notNull().default(true),
  alertRateLimit:        boolean("alert_rate_limit").notNull().default(false),
  alertDailyDigest:      boolean("alert_daily_digest").notNull().default(true),
  alertWeeklyReport:     boolean("alert_weekly_report").notNull().default(true),
  // Thresholds
  highRiskScoreThreshold:    integer("high_risk_score_threshold").notNull().default(75),
  largePayoutThresholdKobo:  integer("large_payout_threshold_kobo").notNull().default(1000000000),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("admin_notif_pref_user_idx").on(t.userId)]);
export type AdminNotificationPrefs = typeof adminNotificationPrefs.$inferSelect;
export type InsertAdminNotificationPrefs = typeof adminNotificationPrefs.$inferInsert;
