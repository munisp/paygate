import {
  pgTable, pgEnum, serial, text, integer, bigint, varchar,
  boolean, timestamp, jsonb, real, unique, index, uniqueIndex, doublePrecision,
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
  accentColor: text("accent_color").default("#8b5cf6"),
  fontFamily: text("font_family").default("Inter"),
  faviconUrl: text("favicon_url"),
  secondaryColor: text("secondary_color").default("#a78bfa"),
  footerText: text("footer_text"),
  supportEmail: text("support_email"),
  customDomain: text("custom_domain"),
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
  ussdLangPickerEnabled: boolean("ussd_lang_picker_enabled").default(true).notNull(), // show language picker on fresh USSD sessions
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
  // GNN Fraud Scoring (populated for transactions >= 500,000 NGN)
  gnnScore: real("gnn_score"),
  gnnRingDetected: boolean("gnn_ring_detected").default(false).notNull(),
  gnnScoredAt: timestamp("gnn_scored_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  unique("transactions_tenant_ref_uniq").on(t.tenantId, t.reference),
  index("transactions_tenant_idx").on(t.tenantId),
  index("transactions_merchant_idx").on(t.merchantId),
  index("transactions_status_idx").on(t.status),
  index("transactions_created_idx").on(t.createdAt),
  // Composite indexes for paginated list queries (most common access pattern)
  index("transactions_merchant_created_idx").on(t.merchantId, t.createdAt),
  index("transactions_merchant_status_idx").on(t.merchantId, t.status),
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
  planId: text("plan_id").default("starter").notNull(),
  totalTransactions: integer("total_transactions").default(0).notNull(),
  totalSpend: bigint("total_spend", { mode: "number" }).default(0).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("customers_tenant_idx").on(t.tenantId),
  index("customers_merchant_idx").on(t.merchantId),
  unique("customers_tenant_merchant_email_uniq").on(t.tenantId, t.merchantId, t.email),
  index("customers_merchant_created_idx").on(t.merchantId, t.createdAt),
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
  index("payouts_merchant_created_idx").on(t.merchantId, t.createdAt),
  index("payouts_merchant_status_idx").on(t.merchantId, t.status),
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
  index("disputes_merchant_created_idx").on(t.merchantId, t.createdAt),
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
  notes: text("notes"),
  fraudRingId: text("fraud_ring_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("fraud_alerts_tenant_idx").on(t.tenantId),
  index("fraud_alerts_merchant_idx").on(t.merchantId),
  index("fraud_alerts_status_idx").on(t.status),
  index("fraud_alerts_merchant_created_idx").on(t.merchantId, t.createdAt),
  index("fraud_alerts_merchant_status_idx").on(t.merchantId, t.status),
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
  // BVN cross-validation — Wave 171
  bvnNumber: text("bvn_number"),
  bvnMatchScore: real("bvn_match_score"),
  bvnVerifiedAt: timestamp("bvn_verified_at"),
  bvnVerificationStatus: text("bvn_verification_status"), // 'matched'|'mismatch'|'not_found'|'skipped'
  // Document expiry enforcement — Wave 171
  documentExpiryDate: timestamp("document_expiry_date"),
  documentExpired: boolean("document_expired").default(false),
  // Liveness retry throttling — Wave 171
  livenessRetryCount: integer("liveness_retry_count").default(0).notNull(),
  livenessBlockedUntil: timestamp("liveness_blocked_until"),
  // DeepFace: ArcFace selfie-vs-ID face verification — Wave 177
  faceMatchVerified: boolean("face_match_verified"),
  faceMatchScore: real("face_match_score"),
  faceMatchDistance: real("face_match_distance"),
  faceMatchModel: text("face_match_model"),
  faceMatchAt: timestamp("face_match_at"),
  // DeepFace: Age estimation — Wave 179
  estimatedAge: integer("estimated_age"),
  ageEstimationFlag: text("age_estimation_flag"), // 'ok' | 'possible_minor' | 'minor_blocked'
  // DeepFace: pgvector duplicate detection — Wave 178 (embedding stored as JSON array)
  faceEmbedding: jsonb("face_embedding"),
  duplicateCheckAt: timestamp("duplicate_check_at"),
  duplicateFlag: boolean("duplicate_flag").default(false),
  duplicateOfSubmissionId: text("duplicate_of_submission_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("kyc_tenant_idx").on(t.tenantId),
  index("kyc_merchant_idx").on(t.merchantId),
  index("kyc_status_idx").on(t.status),
  index("kyc_liveness_idx").on(t.livenessScore),
  index("kyc_bvn_status_idx").on(t.bvnVerificationStatus),
  index("kyc_face_match_idx").on(t.faceMatchVerified),
  index("kyc_duplicate_idx").on(t.duplicateFlag),
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
  accountId: text("account_id").unique(),  // external account ID used by Rust loyalty-ledger
  programId: text("program_id").default("default"),
  merchantId: text("merchant_id").notNull(),
  customerId: integer("customer_id"),
  pointsBalance: bigint("points_balance", { mode: "number" }).notNull().default(0),
  lifetimePoints: bigint("lifetime_points", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("loyalty_account_merchant_idx").on(t.merchantId),
  index("loyalty_account_customer_idx").on(t.customerId),
  index("loyalty_account_id_idx").on(t.accountId),
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
// ─── Loyalty Ledger (used by Rust loyalty-ledger service) ────────────────────
export const loyaltyLedger = pgTable("loyalty_ledger", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  entryType: text("entry_type").notNull(),  // earn | redeem | expire | adjust
  points: bigint("points", { mode: "number" }).notNull(),
  balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
  description: text("description").notNull().default(""),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("loyalty_ledger_account_idx").on(t.accountId),
  index("loyalty_ledger_account_created_idx").on(t.accountId, t.createdAt),
]);
export type LoyaltyLedgerEntry = typeof loyaltyLedger.$inferSelect;

// ─── Inventory Reservations (used by Rust inventory-engine) ──────────────────
export const inventoryReservations = pgTable("inventory_reservations", {
  reservationId: text("reservation_id").primaryKey(),
  itemId: text("item_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  quantity: bigint("quantity", { mode: "number" }).notNull(),
  orderId: text("order_id"),
  status: text("status").notNull().default("active"),  // active | released | expired
  expiresAt: timestamp("expires_at").notNull(),
  releasedAt: timestamp("released_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("inv_res_item_merchant_idx").on(t.itemId, t.merchantId),
  index("inv_res_status_idx").on(t.status),
  index("inv_res_expires_idx").on(t.expiresAt),
]);
export type InventoryReservation = typeof inventoryReservations.$inferSelect;

// ─── Inventory Audit Log (used by Rust inventory-engine) ─────────────────────
export const inventoryAuditLog = pgTable("inventory_audit_log", {
  id: serial("id").primaryKey(),
  itemId: text("item_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  delta: bigint("delta", { mode: "number" }).notNull(),
  reason: text("reason").notNull(),
  referenceId: text("reference_id"),
  previousStock: bigint("previous_stock", { mode: "number" }).notNull(),
  newStock: bigint("new_stock", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("inv_audit_item_idx").on(t.itemId, t.merchantId),
  index("inv_audit_created_idx").on(t.createdAt),
]);
export type InventoryAuditLog = typeof inventoryAuditLog.$inferSelect;


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
  // KYB renewal reminders (Wave 173)
  expiresAt: timestamp("expires_at"),                    // KYB valid for 2 years by default
  renewalReminderSentAt: timestamp("renewal_reminder_sent_at"), // last reminder sent
  // Geo-velocity check (Wave 173)
  lastKnownIp: text("last_known_ip"),
  lastKnownCountry: text("last_known_country"),
  geoVelocityFlagged: boolean("geo_velocity_flagged").default(false),
  geoVelocityNote: text("geo_velocity_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("kyb_merchant_idx").on(t.merchantId),
  index("kyb_status_idx").on(t.status),
  index("kyb_expires_idx").on(t.expiresAt),
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
  // Digest frequency: 'realtime' | 'hourly' | 'daily' | 'weekly'
  digestFrequency: text("digest_frequency").notNull().default("daily"),
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
  // Digest frequency: 'realtime' | 'daily' | 'weekly' | 'never'
  digestFrequency: text("digest_frequency").notNull().default("weekly"),
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
  // Auth anomaly detection thresholds
  loginAnomalyWindowMinutes: integer("login_anomaly_window_minutes").notNull().default(15),
  loginAnomalyThreshold:     integer("login_anomaly_threshold").notNull().default(5),
  // Notification email override (defaults to SMTP_USER if null)
  notificationEmail: text("notification_email"),
  // Digest frequency: 'realtime' | 'hourly' | 'daily' | 'weekly'
  digestFrequency: text("digest_frequency").notNull().default("daily"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("admin_notif_pref_user_idx").on(t.userId)]);
export type AdminNotificationPrefs = typeof adminNotificationPrefs.$inferSelect;
export type InsertAdminNotificationPrefs = typeof adminNotificationPrefs.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Wave 24 — Production Feature Tables
// ─────────────────────────────────────────────────────────────────────────────

// ── Help Search Analytics ────────────────────────────────────────────────────
export const helpSearchAnalytics = pgTable("help_search_analytics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  query: text("query").notNull(),
  userType: text("user_type").notNull().default("merchant"),
  userId: text("user_id"),
  resultCount: integer("result_count").notNull().default(0),
  clickedSection: text("clicked_section"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("help_search_query_idx").on(t.query),
  index("help_search_user_type_idx").on(t.userType),
  index("help_search_created_idx").on(t.createdAt),
]);
export type HelpSearchAnalytics = typeof helpSearchAnalytics.$inferSelect;

// ── Feature Flags ─────────────────────────────────────────────────────────────
export const featureFlags = pgTable("feature_flags", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(false),
  rolloutPercentage: integer("rollout_percentage").notNull().default(0),
  targetMerchantIds: text("target_merchant_ids"),
  targetUserIds: text("target_user_ids"),
  environment: text("environment").notNull().default("production"),
  category: text("category").notNull().default("feature"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  targetingRules: jsonb("targeting_rules"), // { segments: string[], tiers: string[], countries: string[], customRules: object[] }
  tenantId: text("tenant_id"), // null = global flag; set = per-tenant override
}, (t) => [
  index("feature_flags_key_idx").on(t.key),
  index("feature_flags_enabled_idx").on(t.enabled),
  index("feature_flags_tenant_idx").on(t.tenantId),
]);
export type FeatureFlag = typeof featureFlags.$inferSelect;

// ── Merchant Risk Scores ──────────────────────────────────────────────────────
export const merchantRiskScores = pgTable("merchant_risk_scores", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  overallScore: integer("overall_score").notNull().default(0),
  fraudScore: integer("fraud_score").notNull().default(0),
  chargebackScore: integer("chargeback_score").notNull().default(0),
  kycScore: integer("kyc_score").notNull().default(0),
  transactionScore: integer("transaction_score").notNull().default(0),
  velocityScore: integer("velocity_score").notNull().default(0),
  riskLevel: text("risk_level").notNull().default("low"),
  factors: text("factors"),
  recommendation: text("recommendation"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("merchant_risk_merchant_idx").on(t.merchantId),
  index("merchant_risk_level_idx").on(t.riskLevel),
]);
export type MerchantRiskScore = typeof merchantRiskScores.$inferSelect;

// ── Consumer Spending Budgets ─────────────────────────────────────────────────
export const consumerBudgets = pgTable("consumer_budgets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  limitKobo: integer("limit_kobo").notNull(),
  spentKobo: integer("spent_kobo").notNull().default(0),
  period: text("period").notNull().default("monthly"),
  alertAt: integer("alert_at").notNull().default(80),
  alertSent: boolean("alert_sent").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  resetAt: timestamp("reset_at"),
}, (t) => [
  index("consumer_budgets_user_idx").on(t.userId),
  index("consumer_budgets_category_idx").on(t.category),
]);
export type ConsumerBudget = typeof consumerBudgets.$inferSelect;

// ── Consumer Savings Goals ────────────────────────────────────────────────────
export const consumerSavingsGoals = pgTable("consumer_savings_goals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  targetKobo: integer("target_kobo").notNull(),
  savedKobo: integer("saved_kobo").notNull().default(0),
  autoSaveEnabled: boolean("auto_save_enabled").notNull().default(false),
  autoSaveAmountKobo: integer("auto_save_amount_kobo").notNull().default(0),
  autoSaveFrequency: text("auto_save_frequency").notNull().default("monthly"),
  targetDate: timestamp("target_date"),
  status: text("status").notNull().default("active"),
  emoji: text("emoji").default("🎯"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (t) => [
  index("savings_goals_user_idx").on(t.userId),
  index("savings_goals_status_idx").on(t.status),
]);
export type ConsumerSavingsGoal = typeof consumerSavingsGoals.$inferSelect;

// ── Referral Program ──────────────────────────────────────────────────────────
export const referrals = pgTable("referrals", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  referrerId: integer("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refereeId: integer("referee_id").references(() => users.id, { onDelete: "set null" }),
  referralCode: text("referral_code").notNull().unique(),
  status: text("status").notNull().default("pending"),
  referrerRewardKobo: integer("referrer_reward_kobo").notNull().default(50000),
  refereeRewardKobo: integer("referee_reward_kobo").notNull().default(25000),
  referrerPaid: boolean("referrer_paid").notNull().default(false),
  refereePaid: boolean("referee_paid").notNull().default(false),
  qualificationTxnId: text("qualification_txn_id"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("referrals_referrer_idx").on(t.referrerId),
  index("referrals_code_idx").on(t.referralCode),
  index("referrals_status_idx").on(t.status),
]);
export type Referral = typeof referrals.$inferSelect;

// ── Chargeback Management ─────────────────────────────────────────────────────
export const chargebacks = pgTable("chargebacks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  transactionId: text("transaction_id"),
  stripeChargeId: text("stripe_charge_id"),
  amountKobo: integer("amount_kobo").notNull(),
  currency: text("currency").notNull().default("NGN"),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"),
  dueDate: timestamp("due_date"),
  evidenceSubmitted: boolean("evidence_submitted").notNull().default(false),
  evidenceDeadline: timestamp("evidence_deadline"),
  evidence: text("evidence"),
  evidenceUrl: text("evidence_url"),
  evidenceFileName: text("evidence_file_name"),
  notes: text("notes"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("chargebacks_merchant_idx").on(t.merchantId),
  index("chargebacks_status_idx").on(t.status),
  index("chargebacks_due_date_idx").on(t.dueDate),
]);
export type Chargeback = typeof chargebacks.$inferSelect;

// ── Rate Limit Events ─────────────────────────────────────────────────────────
export const rateLimitEvents = pgTable("rate_limit_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  identifier: text("identifier").notNull(),
  identifierType: text("identifier_type").notNull().default("user"),
  procedure: text("procedure"),
  endpoint: text("endpoint"),
  windowMs: integer("window_ms").notNull(),
  limitVal: integer("limit_val").notNull(),
  count: integer("count").notNull(),
  blocked: boolean("blocked").notNull().default(false),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("rate_limit_identifier_idx").on(t.identifier),
  index("rate_limit_blocked_idx").on(t.blocked),
  index("rate_limit_created_idx").on(t.createdAt),
]);
export type RateLimitEvent = typeof rateLimitEvents.$inferSelect;

// ── Webhook Event Simulator Log ───────────────────────────────────────────────
export const webhookSimulatorLogs = pgTable("webhook_simulator_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  webhookId: text("webhook_id"),
  eventType: text("event_type").notNull(),
  payload: text("payload").notNull(),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  durationMs: integer("duration_ms"),
  success: boolean("success").notNull().default(false),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("webhook_sim_merchant_idx").on(t.merchantId),
  index("webhook_sim_event_type_idx").on(t.eventType),
  index("webhook_sim_created_idx").on(t.createdAt),
]);
export type WebhookSimulatorLog = typeof webhookSimulatorLogs.$inferSelect;

// ── Merchant Status Log ───────────────────────────────────────────────────────
export const merchantStatusLog = pgTable("merchant_status_log", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  action: text("action").notNull(),
  reason: text("reason").notNull(),
  notes: text("notes"),
  performedBy: text("performed_by").notNull(),
  previousStatus: text("previous_status"),
  newStatus: text("new_status"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("merchant_status_log_merchant_idx").on(t.merchantId),
  index("merchant_status_log_action_idx").on(t.action),
  index("merchant_status_log_created_idx").on(t.createdAt),
]);
export type MerchantStatusLog = typeof merchantStatusLog.$inferSelect;

// ── Transaction Receipts ──────────────────────────────────────────────────────
export const transactionReceipts = pgTable("transaction_receipts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  transactionId: text("transaction_id").notNull().unique(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  merchantId: text("merchant_id"),
  receiptNumber: text("receipt_number").notNull().unique(),
  pdfUrl: text("pdf_url"),
  emailSentAt: timestamp("email_sent_at"),
  emailAddress: text("email_address"),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("receipts_txn_idx").on(t.transactionId),
  index("receipts_user_idx").on(t.userId),
  index("receipts_number_idx").on(t.receiptNumber),
]);
export type TransactionReceipt = typeof transactionReceipts.$inferSelect;

// ── Settlement SLA Tracking ───────────────────────────────────────────────────
export const settlementSlaEvents = pgTable("settlement_sla_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  settlementId: text("settlement_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  currency: text("currency").notNull().default("NGN"),
  expectedBy: timestamp("expected_by").notNull(),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull().default("pending"),
  slaBreached: boolean("sla_breached").notNull().default(false),
  breachMinutes: integer("breach_minutes"),
  escalatedAt: timestamp("escalated_at"),
  escalationLevel: integer("escalation_level").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("sla_settlement_idx").on(t.settlementId),
  index("sla_merchant_idx").on(t.merchantId),
  index("sla_status_idx").on(t.status),
  index("sla_breached_idx").on(t.slaBreached),
]);
export type SettlementSlaEvent = typeof settlementSlaEvents.$inferSelect;

// ── Live Chat Support Messages ────────────────────────────────────────────────
export const supportMessages = pgTable("support_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id").notNull(),
  merchantId: text("merchant_id"),
  userId: text("user_id"),
  role: text("role").notNull().default("user"), // "user" | "agent" | "system"
  content: text("content").notNull(),
  status: text("status").notNull().default("sent"), // "sent" | "delivered" | "read"
  metadata: text("metadata"), // JSON: { quickReply, attachment, etc. }
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("support_session_idx").on(t.sessionId),
  index("support_merchant_idx").on(t.merchantId),
  index("support_user_idx").on(t.userId),
  index("support_created_idx").on(t.createdAt),
]);
export type SupportMessage = typeof supportMessages.$inferSelect;

// ── AI Model Registry ─────────────────────────────────────────────────────────
export const aiModelStatusEnum = pgEnum("ai_model_status", ["training", "active", "archived", "failed"]);
export const aiModelTypeEnum = pgEnum("ai_model_type", ["gnn_fraud", "credit_scoring", "anomaly_detection", "churn_prediction", "aml_detection"]);

export const aiModelRegistry = pgTable("ai_model_registry", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  modelType: aiModelTypeEnum("model_type").notNull(),
  version: text("version").notNull(),
  status: aiModelStatusEnum("status").notNull().default("training"),
  accuracy: real("accuracy"),
  precision: real("precision"),
  recall: real("recall"),
  f1Score: real("f1_score"),
  aucRoc: real("auc_roc"),
  featureCount: integer("feature_count"),
  trainingRecords: integer("training_records"),
  artifactPath: text("artifact_path"),
  hyperparameters: text("hyperparameters"),
  trainedBy: text("trained_by"),
  trainedAt: timestamp("trained_at"),
  deployedAt: timestamp("deployed_at"),
  archivedAt: timestamp("archived_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("ai_model_type_idx").on(t.modelType),
  index("ai_model_status_idx").on(t.status),
]);
export type AiModelRegistry = typeof aiModelRegistry.$inferSelect;

// ── AI Decision Audit Trail ───────────────────────────────────────────────────
export const aiDecisionTypeEnum = pgEnum("ai_decision_type", ["APPROVE", "REVIEW", "BLOCK", "FLAG"]);

export const aiAuditTrail = pgTable("ai_audit_trail", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  transactionId: text("transaction_id"),
  merchantId: text("merchant_id"),
  modelId: text("model_id"),
  decision: aiDecisionTypeEnum("decision").notNull(),
  confidence: real("confidence").notNull(),
  riskScore: real("risk_score"),
  features: text("features"),
  explanation: text("explanation"),
  latencyMs: integer("latency_ms"),
  toolsUsed: text("tools_used"),
  artSteps: integer("art_steps"),
  overriddenBy: text("overridden_by"),
  overrideReason: text("override_reason"),
  overriddenAt: timestamp("overridden_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("ai_audit_txn_idx").on(t.transactionId),
  index("ai_audit_merchant_idx").on(t.merchantId),
  index("ai_audit_decision_idx").on(t.decision),
  index("ai_audit_created_idx").on(t.createdAt),
]);
export type AiAuditTrail = typeof aiAuditTrail.$inferSelect;

// ── GNN Training Jobs ─────────────────────────────────────────────────────────
export const gnnJobStatusEnum = pgEnum("gnn_job_status", ["queued", "running", "completed", "failed", "cancelled"]);

export const gnnTrainingJobs = pgTable("gnn_training_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  modelType: aiModelTypeEnum("model_type").notNull().default("gnn_fraud"),
  status: gnnJobStatusEnum("status").notNull().default("queued"),
  epochs: integer("epochs").notNull().default(50),
  hiddenDims: integer("hidden_dims").notNull().default(256),
  learningRate: real("learning_rate").notNull().default(0.001),
  batchSize: integer("batch_size").notNull().default(256),
  currentEpoch: integer("current_epoch").notNull().default(0),
  trainLoss: real("train_loss"),
  valLoss: real("val_loss"),
  bestAccuracy: real("best_accuracy"),
  datasetSize: integer("dataset_size"),
  artifactPath: text("artifact_path"),
  errorMessage: text("error_message"),
  triggeredBy: text("triggered_by"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("gnn_job_status_idx").on(t.status),
  index("gnn_job_created_idx").on(t.createdAt),
]);
export type GnnTrainingJob = typeof gnnTrainingJobs.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// Wave 32 — Missing Tables: Stripe Subscriptions, Invite Codes, Partner Onboarding,
//           Tenant Corridors, Fee Overrides, Usage Metrics, Billing Invoices,
//           Plan Limits, Corridor Daily Stats, SSO Configs, BNPL Repayment Schedules
// ═══════════════════════════════════════════════════════════════════════════════

// ── Stripe Subscriptions (portal plan billing) ────────────────────────────────
export const stripeSubscriptionStatusEnum = pgEnum("stripe_sub_status", [
  "active", "past_due", "canceled", "trialing", "incomplete", "paused",
]);
export const stripeSubscriptions = pgTable("stripe_subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  plan: text("plan").notNull().default("free"),
  status: stripeSubscriptionStatusEnum("status").notNull().default("active"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  trialEnd: timestamp("trial_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("stripe_sub_user_idx").on(t.userId),
  index("stripe_sub_stripe_id_idx").on(t.stripeSubscriptionId),
  index("stripe_sub_status_idx").on(t.status),
]);
export type StripeSubscription = typeof stripeSubscriptions.$inferSelect;

// ── Invite Codes ──────────────────────────────────────────────────────────────
export const inviteCodeTypeEnum = pgEnum("invite_code_type", [
  "merchant", "partner", "admin", "consumer", "team_member",
]);
export const inviteCodes = pgTable("invite_codes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  type: inviteCodeTypeEnum("type").notNull().default("merchant"),
  usesRemaining: integer("uses_remaining").notNull().default(1),
  usesTotal: integer("uses_total").notNull().default(1),
  expiresAt: timestamp("expires_at"),
  createdBy: text("created_by").notNull(),
  tenantId: text("tenant_id"),
  metadata: text("metadata"),
  isRevoked: boolean("is_revoked").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("invite_code_code_idx").on(t.code),
  index("invite_code_type_idx").on(t.type),
  index("invite_code_tenant_idx").on(t.tenantId),
]);
export type InviteCode = typeof inviteCodes.$inferSelect;

// ── Partner Onboarding Sessions ───────────────────────────────────────────────
export const onboardingStepEnum = pgEnum("onboarding_step", [
  "invite_code", "company_info", "branding", "fee_structure", "review", "completed",
]);
export const partnerOnboardingSessions = pgTable("partner_onboarding_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  inviteCode: text("invite_code"),
  userId: text("user_id"),
  currentStep: onboardingStepEnum("current_step").notNull().default("invite_code"),
  companyName: text("company_name"),
  companyEmail: text("company_email"),
  companyPhone: text("company_phone"),
  companyAddress: text("company_address"),
  companyRcNumber: text("company_rc_number"),
  brandingPrimaryColor: text("branding_primary_color").default("#1a56db"),
  brandingSecondaryColor: text("branding_secondary_color").default("#7e3af2"),
  brandingLogoUrl: text("branding_logo_url"),
  brandingFaviconUrl: text("branding_favicon_url"),
  brandingFontFamily: text("branding_font_family").default("Inter"),
  feeStructure: text("fee_structure"),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("partner_onboard_user_idx").on(t.userId),
  index("partner_onboard_step_idx").on(t.currentStep),
]);
export type PartnerOnboardingSession = typeof partnerOnboardingSessions.$inferSelect;

// ── Tenant Corridors ──────────────────────────────────────────────────────────
export const tenantCorridors = pgTable("tenant_corridors", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  sourceCurrency: text("source_currency").notNull(),
  destCurrency: text("dest_currency").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  fxMarkupPct: real("fx_markup_pct").notNull().default(1.5),
  dailyLimitUsd: real("daily_limit_usd").notNull().default(50000),
  minAmountUsd: real("min_amount_usd").notNull().default(1),
  maxAmountUsd: real("max_amount_usd").notNull().default(10000),
  flatFeeUsd: real("flat_fee_usd").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("tenant_corridor_tenant_idx").on(t.tenantId),
  index("tenant_corridor_currencies_idx").on(t.sourceCurrency, t.destCurrency),
]);
export type TenantCorridor = typeof tenantCorridors.$inferSelect;

// ── Tenant Fee Overrides ──────────────────────────────────────────────────────
export const tenantFeeOverrides = pgTable("tenant_fee_overrides", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  transactionType: text("transaction_type").notNull(),
  flatFeeNgn: real("flat_fee_ngn").notNull().default(0),
  percentageFee: real("percentage_fee").notNull().default(1.5),
  capNgn: real("cap_ngn"),
  floorNgn: real("floor_ngn"),
  isActive: boolean("is_active").notNull().default(true),
  effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
  effectiveTo: timestamp("effective_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("tenant_fee_tenant_idx").on(t.tenantId),
  index("tenant_fee_type_idx").on(t.transactionType),
]);
export type TenantFeeOverride = typeof tenantFeeOverrides.$inferSelect;

// ── Tenant Usage Metrics ──────────────────────────────────────────────────────
export const tenantUsageMetrics = pgTable("tenant_usage_metrics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  period: text("period").notNull(),
  apiCalls: integer("api_calls").notNull().default(0),
  txVolume: real("tx_volume").notNull().default(0),
  txCount: integer("tx_count").notNull().default(0),
  storageBytes: integer("storage_bytes").notNull().default(0),
  activeUsers: integer("active_users").notNull().default(0),
  webhookDeliveries: integer("webhook_deliveries").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("tenant_usage_tenant_period_idx").on(t.tenantId, t.period),
]);
export type TenantUsageMetric = typeof tenantUsageMetrics.$inferSelect;

