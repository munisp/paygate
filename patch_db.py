import re

with open('server/db.ts', 'r') as f:
    content = f.read()

# Add imports if not present
if 'debitWalletViaMiddleware' not in content:
    content = content.replace('import { getDb } from "./db";', 'import { getDb } from "./db";\nimport { debitWalletViaMiddleware } from "./middlewareBridge";')
    # Or find the top of the file
    if 'debitWalletViaMiddleware' not in content:
        content = 'import { debitWalletViaMiddleware } from "./middlewareBridge";\n' + content

# Patch createTransaction
tx_old = r'''export async function createTransaction\(data: InsertTransaction\) \{
  const db = await getDb\(\); if \(!db\) throw new Error\("DB unavailable"\);
  if \(!db\) throw new Error\('Database unavailable'\);
  await db\.insert\(transactions\)\.values\(data\); return getTransactionById\(data\.id\);
\}'''

tx_new = '''export async function createTransaction(data: InsertTransaction) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.insert(transactions).values(data);
  
  // TigerBeetle wiring (fire-and-forget)
  debitWalletViaMiddleware({
    walletId: `wallet_${data.merchantId}`, // Default derivation
    userId: data.merchantId,
    amount: data.amount,
    currency: data.currency,
    reference: data.reference,
    description: data.description || "Transaction debit",
  }).catch(e => console.error("[TigerBeetle] createTransaction debit failed:", e));
  
  return getTransactionById(data.id);
}'''

content = re.sub(tx_old, tx_new, content)

# Patch createPayout
payout_old = r'''export async function createPayout\(data: InsertPayout\) \{
  const db = await getDb\(\); if \(!db\) throw new Error\("DB unavailable"\);
  if \(!db\) throw new Error\('Database unavailable'\);
  await db\.insert\(payouts\)\.values\(data\); return getPayoutById\(data\.id\);
\}'''

payout_new = '''export async function createPayout(data: InsertPayout) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  await db.insert(payouts).values(data);
  
  // TigerBeetle wiring (fire-and-forget)
  debitWalletViaMiddleware({
    walletId: `wallet_${data.merchantId}`, // Default derivation
    userId: data.merchantId,
    amount: data.amount,
    currency: data.currency,
    reference: data.reference,
    description: data.narration || "Payout debit",
  }).catch(e => console.error("[TigerBeetle] createPayout debit failed:", e));
  
  return getPayoutById(data.id);
}'''

content = re.sub(payout_old, payout_new, content)

with open('server/db.ts', 'w') as f:
    f.write(content)

print("db.ts patched successfully")
