"""
Fifth round of schema patches.
"""
import re

with open('drizzle/schema.ts', 'r') as f:
    content = f.read()

# 1. consumerRecurringPayments: add status column (currently missing "cancelled" value?)
# Check if status column exists
crp_match = re.search(r'export const consumerRecurringPayments = pgTable\("consumer_recurring_payments", \{(.*?)\}, \(t\)', content, re.DOTALL)
if crp_match:
    body = crp_match.group(1)
    print(f"consumerRecurringPayments status: {'status' in body}")
    if 'status' in body:
        # Check the enum values
        status_match = re.search(r'status.*?enum.*?\[(.*?)\]', body)
        if status_match:
            print(f"  enum values: {status_match.group(1)}")

# 2. merchantLoans: add approvedAmountKobo (currently has approvedKobo)
# crud120.ts uses approvedAmountKobo but schema has approvedKobo
old = '  approvedKobo: bigint("approved_kobo", { mode: "number" }).default(0),'
new = '  approvedKobo: bigint("approved_kobo", { mode: "number" }).default(0),\n  approvedAmountKobo: bigint("approved_amount_kobo", { mode: "number" }).default(0),'
if old in content:
    content = content.replace(old, new, 1)
    print("merchantLoans: added approvedAmountKobo alias")
else:
    print("merchantLoans: approvedKobo pattern not found")

# 3. invoices: add sentAt column
old = '  paidAt: timestamp("paid_at"),\n  paymentLinkUrl: text("payment_link_url"),'
new = '  sentAt: timestamp("sent_at"),\n  paidAt: timestamp("paid_at"),\n  paymentLinkUrl: text("payment_link_url"),'
if old in content:
    content = content.replace(old, new, 1)
    print("invoices: added sentAt")
else:
    print("invoices: paidAt pattern not found")

# 4. loyaltyAccounts: add totalPoints alias
old = '  lifetimePoints: bigint("lifetime_points", { mode: "number" }).notNull().default(0),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("loyalty_account_merchant_idx").on(t.merchantId),\n  index("loyalty_account_customer_idx").on(t.customerId),'
new = '  lifetimePoints: bigint("lifetime_points", { mode: "number" }).notNull().default(0),\n  totalPoints: bigint("total_points", { mode: "number" }).notNull().default(0),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("loyalty_account_merchant_idx").on(t.merchantId),\n  index("loyalty_account_customer_idx").on(t.customerId),'
if old in content:
    content = content.replace(old, new, 1)
    print("loyaltyAccounts: added totalPoints")
else:
    print("loyaltyAccounts: pattern not found")

# 5. loyaltyV3Members: add totalPoints
old = '  tier: text("tier").notNull().default("bronze"),\n  joinedAt: timestamp("joined_at").defaultNow().notNull(),\n}, (t) => [index("loyalty_v3_member_merchant_idx").on(t.merchantId)]);'
new = '  tier: text("tier").notNull().default("bronze"),\n  totalPoints: integer("total_points").notNull().default(0),\n  joinedAt: timestamp("joined_at").defaultNow().notNull(),\n}, (t) => [index("loyalty_v3_member_merchant_idx").on(t.merchantId)]);'
if old in content:
    content = content.replace(old, new, 1)
    print("loyaltyV3Members: added totalPoints")
else:
    print("loyaltyV3Members: pattern not found")

# 6. merchantRiskScores: add scoredAt
mrs_match = re.search(r'(export const merchantRiskScores = pgTable\("merchant_risk_scores", \{)(.*?)(\}, \(t\) => \[)', content, re.DOTALL)
if mrs_match:
    body = mrs_match.group(2)
    if 'scoredAt' not in body:
        new_body = body.rstrip() + '\n  scoredAt: timestamp("scored_at").defaultNow(),\n'
        content = content[:mrs_match.start(2)] + new_body + content[mrs_match.end(2):]
        print("merchantRiskScores: added scoredAt")
    else:
        print("merchantRiskScores: scoredAt already exists")

# 7. restaurantOrders: extend status enum to include pending/confirmed/preparing/served/cancelled
old = 'export const restaurantOrderStatusEnum = pgEnum("restaurant_order_status", [\n  "open", "sent_to_kitchen", "ready", "paid", "voided",\n]);'
new = 'export const restaurantOrderStatusEnum = pgEnum("restaurant_order_status", [\n  "open", "sent_to_kitchen", "ready", "paid", "voided",\n  "pending", "confirmed", "preparing", "served", "cancelled",\n]);'
if old in content:
    content = content.replace(old, new, 1)
    print("restaurantOrderStatusEnum: extended with pending/confirmed/preparing/served/cancelled")
else:
    print("restaurantOrderStatusEnum: pattern not found")

# 8. settlementSlaEvents: add acknowledgedAt + resolvedAt
sla_match = re.search(r'(export const settlementSlaEvents = pgTable\("settlement_sla_events", \{)(.*?)(\}, \(t\) => \[)', content, re.DOTALL)
if sla_match:
    body = sla_match.group(2)
    if 'acknowledgedAt' not in body:
        new_body = body.rstrip() + '\n  acknowledgedAt: timestamp("acknowledged_at"),\n  resolvedAt: timestamp("resolved_at"),\n'
        content = content[:sla_match.start(2)] + new_body + content[sla_match.end(2):]
        print("settlementSlaEvents: added acknowledgedAt + resolvedAt")
    else:
        print("settlementSlaEvents: acknowledgedAt already exists")

# 9. realtimeNotificationPreferences: the update call passes pushEnabled/emailEnabled/smsEnabled/categories
# but the table uses integer columns. The issue is the update set type mismatch.
# The table has webhookEnabled, emailEnabled, smsEnabled, pushEnabled as integers
# but crud120.ts passes booleans. Need to check what the update set looks like.
# Actually the error says categories doesn't match - need to add categories column
rnp_match = re.search(r'(export const realtimeNotificationPreferences = pgTable\("realtime_notification_preferences", \{)(.*?)(\}, \(t\) => \[)', content, re.DOTALL)
if rnp_match:
    body = rnp_match.group(2)
    if 'categories' not in body:
        new_body = body.rstrip() + '\n  categories: text("categories"),              // JSON\n'
        content = content[:rnp_match.start(2)] + new_body + content[rnp_match.end(2):]
        print("realtimeNotificationPreferences: added categories")
    else:
        print("realtimeNotificationPreferences: categories already exists")

# 10. Check what's at line 2088 in crud120.ts - resolution on some table
with open('server/routers/crud120.ts', 'r') as f:
    lines = f.readlines()
print(f"\nLine 2088 context:")
for i in range(2082, 2095):
    print(f"  {i+1}: {lines[i].strip()}")

with open('drizzle/schema.ts', 'w') as f:
    f.write(content)
print("\nAll patches applied.")