// ── Tenant Billing Invoices ───────────────────────────────────────────────────
export const tenantInvoiceStatusEnum = pgEnum("tenant_invoice_status", [
  "draft", "open", "paid", "void", "uncollectible",
]);
export const tenantBillingInvoices = pgTable("tenant_billing_invoices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  period: text("period").notNull(),
  amountUsd: real("amount_usd").notNull().default(0),
  status: tenantInvoiceStatusEnum("status").notNull().default("open"),
  stripeInvoiceId: text("stripe_invoice_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paidAt: timestamp("paid_at"),
  dueDate: timestamp("due_date"),
  lineItems: text("line_items"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("tenant_invoice_tenant_idx").on(t.tenantId),
  index("tenant_invoice_status_idx").on(t.status),
  index("tenant_invoice_period_idx").on(t.period),
]);
export type TenantBillingInvoice = typeof tenantBillingInvoices.$inferSelect;

// ── Tenant Plan Limits ────────────────────────────────────────────────────────
export const tenantPlanLimits = pgTable("tenant_plan_limits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  plan: text("plan").notNull().unique(),
  maxApiCallsPerMonth: integer("max_api_calls_per_month").notNull().default(10000),
  maxTxVolumeUsdPerMonth: real("max_tx_volume_usd_per_month").notNull().default(100000),
  maxUsers: integer("max_users").notNull().default(5),
  maxCorridors: integer("max_corridors").notNull().default(3),
  maxWebhooks: integer("max_webhooks").notNull().default(5),
  maxApiKeys: integer("max_api_keys").notNull().default(3),
  priceUsdPerMonth: real("price_usd_per_month").notNull().default(0),
  stripePriceId: text("stripe_price_id"),
  features: text("features"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("tenant_plan_limits_plan_idx").on(t.plan),
]);
export type TenantPlanLimit = typeof tenantPlanLimits.$inferSelect;

// ── Tenant Corridor Daily Stats ───────────────────────────────────────────────
export const tenantCorridorDailyStats = pgTable("tenant_corridor_daily_stats", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull(),
  corridorId: text("corridor_id").notNull(),
  date: text("date").notNull(),
  txCount: integer("tx_count").notNull().default(0),
  volumeUsd: real("volume_usd").notNull().default(0),
  feesCollectedUsd: real("fees_collected_usd").notNull().default(0),
  avgFxRate: real("avg_fx_rate"),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("corridor_daily_tenant_idx").on(t.tenantId),
  index("corridor_daily_date_idx").on(t.date),
  index("corridor_daily_corridor_idx").on(t.corridorId),
]);
export type TenantCorridorDailyStat = typeof tenantCorridorDailyStats.$inferSelect;

