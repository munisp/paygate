"""
Third round of schema patches.
"""
import re

with open('drizzle/schema.ts', 'r') as f:
    content = f.read()

# 1. moneyRequests: extend status enum to include approved/declined, add approvedAt
old = '  status: text("status", { enum: ["pending", "paid", "cancelled", "expired"] }).notNull().default("pending"),'
new = '  status: text("status", { enum: ["pending", "paid", "cancelled", "expired", "approved", "declined"] }).notNull().default("pending"),\n  approvedAt: timestamp("approved_at"),'
if old in content:
    content = content.replace(old, new, 1)
    print("moneyRequests: extended status enum + added approvedAt")
else:
    print("moneyRequests: pattern not found")

# 2. Check what's at line 1704 in crud120.ts - revokedAt on openBankingConsents
with open('server/routers/crud120.ts', 'r') as f:
    lines = f.readlines()
print(f"\nLine 1704: {lines[1703].strip()}")
print(f"Line 1703: {lines[1702].strip()}")
print(f"Line 1702: {lines[1701].strip()}")
print(f"Line 1701: {lines[1700].strip()}")
print(f"Line 1700: {lines[1699].strip()}")

# 3. Check line 1738 - partnerOnboardingSessions step issue
print(f"\nLine 1738: {lines[1737].strip()}")
print(f"Line 1737: {lines[1736].strip()}")
print(f"Line 1736: {lines[1735].strip()}")
print(f"Line 1735: {lines[1734].strip()}")

# 4. Check line 1916 - settled status
print(f"\nLine 1916: {lines[1915].strip()}")
print(f"Line 1915: {lines[1914].strip()}")
print(f"Line 1914: {lines[1913].strip()}")
print(f"Line 1913: {lines[1912].strip()}")

with open('drizzle/schema.ts', 'w') as f:
    f.write(content)
print("\nDone.")
