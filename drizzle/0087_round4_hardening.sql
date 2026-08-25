-- 0087_round4_hardening — Round-4 remediation (F14): dedupe-critical unique indexes.
-- All statements are idempotent (IF NOT EXISTS). Nullable columns use partial
-- indexes so rows without a value are never constrained.

-- (a) orders.checkout_session_id — idempotent checkout completion
-- (server/routers/ecommerce.ts completeCheckout relies on a unique violation to
-- return the already-created order instead of double-crediting). This index was
-- first created by 0085; it is restated here so databases that missed 0085 still
-- gain the guard. It is a no-op where 0085 already ran.
CREATE UNIQUE INDEX IF NOT EXISTS "orders_checkout_session_id_unique" ON "orders" USING btree ("checkout_session_id");
--> statement-breakpoint
-- (b) usdc_v2_transactions.tx_hash — on-chain transaction hashes are globally
-- unique; a replayed chain webhook must never record the same transfer twice.
-- Partial because tx_hash is NULL for off-chain (convert) rows.
CREATE UNIQUE INDEX IF NOT EXISTS "usdc_v2_transactions_tx_hash_unique" ON "usdc_v2_transactions" USING btree ("tx_hash") WHERE "tx_hash" IS NOT NULL;
--> statement-breakpoint
-- (c) usdc_payouts.reference — merchant-supplied payout reference; a retry with
-- the same reference must not execute a second payout. Partial because the
-- reference is optional.
CREATE UNIQUE INDEX IF NOT EXISTS "usdc_payouts_reference_unique" ON "usdc_payouts" USING btree ("reference") WHERE "reference" IS NOT NULL;
--> statement-breakpoint
-- (d) verified already-unique elsewhere (no action needed): wallet_transactions
-- (tenant_id, reference) [wallet_tx_tenant_ref_uniq], mobile_money_transactions.reference,
-- usdc_deposits.solana_signature, consumer_loyalty_txns.reference_id,
-- consumer_wallets (user_id, currency), consumer_wallet_txns (wallet_id, reference) [0085].
