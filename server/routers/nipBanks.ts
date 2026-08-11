/**
 * NIP Banks tRPC Router
 * Provides procedures for:
 *  - Listing all CBN-licensed NIP-enabled banks
 *  - Account name enquiry (with Redis cache via Go bridge)
 *  - Virtual account generation
 *  - Transfer status polling
 *  - NIP webhook handling
 */
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { db } from "../db";
import {
  getCachedNipNameEnquiry,
  cacheNipNameEnquiry,
  createNipVirtualAccount,
  getNipVirtualAccountByReference,
  listNipVirtualAccounts,
} from "../db";
import {
  nipBanks as nibssBanks,
} from "../../drizzle/schema";
import { eq, and, ilike, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const NIBSS_GATEWAY_URL = process.env.NIBSS_GATEWAY_URL ?? "";
const NIBSS_INSTITUTION_CODE = process.env.NIBSS_INSTITUTION_CODE ?? "";
const NIBSS_SECRET_KEY = process.env.NIBSS_SECRET_KEY ?? "";
const MIDDLEWARE_BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "";
const MIDDLEWARE_INTERNAL_KEY = process.env.MIDDLEWARE_INTERNAL_KEY ?? "";

// ─── NIBSS NIP HTTP helper ────────────────────────────────────────────────────

async function nibssPost(path: string, body: Record<string, unknown>) {
  const payload = JSON.stringify(body);
  const { createHmac } = await import("crypto");
  const signature = createHmac("sha256", NIBSS_SECRET_KEY)
    .update(payload)
    .digest("hex");

  const res = await fetch(`${NIBSS_GATEWAY_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      INSTITUTION_CODE: NIBSS_INSTITUTION_CODE,
      "X-NIP-SIGNATURE": signature,
      "X-NIP-TIMESTAMP": Date.now().toString(),
    },
    body: payload,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `NIBSS gateway error ${res.status}: ${text}`,
    });
  }
  return res.json();
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const nipBanksRouter = router({
  /**
   * List all NIP-enabled banks, optionally filtered by category or search term.
   * Results are served from DB (seeded from NIGERIAN_BANKS seed file).
   */
  list: publicProcedure
    .input(
      z.object({
        category: z
          .enum(["commercial", "microfinance", "merchant", "digital", "all"])
          .optional()
          .default("all"),
        search: z.string().optional(),
        activeOnly: z.boolean().optional().default(true),
      })
    )
    .query(async ({ input }) => {
      const database = await db;
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      let query = database.select().from(nibssBanks).$dynamic();

      const conditions = [];
      if (input.activeOnly) conditions.push(eq(nibssBanks.isActive, 1));
      if (input.category !== "all") conditions.push(eq(nibssBanks.category, input.category));
      if (input.search) {
        conditions.push(
          or(
            ilike(nibssBanks.bankName, `%${input.search}%`),
            ilike(nibssBanks.shortName, `%${input.search}%`),
            ilike(nibssBanks.nipCode, `%${input.search}%`)
          )
        );
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      return query.orderBy(nibssBanks.bankName);
    }),

  /**
   * Account name enquiry — validates an account number at a given bank.
   * Checks DB cache first (24h TTL), then calls NIBSS via Go bridge.
   */
  nameEnquiry: protectedProcedure
    .input(
      z.object({
        bankNipCode: z.string().min(6).max(10),
        accountNumber: z.string().length(10),
      })
    )
    .mutation(async ({ input }) => {
      const database = await db;
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Check cache (real `nip_name_enquiry_cache` table via db helper —
      // drizzle/schema.ts does not export this table, so the helper queries
      // it with parameterized raw SQL).
      const cached = await getCachedNipNameEnquiry(input.bankNipCode, input.accountNumber);

      if (cached) {
        return {
          accountName: cached.accountName,
          bankVerificationNumber: cached.bankVerificationNumber,
          kycLevel: cached.kycLevel,
          fromCache: true,
        };
      }

      // Call NIBSS via Go bridge or directly
      let accountName: string;
      let bvn: string | null = null;
      let kycLevel: string | null = null;

      if (MIDDLEWARE_BRIDGE_URL) {
        const res = await fetch(`${MIDDLEWARE_BRIDGE_URL}/nibss/nameenquiry`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Key": MIDDLEWARE_INTERNAL_KEY,
          },
          body: JSON.stringify({
            destinationBankCode: input.bankNipCode,
            destinationAccountNum: input.accountNumber,
            channelCode: 2,
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Name enquiry failed" });
        }
        const data = await res.json() as { accountName: string; bankVerificationNumber?: string; kycLevel?: string; responseCode: string };
        if (data.responseCode !== "00") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Account not found" });
        }
        accountName = data.accountName;
        bvn = data.bankVerificationNumber ?? null;
        kycLevel = data.kycLevel ?? null;
      } else {
        // Direct NIBSS call
        const data = await nibssPost("/nameenquiry", {
          destinationBankCode: input.bankNipCode,
          destinationAccountNum: input.accountNumber,
          channelCode: 2,
          institutionCode: NIBSS_INSTITUTION_CODE,
          nameEnquiryRef: `NE${Date.now()}`,
        }) as { accountName: string; bankVerificationNumber?: string; kycLevel?: string; responseCode: string };

        if (data.responseCode !== "00") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Account not found" });
        }
        accountName = data.accountName;
        bvn = data.bankVerificationNumber ?? null;
        kycLevel = data.kycLevel ?? null;
      }

      // Cache result for 24 hours
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await cacheNipNameEnquiry({
        bankNipCode: input.bankNipCode,
        accountNumber: input.accountNumber,
        accountName,
        bankVerificationNumber: bvn,
        kycLevel,
        expiresAt,
      });

      return { accountName, bankVerificationNumber: bvn, kycLevel, fromCache: false };
    }),

  /**
   * Generate a NIP virtual account for a payment session.
   * The customer pays into this account and NIBSS notifies PayGate via webhook.
   */
  generateVirtualAccount: publicProcedure
    .input(
      z.object({
        merchantId: z.string().optional(), // optional — resolved from paymentLinkId if not provided
        reference: z.string(),
        bankNipCode: z.string(),
        accountName: z.string(),
        amountExpected: z.number().int().positive().optional(),
        expiryMinutes: z.number().int().min(5).max(1440).optional().default(30),
        paymentLinkId: z.string().optional(),
        checkoutSessionId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const database = await db;
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Resolve merchantId from paymentLinkId if not provided directly
      let resolvedMerchantId = input.merchantId;
      if (!resolvedMerchantId && input.paymentLinkId) {
        const { getPaymentLinkById } = await import('../db');
        const link = await getPaymentLinkById(input.paymentLinkId);
        if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Payment link not found" });
        resolvedMerchantId = link.merchantId;
      }
      if (!resolvedMerchantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "merchantId or paymentLinkId is required" });
      }

      // Get bank name
      const bank = await database
        .select({ bankName: nibssBanks.bankName })
        .from(nibssBanks)
        .where(eq(nibssBanks.nipCode, input.bankNipCode))
        .limit(1);

      const bankName = bank[0]?.bankName ?? "Unknown Bank";
      const expiresAt = new Date(Date.now() + input.expiryMinutes * 60 * 1000);

      // Call Go bridge or NIBSS directly
      let accountNumber: string;

      if (MIDDLEWARE_BRIDGE_URL) {
        const res = await fetch(`${MIDDLEWARE_BRIDGE_URL}/nibss/virtualaccounts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Key": MIDDLEWARE_INTERNAL_KEY,
          },
          body: JSON.stringify({
            merchantId: input.merchantId,
            reference: input.reference,
            bankNipCode: input.bankNipCode,
            amountExpected: input.amountExpected ?? 0,
            accountName: input.accountName,
            expiryMinutes: input.expiryMinutes,
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Virtual account generation failed" });
        }
        const data = await res.json() as { accountNumber: string };
        accountNumber = data.accountNumber;
      } else {
        // Direct NIBSS call
        const data = await nibssPost("/virtualaccounts", {
          bankCode: input.bankNipCode,
          accountName: input.accountName,
          reference: input.reference,
          amountExpected: input.amountExpected ?? 0,
          expiryDateTime: expiresAt.toISOString().replace("T", " ").substring(0, 19),
          institutionCode: NIBSS_INSTITUTION_CODE,
        }) as { accountNumber: string };
        accountNumber = data.accountNumber;
      }

      // Persist to DB (real `nip_virtual_accounts` table via db helper —
      // drizzle/schema.ts does not export this table).
      await createNipVirtualAccount({
        merchantId: resolvedMerchantId,
        paymentLinkId: input.paymentLinkId ?? null,
        checkoutSessionId: input.checkoutSessionId ?? null,
        bankNipCode: input.bankNipCode,
        bankName,
        accountNumber,
        accountName: input.accountName,
        amountExpected: input.amountExpected ?? null,
        currency: "NGN",
        reference: input.reference,
        expiresAt,
        status: "pending",
      });

      return {
        accountNumber,
        accountName: input.accountName,
        bankName,
        bankNipCode: input.bankNipCode,
        reference: input.reference,
        expiresAt,
        amountExpected: input.amountExpected,
      };
    }),

  /**
   * Poll the status of a NIP virtual account payment.
   */
  getVirtualAccountStatus: protectedProcedure
    .input(z.object({ reference: z.string() }))
    .query(async ({ input }) => {
      const database = await db;
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const va = await getNipVirtualAccountByReference(input.reference);

      if (!va) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Virtual account not found" });
      }

      return va;
    }),

  /**
   * List virtual accounts for a merchant.
   */
  listVirtualAccounts: protectedProcedure
    .input(
      z.object({
        merchantId: z.string(),
        status: z.enum(["pending", "paid", "expired", "cancelled", "all"]).optional().default("all"),
        limit: z.number().int().min(1).max(100).optional().default(20),
        offset: z.number().int().min(0).optional().default(0),
      })
    )
    .query(async ({ input }) => {
      const database = await db;
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      return listNipVirtualAccounts(input.merchantId, {
        status: input.status === "all" ? null : input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }),
});
