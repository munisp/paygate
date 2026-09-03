/**
 * customerRisk.ts — Paystack customer risk-action + validation parity.
 *
 *   setRiskAction        — POST /customer/set_risk_action
 *                          (default | allow | deny on customers.risk_action,
 *                           column added by drizzle/0098_dva_customer_risk.sql)
 *   assertCustomerNotDenied(merchantId, customerEmail)
 *                        — exported helper for charge-path wiring: throws
 *                          FORBIDDEN when the customer is risk-denied. `allow`
 *                          (whitelist) conceptually bypasses standard velocity
 *                          soft-checks — it is DOCUMENTED here, not faked:
 *                          callers may consult risk_action === 'allow' to skip
 *                          advisory soft limits, but hard compliance checks
 *                          (sanctions, fraud blocks) must still run.
 *   validateCustomer     — POST /customer/validate (type=bank_account)
 *                          Async identification semantics: a record is stored
 *                          in customer_identifications (payload masked), then
 *                          resolved via the existing NIBSS/NIP bridge paths;
 *                          events customer.identification.success / .failed
 *                          (failed carries a reason).
 *
 * Conventions: money bigint kobo (n/a here); fail loud; merchant resolved
 * server-side via resolveMerchantId(openId) (pattern from crud119.ts:110).
 */
import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { dispatchWebhookEvent } from "../webhookEvents";

const DEFAULT_TENANT = "ten_default";

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

export const CUSTOMER_RISK_EVENTS = {
  identificationSuccess: "customer.identification.success",
  identificationFailed: "customer.identification.failed",
} as const;

async function emitRiskEvent(merchantId: string, event: string, data: Record<string, unknown>) {
  await dispatchWebhookEvent({
    event: event as any,
    id: `evt_${crypto.randomBytes(10).toString("hex")}`,
    tenantId: DEFAULT_TENANT,
    merchantId,
    timestamp: new Date().toISOString(),
    data,
  });
}

/** Mask an account number for storage: keep only the last 2 digits. */
function maskAccountNumber(accountNumber: string): string {
  return `${"*".repeat(Math.max(0, accountNumber.length - 2))}${accountNumber.slice(-2)}`;
}

/**
 * Charge-path guard: throws FORBIDDEN when the customer is risk-denied.
 * `default` and `allow` pass; `deny` blocks new charges outright.
 */
