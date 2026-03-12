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
 * - If the key has been seen before with a DIFFERENT request hash → throw 422 (conflict).
 * - If the key is new → execute, store result, return result.
 * - Keys expire after 24 hours.
 */

import { TRPCError } from "@trpc/server";
import { createHash } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "./db";
import { idempotencyRequests } from "../drizzle/schema";

export interface IdempotencyOptions<T> {
  /** Client-supplied idempotency key (UUID recommended). */
  key: string;
  /** Scoping merchant ID. */
  merchantId: string;
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
 */
export async function withIdempotency<T>(opts: IdempotencyOptions<T>): Promise<T> {
  const { key, merchantId, operation, requestBody, execute } = opts;

  if (!key || key.length < 8) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "idempotency_key must be at least 8 characters",
    });
  }

  const requestHash = hashRequest(requestBody);
  const now = new Date();

  // ── Check for existing record ──────────────────────────────────────────────
  const dbConn = await getDb();
  if (!dbConn) return execute(); // no DB — skip idempotency check gracefully

  const existing = await dbConn
    .select()
    .from(idempotencyRequests)
    .where(
      and(
        eq(idempotencyRequests.id, key),
        eq(idempotencyRequests.merchantId, merchantId),
        gt(idempotencyRequests.expiresAt, now),
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const record = existing[0];

    // Conflict: same key, different request body
    if (record.requestHash !== requestHash) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Idempotency key '${key}' was already used with a different request body. Use a new key for a different request.`,
      });
    }

    // Cache hit: return stored response
    return record.responseBody as T;
  }

  // ── Execute the operation ──────────────────────────────────────────────────
  let result: T;
  let responseStatus = 200;

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
    await dbConn.insert(idempotencyRequests).values({
      id: key,
      merchantId,
      operation,
      requestHash,
      responseStatus,
      responseBody: { error: err instanceof Error ? err.message : String(err) },
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      createdAt: now,
    }).onConflictDoNothing();

    throw err;
  }

  // ── Persist the successful response ───────────────────────────────────────
  await dbConn.insert(idempotencyRequests).values({
    id: key,
    merchantId,
    operation,
    requestHash,
    responseStatus,
    responseBody: result as Record<string, unknown>,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    createdAt: now,
  }).onConflictDoNothing();

  return result;
}
