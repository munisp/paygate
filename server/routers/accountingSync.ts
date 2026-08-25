/**
 * Accounting Sync router (P0-e) — QuickBooks Online, Xero, Odoo.
 *
 * Thin orchestration layer over python-services/accounting-sync:
 *   connect        → consent URL from the sync service (503 propagates)
 *   handleCallback → code exchange → upsert accounting_connections (encrypted
 *                    tokens stored verbatim; plaintext never touches this host)
 *   disconnect     → guarded merchant-owned DELETE
 *   listConnections→ token fields NEVER returned
 *   syncNow        → idempotent push/pull run with single-writer token refresh
 *   listSyncRuns / getEntityMap
 *
 * Pull materializes provider bills into ap_bills (source='accounting_sync',
 * idempotency key `acct:{connectionId}:{remoteId}`) and invoices into the AR
 * invoices table — each exactly once, guarded by the accounting_entity_map
 * UNIQUE(connection_id, entity, remote_id).
 */
import { randomUUID } from "crypto";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getMerchantByOwnerId, getUserByOpenId } from "../db";
import { ENV } from "../_core/env";
import { withIdempotency } from "../idempotency";
import { publishEvent } from "../kafkaClient";
import { auditLog, buildAuditEntry } from "../auditTrail";
import {
  accountingConnections,
  accountingEntityMap,
  accountingSyncRuns,
  apBills,
  apPayments,
  invoices,
  vendors,
} from "../../drizzle/schema";

// ─── enums & constants ────────────────────────────────────────────────────────
const providerEnum = z.enum(["quickbooks", "xero", "odoo"]);
const entityEnum = z.enum(["bill", "invoice", "payment"]);
const directionEnum = z.enum(["push", "pull"]);

const SYNC_TOPIC = "paygate.accounting.sync";
/** Refresh tokens this far ahead of expiry (clock skew + in-flight requests). */
const REFRESH_SKEW_MS = 60_000;
/** Lease written by the single-writer refresh claim while a refresh runs. */
const REFRESH_LEASE_MS = 10 * 60 * 1000;
const MAX_PULL_RECORDS = 200;

// ─── merchant resolution (never trust client-supplied merchant ids) ──────────
async function resolveMerchant(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant;
}

