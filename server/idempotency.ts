/**
 * Idempotency middleware for PayGate tRPC procedures.
 *
 * Usage:
 *   const result = await withIdempotency(ctx, {
 *     key: input.idempotencyKey,
 *     operation: "transactions.create",
 *     requestBody: input,
 *     execute: async () => { ... return result; },
 *   });
 *
 * Guarantees:
 * - If the key has been seen before with the same request hash → return cached response immediately.
 * - If the key has been seen before with a DIFFERENT request hash → throw 422/409 (conflict).
 * - If the key is new → claim it atomically (INSERT ... ON CONFLICT DO NOTHING), execute,
 *   store result, return result. Concurrent same-key callers lose the insert race and
 *   either replay the stored response or get 409 while the winner is still executing.
 * - Keys expire after 24 hours.
 */

import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { idempotencyRequests } from "../drizzle/schema";

// ─── C16: stuck-102 recovery constants ────────────────────────────────────────
/** A placeholder row (responseStatus 102, null body) older than this is stuck. */
export const STUCK_102_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Tables an idempotency row is allowed to reference for entity synthesis.
 * entity_table values come from server code (markIdempotencyEntity), never
 * from clients, but the lookup still whitelists identifiers defensively
 * (the table name is interpolated into raw SQL).
 */
const ENTITY_TABLE_WHITELIST = new Set([
  "transactions", "payouts", "refunds", "subscriptions", "customers",
  "transfers", "payment_requests", "transfer_recipients", "split_groups",
  "debit_mandates", "hosted_payment_sessions", "invoices", "settlements",
]);

/**
 * C16(a): stamp the created entity onto an in-flight idempotency placeholder
 * row DURING execution. Compatible with withIdempotency — call it from inside
 * `execute` once the entity row exists:
 *   await withIdempotency({ ..., execute: async () => {
 *     const row = await createThing();
 *     await markIdempotencyEntity(key, "transactions", row.id);
 *     return row;
 *   }});
 * If the process crashes before the success response is persisted, a replay of
 * the stuck-102 row can synthesize the success from this entity reference.
 */
export async function markIdempotencyEntity(
  key: string,
  entityTable: string,
  entityId: string,
): Promise<void> {
  if (!ENTITY_TABLE_WHITELIST.has(entityTable)) {
    throw new Error(`markIdempotencyEntity: table '${entityTable}' is not in the entity whitelist`);
  }
  const dbConn = await getDb();
  if (!dbConn) return;
  await dbConn.execute(sql`
    UPDATE idempotency_requests
    SET entity_table = ${entityTable}, entity_id = ${entityId}
    WHERE id = ${key} AND response_status = 102
  `);
}

/**
 * Look up the entity referenced by a stuck idempotency row and synthesize the
 * success response ({ entity, replayed: true }). Returns null when the entity
 * is gone or the reference is invalid.
 */
export async function synthesizeFromEntityRef(
  entityTable: string,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  if (!ENTITY_TABLE_WHITELIST.has(entityTable) || !entityId) return null;
  const dbConn = await getDb();
  if (!dbConn) return null;
  const result = await dbConn.execute(
    sql.raw(`SELECT * FROM "${entityTable}" WHERE id = '${entityId.replace(/'/g, "''")}' LIMIT 1`),
  );
  const rows: any[] = (result as any)?.rows ?? (Array.isArray(result) ? result : []);
  if (!rows.length) return null;
  return { ...rows[0], replayed: true } as Record<string, unknown>;
}

/**
 * Read the entity reference columns (added by migration 0104 — not on the
 * drizzle table object, schema.ts is append-only) for a row.
 */
async function readEntityRef(dbConn: any, key: string): Promise<{ entityTable: string | null; entityId: string | null }> {
  try {
    const result = await dbConn.execute(sql`
      SELECT entity_table, entity_id FROM idempotency_requests WHERE id = ${key} LIMIT 1
    `);
    const rows: any[] = (result as any)?.rows ?? (Array.isArray(result) ? result : []);
    return { entityTable: rows[0]?.entity_table ?? null, entityId: rows[0]?.entity_id ?? null };
  } catch {
    return { entityTable: null, entityId: null }; // columns not migrated yet
  }
}

