import {
  pgTable, pgEnum, serial, text, integer, bigint,
  boolean, timestamp, jsonb, unique, index,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const merchantStatusEnum = pgEnum("merchant_status", ["pending", "active", "suspended", "closed"]);
export const txStatusEnum = pgEnum("tx_status", ["pending", "processing", "completed", "failed", "reversed"]);
export const txChannelEnum = pgEnum("tx_channel", ["card", "bank_transfer", "mobile_money", "ussd", "qr", "bnpl"]);
export const payoutStatusEnum = pgEnum("payout_status", ["pending", "processing", "completed", "failed", "cancelled"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["open", "under_review", "resolved_merchant", "resolved_customer", "closed"]);
export const cardStatusEnum = pgEnum("card_status", ["active", "frozen", "terminated"]);
export const cardBrandEnum = pgEnum("card_brand", ["visa", "mastercard"]);
export const envEnum = pgEnum("env_type", ["test", "live"]);
export const riskLevelEnum = pgEnum("risk_level", ["low", "medium", "high"]);
export const teamRoleEnum = pgEnum("team_role", ["admin", "developer", "viewer"]);
export const teamStatusEnum = pgEnum("team_status", ["invited", "active", "disabled"]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: text("open_id").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("login_method"),
  role: userRoleEnum("role").default("user").notNull(),
  lastSignedIn: timestamp("last_signed_in"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Merchants ────────────────────────────────────────────────────────────────

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("merchants_owner_idx").on(t.ownerId)]);

export type Merchant = typeof merchants.$inferSelect;
export type InsertMerchant = typeof merchants.$inferInsert;

// ─── Transactions ─────────────────────────────────────────────────────────────

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  reference: text("reference").notNull().unique(),
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
  index("transactions_merchant_idx").on(t.merchantId),
  index("transactions_status_idx").on(t.status),
  index("transactions_created_idx").on(t.createdAt),
]);

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

// ─── Customers ────────────────────────────────────────────────────────────────

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
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
  index("customers_merchant_idx").on(t.merchantId),
  unique("customers_merchant_email_uniq").on(t.merchantId, t.email),
]);

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

// ─── Payouts ──────────────────────────────────────────────────────────────────

export const payouts = pgTable("payouts", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  reference: text("reference").notNull().unique(),
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
}, (t) => [index("payouts_merchant_idx").on(t.merchantId)]);

export type Payout = typeof payouts.$inferSelect;
export type InsertPayout = typeof payouts.$inferInsert;

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
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
}, (t) => [index("api_keys_merchant_idx").on(t.merchantId)]);

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export const webhooks = pgTable("webhooks", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().default([]).notNull(),
  secret: text("secret").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastDeliveredAt: timestamp("last_delivered_at"),
  failureCount: integer("failure_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("webhooks_merchant_idx").on(t.merchantId)]);

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = typeof webhooks.$inferInsert;

// ─── Disputes ─────────────────────────────────────────────────────────────────

export const disputes = pgTable("disputes", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  transactionId: text("transaction_id").references(() => transactions.id),
  reference: text("reference").notNull().unique(),
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
}, (t) => [index("disputes_merchant_idx").on(t.merchantId)]);

export type Dispute = typeof disputes.$inferSelect;
export type InsertDispute = typeof disputes.$inferInsert;

// ─── Virtual Cards ────────────────────────────────────────────────────────────

export const virtualCards = pgTable("virtual_cards", {
  id: text("id").primaryKey(),
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
}, (t) => [index("virtual_cards_merchant_idx").on(t.merchantId)]);

export type VirtualCard = typeof virtualCards.$inferSelect;
export type InsertVirtualCard = typeof virtualCards.$inferInsert;

// ─── Payment Links ────────────────────────────────────────────────────────────

export const paymentLinks = pgTable("payment_links", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  slug: text("slug").notNull().unique(),
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
}, (t) => [index("payment_links_merchant_idx").on(t.merchantId)]);

export type PaymentLink = typeof paymentLinks.$inferSelect;
export type InsertPaymentLink = typeof paymentLinks.$inferInsert;

// ─── Team Members ─────────────────────────────────────────────────────────────

export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
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
  index("team_members_merchant_idx").on(t.merchantId),
  unique("team_members_merchant_email_uniq").on(t.merchantId, t.email),
]);

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

// ─── Webhook Deliveries ───────────────────────────────────────────────────────