// ── Tenant SSO Configs ────────────────────────────────────────────────────────
export const ssoProtocolEnum = pgEnum("sso_protocol_enum", ["saml", "oidc", "oauth2"]);
export const tenantSsoConfigs = pgTable("tenant_sso_configs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().unique(),
  protocol: ssoProtocolEnum("protocol").notNull().default("oidc"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  entityId: text("entity_id"),
  ssoUrl: text("sso_url"),
  sloUrl: text("slo_url"),
  certificate: text("certificate"),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  discoveryUrl: text("discovery_url"),
  scopes: text("scopes").default("openid email profile"),
  attributeMapping: text("attribute_mapping"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("tenant_sso_tenant_idx").on(t.tenantId),
]);
export type TenantSsoConfig = typeof tenantSsoConfigs.$inferSelect;

// ── BNPL Repayment Schedules ──────────────────────────────────────────────────
export const bnplRepaymentStatusEnum = pgEnum("bnpl_repayment_status", [
  "pending", "paid", "overdue", "waived", "failed",
]);
export const bnplRepaymentSchedules = pgTable("bnpl_repayment_schedules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bnplLoanId: text("bnpl_loan_id").notNull(),
  userId: text("user_id").notNull(),
  instalmentNumber: integer("instalment_number").notNull(),
  totalInstalments: integer("total_instalments").notNull(),
  principalAmountNgn: real("principal_amount_ngn").notNull(),
  interestAmountNgn: real("interest_amount_ngn").notNull().default(0),
  totalDueNgn: real("total_due_ngn").notNull(),
  dueDate: timestamp("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  paidAmountNgn: real("paid_amount_ngn"),
  status: bnplRepaymentStatusEnum("status").notNull().default("pending"),
  lateFeeNgn: real("late_fee_ngn").notNull().default(0),
  paymentReference: text("payment_reference"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("bnpl_repay_loan_idx").on(t.bnplLoanId),
  index("bnpl_repay_user_idx").on(t.userId),
  index("bnpl_repay_due_idx").on(t.dueDate),
  index("bnpl_repay_status_idx").on(t.status),
]);
export type BnplRepaymentSchedule = typeof bnplRepaymentSchedules.$inferSelect;

// ─── Consumer EMI Loans (Wave 35) ─────────────────────────────────────────────
export const emiLoans = pgTable("emi_loans", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  principalKobo: bigint("principal_kobo", { mode: "number" }).notNull(),
  emiKobo: bigint("emi_kobo", { mode: "number" }).notNull(),
  tenureMonths: integer("tenure_months").notNull(),
  annualRatePct: integer("annual_rate_pct").notNull().default(24),
  purpose: text("purpose").notNull(),
  status: text("status").default("pending_approval"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("emi_loans_user_idx").on(t.userId),
  index("emi_loans_status_idx").on(t.status),
]);
export type EmiLoan = typeof emiLoans.$inferSelect;

export const emiRepayments = pgTable("emi_repayments", {
  id: text("id").primaryKey(),
  loanId: text("loan_id").notNull(),
  userId: integer("user_id").notNull(),
  instalmentNumber: integer("instalment_number").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  paymentReference: text("payment_reference").notNull(),
  status: text("status").default("completed"),
  paidAt: timestamp("paid_at").defaultNow(),
}, (t) => [
  index("emi_repay_loan_idx").on(t.loanId),
  index("emi_repay_user_idx").on(t.userId),
]);
export type EmiRepayment = typeof emiRepayments.$inferSelect;

// ─── Consumer Insurance Claims (Wave 35 — user-facing claims table) ───────────
export const userInsuranceClaims = pgTable("user_insurance_claims", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull(),
  userId: integer("user_id").notNull(),
  claimType: text("claim_type").notNull(),
  description: text("description").notNull(),
  claimAmountKobo: bigint("claim_amount_kobo", { mode: "number" }).notNull(),
  incidentDate: text("incident_date").notNull(),
  status: text("status").default("submitted"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("uic_policy_idx").on(t.policyId),
  index("uic_user_idx").on(t.userId),
]);
export type UserInsuranceClaim = typeof userInsuranceClaims.$inferSelect;

// ─── Claim Documents (Wave 88 — document evidence for insurance claims) ────────
export const claimDocuments = pgTable("claim_documents", {
  id: text("id").primaryKey(),
  claimId: text("claim_id").notNull().references(() => userInsuranceClaims.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull(),
  fileName: text("file_name").notNull(),
  fileKey: text("file_key").notNull(),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
}, (t) => [
  index("claim_docs_claim_idx").on(t.claimId),
  index("claim_docs_user_idx").on(t.userId),
]);
export type ClaimDocument = typeof claimDocuments.$inferSelect;
export type InsertClaimDocument = typeof claimDocuments.$inferInsert;

// ─── Portfolio Rebalancing Orders (Wave 88 — buy/sell orders from rebalancing) ─
export const portfolioRebalancingOrders = pgTable("portfolio_rebalancing_orders", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  assetType: text("asset_type").notNull(), // "gold" | "mutual_fund" | "pension"
  direction: text("direction").notNull(),  // "buy" | "sell"
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  targetAllocationPct: real("target_allocation_pct").notNull(),
  currentAllocationPct: real("current_allocation_pct").notNull(),
  status: text("status").default("pending").notNull(), // pending | processing | completed | failed
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("rebalance_user_idx").on(t.userId),
  index("rebalance_status_idx").on(t.status),
]);
export type PortfolioRebalancingOrder = typeof portfolioRebalancingOrders.$inferSelect;
export type InsertPortfolioRebalancingOrder = typeof portfolioRebalancingOrders.$inferInsert;

// ─── Tenant Corridor Daily Stats (Wave 88 — volume tracking per corridor/day) ──
// Note: tenant_corridor_daily_stats already exists in schema, this is the live stats view
export const corridorLiveStats = pgTable("corridor_live_stats", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  sourceCurrency: text("source_currency").notNull(),
  destinationCurrency: text("destination_currency").notNull(),
  sourceCountry: text("source_country").notNull(),
  destinationCountry: text("destination_country").notNull(),
  txCount: integer("tx_count").default(0).notNull(),
  volumeKobo: bigint("volume_kobo", { mode: "number" }).default(0).notNull(),
  avgFxRate: real("avg_fx_rate"),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
}, (t) => [
  index("corridor_live_tenant_idx").on(t.tenantId),
  index("corridor_live_pair_idx").on(t.sourceCurrency, t.destinationCurrency),
]);
export type CorridorLiveStat = typeof corridorLiveStats.$inferSelect;


// ─── Billing Engine Tables (Wave 115) ─────────────────────────────────────────
// These tables back the real-time billing engine. The Rust billing core reads
// billing_configs via PostgreSQL (cold path) or Redis (hot path).

export const pricingModelEnum = pgEnum("pricing_model", [
  "per_transaction",
  "subscription",
  "hybrid",
]);

export const billingConfigStatusEnum = pgEnum("billing_config_status", [
  "draft",
  "active",
  "superseded",
  "archived",
]);

// billing_configs: one active config per tenant at any time.
// Version history is preserved (active=false rows are audit records).
export const billingConfigs = pgTable("billing_configs", {
  id: text("id").primaryKey(),                                  // UUID
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  status: billingConfigStatusEnum("status").default("draft").notNull(),
  active: boolean("active").default(false).notNull(),
  pricingModel: pricingModelEnum("pricing_model").default("per_transaction").notNull(),
  // Per-transaction pricing
  feeRate: real("fee_rate").default(0.015).notNull(),           // e.g. 0.015 = 1.5%
  feeCapKobo: bigint("fee_cap_kobo", { mode: "number" }).default(200_000).notNull(), // ₦2,000
  feeFloorKobo: bigint("fee_floor_kobo", { mode: "number" }).default(0).notNull(),
  // Profit split
  platformShare: real("platform_share").default(0.65).notNull(),  // 65%
  resellerShare: real("reseller_share").default(0.35).notNull(),   // 35%
  interchangeCostKobo: bigint("interchange_cost_kobo", { mode: "number" }).default(5_000).notNull(), // ₦50
  // Sign-on fee
  signOnFeeKobo: bigint("sign_on_fee_kobo", { mode: "number" }).default(0).notNull(),
  signOnPlatformShare: real("sign_on_platform_share").default(0.70).notNull(),
  // Subscription pricing
  subscriptionFeeKobo: bigint("subscription_fee_kobo", { mode: "number" }).default(0).notNull(),
  subscriptionPlatformShare: real("subscription_platform_share").default(0.65).notNull(),
  // TigerBeetle ledger account IDs
  tbMerchantPayableAccount: text("tb_merchant_payable_account"),
  tbPlatformRevenueAccount: text("tb_platform_revenue_account"),
  tbResellerPayableAccount: text("tb_reseller_payable_account"),
  tbInterchangeCostAccount: text("tb_interchange_cost_account"),
  tbSignOnRevenueAccount: text("tb_sign_on_revenue_account"),
  // Overhead cost caps (for financial model integration)
  monthlyOverheadCapKobo: bigint("monthly_overhead_cap_kobo", { mode: "number" }).default(0),
  // Metadata
  effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
  effectiveTo: timestamp("effective_to"),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("billing_config_tenant_idx").on(t.tenantId),
  index("billing_config_active_idx").on(t.tenantId, t.active),
]);
export type BillingConfig = typeof billingConfigs.$inferSelect;
export type InsertBillingConfig = typeof billingConfigs.$inferInsert;

// billing_audit_log: every change to billing_configs is recorded here.
export const billingAuditLog = pgTable("billing_audit_log", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  billingConfigId: text("billing_config_id").references(() => billingConfigs.id),
  actorId: text("actor_id").notNull(),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),   // "created" | "updated" | "activated" | "archived"
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  reason: text("reason"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("billing_audit_tenant_idx").on(t.tenantId),
  index("billing_audit_actor_idx").on(t.actorId),
  index("billing_audit_config_idx").on(t.billingConfigId),
]);
export type BillingAuditLogEntry = typeof billingAuditLog.$inferSelect;