export async function assertCustomerNotDenied(merchantId: string, customerEmail: string): Promise<void> {
  const database = await dbOrFail();
  const rows = rowsOf(await database.execute(sql`
    SELECT risk_action AS "riskAction" FROM customers
    WHERE merchant_id = ${merchantId} AND email = ${customerEmail}
    LIMIT 1
  `));
  if (rows[0]?.riskAction === "deny") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Customer ${customerEmail} is risk-denied; new charges are blocked`,
    });
  }
}

/** Read the stored risk_action for a customer (for orchestrator soft-check bypass decisions). */
export async function getCustomerRiskAction(
  merchantId: string,
  customerEmail: string,
): Promise<"default" | "allow" | "deny"> {
  const database = await dbOrFail();
  const rows = rowsOf(await database.execute(sql`
    SELECT risk_action AS "riskAction" FROM customers
    WHERE merchant_id = ${merchantId} AND email = ${customerEmail}
    LIMIT 1
  `));
  return (rows[0]?.riskAction as "default" | "allow" | "deny") ?? "default";
}

async function findCustomer(database: any, merchantId: string, codeOrEmail: string) {
  const rows = rowsOf(await database.execute(sql`
    SELECT id, email, risk_action AS "riskAction" FROM customers
    WHERE merchant_id = ${merchantId} AND (id = ${codeOrEmail} OR email = ${codeOrEmail})
    LIMIT 1
  `));
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: `Customer "${codeOrEmail}" not found` });
  return rows[0];
}

/** Minimal bridge/NIBSS client (same boundary as nipBanks.ts, which is not editable). */
async function bridgeOrNibssPost(path: string, body: Record<string, unknown>): Promise<any> {
  const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL ?? "";
  const nibssGatewayUrl = process.env.NIBSS_GATEWAY_URL ?? "";
  if (bridgeUrl) {
    const res = await fetch(`${bridgeUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`bridge ${path} failed ${res.status}`);
    return res.json();
  }
  if (nibssGatewayUrl) {
    const payload = JSON.stringify(body);
    const signature = crypto.createHmac("sha256", process.env.NIBSS_SECRET_KEY ?? "").update(payload).digest("hex");
    const res = await fetch(`${nibssGatewayUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        INSTITUTION_CODE: process.env.NIBSS_INSTITUTION_CODE ?? "",
        "X-NIP-SIGNATURE": signature,
        "X-NIP-TIMESTAMP": Date.now().toString(),
      },
      body: payload,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`NIBSS ${path} failed ${res.status}`);
    return res.json();
  }
  throw new Error("identification provider unreachable: MIDDLEWARE_BRIDGE_URL and NIBSS_GATEWAY_URL are both unset");
}

export const customerRiskRouter = router({
  /** Paystack POST /customer/set_risk_action */
  setRiskAction: protectedProcedure
    .input(z.object({
      customer: z.string().min(1), // customer code (id) or email
      risk_action: z.enum(["default", "allow", "deny"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      const customer = await findCustomer(database, merchantId, input.customer);
      await database.execute(sql`
        UPDATE customers SET risk_action = ${input.risk_action}, updated_at = now()
        WHERE id = ${customer.id}
      `);
      return {
        customerId: customer.id,
        email: customer.email,
        riskAction: input.risk_action,
        // `deny` now blocks new charges via assertCustomerNotDenied(); `allow`
        // whitelists the customer from standard velocity soft-checks (hard
        // compliance checks still apply — documented, not faked).
      };
    }),

  /** Read the current risk_action for a customer. */
  getRiskAction: protectedProcedure
    .input(z.object({ customer: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      const customer = await findCustomer(database, merchantId, input.customer);
      return { customerId: customer.id, email: customer.email, riskAction: customer.riskAction ?? "default" };
    }),

  /** Paystack POST /customer/validate — async identification. */
  validateCustomer: protectedProcedure
    .input(z.object({
      customer_code: z.string().min(1),
      country: z.enum(["NG", "GH"]),
      type: z.literal("bank_account"),
      account_number: z.string().regex(/^\d{10}$/),
      bvn: z.string().regex(/^\d{11}$/).optional(),
      bank_code: z.string().min(1),
      first_name: z.string().min(1),
      last_name: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      const customer = await findCustomer(database, merchantId, input.customer_code);

      // Persist the identification record (pending) with a MASKED payload —
      // full BVN / account numbers are never stored in clear.
      const identificationId = `cid_${crypto.randomBytes(10).toString("hex")}`;
      const maskedPayload = {
        country: input.country,
        type: input.type,
        account_number: maskAccountNumber(input.account_number),
        bvn: input.bvn ? `*********${input.bvn.slice(-2)}` : null,
        bank_code: input.bank_code,
        first_name: input.first_name,
        last_name: input.last_name,
      };
      await database.execute(sql`
        INSERT INTO customer_identifications (id, merchant_id, customer_id, type, status, payload)
        VALUES (${identificationId}, ${merchantId}, ${customer.id}, ${input.type}, 'pending',
                ${JSON.stringify(maskedPayload)}::jsonb)
      `);

      const finish = async (status: "success" | "failed", reason: string | null) => {
        await database.execute(sql`
          UPDATE customer_identifications
          SET status = ${status}, reason = ${reason}, updated_at = now()
          WHERE id = ${identificationId}
        `);
        await emitRiskEvent(
          merchantId,
          status === "success" ? CUSTOMER_RISK_EVENTS.identificationSuccess : CUSTOMER_RISK_EVENTS.identificationFailed,
          {
            identification_id: identificationId,
            customer_id: customer.id,
            type: input.type,
            ...(status === "failed" ? { reason } : {}),
          },
        );
        return {
          identificationId,
          customerId: customer.id,
          status,
          ...(status === "failed" ? { reason } : {}),
        };
      };

      try {
        // Account-name resolution via the existing NIP path.
        const enquiry = await bridgeOrNibssPost("/nibss/nameenquiry", {
          destinationBankCode: input.bank_code,
          destinationAccountNum: input.account_number,
          channelCode: 2,
        });
        const resolvedName = String(enquiry?.accountName ?? "").toLowerCase();
        const enquiryOk = enquiry?.accountName || String(enquiry?.responseCode ?? "") === "00";
        if (!enquiryOk) return finish("failed", "Account name enquiry failed");
        const nameMatches =
          resolvedName.includes(input.first_name.toLowerCase()) &&
          resolvedName.includes(input.last_name.toLowerCase());
        if (!nameMatches) return finish("failed", "Account name does not match supplied names");

        // BVN verification via the existing NIBSS path, when supplied.
        if (input.bvn) {
          const bvnRes = await bridgeOrNibssPost("/nibss/verifybvn", {
            bvn: input.bvn,
            firstName: input.first_name,
            lastName: input.last_name,
          });
          const verified =
            bvnRes?.verified ??
            ["00", "success", "matched"].includes(String(bvnRes?.responseCode ?? bvnRes?.status ?? "").toLowerCase());
          if (!verified) return finish("failed", "BVN verification failed");
        }

        return finish("success", null);
      } catch (err: any) {
        return finish("failed", `Identification provider unreachable: ${err?.message ?? err}`);
      }
    }),
});