async function resolveMerchantId(openId: string): Promise<string> {
  return (await resolveMerchant(openId)).id;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// ─── sync-service client ──────────────────────────────────────────────────────
async function callAccountingService(path: string, body: unknown, timeoutMs = 45_000): Promise<any> {
  let resp: Response;
  try {
    resp = await fetch(`${ENV.accountingSyncUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": ENV.internalApiKey,
      },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `accounting-sync unreachable: ${err.message}`,
    });
  }
  if (!resp.ok) {
    const excerpt = await resp.text().catch(() => "");
    // Propagate upstream status semantics: 503 (provider_not_configured /
    // token_crypto_not_configured) stays 503; other failures map to the
    // closest tRPC code. The body excerpt is preserved, never swallowed.
    const code =
      resp.status === 503 ? "SERVICE_UNAVAILABLE"
      : resp.status === 401 || resp.status === 403 ? "FORBIDDEN"
      : resp.status >= 500 ? "INTERNAL_SERVER_ERROR"
      : "BAD_REQUEST";
    throw new TRPCError({
      code,
      message: `accounting-sync ${resp.status}: ${excerpt.slice(0, 300)}`,
    });
  }
  return resp.json();
}

// ─── events (non-fatal) ───────────────────────────────────────────────────────
async function emitSyncEvent(payload: Record<string, unknown>) {
  try {
    await publishEvent(SYNC_TOPIC, payload);
  } catch {
    // Kafka is non-fatal on this path — the run row is the source of truth.
  }
}

// ─── ownership ────────────────────────────────────────────────────────────────
async function getOwnedConnection(db: any, connectionId: string, merchantId: string) {
  const [conn] = await db
    .select()
    .from(accountingConnections)
    .where(and(
      eq(accountingConnections.id, connectionId),
      eq(accountingConnections.merchantId, merchantId),
    ))
    .limit(1);
  if (!conn) throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found" });
  return conn;
}

// ─── single-writer token refresh ──────────────────────────────────────────────
/**
 * Returns a connection row with a usable access token.
 *
 * When the token is expired (or within the skew window) exactly one writer
 * claims the right to refresh by atomically moving token_expires_at forward
 * (UPDATE ... WHERE id AND token_expires_at < now+skew RETURNING). Losers
 * re-read the row and use the tokens the winner wrote. The claim is rolled
 * back if the refresh call fails, so a later sync can retry.
 */
async function ensureFreshAccessToken(db: any, conn: any): Promise<any> {
  const now = Date.now();
  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : null;
  if (expiresAt && expiresAt - REFRESH_SKEW_MS > now) return conn; // still valid
  if (!conn.refreshTokenEnc) return conn; // nothing to refresh with

  const claimed = await db
    .update(accountingConnections)
    .set({ tokenExpiresAt: new Date(now + REFRESH_LEASE_MS), updatedAt: new Date() })
    .where(and(
      eq(accountingConnections.id, conn.id),
      lt(accountingConnections.tokenExpiresAt, new Date(now + REFRESH_SKEW_MS)),
    ))
    .returning();

  if (!claimed[0]) {
    // Another writer is refreshing (or already did) — re-read and use it.
    const [reread] = await db
      .select()
      .from(accountingConnections)
      .where(eq(accountingConnections.id, conn.id))
      .limit(1);
    return reread ?? conn;
  }

  try {
    const result = await callAccountingService(`/${conn.provider}/refresh`, {
      refresh_token_enc: conn.refreshTokenEnc,
    });
    const newExpiresAt = result.expires_in
      ? new Date(Date.now() + result.expires_in * 1000)
      : null;
    const updated = await db
      .update(accountingConnections)
      .set({
        accessTokenEnc: result.access_token_enc,
        refreshTokenEnc: result.refresh_token_enc ?? conn.refreshTokenEnc,
        tokenExpiresAt: newExpiresAt,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(accountingConnections.id, conn.id))
      .returning();
    return updated[0] ?? {
      ...conn,
      accessTokenEnc: result.access_token_enc,
      refreshTokenEnc: result.refresh_token_enc ?? conn.refreshTokenEnc,
      tokenExpiresAt: newExpiresAt,
    };
  } catch (err) {
    // Release the claim so the next sync retries, and mark the connection.
    await db
      .update(accountingConnections)
      .set({ tokenExpiresAt: conn.tokenExpiresAt, status: "error", updatedAt: new Date() })
      .where(eq(accountingConnections.id, conn.id))
      .returning();
    throw err;
  }
}

// ─── pull: provider → local rows ──────────────────────────────────────────────
function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function applyPulledRecords(
  db: any,
  merchantId: string,
  conn: any,
  entity: string,
  records: any[],
): Promise<number> {
  let created = 0;
  for (const rec of records.slice(0, MAX_PULL_RECORDS)) {
    const remoteId = String(rec.remote_id);
    const remoteUpdatedAt = toDate(rec.updated_at);
    const [existing] = await db
      .select()
      .from(accountingEntityMap)
      .where(and(
        eq(accountingEntityMap.connectionId, conn.id),
        eq(accountingEntityMap.entity, entity),
        eq(accountingEntityMap.remoteId, remoteId),
      ))
      .limit(1);

    if (existing) {
      // Mapping exists → the local row was already materialized; just track
      // the remote modification stamp. This is what makes pulls idempotent.
      await db
        .update(accountingEntityMap)
        .set({ remoteUpdatedAt })
        .where(eq(accountingEntityMap.id, existing.id))
        .returning();
      continue;
    }

    if (entity === "bill") {
      const [bill] = await db
        .insert(apBills)
        .values({
          merchantId,
          billNumber: rec.bill_number ?? null,
          status: "draft",
          source: "accounting_sync",
          sourceRef: `${conn.provider}:${remoteId}`,
          currency: rec.currency ?? "NGN",
          totalKobo: rec.total_kobo ?? 0,
          dueDate: toDate(rec.due_date),
          extractedData: rec.raw ?? rec,
          idempotencyKey: `acct:${conn.id}:${remoteId}`,
        })
        .returning();
      await db
        .insert(accountingEntityMap)
        .values({
          connectionId: conn.id,
          entity,
          localId: bill.id,
          remoteId,
          remoteUpdatedAt,
        })
        .onConflictDoUpdate({
          target: [
            accountingEntityMap.connectionId,
            accountingEntityMap.entity,
            accountingEntityMap.remoteId,
          ],
          set: { localId: bill.id, remoteUpdatedAt },
        })
        .returning();
      created += 1;
    } else if (entity === "invoice") {
      const invoiceId = randomUUID();
      await db
        .insert(invoices)
        .values({
          invoiceId,
          merchantId,
          customerName: rec.vendor_name ?? null,
          lineItems: [],
          subtotalKobo: rec.total_kobo ?? 0,
          totalKobo: rec.total_kobo ?? 0,
          currency: rec.currency ?? "NGN",
          status: "draft",
          dueDate: rec.due_date ?? null,
          notes: `Synced from ${conn.provider} ${rec.bill_number ?? remoteId}`,
        })
        .returning();
      await db
        .insert(accountingEntityMap)
        .values({
          connectionId: conn.id,
          entity,
          localId: invoiceId,
          remoteId,
          remoteUpdatedAt,
        })
        .onConflictDoUpdate({
          target: [
            accountingEntityMap.connectionId,
            accountingEntityMap.entity,
            accountingEntityMap.remoteId,
          ],
          set: { localId: invoiceId, remoteUpdatedAt },
        })
        .returning();
      created += 1;
    }
    // entity === "payment": no synthetic local row — payment pulls advance the
    // cursor and count records; the provider remains the system of record and
    // bank-feed reconciliation consumes them downstream.
  }
  return created;
}

// ─── push: local rows → provider ──────────────────────────────────────────────
async function collectUnmapped(db: any, conn: any, entity: string, localId: string): Promise<boolean> {
  const [mapped] = await db
    .select()
    .from(accountingEntityMap)
    .where(and(
      eq(accountingEntityMap.connectionId, conn.id),
      eq(accountingEntityMap.entity, entity),
      eq(accountingEntityMap.localId, localId),
    ))
    .limit(1);
  return !!mapped;
}

async function pushLocalRecords(
  db: any,
  merchantId: string,
  conn: any,
  entity: string,
): Promise<number> {
  const records: any[] = [];

  if (entity === "bill") {
    const bills = await db
      .select()
      .from(apBills)
      .where(and(
        eq(apBills.merchantId, merchantId),
        inArray(apBills.status, ["approved", "paid"]),
      ))
      .limit(200);
    for (const bill of bills) {
      if (await collectUnmapped(db, conn, "bill", bill.id)) continue;
      let vendorName: string | null = null;
      if (bill.vendorId) {
        const [vendor] = await db
          .select()
          .from(vendors)
          .where(eq(vendors.id, bill.vendorId))
          .limit(1);
        vendorName = vendor?.name ?? null;
      }
      records.push({
        local_id: bill.id,
        vendor_name: vendorName,
        bill_number: bill.billNumber,
        total_kobo: bill.totalKobo,
        due_date: bill.dueDate ? new Date(bill.dueDate).toISOString().slice(0, 10) : null,
        currency: bill.currency,
      });
    }
  } else if (entity === "invoice") {
    const paid = await db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.merchantId, merchantId),
        eq(invoices.status, "paid"),
      ))
      .limit(200);
    for (const inv of paid) {
      if (await collectUnmapped(db, conn, "invoice", inv.invoiceId)) continue;
      records.push({
        local_id: inv.invoiceId,
        vendor_name: inv.customerName,
        bill_number: inv.invoiceId,
        total_kobo: inv.totalKobo,
        due_date: inv.dueDate ?? null,
        currency: inv.currency,
      });
    }
  } else {
    const completed = await db
      .select()
      .from(apPayments)
      .where(and(
        eq(apPayments.merchantId, merchantId),
        eq(apPayments.status, "completed"),
      ))
      .limit(200);
    for (const payment of completed) {
      if (await collectUnmapped(db, conn, "payment", payment.id)) continue;
      const [bill] = await db
        .select()
        .from(apBills)
        .where(eq(apBills.id, payment.billId))
        .limit(1);
      records.push({
        local_id: payment.id,
        vendor_name: null,
        bill_number: bill?.billNumber ?? payment.reference,
        total_kobo: payment.amountKobo,
        due_date: null,
        currency: bill?.currency ?? "NGN",
      });
    }
  }

  if (records.length === 0) return 0;

  const resp = await callAccountingService(`/${conn.provider}/push`, {
    entity,
    access_token_enc: conn.accessTokenEnc,
    realm_id: conn.realmId,
    records,
  });

  for (const item of resp.pushed ?? []) {
    if (!item.local_id || !item.remote_id) continue;
    await db
      .insert(accountingEntityMap)
      .values({
        connectionId: conn.id,
        entity,
        localId: String(item.local_id),
        remoteId: String(item.remote_id),
        remoteUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          accountingEntityMap.connectionId,
          accountingEntityMap.entity,
          accountingEntityMap.remoteId,
        ],
        set: { remoteUpdatedAt: new Date() },
      })
      .returning();
  }
  return resp.records_out ?? records.length;
}

// ─── run bookkeeping ──────────────────────────────────────────────────────────
async function finishRun(
  db: any,
  runId: number,
  status: "succeeded" | "failed",
  fields: { recordsIn?: number; recordsOut?: number; error?: string },
) {
  await db
    .update(accountingSyncRuns)
    .set({
      status,
      recordsIn: fields.recordsIn ?? 0,
      recordsOut: fields.recordsOut ?? 0,
      error: fields.error ?? null,
      finishedAt: new Date(),
    })
    .where(eq(accountingSyncRuns.id, runId))
    .returning();
}

// ─── router ───────────────────────────────────────────────────────────────────
export const accountingSyncRouter = router({
  /**
   * Begin OAuth: returns the provider consent URL. A 503 from the service
   * (provider_not_configured) propagates to the caller unchanged.
   */
  connect: protectedProcedure
    .input(z.object({
      provider: providerEnum,
      state: z.string().max(128).optional(),
      odooBaseUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const result = await callAccountingService(`/${input.provider}/oauth/url`, {
        state: input.state ?? merchantId,
        base_url: input.odooBaseUrl,
      });
      await auditLog(buildAuditEntry(
        ctx, merchantId, "accounting.connect.initiated",
        "accounting_connection", input.provider,
      ));
      return { url: result.url as string };
    }),

  /**
   * OAuth redirect handler: exchanges the code (or Odoo per-connection
   * credentials) for encrypted tokens and upserts the merchant's connection
   * row (UNIQUE merchant+provider).
   */
  handleCallback: protectedProcedure
    .input(z.object({
      provider: providerEnum,
      code: z.string().min(1).optional(),
      realmId: z.string().max(128).optional(),
      odooBaseUrl: z.string().url().optional(),
      odooDb: z.string().max(128).optional(),
      odooLogin: z.string().max(255).optional(),
      odooApiKey: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await requireDb();

      const odoo = input.odooBaseUrl && input.odooDb
        ? {
            base_url: input.odooBaseUrl,
            db: input.odooDb,
            login: input.odooLogin,
            api_key: input.odooApiKey,
          }
        : undefined;
      if (!input.code && !odoo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "code or odoo credentials (odooBaseUrl + odooDb) required",
        });
      }

      const result = await callAccountingService(`/${input.provider}/oauth/exchange`, {
        code: input.code,
        realm_id: input.realmId,
        odoo,
      });
      if (!result.access_token_enc) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "accounting-sync exchange returned no access token",
        });
      }
      const tokenExpiresAt = result.expires_in
        ? new Date(Date.now() + result.expires_in * 1000)
        : null;
      const realmId = result.realm_id ?? input.realmId ?? null;

      const [conn] = await db
        .insert(accountingConnections)
        .values({
          merchantId,
          provider: input.provider,
          status: "active",
          realmId,
          accessTokenEnc: result.access_token_enc,
          refreshTokenEnc: result.refresh_token_enc ?? null,
          tokenExpiresAt,
          scopes: result.scopes ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [accountingConnections.merchantId, accountingConnections.provider],
          set: {
            status: "active",
            realmId,
            accessTokenEnc: result.access_token_enc,
            refreshTokenEnc: result.refresh_token_enc ?? null,
            tokenExpiresAt,
            scopes: result.scopes ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();

      await emitSyncEvent({
        type: "accounting.connection.upserted",
        merchantId,
        connectionId: conn.id,
        provider: input.provider,
      });
      await auditLog(buildAuditEntry(
        ctx, merchantId, "accounting.connection.upserted",
        "accounting_connection", conn.id, { provider: input.provider },
      ));
      return {
        connectionId: conn.id as string,
        provider: input.provider,
        status: "active",
        realmId,
      };
    }),

  /** Disconnect: guarded merchant-owned delete. */
  disconnect: protectedProcedure
    .input(z.object({ connectionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await requireDb();
      const conn = await getOwnedConnection(db, input.connectionId, merchantId);
      await db
        .delete(accountingConnections)
        .where(and(
          eq(accountingConnections.id, conn.id),
          eq(accountingConnections.merchantId, merchantId),
        ));
      await emitSyncEvent({
        type: "accounting.connection.disconnected",
        merchantId,
        connectionId: conn.id,
        provider: conn.provider,
      });
      await auditLog(buildAuditEntry(
        ctx, merchantId, "accounting.connection.disconnected",
        "accounting_connection", conn.id, { provider: conn.provider },
      ));
      return { deleted: true, connectionId: conn.id as string };
    }),

  /** List the merchant's connections. Token fields are NEVER selected out. */
  listConnections: protectedProcedure
    .query(async ({ ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await requireDb();
      const rows = await db
        .select({
          id: accountingConnections.id,
          merchantId: accountingConnections.merchantId,
          provider: accountingConnections.provider,
          status: accountingConnections.status,
          realmId: accountingConnections.realmId,
          scopes: accountingConnections.scopes,
          tokenExpiresAt: accountingConnections.tokenExpiresAt,
          lastSyncAt: accountingConnections.lastSyncAt,
          syncCursor: accountingConnections.syncCursor,
          createdAt: accountingConnections.createdAt,
          updatedAt: accountingConnections.updatedAt,
        })
        .from(accountingConnections)
        .where(eq(accountingConnections.merchantId, merchantId))
        .orderBy(desc(accountingConnections.createdAt))
        .limit(100);
      return rows;
    }),

  /**
   * Run one sync cycle. Idempotent: the REQUIRED idempotencyKey claims the
   * mutation exactly once; pulled records dedupe via accounting_entity_map.
   */
  syncNow: protectedProcedure
    .input(z.object({
      connectionId: z.string().min(1),
      direction: directionEnum,
      entity: entityEnum,
      idempotencyKey: z.string().min(8).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      return withIdempotency({
        key: input.idempotencyKey,
        merchantId,
        operation: "accountingSync.syncNow",
        requestBody: input,
        execute: async () => {
          const db = await requireDb();
          const conn = await getOwnedConnection(db, input.connectionId, merchantId);
          if (conn.status === "revoked") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Connection is revoked" });
          }

          const [run] = await db
            .insert(accountingSyncRuns)
            .values({
              connectionId: conn.id,
              direction: input.direction,
              entity: input.entity,
              status: "running",
            })
            .returning();

          try {
            const fresh = await ensureFreshAccessToken(db, conn);
            let recordsIn = 0;
            let recordsOut = 0;

            if (input.direction === "pull") {
              const resp = await callAccountingService(`/${conn.provider}/pull`, {
                entity: input.entity,
                access_token_enc: fresh.accessTokenEnc,
                realm_id: conn.realmId,
                cursor: conn.syncCursor ?? undefined,
              });
              const pulled = resp.records ?? [];
              recordsIn = resp.records_in ?? pulled.length;
              await applyPulledRecords(db, merchantId, conn, input.entity, pulled);
              await db
                .update(accountingConnections)
                .set({
                  syncCursor: resp.next_cursor ?? conn.syncCursor,
                  lastSyncAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(accountingConnections.id, conn.id))
                .returning();
            } else {
              recordsOut = await pushLocalRecords(db, merchantId, fresh, input.entity);
              await db
                .update(accountingConnections)
                .set({ lastSyncAt: new Date(), updatedAt: new Date() })
                .where(eq(accountingConnections.id, conn.id))
                .returning();
            }

            await finishRun(db, run.id, "succeeded", { recordsIn, recordsOut });
            await emitSyncEvent({
              type: "accounting.sync.succeeded",
              merchantId,
              connectionId: conn.id,
              runId: run.id,
              direction: input.direction,
              entity: input.entity,
              recordsIn,
              recordsOut,
            });
            await auditLog(buildAuditEntry(
              ctx, merchantId, "accounting.sync.completed",
              "accounting_sync_run", String(run.id),
              { direction: input.direction, entity: input.entity, recordsIn, recordsOut },
            ));
            return { runId: run.id as number, status: "succeeded", recordsIn, recordsOut };
          } catch (err: any) {
            await finishRun(db, run.id, "failed", { error: err.message ?? "sync failed" });
            await emitSyncEvent({
              type: "accounting.sync.failed",
              merchantId,
              connectionId: conn.id,
              runId: run.id,
              direction: input.direction,
              entity: input.entity,
              error: err.message,
            });
            await auditLog(buildAuditEntry(
              ctx, merchantId, "accounting.sync.failed",
              "accounting_sync_run", String(run.id), { error: err.message },
            ));
            throw err;
          }
        },
      });
    }),

  /** Recent sync runs for a merchant-owned connection. */
  listSyncRuns: protectedProcedure
    .input(z.object({
      connectionId: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await requireDb();
      const conn = await getOwnedConnection(db, input.connectionId, merchantId);
      return db
        .select()
        .from(accountingSyncRuns)
        .where(eq(accountingSyncRuns.connectionId, conn.id))
        .orderBy(desc(accountingSyncRuns.startedAt))
        .limit(input.limit);
    }),

  /** Entity mappings for a merchant-owned connection. */
  getEntityMap: protectedProcedure
    .input(z.object({
      connectionId: z.string().min(1),
      entity: entityEnum.optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await requireDb();
      const conn = await getOwnedConnection(db, input.connectionId, merchantId);
      const conditions = [eq(accountingEntityMap.connectionId, conn.id)];
      if (input.entity) conditions.push(eq(accountingEntityMap.entity, input.entity));
      return db
        .select()
        .from(accountingEntityMap)
        .where(and(...conditions))
        .limit(input.limit);
    }),
});

export type AccountingSyncRouter = typeof accountingSyncRouter;
