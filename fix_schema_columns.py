"""
Patch drizzle/schema.ts to fix column mismatches discovered by TypeScript compiler.
Each table gets the missing columns that crud120.ts / crud120b.ts reference.
"""

with open('drizzle/schema.ts', 'r') as f:
    content = f.read()

patches = []

# 1. escrowContracts: add id alias + merchantId
# Currently has escrowId as PK; crud120.ts uses .id and .merchantId
patches.append((
    'export const escrowContracts = pgTable("escrow_contracts", {\n  escrowId: text("escrow_id").primaryKey(),',
    'export const escrowContracts = pgTable("escrow_contracts", {\n  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),\n  merchantId: text("merchant_id").notNull(),'
))

# 2. nftBadges: add id alias + merchantId + mintedCount + name + description + imageUrl + criteria + maxSupply
# Currently has badgeId as PK; crud120.ts uses .id, .merchantId, .mintedCount
patches.append((
    'export const nftBadges = pgTable("nft_badges", {\n  badgeId: text("badge_id").primaryKey(),\n  recipientId: text("recipient_id").notNull(),\n  recipientType: text("recipient_type").default("merchant"),\n  badgeType: text("badge_type").notNull(),\n  badgeName: text("badge_name").notNull(),\n  metadata: jsonb("metadata"),\n  mintTxHash: text("mint_tx_hash"),\n  network: text("network").default("solana"),\n  status: text("status").default("minting"),\n  mintedAt: timestamp("minted_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),',
    'export const nftBadges = pgTable("nft_badges", {\n  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),\n  merchantId: text("merchant_id").notNull(),\n  name: text("name").notNull(),\n  description: text("description"),\n  imageUrl: text("image_url"),\n  criteria: text("criteria"),                 // JSON stringified\n  maxSupply: integer("max_supply"),\n  mintedCount: integer("minted_count").notNull().default(0),\n  recipientId: text("recipient_id"),\n  recipientType: text("recipient_type").default("merchant"),\n  badgeType: text("badge_type"),\n  badgeName: text("badge_name"),\n  metadata: jsonb("metadata"),\n  mintTxHash: text("mint_tx_hash"),\n  network: text("network").default("solana"),\n  status: text("status").default("active"),\n  mintedAt: timestamp("minted_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),'
))

# 3. sdkTokens: add id alias + token + label + platform + permissions + status + revokedAt + rotatedAt
# Currently has tokenId as PK; crud120.ts uses .id, .token, .label, .platform, .status, .revokedAt, .rotatedAt
patches.append((
    'export const sdkTokens = pgTable("sdk_tokens", {\n  tokenId: text("token_id").primaryKey(),\n  merchantId: text("merchant_id").notNull(),\n  tokenHash: text("token_hash").notNull(),\n  expiresAt: timestamp("expires_at").notNull(),\n  scopes: jsonb("scopes"),\n  isRevoked: integer("is_revoked").default(0),\n  createdAt: timestamp("created_at").defaultNow().notNull(),',
    'export const sdkTokens = pgTable("sdk_tokens", {\n  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),\n  merchantId: text("merchant_id").notNull(),\n  token: text("token").notNull().unique(),\n  label: text("label").notNull(),\n  platform: text("platform").notNull().default("web"),\n  permissions: text("permissions"),            // JSON stringified\n  tokenHash: text("token_hash"),\n  scopes: jsonb("scopes"),\n  status: text("status").notNull().default("active"),\n  isRevoked: integer("is_revoked").default(0),\n  revokedAt: timestamp("revoked_at"),\n  rotatedAt: timestamp("rotated_at"),\n  expiresAt: timestamp("expires_at"),\n  createdAt: timestamp("created_at").defaultNow().notNull(),'
))