// overhead_costs: operational cost entries for EBITDA calculation.
export const overheadCostCategoryEnum = pgEnum("overhead_cost_category", [
  "infrastructure",
  "labor",
  "travel",
  "marketing",
  "compliance",
  "support",
  "other",
]);

export const overheadCosts = pgTable("overhead_costs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  category: overheadCostCategoryEnum("category").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  description: text("description").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  recordedBy: text("recorded_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("overhead_tenant_idx").on(t.tenantId),
  index("overhead_period_idx").on(t.tenantId, t.periodStart, t.periodEnd),
  index("overhead_category_idx").on(t.tenantId, t.category),
]);
export type OverheadCost = typeof overheadCosts.$inferSelect;
export type InsertOverheadCost = typeof overheadCosts.$inferInsert;

// billing_events: real-time billing computation results (hot copy from lakehouse).
// The lakehouse is the source of truth; this table holds the last 30 days for fast queries.
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),          // billing_id from Rust engine
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  merchantId: text("merchant_id").notNull(),
  resellerId: text("reseller_id"),
  transactionId: text("transaction_id").notNull().unique(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  grossFeeKobo: bigint("gross_fee_kobo", { mode: "number" }).notNull(),
  platformRevenueKobo: bigint("platform_revenue_kobo", { mode: "number" }).notNull(),
  resellerRevenueKobo: bigint("reseller_revenue_kobo", { mode: "number" }).notNull(),
  interchangeCostKobo: bigint("interchange_cost_kobo", { mode: "number" }).notNull(),
  netPlatformRevenueKobo: bigint("net_platform_revenue_kobo", { mode: "number" }).notNull(),
  pricingModel: pricingModelEnum("pricing_model").notNull(),
  channel: text("channel").notNull(),
  currency: text("currency").default("NGN").notNull(),
  occurredAt: timestamp("occurred_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("billing_event_tenant_idx").on(t.tenantId),
  index("billing_event_merchant_idx").on(t.merchantId),
  index("billing_event_occurred_idx").on(t.tenantId, t.occurredAt),
]);
export type BillingEvent = typeof billingEvents.$inferSelect;

// ─── Wave 122: Fraud Rule Engine ─────────────────────────────────────────────
export const fraudRules = pgTable("fraud_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  conditionTree: text("condition_tree").notNull().default("{}"),
  actions: text("actions").notNull().default("[]"),
  priority: integer("priority").notNull().default(100),
  status: text("status").notNull().default("active"),
  hitCount: integer("hit_count").notNull().default(0),
  lastHitAt: timestamp("last_hit_at"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("fraud_rule_merchant_idx").on(t.merchantId),
  index("fraud_rule_status_idx").on(t.merchantId, t.status),
]);
export type FraudRule = typeof fraudRules.$inferSelect;
export type InsertFraudRule = typeof fraudRules.$inferInsert;

// ─── Wave 122: KYB Documents ─────────────────────────────────────────────────
export const kybDocuments = pgTable("kyb_documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  verificationId: text("verification_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  documentType: text("document_type").notNull(),
  fileName: text("file_name").notNull(),
  fileKey: text("file_key").notNull(),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  status: text("status").notNull().default("pending"),
  reviewNotes: text("review_notes"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("kyb_doc_verification_idx").on(t.verificationId),
  index("kyb_doc_merchant_idx").on(t.merchantId),
]);
export type KYBDocument = typeof kybDocuments.$inferSelect;
export type InsertKYBDocument = typeof kybDocuments.$inferInsert;

