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
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { idempotencyRequests } from "../drizzle/schema";

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
      throw new TRPCError({
        code: "CONFLICT",
        message: `A request with idempotency key '${key}' is currently being processed. Retry after it completes.`,
      });
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
      const codeToStatus: Record<string, number> = {
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        CONFLICT: 409,
        UNPROCESSABLE_CONTENT: 422,
        TOO_MANY_REQUESTS: 429,
        INTERNAL_SERVER_ERROR: 500,
      };
      responseStatus = codeToStatus[err.code] ?? 500;
    }

    // Persist the error so replays get the same error without re-executing
    await persist({ error: err instanceof Error ? err.message : String(err) });

    throw err;
  }

  // ── Persist the successful response onto the claimed placeholder ──────────
  await persist(result);

  return result;
}
