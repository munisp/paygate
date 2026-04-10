// =============================================================================
// PayGate Shared Constants — used by both server and client code
// =============================================================================

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const ONE_DAY_MS = 1000 * 60 * 60 * 24;
export const ONE_HOUR_MS = 1000 * 60 * 60;
export const FIFTEEN_MINUTES_MS = 1000 * 60 * 15;
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// ─── HTTP ─────────────────────────────────────────────────────────────────────
export const AXIOS_TIMEOUT_MS = 30_000;
export const BRIDGE_TIMEOUT_MS = 60_000;
export const LONG_POLL_TIMEOUT_MS = 120_000;

// ─── Error messages ───────────────────────────────────────────────────────────
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
export const NOT_FOUND_ERR_MSG = 'Resource not found (10003)';
export const VALIDATION_ERR_MSG = 'Validation failed (10004)';
export const RATE_LIMIT_ERR_MSG = 'Too many requests (10005)';
export const BRIDGE_ERR_MSG = 'Bridge service unavailable (10006)';
export const PAYMENT_ERR_MSG = 'Payment processing failed (10007)';
export const KYB_REQUIRED_ERR_MSG = 'KYB verification required (10008)';
export const INSUFFICIENT_FUNDS_ERR_MSG = 'Insufficient funds (10009)';
export const DUPLICATE_TXN_ERR_MSG = 'Duplicate transaction (10010)';

// ─── Pagination ───────────────────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE = 1;

// ─── Transaction limits (NGN) ─────────────────────────────────────────────────
export const SINGLE_TXN_LIMIT_NGN = 5_000_000;
export const DAILY_TXN_LIMIT_NGN = 50_000_000;
export const PAYOUT_MIN_NGN = 100;
export const PAYOUT_MAX_NGN = 10_000_000;
export const BULK_PAYMENT_MAX_ROWS = 5_000;
export const MERCHANT_LENDING_MAX_NGN = 50_000_000;
export const BNPL_MAX_TENOR_MONTHS = 24;
export const ESCROW_MAX_HOLD_DAYS = 180;

// ─── Fee rates (basis points) ─────────────────────────────────────────────────
export const STANDARD_FEE_BPS = 150;
export const INTERNATIONAL_FEE_BPS = 350;
export const CRYPTO_RAMP_FEE_BPS = 200;
export const SPLIT_PAYMENT_FEE_BPS = 50;
export const ESCROW_FEE_BPS = 100;
export const REMITTANCE_FEE_BPS = 250;
export const BNPL_ORIGINATION_FEE_BPS = 300;
export const INSURANCE_PREMIUM_RATE_BPS = 50;
export const CARBON_OFFSET_FEE_BPS = 10;

// ─── Tax rates (Nigeria) ──────────────────────────────────────────────────────
export const VAT_RATE = 0.075;
export const WHT_CONTRACTOR_RATE = 0.05;
export const WHT_RENT_RATE = 0.10;
export const WHT_DIVIDEND_RATE = 0.10;
export const WHT_INTEREST_RATE = 0.10;
export const STAMP_DUTY_RATE = 0.001;
export const STAMP_DUTY_THRESHOLD_NGN = 10_000;

// ─── Carbon / ESG ─────────────────────────────────────────────────────────────
export const CARBON_CREDIT_PRICE_USD = 15;
export const CARBON_OFFSET_KG_PER_TXN = 0.05;
export const CARBON_CREDIT_DECIMALS = 6;

// ─── Loyalty ──────────────────────────────────────────────────────────────────
export const LOYALTY_POINTS_PER_NGN = 1;
export const LOYALTY_POINT_VALUE_NGN = 0.01;
export const LOYALTY_TIER_BRONZE_MIN = 0;
export const LOYALTY_TIER_SILVER_MIN = 10_000;
export const LOYALTY_TIER_GOLD_MIN = 50_000;
export const LOYALTY_TIER_PLATINUM_MIN = 200_000;

// ─── Agent Banking ────────────────────────────────────────────────────────────
export const AGENT_FLOAT_MIN_NGN = 10_000;
export const AGENT_FLOAT_MAX_NGN = 5_000_000;
export const AGENT_CASH_IN_FEE_BPS = 100;
export const AGENT_CASH_OUT_FEE_BPS = 150;
export const AGENT_COMMISSION_RATE = 0.30;

// ─── KYB tiers ────────────────────────────────────────────────────────────────
export const KYB_TIER1_LIMIT_NGN = 500_000;
export const KYB_TIER2_LIMIT_NGN = 5_000_000;
export const KYB_TIER3_LIMIT_NGN = 50_000_000;

// ─── Supported currencies ─────────────────────────────────────────────────────
export const SUPPORTED_CURRENCIES = [
  "NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR",
  "XOF", "XAF", "EGP", "UGX", "TZS", "RWF", "ETB",
] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

// ─── Supported payment methods ────────────────────────────────────────────────
export const PAYMENT_METHODS = [
  "card", "bank_transfer", "ussd", "qr", "nfc",
  "mobile_money", "crypto", "bnpl", "wallet",
] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

// ─── Transaction statuses ─────────────────────────────────────────────────────
export const TXN_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  SUCCESS: "success",
  FAILED: "failed",
  REVERSED: "reversed",
  DISPUTED: "disputed",
  EXPIRED: "expired",
} as const;
export type TxnStatus = typeof TXN_STATUS[keyof typeof TXN_STATUS];

