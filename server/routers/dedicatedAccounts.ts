/**
 * dedicatedAccounts.ts — Paystack /dedicated_account parity, built ON TOP of
 * the existing nip_virtual_accounts infrastructure.
 *
 * DVA rows are ordinary `nip_virtual_accounts` rows with `dedicated = true`
 * (columns added by drizzle/0098_dva_customer_risk.sql). No table duplication:
 * the existing NIP inbound-transfer reconciliation path keeps working because
 * the row shape is unchanged.
 *
 * Procedures:
 *   assign             — single-step create + validate + assign (async semantics:
 *                        assignment_pending → assigned | failed; events
 *                        dedicatedaccount.assign.success / .failed)
 *   create             — assign a DVA to an existing customer
 *   list / get         — filtered cursor pagination / single fetch
 *   deactivate         — retire a DVA
 *   requery            — re-check inbound transfers (max once / 10 min / account)
 *   availableProviders — banks with the pay_with_bank_transfer capability
 *   addSplit / removeSplit — attach/detach a split_code on the DVA row
 *
 * Conventions: money in bigint kobo; fail loud; merchant resolved server-side
 * via resolveMerchantId(openId) (pattern from crud119.ts:110); financial entry
 * points accept an optional idempotencyKey handled by withIdempotency.
 */
import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { withIdempotency } from "../idempotency";
import { dispatchWebhookEvent } from "../webhookEvents";

const DEFAULT_TENANT = "ten_default";
const REQUERY_COOLDOWN_MS = 10 * 60 * 1000; // Paystack: requery at most once / 10 min
const DVA_EXPIRY_YEARS = 100; // DVAs do not expire; nip_virtual_accounts.expires_at is NOT NULL

// ─── Merchant resolution (server-side only — never trust client merchantId) ──
async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant.id;
}

async function dbOrFail() {
  const database = await getDb();
  if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return database;
}

function rowsOf(result: any): any[] {
  return (result?.rows ?? result ?? []) as any[];
}

// ─── Webhook event emission ──────────────────────────────────────────────────
// Event constants required by Paystack parity. The WebhookEventType union in
// webhookEvents.ts is owned by another module — cast here instead of editing it.
export const DVA_EVENTS = {
  assignSuccess: "dedicatedaccount.assign.success",
  assignFailed: "dedicatedaccount.assign.failed",
} as const;

async function emitDvaEvent(
  merchantId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  await dispatchWebhookEvent({
    event: event as any,
    id: `evt_${crypto.randomBytes(10).toString("hex")}`,
    tenantId: DEFAULT_TENANT,
    merchantId,
    timestamp: new Date().toISOString(),
    data,
  });
}

// ─── Provider / bridge helpers ───────────────────────────────────────────────
function bridgeConfig() {
  return {
    bridgeUrl: process.env.MIDDLEWARE_BRIDGE_URL ?? "",
    bridgeKey: process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
    nibssGatewayUrl: process.env.NIBSS_GATEWAY_URL ?? "",
    nibssInstitutionCode: process.env.NIBSS_INSTITUTION_CODE ?? "",
    nibssSecretKey: process.env.NIBSS_SECRET_KEY ?? "",
  };
}

/** Minimal replication of nipBanks.ts internals (nipBanks.ts is not editable).
 *  Calls the Go bridge, falling back to a direct NIBSS gateway call. */
async function bridgeOrNibssPost(path: string, body: Record<string, unknown>): Promise<any> {
  const cfg = bridgeConfig();
  if (cfg.bridgeUrl) {
    const res = await fetch(`${cfg.bridgeUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": cfg.bridgeKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`bridge ${path} failed ${res.status}: ${text}`);
    }
    return res.json();
  }
  if (cfg.nibssGatewayUrl) {
    const payload = JSON.stringify(body);
    const signature = crypto.createHmac("sha256", cfg.nibssSecretKey).update(payload).digest("hex");
    const res = await fetch(`${cfg.nibssGatewayUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        INSTITUTION_CODE: cfg.nibssInstitutionCode,
        "X-NIP-SIGNATURE": signature,
        "X-NIP-TIMESTAMP": Date.now().toString(),
      },
      body: payload,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`NIBSS ${path} failed ${res.status}: ${text}`);
    }
    return res.json();
  }
  throw new Error("NIBSS bridge/gateway unreachable: MIDDLEWARE_BRIDGE_URL and NIBSS_GATEWAY_URL are both unset");
}

