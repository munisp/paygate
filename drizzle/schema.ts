import {
  pgTable, pgEnum, serial, text, integer, bigint, varchar,
  boolean, timestamp, jsonb, unique, index, uniqueIndex,
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("kyc_tenant_idx").on(t.tenantId),
  index("kyc_merchant_idx").on(t.merchantId),
  index("kyc_status_idx").on(t.status),
]);
export type KycSubmission = typeof kycSubmissions.$inferSelect;
export type InsertKycSubmission = typeof kycSubmissions.$inferInsert;

// ─── BNPL Loans ───────────────────────────────────────────────────────────────
export const bnplStatusEnum = pgEnum("bnpl_status", ["pending", "active", "completed", "defaulted", "cancelled"]);

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("notif_merchant_idx").on(t.merchantId),
  index("notif_merchant_read_idx").on(t.merchantId, t.isRead),
  index("notif_created_idx").on(t.createdAt),
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