// ─── KYB statuses ─────────────────────────────────────────────────────────────
export const KYB_STATUS = {
  NOT_STARTED: "not_started",
  PENDING: "pending",
  UNDER_REVIEW: "under_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  SUSPENDED: "suspended",
} as const;
export type KybStatus = typeof KYB_STATUS[keyof typeof KYB_STATUS];

// ─── Loan statuses ────────────────────────────────────────────────────────────
export const LOAN_STATUS = {
  APPLIED: "applied",
  UNDER_REVIEW: "under_review",
  APPROVED: "approved",
  DISBURSED: "disbursed",
  ACTIVE: "active",
  REPAID: "repaid",
  DEFAULTED: "defaulted",
  WRITTEN_OFF: "written_off",
} as const;
export type LoanStatus = typeof LOAN_STATUS[keyof typeof LOAN_STATUS];

// ─── Payout statuses ──────────────────────────────────────────────────────────
export const PAYOUT_STATUS = {
  QUEUED: "queued",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;
export type PayoutStatus = typeof PAYOUT_STATUS[keyof typeof PAYOUT_STATUS];

// ─── Dispute statuses ─────────────────────────────────────────────────────────
export const DISPUTE_STATUS = {
  OPEN: "open",
  UNDER_REVIEW: "under_review",
  RESOLVED_MERCHANT: "resolved_merchant",
  RESOLVED_CUSTOMER: "resolved_customer",
  ESCALATED: "escalated",
  CLOSED: "closed",
} as const;
export type DisputeStatus = typeof DISPUTE_STATUS[keyof typeof DISPUTE_STATUS];

// ─── Escrow statuses ──────────────────────────────────────────────────────────
export const ESCROW_STATUS = {
  HELD: "held",
  RELEASED: "released",
  DISPUTED: "disputed",
  REFUNDED: "refunded",
  EXPIRED: "expired",
} as const;
export type EscrowStatus = typeof ESCROW_STATUS[keyof typeof ESCROW_STATUS];

// ─── Bulk payment statuses ────────────────────────────────────────────────────
export const BULK_STATUS = {
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  PROCESSING: "processing",
  COMPLETED: "completed",
  PARTIAL: "partial",
  FAILED: "failed",
} as const;
export type BulkStatus = typeof BULK_STATUS[keyof typeof BULK_STATUS];

// ─── Webhook event types ──────────────────────────────────────────────────────
export const WEBHOOK_EVENTS = [
  "payment.success", "payment.failed",
  "payout.completed", "payout.failed",
  "dispute.opened", "dispute.resolved",
  "kyb.approved", "kyb.rejected",
  "loan.disbursed", "loan.repayment", "loan.default",
  "settlement.completed", "refund.completed",
  "subscription.renewed", "subscription.cancelled",
  "agent.transaction", "escrow.released", "bulk.completed",
] as const;
export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

// ─── Roles ────────────────────────────────────────────────────────────────────
export const USER_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  VIEWER: "viewer",
} as const;
export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// ─── Nigerian states ──────────────────────────────────────────────────────────
export const NIGERIAN_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa",
  "Benue","Borno","Cross River","Delta","Ebonyi","Edo",
  "Ekiti","Enugu","FCT","Gombe","Imo","Jigawa",
  "Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara",
  "Lagos","Nasarawa","Niger","Ogun","Ondo","Osun",
  "Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara",
] as const;

// ─── Business categories ──────────────────────────────────────────────────────
export const BUSINESS_CATEGORIES = [
  "retail","ecommerce","hospitality","healthcare","education",
  "logistics","fintech","saas","manufacturing","agriculture",
  "real_estate","media","professional_services","ngo","government",
  "telecoms","energy","insurance","banking","other",
] as const;
export type BusinessCategory = typeof BUSINESS_CATEGORIES[number];

// ─── Feature flags ────────────────────────────────────────────────────────────
export const FEATURE_FLAGS = {
  INSURANCE_ENABLED: true,
  CARBON_CREDITS_ENABLED: true,
  NFT_BADGES_ENABLED: true,
  BNPL_V2_ENABLED: true,
  CRYPTO_RAMP_ENABLED: true,
  ESCROW_ENABLED: true,
  BULK_SCHEDULER_ENABLED: true,
  TAX_WITHHOLDING_ENABLED: true,
  REG_SANDBOX_ENABLED: true,
  MULTI_CURRENCY_ENABLED: true,
  RTGS_ENABLED: true,
  ISO20022_ENABLED: true,
  OPEN_FINANCE_ENABLED: true,
  WHITE_LABEL_SDK_ENABLED: true,
  SUPER_APP_ENABLED: true,
  LAKEHOUSE_V2_ENABLED: true,
  PAYROLL_V2_ENABLED: true,
  AGENT_BANKING_V3_ENABLED: true,
  LOYALTY_MERCHANT_ENABLED: true,
  COHORT_ANALYTICS_ENABLED: true,
  SETTLEMENT_FORECAST_ENABLED: true,
  MOBILE_POS_ENABLED: true,
  OPEN_BANKING_PORTAL_ENABLED: true,
  DISPUTE_AUTOMATION_ENABLED: true,
} as const;
