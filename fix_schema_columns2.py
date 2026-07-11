"""
Second round of schema patches for crud120.ts column mismatches.
"""
import re

with open('drizzle/schema.ts', 'r') as f:
    content = f.read()

def patch_table(table_name, pg_name, missing_cols_code):
    """Add missing columns to a table definition."""
    global content
    pattern = rf'(export const {table_name} = pgTable\("{pg_name}", \{{)(.*?)(\}}, \(t\) => \[)'
    match = re.search(pattern, content, re.DOTALL)
    if not match:
        # Try without index block
        pattern2 = rf'(export const {table_name} = pgTable\("{pg_name}", \{{)(.*?)(\}}\);)'
        match = re.search(pattern2, content, re.DOTALL)
    if match:
        body = match.group(2)
        # Check if already patched
        first_col = missing_cols_code.strip().split('\n')[0].split(':')[0].strip()
        if first_col in body:
            print(f"{table_name}: already has {first_col}")
            return
        new_body = body.rstrip() + '\n' + missing_cols_code + '\n'
        content = content[:match.start(2)] + new_body + content[match.end(2):]
        print(f"{table_name}: patched")
    else:
        print(f"{table_name}: NOT FOUND")

# 1. portfolioRebalancingOrders: add merchantId, portfolioId, targetAllocations, notes, executedAt
patch_table('portfolioRebalancingOrders', 'portfolio_rebalancing_orders', 
    '  merchantId: text("merchant_id"),\n  portfolioId: text("portfolio_id"),\n  targetAllocations: text("target_allocations"),  // JSON\n  notes: text("notes"),\n  executedAt: timestamp("executed_at"),')

# 2. realtimeNotificationHistory: add userId + readAt
patch_table('realtimeNotificationHistory', 'realtime_notification_history',
    '  userId: text("user_id"),\n  readAt: timestamp("read_at"),')

# 3. realtimeNotificationPreferences: add userId + categories
patch_table('realtimeNotificationPreferences', 'realtime_notification_preferences',
    '  userId: text("user_id"),\n  categories: text("categories"),  // JSON')

# 4. recipeIngredients: add merchantId + recipeId + name + quantity + unit + costPerUnitKobo + allergens + isOptional
patch_table('recipeIngredients', 'recipe_ingredients',
    '  merchantId: text("merchant_id"),\n  recipeId: text("recipe_id"),\n  name: text("name"),\n  quantity: real("quantity"),\n  unit: text("unit"),\n  costPerUnitKobo: bigint("cost_per_unit_kobo", { mode: "number" }),\n  allergens: text("allergens"),  // JSON array\n  isOptional: boolean("is_optional").notNull().default(false),')

# 5. payrollRuns: add approvedAt + processedAt
patch_table('payrollRuns', 'payroll_runs',
    '  approvedAt: timestamp("approved_at"),\n  processedAt: timestamp("processed_at"),')

# 6. Check what's needed for the "approved"/"declined" status errors in crud120.ts around line 1487
# These are likely for partnerOnboardingSessions or similar - check
print("\nChecking line 1487 context:")

with open('server/routers/crud120.ts', 'r') as f:
    lines = f.readlines()
print(f"Line 1487: {lines[1486].strip()}")
print(f"Line 1486: {lines[1485].strip()}")
print(f"Line 1485: {lines[1484].strip()}")
print(f"Line 1484: {lines[1483].strip()}")
print(f"Line 1483: {lines[1482].strip()}")

with open('drizzle/schema.ts', 'w') as f:
    f.write(content)

print("\nAll patches applied.")