/** Resolve a bank row that supports pay_with_bank_transfer DVA provisioning. */
async function resolveProviderBank(database: any, preferredBank: string) {
  const result = await database.execute(sql`
    SELECT id, bank_code AS "bankCode", bank_name AS "bankName", short_name AS "shortName",
           nip_code AS "nipCode", provider_slug AS "providerSlug"
    FROM nip_banks
    WHERE is_active = 1 AND pay_with_bank_transfer = 1
      AND (
        provider_slug = ${preferredBank}
        OR nip_code = ${preferredBank}
        OR bank_code = ${preferredBank}
        OR lower(bank_name) = lower(${preferredBank})
        OR lower(short_name) = lower(${preferredBank})
      )
    LIMIT 1
  `);
  const bank = rowsOf(result)[0];
  if (!bank) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `No available DVA provider matches preferred_bank "${preferredBank}"`,
    });
  }
  return bank;
}

/** Upsert a customer record by (tenant, merchant, email); returns customer id. */
export async function upsertCustomerForMerchant(
  merchantId: string,
  input: { email: string; firstName?: string; lastName?: string; phone?: string },
): Promise<string> {
  const database = await dbOrFail();
  const name = [input.firstName, input.lastName].filter(Boolean).join(" ") || null;
  const id = `cus_${crypto.randomBytes(8).toString("hex")}`;
  const result = await database.execute(sql`
    INSERT INTO customers (id, tenant_id, merchant_id, email, name, phone)
    VALUES (${id}, ${DEFAULT_TENANT}, ${merchantId}, ${input.email}, ${name}, ${input.phone ?? null})
    ON CONFLICT ON CONSTRAINT customers_tenant_merchant_email_uniq
    DO UPDATE SET
      name = COALESCE(EXCLUDED.name, customers.name),
      phone = COALESCE(EXCLUDED.phone, customers.phone),
      updated_at = now()
    RETURNING id
  `);
  const row = rowsOf(result)[0];
  if (!row?.id) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Customer upsert failed" });
  return row.id;
}

async function findCustomerId(database: any, merchantId: string, customerRef: string): Promise<string> {
  const result = await database.execute(sql`
    SELECT id FROM customers
    WHERE merchant_id = ${merchantId} AND (id = ${customerRef} OR email = ${customerRef})
    LIMIT 1
  `);
  const row = rowsOf(result)[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `Customer "${customerRef}" not found` });
  return row.id;
}

const DVA_SELECT = sql`
  SELECT id, merchant_id AS "merchantId", customer_id AS "customerId",
         customer_email AS "customerEmail", customer_phone AS "customerPhone",
         bank_nip_code AS "bankNipCode", bank_name AS "bankName",
         account_number AS "accountNumber", account_name AS "accountName",
         currency, reference, status, dedicated, country,
         preferred_bank AS "preferredBank", provider_slug AS "providerSlug",
         assignment_status AS "assignmentStatus", split_code AS "splitCode",
         last_requery_at AS "lastRequeryAt", assigned_at AS "assignedAt",
         deactivated_at AS "deactivatedAt",
         created_at AS "createdAt", updated_at AS "updatedAt"
  FROM nip_virtual_accounts
`;

/**
 * Core assign flow shared by `assign` (creates/attaches the customer) and
 * `create` (existing customer). Async semantics: a row is first persisted in
 * `assignment_pending`, then transitioned to `assigned` | `failed` with the
 * matching Paystack-parity webhook event.
 */