export interface IdempotencyOptions<T> {
  /** Client-supplied idempotency key (UUID recommended). */
  key: string;
  /** Scoping merchant ID. */
  merchantId: string;
  /** Scoping tenant ID (defaults to "ten_default"). */
  tenantId?: string;
  /** Logical operation name, e.g. "transactions.create". */
  operation: string;
  /** The full request body — used to detect conflicting replays. */
  requestBody: unknown;
  /** The actual operation to execute if no cached result exists. */
  execute: () => Promise<T>;
}

/**
 * SHA-256 hash of the serialised request body.
 * Used to detect when the same key is replayed with different parameters.
 */
function hashRequest(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
}

/** tRPC error code -> HTTP-ish status persisted on the idempotency row. */
const TRPC_CODE_TO_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_CONTENT: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  PRECONDITION_FAILED: 412,
  SERVICE_UNAVAILABLE: 503,
} as const;
const TRPC_CODE_SET: Record<string, true> = Object.fromEntries(
  Object.keys(TRPC_CODE_TO_STATUS).map((k) => [k, true])
);
/** Reverse lookup used when a legacy stored row has no `code` field. */
const STATUS_TO_TRPC_CODE: Record<number, keyof typeof TRPC_CODE_TO_STATUS> =
  Object.fromEntries(
    Object.entries(TRPC_CODE_TO_STATUS).map(([code, status]) => [
      status,
      code as keyof typeof TRPC_CODE_TO_STATUS,
    ])
  );

/**
 * withIdempotency wraps any async operation with exactly-once semantics.
 *
 * Atomicity: the key is claimed FIRST via INSERT ... ON CONFLICT DO NOTHING
 * RETURNING. Exactly one concurrent caller wins the insert; losers fall into
 * the replay/conflict path and never re-execute the operation. The winner's
 * placeholder row (responseStatus 102, null body) is updated in place once
 * execution completes.
 */
