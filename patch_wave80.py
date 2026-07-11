import re

with open('server/wave80Router.ts', 'r') as f:
    content = f.read()

# Add imports if not present
if 'debitWalletViaMiddleware' not in content:
    content = content.replace('import { getDb } from "../db";', 'import { getDb } from "../db";\nimport { debitWalletViaMiddleware, creditWalletViaMiddleware } from "../middlewareBridge";')

# Patch createContract (fund)
create_old = r'''    const \[contract\] = await db\.insert\(escrowContractsV2\)\.values\(\{ merchantId: ctx\.user\.id\.toString\(\)\.toString\(\), title: input\.title, description: input\.description, amount: input\.amount, currency: input\.currency, buyerId: input\.buyerId, sellerId: input\.sellerId, releaseConditions: input\.releaseConditions, status: "pending", expiresAt: new Date\(Date\.now\(\) \+ input\.expiryDays \* 24 \* 60 \* 60 \* 1000\) \}\)\.returning\(\);
    return \{ contract \};'''

create_new = '''    const [contract] = await db.insert(escrowContractsV2).values({ merchantId: ctx.user.id.toString().toString(), title: input.title, description: input.description, amount: input.amount, currency: input.currency, buyerId: input.buyerId, sellerId: input.sellerId, releaseConditions: input.releaseConditions, status: "pending", expiresAt: new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000) }).returning();
    
    // TigerBeetle wiring (reserve funds)
    debitWalletViaMiddleware({
      walletId: `wallet_${ctx.user.id}`,
      userId: ctx.user.id,
      amount: input.amount,
      currency: input.currency,
      reference: `escrow_fund_${contract.id}`,
      description: `Escrow funding for ${input.title}`,
    }).catch(e => console.error("[TigerBeetle] Escrow fund failed:", e));
    
    return { contract };'''

content = re.sub(create_old, create_new, content)

# Patch releaseContract
release_old = r'''    await db\.update\(escrowContractsV2\)\.set\(\{ status: "released", releasedAt: new Date\(\), updatedAt: new Date\(\) \}\)\.where\(and\(eq\(escrowContractsV2\.id, input\.contractId\), eq\(escrowContractsV2\.merchantId, ctx\.user\.id\.toString\(\)\)\)\);
    return \{ success: true \};'''

release_new = '''    await db.update(escrowContractsV2).set({ status: "released", releasedAt: new Date(), updatedAt: new Date() }).where(and(eq(escrowContractsV2.id, input.contractId), eq(escrowContractsV2.merchantId, ctx.user.id.toString())));
    
    // Get contract details for TigerBeetle wiring
    const [contract] = await db.select().from(escrowContractsV2).where(eq(escrowContractsV2.id, input.contractId)).limit(1);
    if (contract && contract.sellerId) {
      creditWalletViaMiddleware({
        walletId: `wallet_${contract.sellerId}`,
        userId: contract.sellerId,
        amount: contract.amount,
        currency: contract.currency,
        reference: `escrow_release_${contract.id}`,
        description: `Escrow release for ${contract.title}`,
      }).catch(e => console.error("[TigerBeetle] Escrow release failed:", e));
    }
    
    return { success: true };'''

content = re.sub(release_old, release_new, content)

with open('server/wave80Router.ts', 'w') as f:
    f.write(content)

print("wave80Router.ts patched successfully")