# 4. consumerSplitSessions: add initiatorId (alias for creatorId)
patches.append((
    'export const consumerSplitSessions = pgTable("consumer_split_sessions", {\n  id: text("id").primaryKey(),\n  creatorId: integer("creator_id").notNull().references(() => users.id),',
    'export const consumerSplitSessions = pgTable("consumer_split_sessions", {\n  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),\n  initiatorId: text("initiator_id").notNull(),  // userId of session creator\n  creatorId: integer("creator_id").references(() => users.id),'
))

# 5. inviteCodes: add merchantId + status + usedCount + maxUses + role + email
patches.append((
    'export const inviteCodes = pgTable("invite_codes", {\n  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),\n  code: text("code").notNull().unique(),\n  type: inviteCodeTypeEnum("type").notNull().default("merchant"),\n  usesRemaining: integer("uses_remaining").notNull().default(1),\n  usesTotal: integer("uses_total").notNull().default(1),\n  expiresAt: timestamp("expires_at"),\n  createdBy: text("created_by").notNull(),\n  tenantId: text("tenant_id"),\n  metadata: text("metadata"),\n  isRevoked: boolean("is_revoked").notNull().default(false),\n  createdAt: timestamp("created_at").defaultNow().notNull(),',
    'export const inviteCodes = pgTable("invite_codes", {\n  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),\n  merchantId: text("merchant_id"),\n  code: text("code").notNull().unique(),\n  type: inviteCodeTypeEnum("type").notNull().default("merchant"),\n  role: text("role"),\n  email: text("email"),\n  status: text("status").notNull().default("active"),  // active | revoked | expired\n  maxUses: integer("max_uses").notNull().default(1),\n  usedCount: integer("used_count").notNull().default(0),\n  usesRemaining: integer("uses_remaining").notNull().default(1),\n  usesTotal: integer("uses_total").notNull().default(1),\n  expiresAt: timestamp("expires_at"),\n  createdBy: text("created_by").notNull(),\n  tenantId: text("tenant_id"),\n  metadata: text("metadata"),\n  isRevoked: boolean("is_revoked").notNull().default(false),\n  createdAt: timestamp("created_at").defaultNow().notNull(),'
))

# 6. couponRedemptions: add merchantId + redeemedAt + status
patches.append((
    'export const couponRedemptions = pgTable("coupon_redemptions", {',
    '// couponRedemptions patched\nexport const couponRedemptions = pgTable("coupon_redemptions", {'
))

# Find and patch couponRedemptions properly
import re
cr_match = re.search(r'(export const couponRedemptions = pgTable\("coupon_redemptions", \{)(.*?)(\}, \(t\) => \[)', content, re.DOTALL)
if cr_match:
    body = cr_match.group(2)
    if 'merchantId' not in body:
        new_body = body.rstrip() + '\n  merchantId: text("merchant_id"),\n  status: text("status").notNull().default("applied"),\n  redeemedAt: timestamp("redeemed_at"),\n'
        content = content[:cr_match.start(2)] + new_body + content[cr_match.end(2):]
        print("couponRedemptions: added merchantId, status, redeemedAt")
    else:
        print("couponRedemptions: merchantId already exists")

# 7. emiLoans: add merchantId + emiAmountKobo + totalAmountKobo + paidInstalments + disbursedAt
emi_match = re.search(r'(export const emiLoans = pgTable\("emi_loans", \{)(.*?)(\}, \(t\) => \[)', content, re.DOTALL)
if emi_match:
    body = emi_match.group(2)
    if 'merchantId' not in body:
        new_body = body.rstrip() + '\n  merchantId: text("merchant_id"),\n  emiAmountKobo: bigint("emi_amount_kobo", { mode: "number" }),\n  totalAmountKobo: bigint("total_amount_kobo", { mode: "number" }),\n  paidInstalments: integer("paid_instalments").notNull().default(0),\n  disbursedAt: timestamp("disbursed_at"),\n'
        content = content[:emi_match.start(2)] + new_body + content[emi_match.end(2):]
        print("emiLoans: added merchantId, emiAmountKobo, totalAmountKobo, paidInstalments, disbursedAt")
    else:
        print("emiLoans: merchantId already exists")

