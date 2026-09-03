/**
 * publicRestAuth.ts — Secret-key authentication for the public REST v1 API.
 *
 * Paystack-parity: `Authorization: Bearer sk_live_xxx` / `sk_test_xxx`.
 *
 * The `api_secret_keys` table is defined HERE (not in drizzle/schema.ts, which
 * is owned by another workstream); the DDL lives in
 * drizzle/0094_public_rest_tokenization.sql. Drizzle pgTable definitions are
 * plain descriptors — co-locating them with the only consumer is safe.
 *
 * Auth chain:
 *   1. api_secret_keys lookup by SHA-256(key) with a constant-time compare of
 *      the stored hash (guards against partial-equality oracles).
 *   2. Fallback: legacy developer_api_keys rows (isActive) so existing
 *      integrations keep working.
 *
 * Failures → 401 with the standard Paystack envelope.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { eq, and } from "drizzle-orm";
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { getDb } from "../db";
import { developerApiKeys } from "../../drizzle/schema";

// ─── Table descriptor (DDL: drizzle/0094_public_rest_tokenization.sql) ───────

export const apiSecretKeys = pgTable("api_secret_keys", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  label: text("label"),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  last4: text("last4").notNull(),
  status: text("status").notNull().default("active"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
}, (t) => [
  index("api_secret_keys_merchant_idx").on(t.merchantId),
  index("api_secret_keys_hash_idx").on(t.keyHash),
]);

export type ApiSecretKey = typeof apiSecretKeys.$inferSelect;

// ─── Key helpers ──────────────────────────────────────────────────────────────

/** Hash a presented secret key. Keys are high-entropy; SHA-256 is sufficient. */
export function hashSecretKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Generate a new secret key material pair (used by key-management UIs/tests). */
export function generateSecretKey(env: "live" | "test"): { key: string; hash: string; last4: string } {
  const key = `sk_${env}_${randomBytes(24).toString("hex")}`;
  return { key, hash: hashSecretKey(key), last4: key.slice(-4) };
}

/** Constant-time string equality (padded to equal length semantics). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// ─── Express request augmentation ─────────────────────────────────────────────

export interface RestAuth {
  merchantId: string;
  keyId: string;
  keyPrefix: string; // sk_live | sk_test | legacy
  environment: "live" | "test";
}

declare module "express-serve-static-core" {
  interface Request {
    restAuth?: RestAuth;
  }
}

function unauthorized(res: Response, message: string) {
  return res.status(401).json({ status: false, message, data: null });
}

/**
 * Express middleware enforcing secret-key auth on every public REST route.
 * Attaches `req.restAuth = { merchantId, keyId, ... }` on success.
 */
export function publicRestAuth(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization ?? "";
      const match = /^Bearer\s+(sk_(?:live|test)_[A-Za-z0-9]+)$/i.exec(header.trim());
      if (!match) {
        return unauthorized(res, "Invalid or missing Authorization header. Expected 'Bearer sk_live_...'.");
      }
      const presentedKey = match[1];
      const presentedHash = hashSecretKey(presentedKey);

      const db = await getDb();
      if (!db) {
        return res.status(503).json({
          status: false,
          message: "Authentication service unavailable (database not reachable)",
          data: null,
        });
      }

      // ── Primary: api_secret_keys ──────────────────────────────────────────
      const rows = await db
        .select()
        .from(apiSecretKeys)
        .where(eq(apiSecretKeys.keyHash, presentedHash))
        .limit(1);

      const keyRow = rows[0];
      if (keyRow) {
        // Constant-time confirm of the hash we looked up (defends against any
        // collation/partial-match surprises in the storage layer).
        if (!safeEqual(keyRow.keyHash, presentedHash)) {
          return unauthorized(res, "Invalid API key");
        }
        if (keyRow.status !== "active") {
          return unauthorized(res, "This API key has been revoked");
        }
        // Best-effort last-used stamp (never block the request).
        db.update(apiSecretKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiSecretKeys.id, keyRow.id))
          .catch(() => undefined);

        req.restAuth = {
          merchantId: keyRow.merchantId,
          keyId: keyRow.id,
          keyPrefix: keyRow.keyPrefix,
          environment: keyRow.keyPrefix === "sk_live" ? "live" : "test",
        };
        return next();
      }

      // ── Fallback: legacy developer_api_keys ──────────────────────────────
      try {
        const legacy = await db
          .select()
          .from(developerApiKeys)
          .where(and(eq(developerApiKeys.keyHash, presentedHash), eq(developerApiKeys.isActive, true)))
          .limit(1);
        const legacyRow = legacy[0];
        if (legacyRow && safeEqual(legacyRow.keyHash, presentedHash)) {
          db.update(developerApiKeys)
            .set({ lastUsedAt: new Date() })
            .where(eq(developerApiKeys.id, legacyRow.id))
            .catch(() => undefined);
          req.restAuth = {
            merchantId: legacyRow.merchantId,
            keyId: legacyRow.id,
            keyPrefix: legacyRow.keyPrefix ?? "legacy",
            environment: legacyRow.environment === "live" ? "live" : "test",
          };
          return next();
        }
      } catch {
        // Legacy table missing in some deployments — fall through to 401.
      }

      return unauthorized(res, "Invalid API key");
    } catch (err) {
      return res.status(503).json({
        status: false,
        message: `Authentication failed: ${err instanceof Error ? err.message : String(err)}`,
        data: null,
      });
    }
  };
}
