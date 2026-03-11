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

