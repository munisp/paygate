import re

with open('server/routers/crud120b.ts', 'r') as f:
    content = f.read()

# Add imports if not present
if 'debitWalletViaMiddleware' not in content:
    content = content.replace('import { getDb } from "../db";', 'import { getDb } from "../db";\nimport { debitWalletViaMiddleware } from "../middlewareBridge";')

# Patch USDC payout
payout_old = r'''    const \[row\] = await db\.insert\(usdcPayouts\)\.values\(\{
      merchantId: ctx\.user\.tenantId \?\? "",
      \.\.\.input,
      status: "pending",
    \}\)\.returning\(\);
    return row;'''

payout_new = '''    const [row] = await db.insert(usdcPayouts).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      status: "pending",
    }).returning();
    
    // TigerBeetle wiring
    debitWalletViaMiddleware({
      walletId: `wallet_${ctx.user.tenantId ?? ""}`,
      userId: ctx.user.tenantId ?? "",
      amount: input.amountUsdc * 1500 * 100, // Approx NGN Kobo conversion for ledger
      currency: "NGN",
      reference: `usdc_payout_${row.id}`,
      description: `USDC payout to ${input.destinationAddress}`,
    }).catch(e => console.error("[TigerBeetle] USDC payout debit failed:", e));
    
    return row;'''

content = re.sub(payout_old, payout_new, content)

with open('server/routers/crud120b.ts', 'w') as f:
    f.write(content)

print("crud120b.ts patched successfully")