async function assignDvaCore(args: {
  merchantId: string;
  customerId: string;
  customerEmail: string;
  customerPhone?: string;
  firstName?: string;
  lastName?: string;
  preferredBank: string;
  country: "NG" | "GH";
  accountNumber?: string;
  bvn?: string;
  bankCode?: string;
  splitCode?: string;
}) {
  const database = await dbOrFail();
  const bank = await resolveProviderBank(database, args.preferredBank);
  const reference = `dva_${crypto.randomBytes(10).toString("hex")}`;
  const accountName = [args.firstName, args.lastName].filter(Boolean).join(" ") || args.customerEmail;
  const expiresAt = new Date(Date.now() + DVA_EXPIRY_YEARS * 365 * 24 * 60 * 60 * 1000);

  // Step 1 — persist in assignment_pending.
  await database.execute(sql`
    INSERT INTO nip_virtual_accounts
      (merchant_id, bank_nip_code, bank_name, account_number, account_name, currency,
       reference, status, expires_at, dedicated, customer_id, customer_email, customer_phone,
       preferred_bank, provider_slug, country, assignment_status, split_code)
    VALUES
      (${args.merchantId}, ${bank.nipCode ?? bank.bankCode}, ${bank.bankName},
       ${"PENDING:" + reference}, ${accountName}, ${args.country === "GH" ? "GHS" : "NGN"},
       ${reference}, 'pending', ${expiresAt}, true, ${args.customerId}, ${args.customerEmail},
       ${args.customerPhone ?? null}, ${args.preferredBank}, ${bank.providerSlug ?? null},
       ${args.country}, 'assignment_pending', ${args.splitCode ?? null})
  `);

  const failAssignment = async (reason: string) => {
    await database.execute(sql`
      UPDATE nip_virtual_accounts
      SET assignment_status = 'failed', status = 'cancelled', updated_at = now()
      WHERE reference = ${reference}
    `);
    await emitDvaEvent(args.merchantId, DVA_EVENTS.assignFailed, {
      reference,
      customer: { id: args.customerId, email: args.customerEmail },
      preferred_bank: args.preferredBank,
      reason,
    });
    const row = rowsOf(await database.execute(sql`${DVA_SELECT} WHERE reference = ${reference} LIMIT 1`))[0];
    return row;
  };

  // Step 2 — validate identity inputs (BVN and/or account number) when supplied.
  try {
    if (args.bvn) {
      const res = await bridgeOrNibssPost("/nibss/verifybvn", {
        bvn: args.bvn,
        firstName: args.firstName ?? "",
        lastName: args.lastName ?? "",
      });
      const verified = res?.verified ?? ["00", "success", "matched"].includes(String(res?.responseCode ?? res?.status ?? "").toLowerCase());
      if (!verified) return failAssignment("BVN validation failed");
    }
    if (args.accountNumber && (args.bankCode || bank.nipCode)) {
      const res = await bridgeOrNibssPost("/nibss/nameenquiry", {
        destinationBankCode: args.bankCode ?? bank.nipCode,
        destinationAccountNum: args.accountNumber,
        channelCode: 2,
      });
      const ok = res?.accountName || String(res?.responseCode ?? "") === "00";
      if (!ok) return failAssignment("Account number validation failed");
    }
  } catch (err: any) {
    return failAssignment(`Validation provider unreachable: ${err?.message ?? err}`);
  }

  // Step 3 — provision the account number through the existing NIP VA path.
  let accountNumber: string;
  try {
    if (args.accountNumber) {
      accountNumber = args.accountNumber;
    } else {
      const res = await bridgeOrNibssPost("/nibss/virtualaccounts", {
        merchantId: args.merchantId,
        reference,
        bankNipCode: bank.nipCode ?? bank.bankCode,
        amountExpected: 0,
        accountName,
        expiryMinutes: DVA_EXPIRY_YEARS * 365 * 24 * 60,
      });
      accountNumber = res?.accountNumber;
      if (!accountNumber) throw new Error("provider returned no account number");
    }
  } catch (err: any) {
    return failAssignment(`Account provisioning failed: ${err?.message ?? err}`);
  }

  // Step 4 — mark assigned + emit success event.
  await database.execute(sql`
    UPDATE nip_virtual_accounts
    SET account_number = ${accountNumber}, assignment_status = 'assigned',
        assigned_at = now(), updated_at = now()
    WHERE reference = ${reference}
  `);
  await emitDvaEvent(args.merchantId, DVA_EVENTS.assignSuccess, {
    reference,
    account_number: accountNumber,
    bank: { name: bank.bankName, slug: bank.providerSlug ?? null, nip_code: bank.nipCode ?? null },
    customer: { id: args.customerId, email: args.customerEmail },
    currency: args.country === "GH" ? "GHS" : "NGN",
  });
  return rowsOf(await database.execute(sql`${DVA_SELECT} WHERE reference = ${reference} LIMIT 1`))[0];
}

