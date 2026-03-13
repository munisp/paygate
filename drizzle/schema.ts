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
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("pos_tx_terminal_idx").on(t.terminalId),
  index("pos_tx_merchant_idx").on(t.merchantId),
]);
export type PosTransaction = typeof posTransactions.$inferSelect;
export type InsertPosTransaction = typeof posTransactions.$inferInsert;
