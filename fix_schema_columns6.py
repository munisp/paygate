"""
Sixth round of schema patches.
"""
import re

with open('drizzle/schema.ts', 'r') as f:
    content = f.read()

# 1. reconciliationAlerts: add resolution column
old = '  resolvedAt: timestamp("resolved_at"),\n  resolvedBy: text("resolved_by"),\n  notes: text("notes"),'
new = '  resolution: text("resolution"),\n  resolvedAt: timestamp("resolved_at"),\n  resolvedBy: text("resolved_by"),\n  notes: text("notes"),'
if old in content:
    content = content.replace(old, new, 1)
    print("reconciliationAlerts: added resolution")
else:
    print("reconciliationAlerts: pattern not found")

# 2. consumerRecurringPayments: add status column
old = '  isActive: boolean("is_active").notNull().default(true),\n  label: text("label"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("crp_user_idx").on(t.userId),\n  index("crp_next_run_idx").on(t.nextRunAt),\n]);'
new = '  status: text("status").notNull().default("active"),  // active | paused | cancelled\n  isActive: boolean("is_active").notNull().default(true),\n  label: text("label"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("crp_user_idx").on(t.userId),\n  index("crp_next_run_idx").on(t.nextRunAt),\n]);'
if old in content:
    content = content.replace(old, new, 1)
    print("consumerRecurringPayments: added status")
else:
    print("consumerRecurringPayments: pattern not found")

# 3. partnerOnboardingSessions: currentStep is typed as onboardingStepEnum but crud120.ts passes
# input.currentStep which is a number (from z.number()). Check what crud120.ts expects
with open('server/routers/crud120.ts', 'r') as f:
    lines = f.readlines()
print(f"\nLine 1738 context (partnerOnboardingSessions update):")
for i in range(1728, 1745):
    print(f"  {i+1}: {lines[i].strip()}")

with open('drizzle/schema.ts', 'w') as f:
    f.write(content)
print("\nDone.")
