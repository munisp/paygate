import re

with open('server/routers/terminal.ts', 'r') as f:
    content = f.read()

# Add imports if not present
if 'creditWalletViaMiddleware' not in content:
    content = content.replace('import { getDb } from "../db";', 'import { getDb } from "../db";\nimport { creditWalletViaMiddleware } from "../middlewareBridge";')

# Patch refund
refund_old = r'''      await publishKafka\("paygate\.terminal\.refund", \{
        refundId: refundTxn\.id, originalId: input\.transactionId,
        merchantId: input\.merchantId, amountKobo: refundAmount,
        reference, timestamp: new Date\(\)\.toISOString\(\),
      \}\);
      return refundTxn;'''

refund_new = '''      await publishKafka("paygate.terminal.refund", {
        refundId: refundTxn.id, originalId: input.transactionId,
        merchantId: input.merchantId, amountKobo: refundAmount,
        reference, timestamp: new Date().toISOString(),
      });
      
      // TigerBeetle wiring
      creditWalletViaMiddleware({
        walletId: `wallet_${input.merchantId}`,
        userId: input.merchantId,
        amount: refundAmount,
        currency: original.currency,
        reference: reference,
        description: `Terminal refund for ${original.reference}`,
      }).catch(e => console.error("[TigerBeetle] Terminal refund failed:", e));
      
      return refundTxn;'''

content = re.sub(refund_old, refund_new, content)

with open('server/routers/terminal.ts', 'w') as f:
    f.write(content)

print("terminal.ts patched successfully")