export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", ["pending", "success", "failed", "retrying"]);

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: text("id").primaryKey(),
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
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  transactionId: text("transaction_id").references(() => transactions.id),
  customerId: text("customer_id").references(() => customers.id),
  alertType: fraudAlertTypeEnum("alert_type").notNull(),
  riskScore: integer("risk_score").notNull().default(0), // 0-100
  status: fraudAlertStatusEnum("status").default("open").notNull(),
  description: text("description"),
  metadata: jsonb("metadata"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
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
  index("kyc_merchant_idx").on(t.merchantId),
  index("kyc_status_idx").on(t.status),
]);
export type KycSubmission = typeof kycSubmissions.$inferSelect;
export type InsertKycSubmission = typeof kycSubmissions.$inferInsert;

// ─── BNPL Loans ───────────────────────────────────────────────────────────────
export const bnplStatusEnum = pgEnum("bnpl_status", ["pending", "active", "completed", "defaulted", "cancelled"]);

export const bnplLoans = pgTable("bnpl_loans", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  transactionId: text("transaction_id").references(() => transactions.id),
  customerId: text("customer_id").references(() => customers.id),
  principalAmount: bigint("principal_amount", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  installments: integer("installments").notNull().default(3),
  installmentAmount: bigint("installment_amount", { mode: "number" }).notNull(),
  interestRate: integer("interest_rate").notNull().default(0), // basis points
  status: bnplStatusEnum("status").default("pending").notNull(),
  nextPaymentAt: timestamp("next_payment_at"),
  completedAt: timestamp("completed_at"),
  defaultedAt: timestamp("defaulted_at"),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("bnpl_merchant_idx").on(t.merchantId),
  index("bnpl_status_idx").on(t.status),
]);
export type BnplLoan = typeof bnplLoans.$inferSelect;
export type InsertBnplLoan = typeof bnplLoans.$inferInsert;

// ─── Mobile Money Reconciliation ──────────────────────────────────────────────
export const mmReconStatusEnum = pgEnum("mm_recon_status", ["matched", "unmatched", "disputed", "pending"]);

export const mobileMoneyRecon = pgTable("mobile_money_recon", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  transactionId: text("transaction_id").references(() => transactions.id),
  provider: text("provider").notNull(), // MTN, Airtel, Glo, etc.
  providerRef: text("provider_ref").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  status: mmReconStatusEnum("status").default("pending").notNull(),
  reconciledAt: timestamp("reconciled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("mm_recon_merchant_idx").on(t.merchantId),
  index("mm_recon_status_idx").on(t.status),
]);
export type MobileMoneyReconRecord = typeof mobileMoneyRecon.$inferSelect;
export type InsertMobileMoneyReconRecord = typeof mobileMoneyRecon.$inferInsert;

// ─── FX Rates ─────────────────────────────────────────────────────────────────
export const fxRates = pgTable("fx_rates", {
  id: serial("id").primaryKey(),
  baseCurrency: text("base_currency").notNull().default("NGN"),
  targetCurrency: text("target_currency").notNull(),
  rate: text("rate").notNull(), // stored as string to avoid float precision issues
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
  index("wallets_user_idx").on(t.userId),
  index("wallets_merchant_idx").on(t.merchantId),
]);
export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;

// ─── Wallet Transactions ──────────────────────────────────────────────────────
export const walletTransactions = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").references(() => wallets.id).notNull(),
  type: text("type").notNull(),
  amount: text("amount").notNull(),
  currency: text("currency").notNull().default("NGN"),
  balanceBefore: text("balance_before").notNull(),
  balanceAfter: text("balance_after").notNull(),
  description: text("description").notNull(),
  reference: text("reference").notNull().unique(),
  channel: text("channel").notNull(),
  counterpartyId: text("counterparty_id"),
  counterpartyName: text("counterparty_name"),
  status: text("status").notNull().default("completed"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("wallet_tx_wallet_idx").on(t.walletId),
  index("wallet_tx_reference_idx").on(t.reference),
  index("wallet_tx_created_idx").on(t.createdAt),
]);
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = typeof walletTransactions.$inferInsert;

// ─── Cross-Border Transfers ───────────────────────────────────────────────────
export const crossBorderTransfers = pgTable("cross_border_transfers", {
  id: serial("id").primaryKey(),
  merchantId: text("merchant_id").references(() => merchants.id),
  walletId: integer("wallet_id").references(() => wallets.id),
  transferId: text("transfer_id").notNull().unique(),
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
  index("xborder_merchant_idx").on(t.merchantId),
  index("xborder_status_idx").on(t.status),
  index("xborder_rail_idx").on(t.rail),
  index("xborder_created_idx").on(t.createdAt),
]);
export type CrossBorderTransfer = typeof crossBorderTransfers.$inferSelect;
export type InsertCrossBorderTransfer = typeof crossBorderTransfers.$inferInsert;
