/**
 * USDC Payout Router
 * ==================
 * tRPC procedures for the native USDC payout engine.
 *
 * Procedures:
 *   usdc.registerWallet        — Register a Solana wallet address for payouts
 *   usdc.listWallets           — List all registered wallets for the merchant
 *   usdc.deactivateWallet      — Deactivate a registered wallet
 *   usdc.validateWallet        — Validate a Solana wallet address (on-chain check via Go bridge)
 *   usdc.getBalance            — Get USDC balance for the merchant's active wallet
 *   usdc.initiatePayout        — Initiate a USDC payout via Temporal workflow
 *   usdc.getPayoutStatus       — Poll payout status by ID
 *   usdc.listPayouts           — List payout history for the merchant
 *   usdc.listDeposits          — List detected USDC deposits for the merchant
 */

import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { getDb, schema } from "./db";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { logger } from "./logger";

const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://localhost:8080";

/** Inline safe bridge caller — mirrors middlewareBridge pattern */
async function bridgeCall<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T | null> {
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const usdcRouter = router({

  // ── Wallet Registration ──────────────────────────────────────────────────

  registerWallet: protectedProcedure
    .input(z.object({
      walletAddress: z.string().min(32).max(44),
      label: z.string().max(64).optional(),
      network: z.enum(["mainnet", "devnet"]).default("mainnet"),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = ctx.user.openId;

      // Validate the wallet address on-chain via Go bridge
      const validation = await bridgeCall<{ valid: boolean; error?: string }>(
        "POST",
        "/v1/usdc/wallet/validate",
        { wallet_address: input.walletAddress, network: input.network }
      );

      if (!validation || !validation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validation?.error ?? "Invalid Solana wallet address — token account not found on-chain",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Deactivate any existing active wallet for this merchantt
      await db
        .update(schema.merchantSolanaWallets)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(schema.merchantSolanaWallets.merchantId, merchantId),
            eq(schema.merchantSolanaWallets.isActive, true)
          )
        );

      // Register the new wallet
      const wallet = await db
        .insert(schema.merchantSolanaWallets)
        .values({
          id: generateId("msw"),
          merchantId,
          walletAddress: input.walletAddress,
          label: input.label ?? "default",
          network: input.network,
          isActive: true,
          verifiedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      logger.info(`[usdc] wallet registered merchant=${merchantId} address=${input.walletAddress}`);
      return wallet[0];
    }),

  listWallets: protectedProcedure
    .query(async ({ ctx }) => {
      const merchantId = ctx.user.openId;
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(schema.merchantSolanaWallets)
        .where(eq(schema.merchantSolanaWallets.merchantId, merchantId))
        .orderBy(desc(schema.merchantSolanaWallets.createdAt));
    }),

  deactivateWallet: protectedProcedure
    .input(z.object({ walletId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = ctx.user.openId;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const result = await db
        .update(schema.merchantSolanaWallets)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(schema.merchantSolanaWallets.id, input.walletId),
            eq(schema.merchantSolanaWallets.merchantId, merchantId)
          )
        )
        .returning();

      if (!result.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Wallet not found" });
      }
      return { success: true };
    }),

  validateWallet: protectedProcedure
    .input(z.object({
      walletAddress: z.string().min(32).max(44),
      network: z.enum(["mainnet", "devnet"]).default("mainnet"),
    }))
    .query(async ({ input }) => {
      const result = await bridgeCall<{
        valid: boolean;
        balance_lamports?: number;
        error?: string;
      }>(
        "POST",
        "/v1/usdc/wallet/validate",
        { wallet_address: input.walletAddress, network: input.network }
      );
      return result ?? { valid: false, error: "Bridge unavailable" };
    }),

  // ── Balance ───────────────────────────────────────────────────────────────

  getBalance: protectedProcedure
    .input(z.object({
      network: z.enum(["mainnet", "devnet"]).default("mainnet"),
    }).optional())
    .query(async ({ ctx, input }) => {
      const merchantId = ctx.user.openId;
      const db = await getDb();
      if (!db) return { hasWallet: false, balanceLamports: 0, balanceUsdc: "0.00" };

      const [wallet] = await db
        .select()
        .from(schema.merchantSolanaWallets)
        .where(
          and(
            eq(schema.merchantSolanaWallets.merchantId, merchantId),
            eq(schema.merchantSolanaWallets.isActive, true)
          )
        )
        .limit(1);

      if (!wallet) {
        return { hasWallet: false, balanceLamports: 0, balanceUsdc: "0.00" };
      }

      const network = input?.network ?? wallet.network;
      const result = await bridgeCall<{ balance_lamports: number; balance_usdc: string }>(
        "GET",
        `/v1/usdc/balance?wallet=${wallet.walletAddress}&network=${network}`
      );

      return {
        hasWallet: true,
        walletAddress: wallet.walletAddress,
        network: wallet.network,
        balanceLamports: result?.balance_lamports ?? 0,
        balanceUsdc: result?.balance_usdc ?? "0.00",
      };
    }),

  // ── Payouts ───────────────────────────────────────────────────────────────

  initiatePayout: protectedProcedure
    .input(z.object({
      recipientWallet: z.string().min(32).max(44),
      amountUsdc: z.number().positive().max(1_000_000),
      reference: z.string().max(128).optional(),
      network: z.enum(["mainnet", "devnet"]).default("mainnet"),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = ctx.user.openId;
      const amountLamports = Math.round(input.amountUsdc * 1_000_000); // USDC has 6 decimals
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Create the payout record in pending state
      const payoutId = generateId("upay");
      await db
        .insert(schema.usdcPayouts)
        .values({
          id: payoutId,
          merchantId,
          recipientWallet: input.recipientWallet,
          amountLamports,
          reference: input.reference,
          network: input.network,
          status: "pending",
          initiatedAt: new Date(),
          updatedAt: new Date(),
        });

      // Trigger the Temporal workflow via Go bridge
      const workflowResult = await bridgeCall<{
        workflow_id: string;
        run_id: string;
        status: string;
      }>(
        "POST",
        "/v1/usdc/payout",
        {
          payout_id: payoutId,
          merchant_id: merchantId,
          recipient_wallet: input.recipientWallet,
          amount_lamports: amountLamports,
          reference: input.reference ?? "",
          network: input.network,
        }
      );

      if (workflowResult) {
        await db
          .update(schema.usdcPayouts)
          .set({
            temporalWorkflowId: workflowResult.workflow_id,
            temporalRunId: workflowResult.run_id,
            status: "reserved",
            updatedAt: new Date(),
          })
          .where(eq(schema.usdcPayouts.id, payoutId));
      }

      logger.info(`[usdc] payout initiated payoutId=${payoutId} merchant=${merchantId} amount=${amountLamports} recipient=${input.recipientWallet}`);

      return {
        payoutId,
        status: workflowResult?.status ?? "pending",
        temporalWorkflowId: workflowResult?.workflow_id,
        message: "Payout initiated. Track status with usdc.getPayoutStatus.",
      };
    }),

  getPayoutStatus: protectedProcedure
    .input(z.object({ payoutId: z.string() }))
    .query(async ({ ctx, input }) => {
      const merchantId = ctx.user.openId;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [payout] = await db
        .select()
        .from(schema.usdcPayouts)
        .where(
          and(
            eq(schema.usdcPayouts.id, input.payoutId),
            eq(schema.usdcPayouts.merchantId, merchantId)
          )
        )
        .limit(1);

      if (!payout) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payout not found" });
      }
      return payout;
    }),

  listPayouts: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      status: z.enum([
        "pending", "reserved", "broadcasting", "confirming",
        "settled", "failed", "voided",
      ]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const merchantId = ctx.user.openId;
      const db = await getDb();
      if (!db) return { payouts: [], total: 0 };
      const baseCondition = eq(schema.usdcPayouts.merchantId, merchantId);
      const statusCondition = input?.status ? eq(schema.usdcPayouts.status, input.status) : undefined;

      const payouts = await db
        .select()
        .from(schema.usdcPayouts)
        .where(statusCondition ? and(baseCondition, statusCondition) : baseCondition)
        .orderBy(desc(schema.usdcPayouts.initiatedAt))
        .limit(input?.limit ?? 20)
        .offset(input?.offset ?? 0);

      return { payouts, total: payouts.length };
    }),

  // ── Deposits ──────────────────────────────────────────────────────────────

  listDeposits: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const merchantId = ctx.user.openId;
      const db = await getDb();
      if (!db) return { deposits: [], total: 0 };
      const deposits = await db
        .select()
        .from(schema.usdcDeposits)
        .where(eq(schema.usdcDeposits.merchantId, merchantId))
        .orderBy(desc(schema.usdcDeposits.detectedAt))
        .limit(input?.limit ?? 20)
        .offset(input?.offset ?? 0);

      return { deposits, total: deposits.length };
    }),
});
