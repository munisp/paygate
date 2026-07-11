"""
Fourth round of schema patches.
"""
import re

with open('drizzle/schema.ts', 'r') as f:
    content = f.read()

# 1. openBankingConsentsV2: add revokedAt
old = '  consentToken: text("consent_token"),\n  expiresAt: timestamp("expires_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n}, (t) => [index("ob_v2_merchant_idx").on(t.merchantId)]);'
new = '  consentToken: text("consent_token"),\n  revokedAt: timestamp("revoked_at"),\n  expiresAt: timestamp("expires_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n}, (t) => [index("ob_v2_merchant_idx").on(t.merchantId)]);'
if old in content:
    content = content.replace(old, new, 1)
    print("openBankingConsentsV2: added revokedAt")
else:
    print("openBankingConsentsV2: pattern not found")

# 2. partnerOnboardingSessions: add stepData + status columns
old = '  isCompleted: boolean("is_completed").notNull().default(false),\n  completedAt: timestamp("completed_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n}, (t) => [\n  index("partner_onboard_user_idx").on(t.userId),\n  index("partner_onboard_step_idx").on(t.currentStep),\n]);'
new = '  stepData: text("step_data"),              // JSON: per-step data\n  status: text("status").notNull().default("in_progress"),  // in_progress | completed | abandoned\n  isCompleted: boolean("is_completed").notNull().default(false),\n  completedAt: timestamp("completed_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n}, (t) => [\n  index("partner_onboard_user_idx").on(t.userId),\n  index("partner_onboard_step_idx").on(t.currentStep),\n]);'
if old in content:
    content = content.replace(old, new, 1)
    print("partnerOnboardingSessions: added stepData + status")
else:
    print("partnerOnboardingSessions: pattern not found")

# 3. ptspBatches: extend status enum to include "settled"
old = 'export const ptspBatchStatusEnum = pgEnum("ptsp_batch_status", [\n  "pending", "submitted", "confirmed", "failed", "partial",\n]);'
new = 'export const ptspBatchStatusEnum = pgEnum("ptsp_batch_status", [\n  "pending", "submitted", "confirmed", "failed", "partial", "settled",\n]);'
if old in content:
    content = content.replace(old, new, 1)
    print("ptspBatchStatusEnum: added settled")
else:
    print("ptspBatchStatusEnum: pattern not found")

# 4. ptspBatches: add settledAt column
old = '  failureReason: text("failure_reason"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n}, (t) => [\n  index("ptsp_batch_merchant_idx").on(t.merchantId),\n  index("ptsp_batch_date_idx").on(t.settlementDate),\n  index("ptsp_batch_status_idx").on(t.status),\n]);'
new = '  failureReason: text("failure_reason"),\n  settledAt: timestamp("settled_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n}, (t) => [\n  index("ptsp_batch_merchant_idx").on(t.merchantId),\n  index("ptsp_batch_date_idx").on(t.settlementDate),\n  index("ptsp_batch_status_idx").on(t.status),\n]);'
if old in content:
    content = content.replace(old, new, 1)
    print("ptspBatches: added settledAt")
else:
    print("ptspBatches: pattern not found")

with open('drizzle/schema.ts', 'w') as f:
    f.write(content)
print("\nAll patches applied.")