# 8. inventoryTransactions: add merchantId
inv_match = re.search(r'(export const inventoryTransactions = pgTable\("inventory_transactions", \{)(.*?)(\}, \(t\) => \[)', content, re.DOTALL)
if inv_match:
    body = inv_match.group(2)
    if 'merchantId' not in body:
        new_body = body.rstrip() + '\n  merchantId: text("merchant_id"),\n'
        content = content[:inv_match.start(2)] + new_body + content[inv_match.end(2):]
        print("inventoryTransactions: added merchantId")
    else:
        print("inventoryTransactions: merchantId already exists")

# 9. merchantStatusLog: add changedAt
msl_match = re.search(r'(export const merchantStatusLog = pgTable\("merchant_status_log", \{)(.*?)(\}, \(t\) => \[)', content, re.DOTALL)
if msl_match:
    body = msl_match.group(2)
    if 'changedAt' not in body:
        new_body = body.rstrip() + '\n  changedAt: timestamp("changed_at").defaultNow().notNull(),\n'
        content = content[:msl_match.start(2)] + new_body + content[msl_match.end(2):]
        print("merchantStatusLog: added changedAt")
    else:
        print("merchantStatusLog: changedAt already exists")

# 10. rateLimitEvents: add action column
rle_match = re.search(r'(export const rateLimitEvents = pgTable\("rate_limit_events", \{)(.*?)(\}, \(t\) => \[)', content, re.DOTALL)
if rle_match:
    body = rle_match.group(2)
    if '  action:' not in body:
        new_body = body.rstrip() + '\n  action: text("action"),                    // blocked | throttled | allowed\n'
        content = content[:rle_match.start(2)] + new_body + content[rle_match.end(2):]
        print("rateLimitEvents: added action")
    else:
        print("rateLimitEvents: action already exists")

# 11. helpSearchAnalytics: add searchedAt
hsa_match = re.search(r'(export const helpSearchAnalytics = pgTable\("help_search_analytics", \{)(.*?)(\}, \(t\) => \[)', content, re.DOTALL)
if hsa_match:
    body = hsa_match.group(2)
    if 'searchedAt' not in body:
        new_body = body.rstrip() + '\n  searchedAt: timestamp("searched_at"),\n'
        content = content[:hsa_match.start(2)] + new_body + content[hsa_match.end(2):]
        print("helpSearchAnalytics: added searchedAt")
    else:
        print("helpSearchAnalytics: searchedAt already exists")

# 12. geofenceRules: add enabled (alias for active)
gfr_match = re.search(r'(export const geofenceRules = pgTable\("geofence_rules", \{)(.*?)(\}, \(t\) => \[)', content, re.DOTALL)
if gfr_match:
    body = gfr_match.group(2)
    if 'enabled' not in body:
        new_body = body.rstrip() + '\n  enabled: boolean("enabled").notNull().default(true),\n'
        content = content[:gfr_match.start(2)] + new_body + content[gfr_match.end(2):]
        print("geofenceRules: added enabled")
    else:
        print("geofenceRules: enabled already exists")

# Now apply the string patches for escrowContracts, nftBadges, sdkTokens, consumerSplitSessions, inviteCodes
for old, new in patches[:5]:  # first 5 patches (escrowContracts, nftBadges, sdkTokens, consumerSplitSessions, inviteCodes)
    if old in content:
        content = content.replace(old, new, 1)
        print(f"Applied patch for: {old[:60].strip()}")
    else:
        print(f"PATCH NOT FOUND: {old[:60].strip()}")

# Remove the bogus comment patch we added
content = content.replace('// couponRedemptions patched\n', '')

with open('drizzle/schema.ts', 'w') as f:
    f.write(content)

print("\nAll patches applied to drizzle/schema.ts")