export async function withIdempotency<T>(opts: IdempotencyOptions<T>): Promise<T> {
  const { key, merchantId, operation, requestBody, execute } = opts;
  const tenantId = opts.tenantId ?? "ten_default";

  if (!key || key.length < 8) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "idempotency_key must be at least 8 characters",
    });
  }

  const requestHash = hashRequest(requestBody);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h TTL

  const dbConn = await getDb();
  if (!dbConn) return execute(); // no DB — skip idempotency check gracefully

  // ── Atomically claim the key (single round-trip, race-safe) ───────────────
  // responseStatus 102 = "Processing": placeholder row written before execution.
  const claimed = await dbConn
    .insert(idempotencyRequests)
    .values({
      id: key,
      merchantId,
      tenantId,
      operation,
      requestHash,
      responseStatus: 102,
      responseBody: null,
      expiresAt,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyRequests.id });

  if (claimed.length === 0) {
    // ── Key already exists: replay, conflict, or in-progress ────────────────
    const existing = await dbConn
      .select()
      .from(idempotencyRequests)
      .where(
        and(
          eq(idempotencyRequests.id, key),
          eq(idempotencyRequests.merchantId, merchantId),
        )
      )
      .limit(1);

    const record = existing[0];
    if (record && record.expiresAt <= now) {
      // Expired key: evict and re-claim atomically, then execute as new.
      await dbConn
        .delete(idempotencyRequests)
        .where(
          and(
            eq(idempotencyRequests.id, key),
            eq(idempotencyRequests.merchantId, merchantId),
          )
        );
      return withIdempotency(opts); // re-run the claim path
    }

    if (!record) {
      // Unique-violation loser whose winner's row isn't visible yet — treat as in-flight.
      throw new TRPCError({
        code: "CONFLICT",
        message: `A request with idempotency key '${key}' is currently being processed. Retry after it completes.`,
      });
    }

    // Conflict: same key, different request body
    if (record.requestHash !== requestHash) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Idempotency key '${key}' was already used with a different request body. Use a new key for a different request.`,
      });
    }

    // In-flight: the winner claimed the key but hasn't finished executing.
    if (record.responseBody == null) {
      // C16(b): a placeholder older than 15 min is STUCK — the winner crashed
      // mid-execution. Recover instead of 409ing forever.
      const isStuck = now.getTime() - new Date(record.createdAt).getTime() > STUCK_102_THRESHOLD_MS;
      if (isStuck) {
        const { entityTable, entityId } = await readEntityRef(dbConn, key);
        if (entityTable && entityId) {
          // The mutation stamped its entity before crashing — look it up and
          // synthesize the success response (no re-execution, no 409).
          const synthesized = await synthesizeFromEntityRef(entityTable, entityId);
          if (synthesized) {
            await dbConn.execute(sql`
              UPDATE idempotency_requests
              SET response_status = 200, response_body = ${JSON.stringify(synthesized)}::jsonb
              WHERE id = ${key} AND response_status = 102
            `).catch(() => { /* best-effort persist; still return the entity */ });
            return synthesized as T;
          }
        }
        // No usable entity reference: mark the stuck row failed for audit and
        // evict it so THIS request re-executes the operation as a fresh claim.
        await dbConn.execute(sql`
          UPDATE idempotency_requests
          SET response_status = 500,
              response_body = ${JSON.stringify({ error: "stuck-102 placeholder evicted after 15min without entity reference", code: "INTERNAL_SERVER_ERROR" })}::jsonb
          WHERE id = ${key} AND response_status = 102
        `).catch(() => { /* non-fatal */ });
        await dbConn
          .delete(idempotencyRequests)
          .where(
            and(
              eq(idempotencyRequests.id, key),
              eq(idempotencyRequests.merchantId, merchantId),
            )
          );
        return withIdempotency(opts); // re-run the claim path as new
      }
      throw new TRPCError({
        code: "CONFLICT",
        message: `A request with idempotency key '${key}' is currently being processed. Retry after it completes.`,
      });
    }

    // R4 F5 (spec #11): a stored FAILED response must be re-thrown, never
    // returned as a success payload. Errors are persisted as
    // { error: string, code: TRPC_ERROR_CODE } alongside responseStatus >= 400.
    if (record.responseStatus >= 400) {
      const stored = (record.responseBody ?? {}) as { error?: unknown; code?: unknown };
      const message =
        typeof stored.error === "string" && stored.error.length > 0
          ? stored.error
          : `Stored failure for idempotency key '${key}' (HTTP ${record.responseStatus})`;
      const code: keyof typeof TRPC_CODE_TO_STATUS =
        typeof stored.code === "string" && stored.code in TRPC_CODE_TO_STATUS
          ? (stored.code as keyof typeof TRPC_CODE_TO_STATUS)
          : (STATUS_TO_TRPC_CODE[record.responseStatus] ?? "INTERNAL_SERVER_ERROR");
      throw new TRPCError({ code, message });
    }

    // Cache hit: return stored response without re-executing.
    return record.responseBody as T;
  }

  // ── We claimed the key: execute the operation ─────────────────────────────
  let result: T;
  let responseStatus = 200;

  const persist = (body: unknown) =>
    dbConn
      .update(idempotencyRequests)
      .set({ responseStatus, responseBody: body as Record<string, unknown>, expiresAt })
      .where(
        and(
          eq(idempotencyRequests.id, key),
          eq(idempotencyRequests.merchantId, merchantId),
        )
      );

  try {
    result = await execute();
  } catch (err) {
    // Store failed responses too so retries get the same error
    responseStatus = 500;
    if (err instanceof TRPCError) {
      responseStatus =
        TRPC_CODE_TO_STATUS[err.code as keyof typeof TRPC_CODE_TO_STATUS] ?? 500;
    }

    // C16(c): NEVER persist 5xx / throwable infrastructure errors — a crashed
    // or 5xx'd execution must be re-runnable by the client (the key is NOT
    // burned). Only business 4xx failures are deterministic and safe to replay.
    const isBusiness4xx = responseStatus >= 400 && responseStatus < 500;
    if (!isBusiness4xx) {
      // Evict the placeholder so the client's retry re-executes cleanly.
      // If eviction fails the row stays 102 and is recovered by the stuck-102
      // path (15 min) or the idempotencyCleanup worker.
      await dbConn
        .delete(idempotencyRequests)
        .where(
          and(
            eq(idempotencyRequests.id, key),
            eq(idempotencyRequests.merchantId, merchantId),
            eq(idempotencyRequests.responseStatus, 102),
          )
        )
        .catch(() => { /* best-effort — stuck-102 recovery is the backstop */ });
      throw err;
    }

    // Persist the business error (message + tRPC code) so replays re-THROW the
    // same error without re-executing (spec #11).
    await persist({
      error: err instanceof Error ? err.message : String(err),
      code: err instanceof TRPCError ? err.code : "INTERNAL_SERVER_ERROR",
    });

    throw err;
  }

  // ── Persist the successful response onto the claimed placeholder ──────────
  await persist(result);

  return result;
}
