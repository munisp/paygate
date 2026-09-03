/**
 * transferRecipients.ts — Paystack /transferrecipient + /balance + transfer
 * OTP controls parity.
 *
 * Procedures:
 *   create, bulkCreate, list, get, update, delete            (recipients)
 *   getBalances, getBalanceLedger                            (balance)
 *   resendOtp, disableOtp, finalizeDisableOtp, enableOtp,
 *   getTransferSettings                                      (OTP controls)
 *
 * Storage: transfer_recipients + merchant_transfer_settings +
 * merchant_transfer_otp_challenges (drizzle/0097, raw SQL). Balances/ledger are
 * read from the existing wallets / wallet_transactions tables (the same source
 * the payout flows debit). NUBAN account names resolve through the NIBSS NIP
 * name-enquiry endpoint with the nip_account_cache read-through cache
 * (crud119.ts resolveAccount pattern) — resolution failures fail loud.
 */
import { z } from "zod";
import { randomInt, randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { withIdempotency } from "../idempotency";
import { ENV } from "../_core/env";
import { logger } from "../logger";
import {
  resolveMerchantId,
  rowsOf,
  triggerNotification,
  emitEvent,
  safeEqual,
  hashOtp,
  TRANSFER_RECIPIENT_CREATED,
  TRANSFER_OTP_REQUIRED,
} from "./paymentRequests";

// ─── domain helpers ──────────────────────────────────────────────────────────

export const RECIPIENT_TYPES = ["nuban", "mobile_money", "ghipss", "basa", "authorization"] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

const RECIPIENT_CODE_PREFIX = "RCP_";
function newRecipientCode(): string {
  return RECIPIENT_CODE_PREFIX + randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

/**
 * Resolve a NUBAN account name via NIBSS NIP name enquiry with the
 * nip_account_cache read-through cache. FAIL LOUD: any failure throws — a
 * recipient must never be created without verified payee identity.
 */
export async function resolveAccountName(input: {
  db: any;
  tenantId?: string;
  merchantId: string;
  accountNumber: string;
  bankCode: string;
}): Promise<string> {
  const { db, merchantId, accountNumber, bankCode } = input;
  const tenantId = input.tenantId ?? "ten_default";
  const cached = await db.execute(sql`
    SELECT account_name FROM nip_account_cache
    WHERE tenant_id = ${tenantId} AND account_number = ${accountNumber}
      AND bank_code = ${bankCode} AND expires_at > now()
    LIMIT 1
  `);
  const hit = rowsOf(cached)[0];
  if (hit) return hit.account_name;

  if (!ENV.nibssApiKey) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Account resolution service unavailable: NIBSS is not configured",
    });
  }
  const logResolutionError = async (errorCode: string, errorMessage: string, errorSource: string) => {
    try {
      await db.execute(sql`
        INSERT INTO nip_resolution_errors (tenant_id, merchant_id, account_number, bank_code, error_code, error_message, error_source)
        VALUES (${tenantId}, ${merchantId}, ${accountNumber}, ${bankCode}, ${errorCode}, ${errorMessage.slice(0, 500)}, ${errorSource})
      `);
    } catch (logErr) {
      logger.warn(`[transferRecipients.resolveAccountName] failed to persist resolution error: ${logErr instanceof Error ? logErr.message : String(logErr)}`);
    }
  };
  try {
    const resp = await fetch(`${ENV.nibssGatewayUrl}/nameenquiry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.nibssApiKey}`,
        InstitutionCode: ENV.nibssInstitutionCode,
      },
      body: JSON.stringify({ DestinationInstitutionCode: bankCode, AccountNumber: accountNumber }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      await logResolutionError(String(resp.status), errText || "Name enquiry failed", "nibss");
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: `Name enquiry failed (NIBSS HTTP ${resp.status})` });
    }
    const data = (await resp.json()) as any;
    const accountName: string = data.AccountName ?? data.accountName ?? data.BeneficiaryName ?? "";
    if (!accountName) {
      await logResolutionError("EMPTY_ACCOUNT_NAME", "NIBSS returned no account name", "nibss");
      throw new TRPCError({ code: "NOT_FOUND", message: "No account name found for this account number and bank" });
    }
    try {
      await db.execute(sql`
        INSERT INTO nip_account_cache (id, tenant_id, account_number, bank_code, account_name, expires_at)
        VALUES (${randomUUID()}, ${tenantId}, ${accountNumber}, ${bankCode}, ${accountName}, now() + interval '24 hours')
        ON CONFLICT DO NOTHING
      `);
    } catch (cacheErr) {
      logger.warn(`[transferRecipients.resolveAccountName] failed to cache resolution: ${cacheErr instanceof Error ? cacheErr.message : String(cacheErr)}`);
    }
    return accountName;
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    await logResolutionError("NETWORK_ERROR", message, "timeout");
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Account resolution temporarily unavailable" });
  }
}

