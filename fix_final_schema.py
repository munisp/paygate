"""
Final schema patch: fix all remaining column mismatches.
"""

with open('drizzle/schema.ts', 'r') as f:
    schema = f.read()

patches = []

# 1. usdcDeposits: add createdAt
old = '  processedAt: timestamp("processed_at"),\n}, (t) => [\n  index("ud_wallet_idx").on(t.walletAddress),\n  index("ud_merchant_idx").on(t.merchantId),\n  index("ud_signature_idx").on(t.solanaSignature),\n]);'
new = '  processedAt: timestamp("processed_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("ud_wallet_idx").on(t.walletAddress),\n  index("ud_merchant_idx").on(t.merchantId),\n  index("ud_signature_idx").on(t.solanaSignature),\n]);'
if old in schema:
    schema = schema.replace(old, new, 1)
    patches.append("usdcDeposits: added createdAt")
else:
    patches.append("usdcDeposits: pattern not found")

# 2. usdcPayouts: add createdAt (check what's at end of table)
# Find the usdcPayouts table end
idx = schema.find('export const usdcPayouts = pgTable("usdc_payouts"')
end_idx = schema.find(']);', idx) + 3
usdc_section = schema[idx:end_idx]
if 'createdAt' not in usdc_section:
    # Find the last column before the closing bracket
    last_col_end = usdc_section.rfind('\n  ', 0, usdc_section.rfind('\n}, (t)'))
    insert_pos = idx + usdc_section.rfind('\n}, (t)')
    schema = schema[:insert_pos] + '\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),' + schema[insert_pos:]
    patches.append("usdcPayouts: added createdAt + updatedAt")
else:
    patches.append("usdcPayouts: createdAt already exists")

# 3. userInsuranceClaims: add merchantId
old = '  policyId: text("policy_id").notNull(),\n  userId: integer("user_id").notNull(),'
new = '  policyId: text("policy_id").notNull(),\n  merchantId: text("merchant_id"),\n  userId: integer("user_id").notNull(),'
if old in schema:
    schema = schema.replace(old, new, 1)
    patches.append("userInsuranceClaims: added merchantId")
else:
    patches.append("userInsuranceClaims: pattern not found")

# 4. tenantPlanLimits: check what crud120b.ts needs
# Error: 'maxApiCallsPerMonth' not found - check what crud120b.ts uses
import subprocess
result = subprocess.run(['grep', '-n', 'tenantPlanLimits\.', 'server/routers/crud120b.ts'], capture_output=True, text=True)
print("tenantPlanLimits usage in crud120b.ts:")
print(result.stdout[:500])

# 5. tenantUsageMetrics: add recordedAt
old = '  webhookDeliveries: integer("webhook_deliveries").notNull().default(0),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n}, (t) => [\n  index("tenant_usage_tenant_period_idx").on(t.tenantId, t.period),\n]);'
new = '  webhookDeliveries: integer("webhook_deliveries").notNull().default(0),\n  recordedAt: timestamp("recorded_at").defaultNow().notNull(),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n}, (t) => [\n  index("tenant_usage_tenant_period_idx").on(t.tenantId, t.period),\n]);'
if old in schema:
    schema = schema.replace(old, new, 1)
    patches.append("tenantUsageMetrics: added recordedAt")
else:
    patches.append("tenantUsageMetrics: pattern not found")

with open('drizzle/schema.ts', 'w') as f:
    f.write(schema)

for p in patches:
    print(p)
