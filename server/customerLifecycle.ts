/**
 * customerLifecycle.ts — M11 customer data-lifecycle helpers.
 *
 *   - anonymizeCustomer(merchantId, customerId): GDPR-style erasure. Scrubs
 *     PII from the customers row and hashes/tokenizes customerEmail /
 *     customerName / customerPhone on historical transactions — amounts,
 *     references, and all financial fields are preserved untouched.
 *   - mergeCustomers(merchantId, sourceId, targetId): repoints FK references
 *     from the source customer onto the target inside ONE transaction, folds
 *     aggregate stats, then deletes the source row.
 *
 * wire into customers router — these helpers are exported for the customers
 * tRPC router (routers.ts / crud*.ts), which is outside this module's
 * ownership; do not call them from here.
 */
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { logger } from "./logger";

/** Deterministic HMAC token — stable per merchant so analytics joins still work. */
function tokenize(merchantId: string, value: string): string {
  return (
    "anon_" +
    crypto.createHmac("sha256", `paygate-anonymize:${merchantId}`).update(value).digest("hex").slice(0, 24)
  );
}

export interface AnonymizeResult {
  anonymized: boolean;
  transactionsScrubbed: number;
}

/**
 * Anonymize a customer: scrub PII on the customers row and tokenize PII on
 * historical transactions (amounts/refs/status untouched).
 */
export async function anonymizeCustomer(merchantId: string, customerId: string): Promise<AnonymizeResult> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const found = await db.execute(sql`
    SELECT id, email FROM customers WHERE id = ${customerId} AND merchant_id = ${merchantId} LIMIT 1
  `);
  const customer = ((found as any)?.rows ?? [])[0];
  if (!customer) {
    logger.warn(`[customerLifecycle] anonymize: customer ${customerId} not found for merchant ${merchantId}`);
    return { anonymized: false, transactionsScrubbed: 0 };
  }

  const email = String(customer.email ?? "");
  const anonEmail = `${tokenize(merchantId, email || customerId)}@anonymized.local`;
  const anonMarker = tokenize(merchantId, customerId);

  let txScrubbed = 0;
  await db.transaction(async (tx: any) => {
    // 1. Scrub the customers row (id/merchant/financial aggregates preserved).
    await tx.execute(sql`
      UPDATE customers
      SET email = ${anonEmail},
          name = 'Anonymized Customer',
          phone = NULL,
          metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ anonymized_at: new Date().toISOString() })}::jsonb,
          updated_at = NOW()
      WHERE id = ${customerId} AND merchant_id = ${merchantId}
    `);

    // 2. Tokenize PII on historical transactions BY THE OLD EMAIL (the join
    //    key); amounts/references are never touched.
    if (email) {
      const res = await tx.execute(sql`
        UPDATE transactions
        SET customer_email = ${anonEmail},
            customer_name = ${"anon_" + anonMarker.slice(5, 17)},
            customer_phone = NULL,
            updated_at = NOW()
        WHERE merchant_id = ${merchantId} AND customer_email = ${email}
      `);
      txScrubbed = Number((res as any)?.rowCount ?? (res as any)?.count ?? 0);
    }
  });

  logger.info(`[customerLifecycle] anonymized customer ${customerId} (merchant ${merchantId}); ${txScrubbed} transaction(s) tokenized`);
  return { anonymized: true, transactionsScrubbed: txScrubbed };
}

export interface MergeResult {
  merged: boolean;
  repointed: Record<string, number>;
}

/**
 * Merge source customer into target: repoint all FK-bearing tables to the
 * target inside ONE transaction, fold aggregate stats, delete the source.
 */
export async function mergeCustomers(merchantId: string, sourceId: string, targetId: string): Promise<MergeResult> {
  if (sourceId === targetId) throw new Error("sourceId and targetId must differ");
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const found = await db.execute(sql`
    SELECT id, email, total_transactions, total_spend FROM customers
    WHERE merchant_id = ${merchantId} AND id IN (${sourceId}, ${targetId})
  `);
  const rows: any[] = (found as any)?.rows ?? [];
  const source = rows.find((r) => r.id === sourceId);
  const target = rows.find((r) => r.id === targetId);
  if (!source || !target) {
    logger.warn(`[customerLifecycle] merge: source/target not found (merchant ${merchantId}, ${sourceId} → ${targetId})`);
    return { merged: false, repointed: {} };
  }

  const repointed: Record<string, number> = {};
  await db.transaction(async (tx: any) => {
    // Repoint FK columns that reference customers.id. Each UPDATE is scoped by
    // merchant_id; missing tables would abort the whole merge (fail loud).
    const repoint = async (table: string, column: string) => {
      const res = await tx.execute(
        sql.raw(
          `UPDATE "${table}" SET "${column}" = '${targetId.replace(/'/g, "''")}' ` +
          `WHERE merchant_id = '${merchantId.replace(/'/g, "''")}' AND "${column}" = '${sourceId.replace(/'/g, "''")}'`,
        ),
      );
      repointed[`${table}.${column}`] = Number((res as any)?.rowCount ?? (res as any)?.count ?? 0);
    };

    await repoint("payment_requests", "customer_id");
    await repoint("customer_identifications", "customer_id");
    await repoint("debit_mandates", "customer_id");

    // Transactions key customers by email — repoint by the source's email.
    if (source.email) {
      const res = await tx.execute(sql`
        UPDATE transactions
        SET customer_email = ${target.email}, updated_at = NOW()
        WHERE merchant_id = ${merchantId} AND customer_email = ${source.email}
      `);
      repointed["transactions.customer_email"] = Number((res as any)?.rowCount ?? (res as any)?.count ?? 0);
    }

    // Fold aggregate stats onto the target, then remove the source row.
    await tx.execute(sql`
      UPDATE customers
      SET total_transactions = COALESCE(total_transactions, 0) + COALESCE(${Number(source.total_transactions ?? 0)}, 0),
          total_spend = COALESCE(total_spend, 0) + COALESCE(${Number(source.total_spend ?? 0)}, 0),
          metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ merged_from: sourceId, merged_at: new Date().toISOString() })}::jsonb,
          updated_at = NOW()
      WHERE id = ${targetId} AND merchant_id = ${merchantId}
    `);
    await tx.execute(sql`
      DELETE FROM customers WHERE id = ${sourceId} AND merchant_id = ${merchantId}
    `);
  });

  logger.info(`[customerLifecycle] merged customer ${sourceId} → ${targetId} (merchant ${merchantId}): ${JSON.stringify(repointed)}`);
  return { merged: true, repointed };
}