async function loadOwnedDva(database: any, merchantId: string, idOrAccount: { id?: number; accountNumber?: string }) {
  const result = idOrAccount.id != null
    ? await database.execute(sql`${DVA_SELECT} WHERE id = ${idOrAccount.id} AND merchant_id = ${merchantId} AND dedicated = true LIMIT 1`)
    : await database.execute(sql`${DVA_SELECT} WHERE account_number = ${idOrAccount.accountNumber!} AND merchant_id = ${merchantId} AND dedicated = true LIMIT 1`);
  const row = rowsOf(result)[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Dedicated virtual account not found" });
  return row;
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const dedicatedAccountsRouter = router({
  /** Paystack POST /dedicated_account/assign — single-step create+validate+assign. */
  assign: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      first_name: z.string().min(1),
      last_name: z.string().min(1),
      phone: z.string().min(7),
      preferred_bank: z.string().min(1),
      country: z.enum(["NG", "GH"]).default("NG"),
      account_number: z.string().regex(/^\d{10}$/).optional(),
      bvn: z.string().regex(/^\d{11}$/).optional(),
      bank_code: z.string().optional(),
      idempotencyKey: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const run = async () => {
        const customerId = await upsertCustomerForMerchant(merchantId, {
          email: input.email,
          firstName: input.first_name,
          lastName: input.last_name,
          phone: input.phone,
        });
        return assignDvaCore({
          merchantId,
          customerId,
          customerEmail: input.email,
          customerPhone: input.phone,
          firstName: input.first_name,
          lastName: input.last_name,
          preferredBank: input.preferred_bank,
          country: input.country,
          accountNumber: input.account_number,
          bvn: input.bvn,
          bankCode: input.bank_code,
        });
      };
      if (input.idempotencyKey) {
        return withIdempotency({
          key: input.idempotencyKey,
          merchantId,
          operation: "dedicatedAccounts.assign",
          requestBody: input,
          execute: run,
        });
      }
      return run();
    }),

  /** Paystack POST /dedicated_account — assign a DVA to an existing customer. */
  create: protectedProcedure
    .input(z.object({
      customer: z.string().min(1), // customer id or email
      preferred_bank: z.string().min(1),
      split_code: z.string().optional(),
      idempotencyKey: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const run = async () => {
        const database = await dbOrFail();
        const customerId = await findCustomerId(database, merchantId, input.customer);
        const cust = rowsOf(await database.execute(sql`
          SELECT email, phone, name FROM customers WHERE id = ${customerId} LIMIT 1
        `))[0];
        const [firstName, ...rest] = String(cust?.name ?? "").split(" ");
        return assignDvaCore({
          merchantId,
          customerId,
          customerEmail: cust?.email ?? input.customer,
          customerPhone: cust?.phone ?? undefined,
          firstName: firstName || undefined,
          lastName: rest.join(" ") || undefined,
          preferredBank: input.preferred_bank,
          country: "NG",
          splitCode: input.split_code,
        });
      };
      if (input.idempotencyKey) {
        return withIdempotency({
          key: input.idempotencyKey,
          merchantId,
          operation: "dedicatedAccounts.create",
          requestBody: input,
          execute: run,
        });
      }
      return run();
    }),

  /** Paystack GET /dedicated_account — filterable cursor pagination. */
  list: protectedProcedure
    .input(z.object({
      active: z.boolean().optional(),
      currency: z.string().length(3).optional(),
      provider_slug: z.string().optional(),
      bank: z.string().optional(),
      customer: z.string().optional(), // customer id or email
      cursor: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      const conds = [
        sql`merchant_id = ${merchantId}`,
        sql`dedicated = true`,
      ];
      if (input.active != null) {
        conds.push(input.active
          ? sql`status <> 'cancelled' AND deactivated_at IS NULL`
          : sql`(status = 'cancelled' OR deactivated_at IS NOT NULL)`);
      }
      if (input.currency) conds.push(sql`currency = ${input.currency.toUpperCase()}`);
      if (input.provider_slug) conds.push(sql`provider_slug = ${input.provider_slug}`);
      if (input.bank) conds.push(sql`(bank_nip_code = ${input.bank} OR lower(bank_name) = lower(${input.bank}))`);
      if (input.customer) conds.push(sql`(customer_id = ${input.customer} OR customer_email = ${input.customer})`);
      if (input.cursor != null) conds.push(sql`id > ${input.cursor}`);
      const where = sql.join(conds, sql` AND `);
      const rows = rowsOf(await database.execute(sql`${DVA_SELECT} WHERE ${where} ORDER BY id ASC LIMIT ${input.limit + 1}`));
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      };
    }),

  /** Paystack GET /dedicated_account/:id */
  get: protectedProcedure
    .input(z.object({
      id: z.number().int().optional(),
      account_number: z.string().optional(),
    }).refine((v) => v.id != null || !!v.account_number, { message: "id or account_number required" }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      return loadOwnedDva(database, merchantId, { id: input.id, accountNumber: input.account_number });
    }),

  /** Paystack DELETE /dedicated_account/:id */
  deactivate: protectedProcedure
    .input(z.object({
      id: z.number().int().optional(),
      account_number: z.string().optional(),
    }).refine((v) => v.id != null || !!v.account_number, { message: "id or account_number required" }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      const dva = await loadOwnedDva(database, merchantId, { id: input.id, accountNumber: input.account_number });
      await database.execute(sql`
        UPDATE nip_virtual_accounts
        SET status = 'cancelled', deactivated_at = now(), updated_at = now()
        WHERE id = ${dva.id}
      `);
      return { id: dva.id, accountNumber: dva.accountNumber, status: "cancelled" as const };
    }),

  /**
   * Paystack POST /dedicated_account/requery — trigger a re-check of inbound
   * transfers against the NIP recon path. Enforced: max once per 10 minutes
   * per account. FAILS LOUD when the recon/bridge path is unreachable.
   */
  requery: protectedProcedure
    .input(z.object({
      account_number: z.string().min(5),
      provider_slug: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      const dva = await loadOwnedDva(database, merchantId, { accountNumber: input.account_number });

      const lastRequeryAt = dva.lastRequeryAt ? new Date(dva.lastRequeryAt).getTime() : null;
      if (lastRequeryAt != null && Date.now() - lastRequeryAt < REQUERY_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((REQUERY_COOLDOWN_MS - (Date.now() - lastRequeryAt)) / 1000);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Requery allowed once per 10 minutes per account. Retry in ${retryAfterSeconds}s.`,
        });
      }

      // Trigger the re-check via the existing NIP recon path. Fail loud if unreachable.
      const cfg = bridgeConfig();
      if (!cfg.bridgeUrl && !cfg.nibssGatewayUrl) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "NIP recon path unreachable: MIDDLEWARE_BRIDGE_URL and NIBSS_GATEWAY_URL are both unset",
        });
      }
      await bridgeOrNibssPost("/nibss/requery", {
        accountNumber: input.account_number,
        providerSlug: input.provider_slug,
        date: input.date,
        merchantId,
        reference: dva.reference,
      });

      await database.execute(sql`
        UPDATE nip_virtual_accounts SET last_requery_at = now(), updated_at = now()
        WHERE id = ${dva.id}
      `);
      return { status: "queued" as const, accountNumber: input.account_number, date: input.date };
    }),

  /** Paystack GET /dedicated_account/available_providers */
  availableProviders: protectedProcedure
    .query(async ({ ctx }) => {
      await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      const rows = rowsOf(await database.execute(sql`
        SELECT provider_slug AS "providerSlug", bank_name AS "bankName",
               bank_code AS "bankCode", nip_code AS "nipCode", category
        FROM nip_banks
        WHERE is_active = 1 AND pay_with_bank_transfer = 1
        ORDER BY bank_name ASC
      `));
      return rows.map((r: any) => ({
        provider_slug: r.providerSlug ?? String(r.bankName ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        bank_name: r.bankName,
        bank_code: r.bankCode,
        nip_code: r.nipCode,
        category: r.category,
        pay_with_bank_transfer: true,
      }));
    }),

  /** Attach a split_code to a DVA (Paystack /dedicated_account/split). */
  addSplit: protectedProcedure
    .input(z.object({
      account_number: z.string().min(5),
      split_code: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      const dva = await loadOwnedDva(database, merchantId, { accountNumber: input.account_number });
      await database.execute(sql`
        UPDATE nip_virtual_accounts SET split_code = ${input.split_code}, updated_at = now()
        WHERE id = ${dva.id}
      `);
      return { accountNumber: dva.accountNumber, splitCode: input.split_code };
    }),

  /** Detach the split_code from a DVA. */
  removeSplit: protectedProcedure
    .input(z.object({ account_number: z.string().min(5) }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      const dva = await loadOwnedDva(database, merchantId, { accountNumber: input.account_number });
      await database.execute(sql`
        UPDATE nip_virtual_accounts SET split_code = NULL, updated_at = now()
        WHERE id = ${dva.id}
      `);
      return { accountNumber: dva.accountNumber, splitCode: null };
    }),
});