// ─── Wave 122: Loyalty V3 Redemptions ────────────────────────────────────────
export const loyaltyV3Redemptions = pgTable("loyalty_v3_redemptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  programId: text("program_id").notNull(),
  memberId: text("member_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  customerId: text("customer_id").notNull(),
  rewardTier: text("reward_tier").notNull(),
  pointsRedeemed: integer("points_redeemed").notNull(),
  pointsBalanceBefore: integer("points_balance_before").notNull(),
  pointsBalanceAfter: integer("points_balance_after").notNull(),
  nairaValue: integer("naira_value").notNull().default(0),
  redemptionCode: text("redemption_code").notNull().unique(),
  pinVerified: boolean("pin_verified").notNull().default(false),
  kafkaEventId: text("kafka_event_id"),
  kafkaEventStatus: text("kafka_event_status").notNull().default("pending"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  confirmedAt: timestamp("confirmed_at"),
  fulfilledAt: timestamp("fulfilled_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("loyalty_v3_redemption_program_idx").on(t.programId),
  index("loyalty_v3_redemption_member_idx").on(t.memberId),
  index("loyalty_v3_redemption_merchant_idx").on(t.merchantId),
]);
export type LoyaltyV3Redemption = typeof loyaltyV3Redemptions.$inferSelect;
export type InsertLoyaltyV3Redemption = typeof loyaltyV3Redemptions.$inferInsert;

// ─── POS Product Catalog ──────────────────────────────────────────────────────
export const posProducts = pgTable("pos_products", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  terminalId: text("terminal_id"),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  priceKobo: integer("price_kobo").notNull(),
  currency: text("currency").notNull().default("NGN"),
  taxPercent: integer("tax_percent").notNull().default(0),
  stockQuantity: integer("stock_quantity"),
  trackInventory: boolean("track_inventory").notNull().default(false),
  imageUrl: text("image_url"),
  barcode: text("barcode"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("pos_products_merchant_idx").on(t.merchantId),
  index("pos_products_sku_merchant_idx").on(t.sku, t.merchantId),
  index("pos_products_category_idx").on(t.category),
  index("pos_products_barcode_idx").on(t.barcode),
]);
export type PosProduct = typeof posProducts.$inferSelect;
export type InsertPosProduct = typeof posProducts.$inferInsert;

// ─── Keycloak Auth Events ─────────────────────────────────────────────────────
// Stores login, logout, and failed-login events forwarded from Keycloak's
// event listener SPI via the /api/internal/keycloak-events webhook endpoint.
// Used for compliance reporting, anomaly detection, and the audit log UI.
export const keycloakEvents = pgTable("keycloak_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),       // LOGIN, LOGOUT, LOGIN_ERROR, etc.
  realmId: text("realm_id"),
  clientId: text("client_id"),
  userId: text("user_id"),                        // Keycloak user UUID (sub)
  sessionId: text("session_id"),
  ipAddress: text("ip_address"),
  geoCountry: text("geo_country"),               // enriched from IP via ip-api.com
  geoCity: text("geo_city"),                     // enriched from IP via ip-api.com
  geoAnomalyAcknowledged: boolean("geo_anomaly_acknowledged").default(false), // admin dismissed this new-country alert
  error: text("error"),                           // populated for *_ERROR events
  details: jsonb("details"),                      // raw Keycloak event details object
  receivedAt: timestamp("received_at").defaultNow().notNull(),
}, (t) => [
  index("keycloak_events_type_idx").on(t.eventType),
  index("keycloak_events_user_idx").on(t.userId),
  index("keycloak_events_received_idx").on(t.receivedAt),
]);
export type KeycloakEvent = typeof keycloakEvents.$inferSelect;
export type InsertKeycloakEvent = typeof keycloakEvents.$inferInsert;

// ─── Anomaly Config Audit Log ─────────────────────────────────────────────────
// Records every change to loginAnomalyWindowMinutes / loginAnomalyThreshold.
// Tracks who changed it, old value, new value, and whether it was a global change.
export const anomalyConfigAudit = pgTable("anomaly_config_audit", {
  id: serial("id").primaryKey(),
  changedByUserId: integer("changed_by_user_id").notNull(), // portal user id (0 = global)
  isGlobal: boolean("is_global").default(false).notNull(),
  oldWindowMinutes: integer("old_window_minutes"),
  oldThreshold: integer("old_threshold"),
  newWindowMinutes: integer("new_window_minutes").notNull(),
  newThreshold: integer("new_threshold").notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
}, (t) => [
  index("anomaly_config_audit_user_idx").on(t.changedByUserId),
  index("anomaly_config_audit_changed_at_idx").on(t.changedAt),
]);
export type AnomalyConfigAudit = typeof anomalyConfigAudit.$inferSelect;
export type InsertAnomalyConfigAudit = typeof anomalyConfigAudit.$inferInsert;

// ─── FX Alerts ────────────────────────────────────────────────────────────────
// Stores merchant-configured FX rate alert thresholds.
export const fxAlerts = pgTable("fx_alerts", {
  id: serial("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  pair: text("pair").notNull(),
  direction: text("direction", { enum: ["above", "below"] }).notNull(),
  threshold: real("threshold").notNull(),
  active: boolean("active").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("fx_alerts_merchant_idx").on(t.merchantId),
  index("fx_alerts_active_idx").on(t.active),
]);
export type FxAlert = typeof fxAlerts.$inferSelect;
export type InsertFxAlert = typeof fxAlerts.$inferInsert;

// ─── Liveness Sessions (Replay Viewer) ───────────────────────────────────────
// Stores per-session liveness check results for admin replay and audit.
export const livenessDecisionEnum = pgEnum("liveness_decision", ["real", "spoof", "uncertain"]);
export const livenessSessions = pgTable("liveness_sessions", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
  submissionId: text("submission_id").references(() => kycSubmissions.id, { onDelete: "set null" }),
  sessionRef: text("session_ref"),
  mode: text("mode", { enum: ["passive", "active", "full"] }).default("passive").notNull(),
  challengeType: text("challenge_type"),
  decision: livenessDecisionEnum("decision"),
  livenessScore: real("liveness_score"),
  confidenceScore: real("confidence_score"),
  spoofType: text("spoof_type"),
  rustSignalScore: real("rust_signal_score"),
  goGatewayScore: real("go_gateway_score"),
  pythonMlScore: real("python_ml_score"),
  ensembleWeights: jsonb("ensemble_weights"),
  frameCount: integer("frame_count").default(0).notNull(),
  passiveFrameUrl: text("passive_frame_url"),
  challengeFrameUrls: jsonb("challenge_frame_urls"),
  overrideDecision: livenessDecisionEnum("override_decision"),
  overrideNote: text("override_note"),
  overrideBy: text("override_by"),
  overrideAt: timestamp("override_at"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceType: text("device_type"),
  durationMs: integer("duration_ms"),
  // NDPR biometric data retention (Wave 173)
  retentionExpiresAt: timestamp("retention_expires_at"),  // 90 days from createdAt by default
  ndprPurgedAt: timestamp("ndpr_purged_at"),              // set when S3 frames are deleted
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("liveness_sessions_merchant_idx").on(t.merchantId),
  index("liveness_sessions_submission_idx").on(t.submissionId),
  index("liveness_sessions_decision_idx").on(t.decision),
  index("liveness_sessions_created_idx").on(t.createdAt),
  index("liveness_sessions_retention_idx").on(t.retentionExpiresAt),
]);
export type LivenessSession = typeof livenessSessions.$inferSelect;
export type InsertLivenessSession = typeof livenessSessions.$inferInsert;

// ─── Wave 161: Offline Queue (merchant-side operations queued while offline) ──
export const offlineQueueStatusEnum = pgEnum("offline_queue_status", ["pending", "syncing", "synced", "failed", "cancelled"]);
export const offlineQueuePriorityEnum = pgEnum("offline_queue_priority", ["critical", "high", "normal", "low"]);

export const offlineQueue = pgTable("offline_queue", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  operationType: text("operation_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: offlineQueueStatusEnum("status").default("pending").notNull(),
  priority: offlineQueuePriorityEnum("priority").default("normal").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  nextRetryAt: timestamp("next_retry_at"),
  lastError: text("last_error"),
  syncedAt: timestamp("synced_at"),
  deviceId: text("device_id"),
  networkType: text("network_type"),
  bandwidthKbps: integer("bandwidth_kbps"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("offline_queue_merchant_idx").on(t.merchantId),
  index("offline_queue_status_idx").on(t.status),
  index("offline_queue_priority_idx").on(t.priority),
  index("offline_queue_next_retry_idx").on(t.nextRetryAt),
  index("offline_queue_created_idx").on(t.createdAt),
]);
export type OfflineQueueItem = typeof offlineQueue.$inferSelect;
export type InsertOfflineQueueItem = typeof offlineQueue.$inferInsert;

// ─── Wave 161: Retry Policies ─────────────────────────────────────────────────
export const retryPolicies = pgTable("retry_policies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id"),
  operationType: text("operation_type").notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  initialDelayMs: integer("initial_delay_ms").default(1000).notNull(),
  backoffMultiplier: real("backoff_multiplier").default(2.0).notNull(),
  maxDelayMs: integer("max_delay_ms").default(60000).notNull(),
  retryOnStatuses: jsonb("retry_on_statuses").$type<number[]>().default([500, 502, 503, 504]),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("retry_policies_merchant_idx").on(t.merchantId),
  index("retry_policies_op_idx").on(t.operationType),
]);
export type RetryPolicy = typeof retryPolicies.$inferSelect;
export type InsertRetryPolicy = typeof retryPolicies.$inferInsert;

// ─── Wave 161: Network Quality Events ────────────────────────────────────────
export const networkQualityEvents = pgTable("network_quality_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  deviceId: text("device_id"),
  networkType: text("network_type").notNull(),
  bandwidthKbps: integer("bandwidth_kbps"),
  latencyMs: integer("latency_ms"),
  packetLossPct: real("packet_loss_pct"),
  wsConnected: boolean("ws_connected").default(true).notNull(),
  wsFallbackActive: boolean("ws_fallback_active").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("network_quality_merchant_idx").on(t.merchantId),
  index("network_quality_created_idx").on(t.createdAt),
]);
export type NetworkQualityEvent = typeof networkQualityEvents.$inferSelect;
export type InsertNetworkQualityEvent = typeof networkQualityEvents.$inferInsert;

// ─── Wave 174: UBO (Ultimate Beneficial Owners) Mapping ──────────────────────
export const uboOwners = pgTable("ubo_owners", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  verificationId: text("verification_id").notNull(),   // FK → kyb_verifications
  merchantId: text("merchant_id").notNull(),
  fullName: text("full_name").notNull(),
  bvn: text("bvn"),
  nin: text("nin"),
  ownershipPct: real("ownership_pct").notNull(),        // 0–100
  isPep: boolean("is_pep").default(false).notNull(),    // Politically Exposed Person
  kycStatus: text("kyc_status").default("pending"),     // pending | approved | rejected
  kycSubmissionId: text("kyc_submission_id"),           // FK → kyc_submissions
  adverseMediaFlagged: boolean("adverse_media_flagged").default(false),
  adverseMediaNote: text("adverse_media_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("ubo_verification_idx").on(t.verificationId),
  index("ubo_merchant_idx").on(t.merchantId),
]);
export type UBOOwner = typeof uboOwners.$inferSelect;
export type InsertUBOOwner = typeof uboOwners.$inferInsert;

// ─── Wave 174: Adverse Media Screening ───────────────────────────────────────
export const adverseMediaScreenings = pgTable("adverse_media_screenings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entityType: text("entity_type").notNull(),            // merchant | ubo | director
  entityId: text("entity_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  query: text("query").notNull(),                       // name + country used for search
  provider: text("provider").default("llm_search"),    // llm_search | youverify | manual
  result: text("result"),                               // raw result JSON
  flagged: boolean("flagged").default(false).notNull(),
  flagReason: text("flag_reason"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("adverse_media_entity_idx").on(t.entityType, t.entityId),
  index("adverse_media_merchant_idx").on(t.merchantId),
  index("adverse_media_flagged_idx").on(t.flagged),
]);
export type AdverseMediaScreening = typeof adverseMediaScreenings.$inferSelect;
export type InsertAdverseMediaScreening = typeof adverseMediaScreenings.$inferInsert;

// ─── Wave 174: Temporal Consistency Checks ───────────────────────────────────
export const temporalConsistencyChecks = pgTable("temporal_consistency_checks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  submissionId: text("submission_id").notNull(),        // FK → kyc_submissions
  merchantId: text("merchant_id").notNull(),
  checkType: text("check_type").notNull(),              // doc_expiry | dob_mismatch | address_mismatch | name_mismatch
  fieldA: text("field_a"),                              // value from document
  fieldB: text("field_b"),                              // value from database / BVN
  passed: boolean("passed").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("temporal_submission_idx").on(t.submissionId),
  index("temporal_merchant_idx").on(t.merchantId),
  index("temporal_check_type_idx").on(t.checkType),
]);
export type TemporalConsistencyCheck = typeof temporalConsistencyChecks.$inferSelect;
export type InsertTemporalConsistencyCheck = typeof temporalConsistencyChecks.$inferInsert;

// ─── Wave 174: Automated KYB Risk Scores ─────────────────────────────────────
export const kybRiskScores = pgTable("kyb_risk_scores", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  verificationId: text("verification_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  compositeScore: real("composite_score").notNull(),    // 0–100 (higher = riskier)
  riskBand: text("risk_band").notNull(),                // low | medium | high | critical
  // Sub-scores (0–100 each)
  uboRiskScore: real("ubo_risk_score"),
  adverseMediaScore: real("adverse_media_score"),
  geoVelocityScore: real("geo_velocity_score"),
  documentQualityScore: real("document_quality_score"),
  livenessScore: real("liveness_score"),
  bvnMatchScore: real("bvn_match_score"),
  // Metadata
  scoredAt: timestamp("scored_at").defaultNow().notNull(),
  scoredBy: text("scored_by").default("auto"),          // auto | manual:<userId>
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("kyb_risk_verification_idx").on(t.verificationId),
  index("kyb_risk_merchant_idx").on(t.merchantId),
  index("kyb_risk_band_idx").on(t.riskBand),
]);
export type KYBRiskScore = typeof kybRiskScores.$inferSelect;
export type InsertKYBRiskScore = typeof kybRiskScores.$inferInsert;

// ─── Wave 175: SCUML (Special Control Unit against Money Laundering) Checks ───
export const scumlChecks = pgTable("scuml_checks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  verificationId: text("verification_id"),              // FK → kyb_verifications (optional)
  entityName: text("entity_name").notNull(),
  rcNumber: text("rc_number"),
  checkType: text("check_type").notNull(),              // registration | renewal | amendment
  status: text("status").default("pending"),            // pending | cleared | flagged | error
  scumlRef: text("scuml_ref"),                          // SCUML registration reference number
  flagReason: text("flag_reason"),
  checkedAt: timestamp("checked_at"),
  expiresAt: timestamp("expires_at"),                   // SCUML registration valid for 1 year
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("scuml_merchant_idx").on(t.merchantId),
  index("scuml_status_idx").on(t.status),
  index("scuml_expires_idx").on(t.expiresAt),
]);
export type SCUMLCheck = typeof scumlChecks.$inferSelect;
export type InsertSCUMLCheck = typeof scumlChecks.$inferInsert;

// ─── Wave 175: Accessibility Fallback Sessions ────────────────────────────────
// Tracks when users trigger the accessibility fallback path (manual review)
// instead of automated liveness (e.g., camera unavailable, disability accommodation)
export const accessibilityFallbackSessions = pgTable("accessibility_fallback_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId: text("merchant_id").notNull(),
  submissionId: text("submission_id"),                  // FK → kyc_submissions
  reason: text("reason").notNull(),                     // camera_unavailable | disability | device_unsupported | other
  reviewStatus: text("review_status").default("pending"), // pending | approved | rejected
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("a11y_fallback_merchant_idx").on(t.merchantId),
  index("a11y_fallback_status_idx").on(t.reviewStatus),
]);
export type AccessibilityFallbackSession = typeof accessibilityFallbackSessions.$inferSelect;
export type InsertAccessibilityFallbackSession = typeof accessibilityFallbackSessions.$inferInsert;

// ─── Wave 175: i18n Locale Preferences ───────────────────────────────────────
export const userLocalePreferences = pgTable("user_locale_preferences", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().unique(),
  locale: text("locale").default("en-NG").notNull(),    // BCP-47 locale tag
  currency: text("currency").default("NGN").notNull(),  // ISO-4217
  timezone: text("timezone").default("Africa/Lagos").notNull(),
  dateFormat: text("date_format").default("DD/MM/YYYY").notNull(),
  numberFormat: text("number_format").default("1,234.56").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("locale_user_idx").on(t.userId),
]);
export type UserLocalePreference = typeof userLocalePreferences.$inferSelect;
export type InsertUserLocalePreference = typeof userLocalePreferences.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// NEXTHUB SRBE — Settlement, Reconciliation, and Billing Engine
// ═══════════════════════════════════════════════════════════════════════════════

