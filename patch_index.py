import re

with open('server/_core/index.ts', 'r') as f:
    content = f.read()

# Add imports if not present
if 'p2pTransferViaMiddleware' not in content:
    content = 'import { p2pTransferViaMiddleware } from "../middlewareBridge";\n' + content

# Patch first block (pay-phone)
block1_old = r'''      await db\.update\(wallets\)\.set\(\{ balance: sql`balance - \$\{amount\}` \}\)\.where\(eq\(wallets\.merchantId, sender\.id\)\);
      await db\.update\(wallets\)\.set\(\{ balance: sql`balance \+ \$\{amount\}` \}\)\.where\(eq\(wallets\.merchantId, recipient\.id\)\);
      return res\.json\(\{ success: true, reference: idempotency_key \}\);'''

block1_new = '''      // TigerBeetle wiring
      p2pTransferViaMiddleware({
        transferId: idempotency_key,
        senderWalletId: `wallet_${sender.id}`,
        receiverWalletId: `wallet_${recipient.id}`,
        senderUserId: sender.id,
        receiverUserId: recipient.id,
        amount: amount,
        currency: "NGN",
        narration: "USSD P2P Transfer",
      }).catch(e => console.error("[TigerBeetle] P2P transfer failed:", e));

      return res.json({ success: true, reference: idempotency_key });'''

content = re.sub(block1_old, block1_new, content)

# Patch second block (pay-merchant)
block2_old = r'''      await db\.update\(wallets\)\.set\(\{ balance: sql`balance - \$\{amount\}` \}\)\.where\(eq\(wallets\.merchantId, sender\.id\)\);
      await db\.update\(wallets\)\.set\(\{ balance: sql`balance \+ \$\{amount\}` \}\)\.where\(eq\(wallets\.merchantId, merchantRecipient\.id\)\);
      return res\.json\(\{ success: true, reference: idempotency_key \}\);'''

block2_new = '''      // TigerBeetle wiring
      p2pTransferViaMiddleware({
        transferId: idempotency_key,
        senderWalletId: `wallet_${sender.id}`,
        receiverWalletId: `wallet_${merchantRecipient.id}`,
        senderUserId: sender.id,
        receiverUserId: merchantRecipient.id,
        amount: amount,
        currency: "NGN",
        narration: "USSD Merchant Payment",
      }).catch(e => console.error("[TigerBeetle] Merchant payment failed:", e));

      return res.json({ success: true, reference: idempotency_key });'''

content = re.sub(block2_old, block2_new, content)

with open('server/_core/index.ts', 'w') as f:
    f.write(content)

print("index.ts patched successfully")