interface ValidatedRecipient {
  type: RecipientType;
  name?: string;
  account_number?: string;
  bank_code?: string;
  currency: string;
  email?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  authorization_code?: string;
}

const createRecipientInput = z.object({
  type: z.enum(RECIPIENT_TYPES),
  name: z.string().min(1).optional(),
  account_number: z.string().min(4).optional(),
  bank_code: z.string().min(1).optional(),
  currency: z.string().length(3).default("NGN"),
  email: z.string().email().optional(),
  description: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  authorization_code: z.string().optional(),
});

/** Per-type validation + NUBAN name resolution. Throws TRPCError on failure. */
async function validateRecipient(db: any, merchantId: string, input: z.infer<typeof createRecipientInput>): Promise<ValidatedRecipient> {
  switch (input.type) {
    case "nuban": {
      if (!input.account_number || !/^\d{10}$/.test(input.account_number)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "nuban recipients require a 10-digit account_number" });
      }
      if (!input.bank_code) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "nuban recipients require bank_code" });
      }
      const resolvedName = await resolveAccountName({
        db, merchantId, accountNumber: input.account_number, bankCode: input.bank_code,
      });
      return { ...input, name: input.name ?? resolvedName };
    }
    case "mobile_money": {
      if (!input.account_number || !/^\+?\d{7,15}$/.test(input.account_number)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "mobile_money recipients require a phone-style account_number (E.164 digits)" });
      }
      const provider = input.metadata?.provider;
      if (!provider || typeof provider !== "string") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "mobile_money recipients require metadata.provider" });
      }
      return { ...input };
    }
    case "ghipss":
    case "basa": {
      if (!input.account_number || !input.bank_code) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${input.type} recipients require account_number and bank_code` });
      }
      return { ...input };
    }
    case "authorization": {
      if (!input.authorization_code) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "authorization recipients require authorization_code" });
      }
      return { ...input };
    }
  }
}

/** Insert a recipient; returns the EXISTING row on duplicate (idempotent create). */
async function insertRecipient(db: any, merchantId: string, v: ValidatedRecipient) {
  // Idempotent duplicate: same merchant/type/account/bank → return existing.
  const dup = await db.execute(sql`
    SELECT * FROM transfer_recipients
    WHERE merchant_id = ${merchantId} AND type = ${v.type}
      AND account_number IS NOT DISTINCT FROM ${v.account_number ?? null}
      AND bank_code IS NOT DISTINCT FROM ${v.bank_code ?? null}
    LIMIT 1
  `);
  const existing = rowsOf(dup)[0];
  if (existing) return { recipient: existing, created: false };

  const id = randomUUID();
  const code = newRecipientCode();
  const ins = await db.execute(sql`
    INSERT INTO transfer_recipients (
      id, merchant_id, recipient_code, type, name, account_number, bank_code,
      currency, email, description, metadata, authorization_code, created_at, updated_at
    ) VALUES (
      ${id}, ${merchantId}, ${code}, ${v.type}, ${v.name ?? null},
      ${v.account_number ?? null}, ${v.bank_code ?? null}, ${v.currency},
      ${v.email ?? null}, ${v.description ?? null},
      ${v.metadata ? JSON.stringify(v.metadata) : null}::jsonb,
      ${v.authorization_code ?? null}, now(), now()
    )
    ON CONFLICT ON CONSTRAINT transfer_recipients_dedupe_uniq DO NOTHING
    RETURNING *
  `);
  const inserted = rowsOf(ins)[0];
  if (inserted) return { recipient: inserted, created: true };
  // Lost a concurrent insert race → read the winner's row.
  const raced = await db.execute(sql`
    SELECT * FROM transfer_recipients
    WHERE merchant_id = ${merchantId} AND type = ${v.type}
      AND account_number IS NOT DISTINCT FROM ${v.account_number ?? null}
      AND bank_code IS NOT DISTINCT FROM ${v.bank_code ?? null}
    LIMIT 1
  `);
  return { recipient: rowsOf(raced)[0], created: false };
}

async function getRecipientForMerchant(db: any, merchantId: string, idOrCode: string) {
  const res = await db.execute(sql`
    SELECT * FROM transfer_recipients
    WHERE merchant_id = ${merchantId} AND (id = ${idOrCode} OR recipient_code = ${idOrCode})
    LIMIT 1
  `);
  const row = rowsOf(res)[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Transfer recipient not found" });
  return row;
}

// ─── OTP helpers ─────────────────────────────────────────────────────────────

const OTP_TTL_MS = 10 * 60 * 1000;

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Create + deliver an OTP challenge. FAIL LOUD: when the notification rail is
 * unconfigured or delivery fails, no challenge is persisted and the error
 * propagates — otp_required must never change without a verifiable challenge.
 */
async function issueOtpChallenge(db: any, merchantId: string, purpose: string): Promise<{ challengeId: string }> {
  if (!ENV.novuApiKey) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "OTP delivery rail is not configured (NOVU_API_KEY missing) — transfer settings unchanged",
    });
  }
  const code = generateOtp();
  const id = randomUUID();
  const delivered = await triggerNotification({
    subscriberId: merchantId,
    workflowId: "transfer.otp",
    payload: { purpose, otp: code, merchantId },
  });
  if (!delivered) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "OTP delivery failed — transfer settings unchanged" });
  }
  await db.execute(sql`
    INSERT INTO merchant_transfer_otp_challenges (id, merchant_id, purpose, code_hash, expires_at)
    VALUES (${id}, ${merchantId}, ${purpose}, ${hashOtp(code)}, ${new Date(Date.now() + OTP_TTL_MS).toISOString()})
  `);
  await emitEvent(TRANSFER_OTP_REQUIRED, merchantId, { purpose, challengeId: id });
  return { challengeId: id };
}

/** Constant-time OTP verification against the latest unconsumed challenge. */
async function verifyOtpChallenge(db: any, merchantId: string, purpose: string, otp: string): Promise<void> {
  const res = await db.execute(sql`
    SELECT * FROM merchant_transfer_otp_challenges
    WHERE merchant_id = ${merchantId} AND purpose = ${purpose}
      AND consumed = false AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1
  `);
  const challenge = rowsOf(res)[0];
  if (!challenge || !safeEqual(hashOtp(otp), challenge.code_hash)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired OTP" });
  }
  await db.execute(sql`
    UPDATE merchant_transfer_otp_challenges SET consumed = true WHERE id = ${challenge.id}
  `);
}

async function getSettingsRow(db: any, merchantId: string) {
  const res = await db.execute(sql`
    INSERT INTO merchant_transfer_settings (merchant_id) VALUES (${merchantId})
    ON CONFLICT (merchant_id) DO NOTHING
    RETURNING *
  `);
  void res;
  const sel = await db.execute(sql`
    SELECT * FROM merchant_transfer_settings WHERE merchant_id = ${merchantId} LIMIT 1
  `);
  return rowsOf(sel)[0];
}

// ─── router ──────────────────────────────────────────────────────────────────

export const transferRecipientsRouter = router({
  create: protectedProcedure.input(createRecipientInput.extend({
    idempotencyKey: z.string().min(8).max(128),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return withIdempotency({
      key: input.idempotencyKey,
      merchantId,
      operation: "transferRecipients.create",
      requestBody: input,
      execute: async () => {
        const v = await validateRecipient(db, merchantId, input);
        const { recipient, created } = await insertRecipient(db, merchantId, v);
        if (created) {
          await emitEvent(TRANSFER_RECIPIENT_CREATED, merchantId, {
            recipientId: recipient.id,
            recipientCode: recipient.recipient_code,
            type: recipient.type,
          });
        }
        return recipient;
      },
    });
  }),

  bulkCreate: protectedProcedure.input(z.object({
    batch: z.array(createRecipientInput).min(1).max(100),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const success: any[] = [];
    const errors: Array<{ index: number; input: unknown; error: string }> = [];
    for (let i = 0; i < input.batch.length; i++) {
      const item = input.batch[i];
      try {
        const v = await validateRecipient(db, merchantId, item);
        const { recipient, created } = await insertRecipient(db, merchantId, v);
        if (created) {
          await emitEvent(TRANSFER_RECIPIENT_CREATED, merchantId, {
            recipientId: recipient.id,
            recipientCode: recipient.recipient_code,
            type: recipient.type,
          });
        }
        success.push(recipient);
      } catch (err) {
        errors.push({
          index: i,
          input: item,
          error: err instanceof TRPCError ? err.message : String(err),
        });
      }
    }
    return { success, errors };
  }),

  list: protectedProcedure.input(z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    cursor: z.string().optional(), // recipient id; returns rows created before it
    limit: z.number().int().min(1).max(200).default(50),
    include_inactive: z.boolean().default(false),
  })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const conditions = [sql`merchant_id = ${merchantId}`];
    if (!input.include_inactive) conditions.push(sql`active = true`);
    if (input.from) conditions.push(sql`created_at >= ${input.from}`);
    if (input.to) conditions.push(sql`created_at <= ${input.to}`);
    if (input.cursor) {
      conditions.push(sql`created_at < (SELECT created_at FROM transfer_recipients WHERE id = ${input.cursor})`);
    }
    const where = sql.join(conditions, sql` AND `);
    const res = await db.execute(sql`
      SELECT * FROM transfer_recipients WHERE ${where}
      ORDER BY created_at DESC, id DESC LIMIT ${input.limit + 1}
    `);
    const rows = rowsOf(res);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      data: page,
      next_cursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }),

  get: protectedProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return getRecipientForMerchant(db, merchantId, input.id);
  }),

  update: protectedProcedure.input(z.object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const row = await getRecipientForMerchant(db, merchantId, input.id);
    const upd = await db.execute(sql`
      UPDATE transfer_recipients SET
        name = COALESCE(${input.name ?? null}, name),
        email = COALESCE(${input.email ?? null}, email),
        updated_at = now()
      WHERE id = ${row.id}
      RETURNING *
    `);
    return rowsOf(upd)[0];
  }),

  delete: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const row = await getRecipientForMerchant(db, merchantId, input.id);
    const upd = await db.execute(sql`
      UPDATE transfer_recipients SET active = false, updated_at = now()
      WHERE id = ${row.id}
      RETURNING *
    `);
    return rowsOf(upd)[0];
  }),

  // ─── Balance (Paystack /balance parity) ──────────────────────────────────

  getBalances: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const res = await db.execute(sql`
      SELECT currency, COALESCE(SUM(balance::numeric), 0) AS balance,
             COALESCE(SUM(ledger_balance::numeric), 0) AS ledger_balance
      FROM wallets
      WHERE merchant_id = ${merchantId} AND status = 'active'
      GROUP BY currency
    `);
    return rowsOf(res).map((r: any) => ({
      currency: r.currency,
      balance: String(r.balance),
      ledger_balance: String(r.ledger_balance),
    }));
  }),

  getBalanceLedger: protectedProcedure.input(z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(200).default(50),
  })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    const conditions = [sql`w.merchant_id = ${merchantId}`];
    if (input.from) conditions.push(sql`wt.created_at >= ${input.from}`);
    if (input.to) conditions.push(sql`wt.created_at <= ${input.to}`);
    const where = sql.join(conditions, sql` AND `);
    const res = await db.execute(sql`
      SELECT wt.balance_after AS balance,
             (wt.balance_after::numeric - wt.balance_before::numeric) AS difference,
             wt.description AS reason,
             'wallet_transactions' AS model_responsible,
             wt.id::text AS model_ref,
             wt.currency,
             wt.created_at
      FROM wallet_transactions wt
      JOIN wallets w ON w.id = wt.wallet_id
      WHERE ${where}
      ORDER BY wt.created_at DESC, wt.id DESC
      LIMIT ${input.limit} OFFSET ${offset}
    `);
    return rowsOf(res).map((r: any) => ({ ...r, balance: String(r.balance), difference: String(r.difference) }));
  }),

  // ─── Transfer OTP controls ───────────────────────────────────────────────

  resendOtp: protectedProcedure.input(z.object({
    transfer_code: z.string().optional(),
    reference: z.string().optional(),
  }).refine((v) => v.transfer_code || v.reference, { message: "transfer_code or reference is required" }))
    .mutation(async ({ ctx }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const { challengeId } = await issueOtpChallenge(db, merchantId, "transfer_resend");
      return { sent: true, challengeId };
    }),

  disableOtp: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    // Initiates the disable flow; otp_required stays true until finalizeDisableOtp.
    const { challengeId } = await issueOtpChallenge(db, merchantId, "disable_otp");
    return { initiated: true, challengeId, otp_required: true };
  }),

  finalizeDisableOtp: protectedProcedure.input(z.object({
    otp: z.string().length(6),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    await verifyOtpChallenge(db, merchantId, "disable_otp", input.otp);
    const upd = await db.execute(sql`
      UPDATE merchant_transfer_settings SET otp_required = false, updated_at = now()
      WHERE merchant_id = ${merchantId}
      RETURNING *
    `);
    return rowsOf(upd)[0];
  }),

  enableOtp: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    await getSettingsRow(db, merchantId);
    const upd = await db.execute(sql`
      UPDATE merchant_transfer_settings SET otp_required = true, updated_at = now()
      WHERE merchant_id = ${merchantId}
      RETURNING *
    `);
    return rowsOf(upd)[0];
  }),

  getTransferSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return getSettingsRow(db, merchantId);
  }),
});
