"""
Fix all remaining schema column mismatches and code issues.
"""
import re

with open('drizzle/schema.ts', 'r') as f:
    schema = f.read()

# ── 1. strRecords: add reportRef column ──────────────────────────────────────
old = '  nfiuRef: text("nfiu_ref"),\n  submittedAt: timestamp("submitted_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n}, (t) => [\n  index("str_merchant_idx").on(t.merchantId),\n  index("str_status_idx").on(t.submissionStatus),\n  index("str_deadline_idx").on(t.deadlineAt),\n]);'
new = '  nfiuRef: text("nfiu_ref"),\n  reportRef: text("report_ref"),  // NFIU report reference number\n  nfiuSubmittedAt: timestamp("nfiu_submitted_at"),\n  submittedAt: timestamp("submitted_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n}, (t) => [\n  index("str_merchant_idx").on(t.merchantId),\n  index("str_status_idx").on(t.submissionStatus),\n  index("str_deadline_idx").on(t.deadlineAt),\n]);'
if old in schema:
    schema = schema.replace(old, new, 1)
    print("strRecords: added reportRef + nfiuSubmittedAt")
else:
    print("strRecords: pattern not found")

# ── 2. chargebackTimeline: add occurredAt column ─────────────────────────────
old = '  deadlineAt: timestamp("deadline_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("ct_chargeback_idx").on(t.chargebackId),\n  index("ct_merchant_idx").on(t.merchantId),\n]);'
new = '  occurredAt: timestamp("occurred_at").defaultNow().notNull(),\n  deadlineAt: timestamp("deadline_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("ct_chargeback_idx").on(t.chargebackId),\n  index("ct_merchant_idx").on(t.merchantId),\n]);'
if old in schema:
    schema = schema.replace(old, new, 1)
    print("chargebackTimeline: added occurredAt")
else:
    print("chargebackTimeline: pattern not found")

# ── 3. chargebackEvidencePackages: add uploadedAt column ─────────────────────
old = '  uploadedBy: text("uploaded_by").notNull(),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("cep_chargeback_idx").on(t.chargebackId),\n  index("cep_merchant_idx").on(t.merchantId),\n]);'
new = '  uploadedBy: text("uploaded_by").notNull(),\n  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("cep_chargeback_idx").on(t.chargebackId),\n  index("cep_merchant_idx").on(t.merchantId),\n]);'
if old in schema:
    schema = schema.replace(old, new, 1)
    print("chargebackEvidencePackages: added uploadedAt")
else:
    print("chargebackEvidencePackages: pattern not found")

# ── 4. regulatoryReportSubmissions: add acknowledgedAt column ─────────────────
old = '  submittedAt: timestamp("submitted_at").defaultNow().notNull(),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("rrs_report_idx").on(t.reportId),\n  index("rrs_merchant_idx").on(t.merchantId),\n]);'
new = '  acknowledgedAt: timestamp("acknowledged_at"),\n  submittedAt: timestamp("submitted_at").defaultNow().notNull(),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("rrs_report_idx").on(t.reportId),\n  index("rrs_merchant_idx").on(t.merchantId),\n]);'
if old in schema:
    schema = schema.replace(old, new, 1)
    print("regulatoryReportSubmissions: added acknowledgedAt")
else:
    print("regulatoryReportSubmissions: pattern not found")

# ── 5. schemeMemberships: add sponsoredMerchants column ──────────────────────
old = '  annualFeeUsd: integer("annual_fee_usd"),\n  notes: text("notes"),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("scheme_membership_scheme_idx").on(t.scheme),\n  index("scheme_membership_status_idx").on(t.status),\n]);'
new = '  annualFeeUsd: integer("annual_fee_usd"),\n  sponsoredMerchants: text("sponsored_merchants"),  // JSON array of merchant IDs\n  notes: text("notes"),\n  updatedAt: timestamp("updated_at").defaultNow().notNull(),\n  createdAt: timestamp("created_at").defaultNow().notNull(),\n}, (t) => [\n  index("scheme_membership_scheme_idx").on(t.scheme),\n  index("scheme_membership_status_idx").on(t.status),\n]);'
if old in schema:
    schema = schema.replace(old, new, 1)
    print("schemeMemberships: added sponsoredMerchants")
else:
    print("schemeMemberships: pattern not found")

# ── 6. referrals: add referralId column ──────────────────────────────────────
# Check what referrals table looks like
idx = schema.find('export const referrals = pgTable("referrals"')
if idx >= 0:
    end_idx = schema.find(']);', idx) + 3
    print(f"referrals table found at line ~{schema[:idx].count(chr(10))+1}")
    # Check if referralId already exists
    if 'referralId' not in schema[idx:end_idx]:
        # Add referralId as an alias column
        old_ref = '}, (t) => [\n  index("referrals_'
        # Find the specific occurrence after referrals table
        ref_section = schema[idx:end_idx]
        print(f"referrals columns: {[l.strip() for l in ref_section.split(chr(10)) if ':' in l and 'index' not in l][:5]}")
else:
    print("referrals table not found")

with open('drizzle/schema.ts', 'w') as f:
    f.write(schema)
print("\nPhase 1 patches applied.")

# ── Now fix code issues ───────────────────────────────────────────────────────

# Fix mobileMoney.ts - db null issues and providerStatus column
with open('server/routers/mobileMoney.ts', 'r') as f:
    content = f.read()
# Fix db null checks
content = re.sub(r'const db = await getDb\(\);', 'const db = (await getDb())!;', content)
content = re.sub(r'const db = getDb\(\);', 'const db = (await getDb())!;', content)
# Fix providerStatus -> status (mobileMoneyTransactions doesn't have providerStatus)
content = content.replace('providerStatus:', 'status:')
with open('server/routers/mobileMoney.ts', 'w') as f:
    f.write(content)
print("mobileMoney.ts: fixed db null + providerStatus->status")

# Fix wave174.ts - documentExpiresAt -> documentExpiredAt, fullName, dateOfBirth, submissionId, targetId
with open('server/routers/wave174.ts', 'r') as f:
    content = f.read()
# documentExpiresAt -> documentExpiredAt (schema has documentExpired not documentExpiresAt)
# Actually check what the schema has
print("Checking kyc_submissions columns...")
EOF
