import re

with open('server/routers/mobileMoney.ts', 'r') as f:
    content = f.read()

# Add imports if not present
if 'creditWalletViaMiddleware' not in content:
    content = content.replace('import { getDb } from "../db";', 'import { getDb } from "../db";\nimport { creditWalletViaMiddleware, debitWalletViaMiddleware } from "../../server/middlewareBridge";')

# Patch initiateCollection
collection_old = r'''      await publishKafka\("paygate\.mobile_money\.collection_initiated", \{
        txnId: txn\.id, reference, merchantId: input\.merchantId,
        providerCode: input\.providerCode, amountKobo: input\.amountKobo,
        currency: input\.currency, msisdn: input\.customerMsisdn,
        timestamp: new Date\(\)\.toISOString\(\),
      \}\);
      return txn;'''

collection_new = '''      await publishKafka("paygate.mobile_money.collection_initiated", {
        txnId: txn.id, reference, merchantId: input.merchantId,
        providerCode: input.providerCode, amountKobo: input.amountKobo,
        currency: input.currency, msisdn: input.customerMsisdn,
        timestamp: new Date().toISOString(),
      });
      
      // TigerBeetle wiring
      creditWalletViaMiddleware({
        walletId: `wallet_${input.merchantId}`,
        userId: input.merchantId,
        amount: input.amountKobo,
        currency: input.currency,
        reference: reference,
        description: `Mobile Money Collection from ${input.customerMsisdn}`,
      }).catch(e => console.error("[TigerBeetle] Mobile money collection credit failed:", e));
      
      return txn;'''

content = re.sub(collection_old, collection_new, content)

# Patch initiateDisbursement
disbursement_old = r'''      await publishKafka\("paygate\.mobile_money\.disbursement_initiated", \{
        txnId: txn\.id, reference, merchantId: input\.merchantId,
        providerCode: input\.providerCode, amountKobo: input\.amountKobo,
        currency: input\.currency, msisdn: input\.recipientMsisdn,
        timestamp: new Date\(\)\.toISOString\(\),
      \}\);
      return txn;'''

disbursement_new = '''      await publishKafka("paygate.mobile_money.disbursement_initiated", {
        txnId: txn.id, reference, merchantId: input.merchantId,
        providerCode: input.providerCode, amountKobo: input.amountKobo,
        currency: input.currency, msisdn: input.recipientMsisdn,
        timestamp: new Date().toISOString(),
      });
      
      // TigerBeetle wiring
      debitWalletViaMiddleware({
        walletId: `wallet_${input.merchantId}`,
        userId: input.merchantId,
        amount: input.amountKobo,
        currency: input.currency,
        reference: reference,
        description: `Mobile Money Disbursement to ${input.recipientMsisdn}`,
      }).catch(e => console.error("[TigerBeetle] Mobile money disbursement debit failed:", e));
      
      return txn;'''

content = re.sub(disbursement_old, disbursement_new, content)

with open('server/routers/mobileMoney.ts', 'w') as f:
    f.write(content)

print("mobileMoney.ts patched successfully")
