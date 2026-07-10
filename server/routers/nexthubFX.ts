import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { nexthubFxRates } from "../../drizzle/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const nexthubFXRouter = router({
  // Get current FX rate for a currency pair
  getRate: protectedProcedure
    .input(z.object({
      sourceCurrency: z.string().length(3),
      targetCurrency: z.string().length(3),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const now = new Date();
      const rates = await db
        .select()
        .from(nexthubFxRates)
        .where(and(
          eq(nexthubFxRates.sourceCurrency, input.sourceCurrency),
          eq(nexthubFxRates.targetCurrency, input.targetCurrency),
          lte(nexthubFxRates.validFrom, now),
          gte(nexthubFxRates.validTo, now),
        ))
        .orderBy(desc(nexthubFxRates.createdAt))
        .limit(1);

      if (!rates.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No active FX rate for ${input.sourceCurrency}/${input.targetCurrency}`,
        });
      }

      return rates[0];
    }),

  // List all active FX rates
  listRates: protectedProcedure
    .input(z.object({
      sourceCurrency: z.string().length(3).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const now = new Date();
      const conditions = [
        lte(nexthubFxRates.validFrom, now),
        gte(nexthubFxRates.validTo, now),
      ];
      if (input?.sourceCurrency) {
        conditions.push(eq(nexthubFxRates.sourceCurrency, input.sourceCurrency));
      }
      return db
        .select()
        .from(nexthubFxRates)
        .where(and(...conditions))
        .orderBy(nexthubFxRates.sourceCurrency, nexthubFxRates.targetCurrency);
    }),

  // Publish a new FX rate (from FX provider bridge)
  publishRate: protectedProcedure
    .input(z.object({
      sourceCurrency: z.string().length(3),
      targetCurrency: z.string().length(3),
      rate: z.string().regex(/^\d+(\.\d+)?$/, "Rate must be a positive decimal string"),
      provider: z.string().default("nexthub-fx"),
      validForSeconds: z.number().int().min(60).max(86400).default(300),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const now = new Date();
      const validTo = new Date(now.getTime() + input.validForSeconds * 1000);

      const [rate] = await db
        .insert(nexthubFxRates)
        .values({
          sourceCurrency: input.sourceCurrency,
          targetCurrency: input.targetCurrency,
          rate: input.rate,
          provider: input.provider,
          validFrom: now,
          validTo,
        })
        .returning();

      return rate;
    }),

  // Convert an amount using the current rate
  convert: protectedProcedure
    .input(z.object({
      sourceCurrency: z.string().length(3),
      targetCurrency: z.string().length(3),
      sourceAmount: z.string().regex(/^\d+(\.\d+)?$/),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const now = new Date();
      const rates = await db
        .select()
        .from(nexthubFxRates)
        .where(and(
          eq(nexthubFxRates.sourceCurrency, input.sourceCurrency),
          eq(nexthubFxRates.targetCurrency, input.targetCurrency),
          lte(nexthubFxRates.validFrom, now),
          gte(nexthubFxRates.validTo, now),
        ))
        .orderBy(desc(nexthubFxRates.createdAt))
        .limit(1);

      if (!rates.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No active FX rate for ${input.sourceCurrency}/${input.targetCurrency}`,
        });
      }

      const rate = parseFloat(rates[0].rate);
      const sourceAmount = parseFloat(input.sourceAmount);
      const targetAmount = (sourceAmount * rate).toFixed(2);

      return {
        sourceCurrency: input.sourceCurrency,
        targetCurrency: input.targetCurrency,
        sourceAmount: input.sourceAmount,
        targetAmount,
        rate: rates[0].rate,
        provider: rates[0].provider,
        validTo: rates[0].validTo,
      };
    }),

  // Get FX rate history for a currency pair
  rateHistory: protectedProcedure
    .input(z.object({
      sourceCurrency: z.string().length(3),
      targetCurrency: z.string().length(3),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(nexthubFxRates)
        .where(and(
          eq(nexthubFxRates.sourceCurrency, input.sourceCurrency),
          eq(nexthubFxRates.targetCurrency, input.targetCurrency),
        ))
        .orderBy(desc(nexthubFxRates.createdAt))
        .limit(input.limit);
    }),

  // Get supported currency pairs
  supportedPairs: protectedProcedure.query(async () => {
    const db = await getDb();
    const now = new Date();
    const rates = await db
      .select({
        sourceCurrency: nexthubFxRates.sourceCurrency,
        targetCurrency: nexthubFxRates.targetCurrency,
        provider: nexthubFxRates.provider,
      })
      .from(nexthubFxRates)
      .where(and(
        lte(nexthubFxRates.validFrom, now),
        gte(nexthubFxRates.validTo, now),
      ));

    // Deduplicate
    const seen = new Set<string>();
    return rates.filter((r) => {
      const key = `${r.sourceCurrency}/${r.targetCurrency}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }),
});