export const settlementWindows = pgTable("settlement_windows", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  windowType: text("window_type").notNull(),
  status: text("status").notNull().default("OPEN"),
  currency: text("currency").notNull().default("NGN"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  settledAt: timestamp("settled_at"),
  totalTransfers: integer("total_transfers").notNull().default(0),
  totalAmountKobo: bigint("total_amount_kobo", { mode: "number" }).notNull().default(0),
  settlementReportUrl: text("settlement_report_url"),
  railReference: text("rail_reference"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type SettlementWindow = typeof settlementWindows.$inferSelect;
export type InsertSettlementWindow = typeof settlementWindows.$inferInsert;

export const settlementNetPositions = pgTable("settlement_net_positions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  windowId: text("window_id").notNull().references(() => settlementWindows.id),
  dfspId: text("dfsp_id").notNull(),
  dfspName: text("dfsp_name").notNull(),
  currency: text("currency").notNull().default("NGN"),
  netPositionKobo: bigint("net_position_kobo", { mode: "number" }).notNull().default(0),
  totalDebitsKobo: bigint("total_debits_kobo", { mode: "number" }).notNull().default(0),
  totalCreditsKobo: bigint("total_credits_kobo", { mode: "number" }).notNull().default(0),
  transferCount: integer("transfer_count").notNull().default(0),
  tigerBeetleAccountId: text("tigerbeetle_account_id"),
  settlementInstruction: text("settlement_instruction"),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type SettlementNetPosition = typeof settlementNetPositions.$inferSelect;

export const nexthubDfsps = pgTable("nexthub_dfsps", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dfspId: text("dfsp_id").notNull().unique(),
  dfspName: text("dfsp_name").notNull(),
  dfspType: text("dfsp_type").notNull().default("bank"),
  country: text("country").notNull().default("NG"),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("ACTIVE"),
  tigerBeetlePositionAccountId: text("tigerbeetle_position_account_id"),
  tigerBeetleLiquidityAccountId: text("tigerbeetle_liquidity_account_id"),
  liquidityLimitKobo: bigint("liquidity_limit_kobo", { mode: "number" }).notNull().default(0),
  callbackUrl: text("callback_url"),
  clientCertificateThumbprint: text("client_certificate_thumbprint"),
  certificateExpiresAt: timestamp("certificate_expires_at"),
  onboardedAt: timestamp("onboarded_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type NexthubDfsp = typeof nexthubDfsps.$inferSelect;
export type InsertNexthubDfsp = typeof nexthubDfsps.$inferInsert;

export const feePostings = pgTable("fee_postings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  transferId: text("transfer_id").notNull(),
  windowId: text("window_id"),
  dfspId: text("dfsp_id").notNull(),
  feeType: text("fee_type").notNull(),
  feeCategory: text("fee_category").notNull().default("DEBIT"),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  billedAt: timestamp("billed_at"),
  invoiceId: text("invoice_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type FeePosting = typeof feePostings.$inferSelect;

export const dfspFeeTiers = pgTable("dfsp_fee_tiers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dfspId: text("dfsp_id").notNull(),
  feeType: text("fee_type").notNull(),
  tierModel: text("tier_model").notNull().default("flat"),
  flatRateBps: integer("flat_rate_bps"),
  minFeeKobo: integer("min_fee_kobo"),
  maxFeeKobo: integer("max_fee_kobo"),
  tierBands: text("tier_bands"),
  volumeDiscountBands: text("volume_discount_bands"),
  effectiveFrom: timestamp("effective_from").notNull().defaultNow(),
  effectiveTo: timestamp("effective_to"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type DfspFeeTier = typeof dfspFeeTiers.$inferSelect;

export const nexthubInvoices = pgTable("nexthub_invoices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  dfspId: text("dfsp_id").notNull(),
  dfspName: text("dfsp_name").notNull(),
  billingPeriodStart: timestamp("billing_period_start").notNull(),
  billingPeriodEnd: timestamp("billing_period_end").notNull(),
  totalSchemeFeesKobo: bigint("total_scheme_fees_kobo", { mode: "number" }).notNull().default(0),
  totalInterchangeKobo: bigint("total_interchange_kobo", { mode: "number" }).notNull().default(0),
  totalFxMarkupKobo: bigint("total_fx_markup_kobo", { mode: "number" }).notNull().default(0),
  totalPenaltiesKobo: bigint("total_penalties_kobo", { mode: "number" }).notNull().default(0),
  totalAmountKobo: bigint("total_amount_kobo", { mode: "number" }).notNull().default(0),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("DRAFT"),
  pdfUrl: text("pdf_url"),
  tigerBeetleInvoiceTransferId: text("tigerbeetle_invoice_transfer_id"),
  issuedAt: timestamp("issued_at"),
  dueAt: timestamp("due_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type NexthubInvoice = typeof nexthubInvoices.$inferSelect;

export const reconciliationExceptions = pgTable("reconciliation_exceptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  windowId: text("window_id").notNull(),
  transferId: text("transfer_id"),
  dfspId: text("dfsp_id"),
  breakType: text("break_type").notNull(),
  severity: text("severity").notNull().default("MEDIUM"),
  status: text("status").notNull().default("OPEN"),
  hubAmountKobo: bigint("hub_amount_kobo", { mode: "number" }),
  railAmountKobo: bigint("rail_amount_kobo", { mode: "number" }),
  discrepancyAmountKobo: bigint("discrepancy_amount_kobo", { mode: "number" }),
  currency: text("currency").notNull().default("NGN"),
  description: text("description"),
  resolutionNotes: text("resolution_notes"),
  autoResolveSlaMinutes: integer("auto_resolve_sla_minutes"),
  resolvedAt: timestamp("resolved_at"),
  escalatedAt: timestamp("escalated_at"),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type ReconciliationException = typeof reconciliationExceptions.$inferSelect;

export const transferDisputes = pgTable("transfer_disputes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  transferId: text("transfer_id").notNull(),
  initiatedByDfspId: text("initiated_by_dfsp_id").notNull(),
  respondingDfspId: text("responding_dfsp_id"),
  disputeType: text("dispute_type").notNull(),
  status: text("status").notNull().default("OPEN"),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  reason: text("reason").notNull(),
  evidence: text("evidence"),
  resolution: text("resolution"),
  resolutionNotes: text("resolution_notes"),
  penaltyAmountKobo: bigint("penalty_amount_kobo", { mode: "number" }).default(0),
  reversalTransferId: text("reversal_transfer_id"),
  tigerBeetlePenaltyTransferId: text("tigerbeetle_penalty_transfer_id"),
  slaDeadline: timestamp("sla_deadline"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type TransferDispute = typeof transferDisputes.$inferSelect;

export const nexthubTransfers = pgTable("nexthub_transfers", {
  id: text("id").primaryKey(),
  payerFspId: text("payer_fsp_id").notNull(),
  payeeFspId: text("payee_fsp_id").notNull(),
  payerPartyId: text("payer_party_id").notNull(),
  payeePartyId: text("payee_party_id").notNull(),
  amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  state: text("state").notNull().default("RECEIVED"),
  ilpPacket: text("ilp_packet"),
  condition: text("condition"),
  fulfilment: text("fulfilment"),
  fraudScore: real("fraud_score"),
  schemeFeeKobo: bigint("scheme_fee_kobo", { mode: "number" }).default(0),
  interchangeFeeKobo: bigint("interchange_fee_kobo", { mode: "number" }).default(0),
  fxRate: real("fx_rate"),
  tigerBeetleTransferId: text("tigerbeetle_transfer_id"),
  tigerBeetleFeeId: text("tigerbeetle_fee_id"),
  windowId: text("window_id"),
  expirationTime: timestamp("expiration_time"),
  errorCode: text("error_code"),
  errorDescription: text("error_description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type NexthubTransfer = typeof nexthubTransfers.$inferSelect;

export const nexthubSecurityEvents = pgTable("nexthub_security_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("MEDIUM"),
  dfspId: text("dfsp_id"),
  sourceIp: text("source_ip"),
  description: text("description").notNull(),
  metadata: text("metadata"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedBy: text("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type NexthubSecurityEvent = typeof nexthubSecurityEvents.$inferSelect;

export const amlRules = pgTable("aml_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ruleName: text("rule_name").notNull().unique(),
  ruleCategory: text("rule_category").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  parameters: text("parameters").notNull(),
  action: text("action").notNull().default("FLAG"),
  effectiveFrom: timestamp("effective_from").notNull().defaultNow(),
  effectiveTo: timestamp("effective_to"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type AmlRule = typeof amlRules.$inferSelect;

// ─── NIP Name Enquiry Cache ────────────────────────────────────────────────────
export const nipNameEnquiryCache = pgTable("nip_name_enquiry_cache", {
  id: serial("id").primaryKey(),
  bankNipCode: text("bank_nip_code").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  bankVerificationNumber: text("bank_verification_number"),
  kycLevel: text("kyc_level"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("nip_name_enquiry_cache_key_idx").on(t.bankNipCode, t.accountNumber),
  index("nip_name_enquiry_cache_expires_idx").on(t.expiresAt),
]);
export type NipNameEnquiryCache = typeof nipNameEnquiryCache.$inferSelect;

// ─── NIP Virtual Accounts ─────────────────────────────────────────────────────
export const nipVirtualAccounts = pgTable("nip_virtual_accounts", {
  id: serial("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  paymentLinkId: text("payment_link_id"),
  checkoutSessionId: text("checkout_session_id"),
  bankNipCode: text("bank_nip_code").notNull(),
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number").notNull(),
  accountName: text("account_name").notNull(),
  amountExpected: integer("amount_expected"),
  currency: text("currency").notNull().default("NGN"),
  reference: text("reference").notNull().unique(),
  status: text("status").notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  paidAmount: integer("paid_amount"),
  nibssReference: text("nibss_reference"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("nip_va_merchant_idx").on(t.merchantId),
  index("nip_va_reference_idx").on(t.reference),
  index("nip_va_status_idx").on(t.status),
  index("nip_va_expires_idx").on(t.expiresAt),
]);
export type NipVirtualAccount = typeof nipVirtualAccounts.$inferSelect;

// ============================================================
// VELOCITY LIMIT CONFIGS — Wave 210
// ============================================================
export const velocityLimitConfigs = pgTable("velocity_limit_configs", {
  id: serial("id").primaryKey(),
  merchantId: varchar("merchant_id", { length: 64 }),
  channel: varchar("channel", { length: 32 }).notNull().default("all"),
  limitType: varchar("limit_type", { length: 16 }).notNull().default("count"), // "count" | "amount"
  maxValue: integer("max_value").notNull(),
  windowSeconds: integer("window_seconds").notNull().default(3600),
  isActive: integer("is_active").notNull().default(1),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("vlc_merchant_channel_idx").on(t.merchantId, t.channel),
  index("vlc_active_idx").on(t.isActive),
]);
export type VelocityLimitConfig = typeof velocityLimitConfigs.$inferSelect;

export const velocityBreaches = pgTable("velocity_breaches", {
  id: serial("id").primaryKey(),
  limitConfigId: integer("limit_config_id").notNull(),
  merchantId: varchar("merchant_id", { length: 64 }).notNull(),
  channel: varchar("channel", { length: 32 }).notNull(),
  amountKobo: integer("amount_kobo").notNull().default(0),
  userId: integer("user_id").notNull().default(0),
  details: text("details"),
  breachedAt: timestamp("breached_at").defaultNow(),
}, (t) => [
  index("vb_merchant_idx").on(t.merchantId),
  index("vb_breached_at_idx").on(t.breachedAt),
]);
export type VelocityBreach = typeof velocityBreaches.$inferSelect;

// ============================================================
// NEXTHUB BULK TRANSFERS — Wave 210
// ============================================================
export const nexthubBulkTransfers = pgTable("nexthub_bulk_transfers", {
  id: serial("id").primaryKey(),
  bulkTransferId: varchar("bulk_transfer_id", { length: 64 }).notNull().unique(),
  bulkQuoteId: varchar("bulk_quote_id", { length: 64 }),
  payerFsp: varchar("payer_fsp", { length: 64 }).notNull(),
  payeeFsp: varchar("payee_fsp", { length: 64 }).notNull(),
  state: varchar("state", { length: 32 }).notNull().default("RECEIVED"),
  totalTransfers: integer("total_transfers").notNull().default(0),
  completedTransfers: integer("completed_transfers").notNull().default(0),
  failedTransfers: integer("failed_transfers").notNull().default(0),
  expiration: timestamp("expiration"),
  completedAt: timestamp("completed_at"),
  errorCode: varchar("error_code", { length: 8 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("nbt_state_idx").on(t.state),
  index("nbt_payer_idx").on(t.payerFsp),
  index("nbt_created_idx").on(t.createdAt),
]);
export type NexhubBulkTransfer = typeof nexthubBulkTransfers.$inferSelect;

// ============================================================
// NEXTHUB ORACLES — Wave 210
// ============================================================
export const nexthubOracles = pgTable("nexthub_oracles", {
  id: serial("id").primaryKey(),
  oracleId: varchar("oracle_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  partyIdType: varchar("party_id_type", { length: 32 }).notNull(), // MSISDN, IBAN, BVN, EMAIL, ALIAS
  currency: varchar("currency", { length: 8 }),
  endpoint: varchar("endpoint", { length: 512 }).notNull(),
  isDefault: integer("is_default").notNull().default(0),
  isActive: integer("is_active").notNull().default(1),
  healthStatus: varchar("health_status", { length: 16 }).notNull().default("UNKNOWN"),
  lastHealthCheck: timestamp("last_health_check"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("no_party_id_type_idx").on(t.partyIdType),
  index("no_active_idx").on(t.isActive),
]);
export type NexhubOracle = typeof nexthubOracles.$inferSelect;

// ============================================================
// NEXTHUB FX RATES — Wave 210
// ============================================================
export const nexthubFxRates = pgTable("nexthub_fx_rates", {
  id: serial("id").primaryKey(),
  sourceCurrency: varchar("source_currency", { length: 8 }).notNull(),
  targetCurrency: varchar("target_currency", { length: 8 }).notNull(),
  rate: varchar("rate", { length: 32 }).notNull(), // stored as string to avoid float precision issues
  provider: varchar("provider", { length: 64 }).notNull().default("nexthub-fx"),
  validFrom: timestamp("valid_from").notNull(),
  validTo: timestamp("valid_to").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("nfr_pair_idx").on(t.sourceCurrency, t.targetCurrency),
  index("nfr_valid_idx").on(t.validFrom, t.validTo),
]);
export type NexhubFxRate = typeof nexthubFxRates.$inferSelect;

// ============================================================
// NEXTHUB PISP CONSENTS — Wave 210
// ============================================================
export const nexthubPispConsents = pgTable("nexthub_pisp_consents", {
  id: serial("id").primaryKey(),
  consentId: varchar("consent_id", { length: 64 }).notNull().unique(),
  consentRequestId: varchar("consent_request_id", { length: 64 }),
  consumerId: varchar("consumer_id", { length: 64 }).notNull().default(""),
  pispId: varchar("pisp_id", { length: 64 }).notNull(),
  dfspId: varchar("dfsp_id", { length: 64 }).notNull(),
  // 'state' is the canonical FSPIOP term; 'status' is kept as alias
  state: varchar("state", { length: 32 }).notNull().default("REQUESTED"), // REQUESTED, GRANTED, ACTIVE, REVOKED, EXPIRED
  scopes: text("scopes").notNull().default("[]"), // JSON array of scope strings
  authChannels: text("auth_channels").default("[]"), // WEB, OTP
  credential: text("credential"), // FIDO2 credential JSON
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  revokeReason: varchar("revoke_reason", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("npc_consumer_idx").on(t.consumerId),
  index("npc_pisp_idx").on(t.pispId),
  index("npc_state_idx").on(t.state),
]);
export type NexhubPispConsent = typeof nexthubPispConsents.$inferSelect;

// ─── Wave 211: Remittance Corridors ──────────────────────────────────────────

export const remittanceCorridors = pgTable("remittance_corridors", {
  id: varchar("id", { length: 64 }).primaryKey(),
  fromCurrency: varchar("from_currency", { length: 8 }).notNull(),
  toCurrency: varchar("to_currency", { length: 8 }).notNull(),
  fromCountry: varchar("from_country", { length: 4 }).notNull(),
  toCountry: varchar("to_country", { length: 4 }).notNull(),
  exchangeRate: doublePrecision("exchange_rate").notNull(),
  fee: doublePrecision("fee").notNull().default(0),
  feeType: varchar("fee_type", { length: 16 }).notNull().default("FLAT"),
  minAmount: doublePrecision("min_amount").notNull().default(100),
  maxAmount: doublePrecision("max_amount").notNull().default(5000000),
  provider: varchar("provider", { length: 64 }).notNull(),
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("rc_from_to_idx").on(t.fromCurrency, t.toCurrency),
  index("rc_active_idx").on(t.isActive),
]);

export const remittanceTransfers = pgTable("remittance_transfers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  corridorId: varchar("corridor_id", { length: 64 }).notNull(),
  senderFsp: varchar("sender_fsp", { length: 64 }).notNull(),
  senderAccount: varchar("sender_account", { length: 64 }).notNull(),
  receiverFsp: varchar("receiver_fsp", { length: 64 }).notNull(),
  receiverAccount: varchar("receiver_account", { length: 64 }).notNull(),
  sendAmount: doublePrecision("send_amount").notNull(),
  sendCurrency: varchar("send_currency", { length: 8 }).notNull(),
  receiveAmount: doublePrecision("receive_amount"),
  receiveCurrency: varchar("receive_currency", { length: 8 }),
  exchangeRate: doublePrecision("exchange_rate"),
  fee: doublePrecision("fee"),
  receiverName: varchar("receiver_name", { length: 128 }).notNull(),
  narration: varchar("narration", { length: 256 }),
  status: varchar("status", { length: 32 }).notNull().default("INITIATED"),
  railRef: varchar("rail_ref", { length: 128 }),
  travelRuleRef: varchar("travel_rule_ref", { length: 128 }),
  riskScore: integer("risk_score"),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  settledAt: timestamp("settled_at"),
}, (t) => [
  index("rt_status_idx").on(t.status),
  index("rt_corridor_idx").on(t.corridorId),
]);

// ─── Wave 212: Healthcare Claims ─────────────────────────────────────────────

export const healthcareClaims = pgTable("healthcare_claims", {
  id: varchar("id", { length: 64 }).primaryKey(),
  policyNumber: varchar("policy_number", { length: 64 }).notNull(),
  beneficiaryId: varchar("beneficiary_id", { length: 64 }).notNull(),
  beneficiaryName: varchar("beneficiary_name", { length: 128 }).notNull(),
  providerId: varchar("provider_id", { length: 64 }).notNull(),
  providerName: varchar("provider_name", { length: 128 }).notNull(),
  claimType: varchar("claim_type", { length: 32 }).notNull(),
  diagnosisCodes: text("diagnosis_codes").notNull().default("[]"),
  procedureCodes: text("procedure_codes").notNull().default("[]"),
  claimAmount: doublePrecision("claim_amount").notNull(),
  approvedAmount: doublePrecision("approved_amount"),
  currency: varchar("currency", { length: 8 }).notNull().default("NGN"),
  serviceDate: varchar("service_date", { length: 16 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("SUBMITTED"),
  nhiaClaimRef: varchar("nhia_claim_ref", { length: 128 }),
  adjudicationNotes: text("adjudication_notes"),
  submittedBy: varchar("submitted_by", { length: 64 }),
  submittedAt: timestamp("submitted_at").defaultNow(),
  adjudicatedAt: timestamp("adjudicated_at"),
  paidAt: timestamp("paid_at"),
}, (t) => [
  index("hc_status_idx").on(t.status),
  index("hc_policy_idx").on(t.policyNumber),
  index("hc_provider_idx").on(t.providerId),
]);

// ─── Wave 213: Insurance Premium Payments ─────────────────────────────────────

export const insurancePremiumPayments = pgTable("insurance_premium_payments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  policyId: varchar("policy_id", { length: 64 }).notNull(),
  policyNumber: varchar("policy_number", { length: 64 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("NGN"),
  dueDate: varchar("due_date", { length: 16 }).notNull(),
  paidAt: timestamp("paid_at"),
  transferRef: varchar("transfer_ref", { length: 128 }),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("ipp_policy_idx").on(t.policyId),
  index("ipp_status_idx").on(t.status),
  index("ipp_due_date_idx").on(t.dueDate),
]);

// ─── Wave 214: Supply Chain Finance ──────────────────────────────────────────

export const scfInvoices = pgTable("scf_invoices", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tokenId: varchar("token_id", { length: 64 }).notNull(),
  invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
  supplierId: varchar("supplier_id", { length: 64 }).notNull(),
  supplierFsp: varchar("supplier_fsp", { length: 64 }).notNull(),
  supplierAccount: varchar("supplier_account", { length: 64 }).notNull(),
  buyerId: varchar("buyer_id", { length: 64 }).notNull(),
  buyerFsp: varchar("buyer_fsp", { length: 64 }).notNull(),
  buyerAccount: varchar("buyer_account", { length: 64 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("NGN"),
  dueDate: varchar("due_date", { length: 16 }).notNull(),
  discountRate: doublePrecision("discount_rate"),
  discountAmount: doublePrecision("discount_amount"),
  netAmount: doublePrecision("net_amount"),
  status: varchar("status", { length: 32 }).notNull().default("SUBMITTED"),
  transferRef: varchar("transfer_ref", { length: 128 }),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  paidAt: timestamp("paid_at"),
}, (t) => [
  index("scf_status_idx").on(t.status),
  index("scf_supplier_idx").on(t.supplierId),
  index("scf_buyer_idx").on(t.buyerId),
]);

// ─── Wave 215: G2P Disbursements ─────────────────────────────────────────────

export const g2pDisbursementBatches = pgTable("g2p_disbursement_batches", {
  id: varchar("id", { length: 64 }).primaryKey(),
  programType: varchar("program_type", { length: 32 }).notNull(),
  programId: varchar("program_id", { length: 64 }).notNull(),
  payerFsp: varchar("payer_fsp", { length: 64 }).notNull(),
  payerAccount: varchar("payer_account", { length: 64 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("NGN"),
  totalAmount: doublePrecision("total_amount").notNull(),
  beneficiaryCount: integer("beneficiary_count").notNull(),
  disbursedCount: integer("disbursed_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("g2p_program_idx").on(t.programType),
  index("g2p_status_idx").on(t.status),
]);

// ─── Wave 216: Energy / VEND ──────────────────────────────────────────────────

export const energyVendTransactions = pgTable("energy_vend_transactions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  meterNumber: varchar("meter_number", { length: 32 }).notNull(),
  disco: varchar("disco", { length: 16 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("NGN"),
  customerPhone: varchar("customer_phone", { length: 32 }).notNull(),
  customerFsp: varchar("customer_fsp", { length: 64 }).notNull(),
  customerAccount: varchar("customer_account", { length: 64 }).notNull(),
  token: varchar("token", { length: 24 }),
  units: doublePrecision("units"),
  transferRef: varchar("transfer_ref", { length: 128 }),
  discoRef: varchar("disco_ref", { length: 128 }),
  status: varchar("status", { length: 32 }).notNull().default("INITIATED"),
  errorCode: varchar("error_code", { length: 64 }),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  vendedAt: timestamp("vended_at"),
}, (t) => [
  index("evt_meter_idx").on(t.meterNumber),
  index("evt_disco_idx").on(t.disco),
  index("evt_status_idx").on(t.status),
]);

// ─── Wave 217: CBDC ───────────────────────────────────────────────────────────

export const cbdcAccounts = pgTable("cbdc_accounts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  rail: varchar("rail", { length: 16 }).notNull(),
  walletId: varchar("wallet_id", { length: 128 }).notNull(),
  ownerId: varchar("owner_id", { length: 64 }).notNull(),
  ownerType: varchar("owner_type", { length: 32 }).notNull(),
  balance: doublePrecision("balance").notNull().default(0),
  currency: varchar("currency", { length: 8 }).notNull(),
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  index("cbdc_acc_rail_idx").on(t.rail),
  index("cbdc_acc_owner_idx").on(t.ownerId),
  index("cbdc_acc_wallet_idx").on(t.walletId),
]);

export const cbdcTransfers = pgTable("cbdc_transfers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  rail: varchar("rail", { length: 16 }).notNull(),
  senderWallet: varchar("sender_wallet", { length: 128 }).notNull(),
  receiverWallet: varchar("receiver_wallet", { length: 128 }).notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: varchar("currency", { length: 8 }).notNull(),
  narration: varchar("narration", { length: 256 }),
  status: varchar("status", { length: 32 }).notNull().default("INITIATED"),
  railRef: varchar("rail_ref", { length: 128 }),
  tigerBeetleRef: varchar("tiger_beetle_ref", { length: 128 }),
  createdBy: varchar("created_by", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  settledAt: timestamp("settled_at"),
}, (t) => [
  index("cbdc_tx_rail_idx").on(t.rail),
  index("cbdc_tx_status_idx").on(t.status),
]);

// ── Wave 220: Participant Limits, Positions, Liquidity Windows ─────────────
export const nexthubParticipants = pgTable("nexthub_participants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  dfspId: text("dfsp_id").notNull().unique(),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("PENDING"),
  schemeType: text("scheme_type").notNull().default("FSPIOP"),
  endpointUrl: text("endpoint_url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const nexthubParticipantLimits = pgTable("nexthub_participant_limits", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  participantId: text("participant_id").notNull(),
  currency: text("currency").notNull().default("NGN"),
  netDebitCap: bigint("net_debit_cap", { mode: "number" }).notNull(),
  liquidityCover: bigint("liquidity_cover", { mode: "number" }).notNull().default(0),
  positionLimit: bigint("position_limit", { mode: "number" }),
  alertThreshold: doublePrecision("alert_threshold").notNull().default(0.8),
  suspendOnBreach: boolean("suspend_on_breach").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: text("updated_by"),
});

export const nexthubParticipantPositions = pgTable("nexthub_participant_positions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  participantId: text("participant_id").notNull(),
  currency: text("currency").notNull().default("NGN"),
  currentValue: bigint("current_value", { mode: "number" }).notNull().default(0),
  reservedValue: bigint("reserved_value", { mode: "number" }).notNull().default(0),
  availableValue: bigint("available_value", { mode: "number" }).notNull().default(0),
  ndcUtilisation: doublePrecision("ndc_utilisation").notNull().default(0),
  positionStatus: text("position_status").notNull().default("OK"),
  lastTransferId: text("last_transfer_id"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const nexthubLiquidityWindows = pgTable("nexthub_liquidity_windows", {
  windowId: text("window_id").primaryKey(),
  participantId: text("participant_id").notNull(),
  currency: text("currency").notNull().default("NGN"),
  amount: bigint("amount", { mode: "number" }).notNull(),
  openedAt: timestamp("opened_at").defaultNow(),
  closesAt: timestamp("closes_at").notNull(),
  status: text("status").notNull().default("OPEN"),
});

// ── Wave 221: Developer API Keys ─────────────────────────────────────────────
export const developerApiKeys = pgTable("developer_api_keys", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  environment: text("environment").notNull().default("test"),
  scopes: text("scopes").notNull().default("[]"),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Wave 221: Developer Webhooks ──────────────────────────────────────────────
export const developerWebhooks = pgTable("developer_webhooks", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  events: text("events").notNull().default("[]"),
  signingSecret: text("signing_secret").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  retryPolicy: text("retry_policy").notNull().default("exponential"),
  maxRetries: integer("max_retries").notNull().default(3),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Wave 221: Developer Webhook Deliveries ────────────────────────────────────
export const developerWebhookDeliveries = pgTable("developer_webhook_deliveries", {
  id: text("id").primaryKey(),
  webhookId: text("webhook_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  eventType: text("event_type").notNull(),
  eventId: text("event_id"),
  payload: text("payload").notNull(),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  durationMs: integer("duration_ms"),
  attempt: integer("attempt").notNull().default(1),
  status: text("status").notNull().default("pending"),
  nextRetryAt: timestamp("next_retry_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Wave 221: Domain Health Snapshots ─────────────────────────────────────────
export const domainHealthSnapshots = pgTable("domain_health_snapshots", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull(),
  tps: doublePrecision("tps").notNull().default(0),
  errorRate: doublePrecision("error_rate").notNull().default(0),
  p50LatencyMs: integer("p50_latency_ms").notNull().default(0),
  p95LatencyMs: integer("p95_latency_ms").notNull().default(0),
  p99LatencyMs: integer("p99_latency_ms").notNull().default(0),
  uptime: doublePrecision("uptime").notNull().default(100),
  activeConnections: integer("active_connections").notNull().default(0),
  queueDepth: integer("queue_depth").notNull().default(0),
  status: text("status").notNull().default("healthy"),
  snapshotAt: timestamp("snapshot_at").defaultNow(),
});

// ── Wave 221: Saga Instances ──────────────────────────────────────────────────
export const sagaInstances = pgTable("saga_instances", {
  id: text("id").primaryKey(),
  sagaType: text("saga_type").notNull(),
  merchantId: text("merchant_id").notNull(),
  status: text("status").notNull().default("running"),
  currentStep: integer("current_step").notNull().default(0),
  totalSteps: integer("total_steps").notNull().default(5),
  steps: jsonb("steps").notNull().default([]),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").default({}),
  // Wave 225 — Temporal wiring
  workflowId: text("workflow_id"),
  runId: text("run_id"),
});

// ── Wave 221: Nexthub Beneficiary Registry ────────────────────────────────────
export const nexthubBeneficiaryRegistry = pgTable("nexthub_beneficiary_registry", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  fullName: text("full_name").notNull(),
  nin: text("nin"),
  bvn: text("bvn"),
  phone: text("phone"),
  email: text("email"),
  bankAccount: text("bank_account"),
  bankCode: text("bank_code"),
  domains: text("domains").notNull().default("[]"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Wave 221: Domain Quotas ───────────────────────────────────────────────────
export const nexthubDomainQuotas = pgTable("nexthub_domain_quotas", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  domain: text("domain").notNull(),
  dailyLimit: integer("daily_limit").notNull().default(10000),
  monthlyLimit: integer("monthly_limit").notNull().default(250000),
  currentDaily: integer("current_daily").notNull().default(0),
  currentMonthly: integer("current_monthly").notNull().default(0),
  rateLimitRpm: integer("rate_limit_rpm").notNull().default(120),
  status: text("status").notNull().default("active"),
  resetAt: timestamp("reset_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Wave 221: Cost Centres ────────────────────────────────────────────────────
export const costCentres = pgTable("cost_centres", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  domain: text("domain"),
  budgetAmount: doublePrecision("budget_amount"),
  spentAmount: doublePrecision("spent_amount").notNull().default(0),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Wave 223: Onboarding & Production-Readiness Tables ───────────────────────

// Settlement Banks registry
export const settlementBanks = pgTable("settlement_banks", {
  id: text("id").primaryKey(),
  bankCode: text("bank_code").notNull().unique(),
  bankName: text("bank_name").notNull(),
  nipCode: text("nip_code"),
  swiftCode: text("swift_code"),
  cbnLicenseNumber: text("cbn_license_number"),
  settlementAccountNumber: text("settlement_account_number"),
  settlementAccountName: text("settlement_account_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  status: text("status").notNull().default("active"),
  isRtgsEnabled: boolean("is_rtgs_enabled").notNull().default(false),
  isNipEnabled: boolean("is_nip_enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Nexthub Regulators (CBN, SEC, NDIC observers)
export const nexthubRegulators = pgTable("nexthub_regulators", {
  id: text("id").primaryKey(),
  regulatorCode: text("regulator_code").notNull().unique(),
  regulatorName: text("regulator_name").notNull(),
  jurisdiction: text("jurisdiction").notNull().default("NG"),
  regulatoryType: text("regulatory_type").notNull().default("central_bank"),
  contactEmail: text("contact_email"),
  reportingFrequency: text("reporting_frequency").notNull().default("daily"),
  dataAccessLevel: text("data_access_level").notNull().default("aggregate"),
  apiEndpoint: text("api_endpoint"),
  webhookUrl: text("webhook_url"),
  status: text("status").notNull().default("active"),
  onboardedAt: timestamp("onboarded_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// DFSP Onboarding Sessions (wizard state)
export const dfspOnboardingSessions = pgTable("dfsp_onboarding_sessions", {
  id: text("id").primaryKey(),
  dfspId: text("dfsp_id"),
  institutionName: text("institution_name").notNull(),
  institutionType: text("institution_type").notNull(),
  cbnLicenseNumber: text("cbn_license_number"),
  cbnLicenseDocUrl: text("cbn_license_doc_url"),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  technicalContactEmail: text("technical_contact_email"),
  fspiopEndpoint: text("fspop_endpoint"),
  tlsCertUrl: text("tls_cert_url"),
  jwksUrl: text("jwks_url"),
  settlementAccountNumber: text("settlement_account_number"),
  settlementBankCode: text("settlement_bank_code"),
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(6),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// PISP Onboarding Sessions
export const pispOnboardingSessions = pgTable("pisp_onboarding_sessions", {
  id: text("id").primaryKey(),
  pispId: text("pisp_id"),
  companyName: text("company_name").notNull(),
  cbnLicenseNumber: text("cbn_license_number"),
  cbnLicenseDocUrl: text("cbn_license_doc_url"),
  contactEmail: text("contact_email").notNull(),
  redirectUrls: text("redirect_urls"),
  webhookUrl: text("webhook_url"),
  consentScopeRequested: text("consent_scope_requested"),
  businessDescription: text("business_description"),
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(5),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// PSP / Acquirer Onboarding Sessions
export const pspOnboardingSessions = pgTable("psp_onboarding_sessions", {
  id: text("id").primaryKey(),
  pspId: text("psp_id"),
  companyName: text("company_name").notNull(),
  pspType: text("psp_type").notNull().default("acquirer"),
  cbnLicenseNumber: text("cbn_license_number"),
  pcidssLevel: text("pcidss_level"),
  pcidssDocUrl: text("pcidss_doc_url"),
  contactEmail: text("contact_email").notNull(),
  settlementBankCode: text("settlement_bank_code"),
  merchantCategoryCodesAllowed: text("merchant_category_codes_allowed"),
  maxTransactionAmount: doublePrecision("max_transaction_amount"),
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(5),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// POS Operator Onboarding Sessions
export const posOperatorOnboardingSessions = pgTable("pos_operator_onboarding_sessions", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id"),
  operatorName: text("operator_name").notNull(),
  ptspCode: text("ptsp_code"),
  terminalCount: integer("terminal_count").notNull().default(1),
  deploymentLocations: text("deployment_locations"),
  nibssApprovalDocUrl: text("nibss_approval_doc_url"),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(4),
  status: text("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Compliance Check Results (for nightly automation job)
export const complianceCheckResults = pgTable("compliance_check_results", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  checkType: text("check_type").notNull(),
  checkName: text("check_name").notNull(),
  score: integer("score").notNull().default(0),
  maxScore: integer("max_score").notNull().default(100),
  status: text("status").notNull().default("pending"),
  findings: text("findings"),
  recommendations: text("recommendations"),
  evaluatedAt: timestamp("evaluated_at").defaultNow(),
  nextEvaluationAt: timestamp("next_evaluation_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id"),
  userId: text("user_id"),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  requestBody: text("request_body"),
  responseStatus: integer("response_status"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const apiRateLimitRules = pgTable("api_rate_limit_rules", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  endpoint: text("endpoint").notNull(),
  limitPerMinute: integer("limit_per_minute").notNull().default(60),
  limitPerHour: integer("limit_per_hour").notNull().default(1000),
  limitPerDay: integer("limit_per_day").notNull().default(10000),
  burstLimit: integer("burst_limit").notNull().default(10),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Wave 225: Regulator Magic-Link Auth ───────────────────────────────────────
export const regulatorMagicTokens = pgTable("regulator_magic_tokens", {
  id: text("id").primaryKey(),
  regulatorId: text("regulator_id").notNull(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const regulatorSessions = pgTable("regulator_sessions", {
  id: text("id").primaryKey(),
  regulatorId: text("regulator_id").notNull(),
  email: text("email").notNull(),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

