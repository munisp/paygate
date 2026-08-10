// server/routers/consumerFeatures.ts
// Consumer analytics, disputes, fraud, and idempotency routers

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../_core/trpc';
import { getDb } from '../db';

// ─── Consumer Analytics Router ────────────────────────────────────────────────
export const consumerAnalyticsRouter = router({
  // Monthly spend summary grouped by month
  spendByMonth: protectedProcedure
    .input(z.object({ months: z.number().int().min(1).max(12).default(6) }))
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { consumerWalletTxns, consumerWallets } = await import('../../drizzle/schema');
      const { eq, and, gte, sql } = await import('drizzle-orm');
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 6);
      const wallets = await db.select({ id: consumerWallets.id })
        .from(consumerWallets)
        .where(eq(consumerWallets.userId, ctx.user.id));
      if (wallets.length === 0) return [];
      const walletIds = wallets.map(w => w.id);
      const rows = await db.select({
        month: sql<string>`to_char(${consumerWalletTxns.createdAt}, 'YYYY-MM')`,
        totalDebit: sql<number>`coalesce(sum(case when ${consumerWalletTxns.type} in ('debit','p2p_send','qr_pay','bill_pay','red_envelope_send') then ${consumerWalletTxns.amountKobo} else 0 end), 0)`,
        totalCredit: sql<number>`coalesce(sum(case when ${consumerWalletTxns.type} in ('topup','p2p_receive','red_envelope_receive','refund') then ${consumerWalletTxns.amountKobo} else 0 end), 0)`,
        txCount: sql<number>`count(*)`,
      })
        .from(consumerWalletTxns)
        .where(and(
          sql`${consumerWalletTxns.walletId} = any(${walletIds})`,
          gte(consumerWalletTxns.createdAt, cutoff),
          eq(consumerWalletTxns.status, 'completed'),
        ))
        .groupBy(sql`to_char(${consumerWalletTxns.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${consumerWalletTxns.createdAt}, 'YYYY-MM') asc`);
      return rows;
    }),

  // Spend by transaction type (category breakdown)
  spendByCategory: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { consumerWalletTxns, consumerWallets } = await import('../../drizzle/schema');
      const { eq, and, gte, sql } = await import('drizzle-orm');
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 1);
      const wallets = await db.select({ id: consumerWallets.id })
        .from(consumerWallets)
        .where(eq(consumerWallets.userId, ctx.user.id));
      if (wallets.length === 0) return [];
      const walletIds = wallets.map(w => w.id);
      const rows = await db.select({
        category: consumerWalletTxns.type,
        totalKobo: sql<number>`sum(${consumerWalletTxns.amountKobo})`,
        txCount: sql<number>`count(*)`,
      })
        .from(consumerWalletTxns)
        .where(and(
          sql`${consumerWalletTxns.walletId} = any(${walletIds})`,
          gte(consumerWalletTxns.createdAt, cutoff),
          eq(consumerWalletTxns.status, 'completed'),
        ))
        .groupBy(consumerWalletTxns.type)
        .orderBy(sql`sum(${consumerWalletTxns.amountKobo}) desc`);
      return rows;
    }),

  // Top counterparties (who you pay most)
  topCounterparties: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(20).default(5) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const { consumerWalletTxns, consumerWallets } = await import('../../drizzle/schema');
      const { eq, and, gte, sql, isNotNull } = await import('drizzle-orm');
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 3);
      const wallets = await db.select({ id: consumerWallets.id })
        .from(consumerWallets)
        .where(eq(consumerWallets.userId, ctx.user.id));
      if (wallets.length === 0) return [];
      const walletIds = wallets.map(w => w.id);
      const rows = await db.select({
        counterpartyName: consumerWalletTxns.counterpartyName,
        totalKobo: sql<number>`sum(${consumerWalletTxns.amountKobo})`,
        txCount: sql<number>`count(*)`,
      })
        .from(consumerWalletTxns)
        .where(and(
          sql`${consumerWalletTxns.walletId} = any(${walletIds})`,
          gte(consumerWalletTxns.createdAt, cutoff),
          isNotNull(consumerWalletTxns.counterpartyName),
          eq(consumerWalletTxns.status, 'completed'),
        ))
        .groupBy(consumerWalletTxns.counterpartyName)
        .orderBy(sql`sum(${consumerWalletTxns.amountKobo}) desc`)
        .limit(input.limit);
      return rows;
    }),

  // Credit vs debit split for last 30 days
  creditDebitSplit: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { creditKobo: 0, debitKobo: 0 };
      const { consumerWalletTxns, consumerWallets } = await import('../../drizzle/schema');
      const { eq, and, gte, sql } = await import('drizzle-orm');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const wallets = await db.select({ id: consumerWallets.id })
        .from(consumerWallets)
        .where(eq(consumerWallets.userId, ctx.user.id));
      if (wallets.length === 0) return { creditKobo: 0, debitKobo: 0 };
      const walletIds = wallets.map(w => w.id);
      const [row] = await db.select({
        creditKobo: sql<number>`coalesce(sum(case when ${consumerWalletTxns.type} in ('topup','p2p_receive','red_envelope_receive','refund') then ${consumerWalletTxns.amountKobo} else 0 end), 0)`,
        debitKobo: sql<number>`coalesce(sum(case when ${consumerWalletTxns.type} in ('debit','p2p_send','qr_pay','bill_pay','red_envelope_send') then ${consumerWalletTxns.amountKobo} else 0 end), 0)`,
      })
        .from(consumerWalletTxns)
        .where(and(
          sql`${consumerWalletTxns.walletId} = any(${walletIds})`,
          gte(consumerWalletTxns.createdAt, cutoff),
          eq(consumerWalletTxns.status, 'completed'),
        ));
      return row ?? { creditKobo: 0, debitKobo: 0 };
    }),

  // Daily usage chart (last 7 days)
  dailyUsage: protectedProcedure
    .input(z.object({ days: z.number().int().min(7).max(30).default(7) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const { consumerWalletTxns, consumerWallets } = await import('../../drizzle/schema');
      const { eq, and, gte, sql } = await import('drizzle-orm');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.days);
      const wallets = await db.select({ id: consumerWallets.id })
        .from(consumerWallets)
        .where(eq(consumerWallets.userId, ctx.user.id));
      if (wallets.length === 0) return [];
      const walletIds = wallets.map(w => w.id);
      const rows = await db.select({
        day: sql<string>`to_char(${consumerWalletTxns.createdAt}, 'YYYY-MM-DD')`,
        totalKobo: sql<number>`sum(${consumerWalletTxns.amountKobo})`,
        txCount: sql<number>`count(*)`,
      })
        .from(consumerWalletTxns)
        .where(and(
          sql`${consumerWalletTxns.walletId} = any(${walletIds})`,
          gte(consumerWalletTxns.createdAt, cutoff),
          eq(consumerWalletTxns.status, 'completed'),
        ))
        .groupBy(sql`to_char(${consumerWalletTxns.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${consumerWalletTxns.createdAt}, 'YYYY-MM-DD') asc`);
      return rows;
    }),
});

// ─── Consumer Disputes Router ─────────────────────────────────────────────────
export const consumerDisputeRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['open', 'under_review', 'resolved', 'rejected', 'escalated']).optional(),
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const { consumerDisputes } = await import('../../drizzle/schema');
      const { eq, and, desc, count } = await import('drizzle-orm');
      const conditions = [eq(consumerDisputes.userId, ctx.user.id)];
      if (input.status) conditions.push(eq(consumerDisputes.status, input.status));
      const [items, [{ total }]] = await Promise.all([
        db.select().from(consumerDisputes)
          .where(and(...conditions))
          .orderBy(desc(consumerDisputes.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ total: count() }).from(consumerDisputes).where(and(...conditions)),
      ]);
      return { items, total };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'NOT_FOUND' });
      const { consumerDisputes } = await import('../../drizzle/schema');
      const { eq, and } = await import('drizzle-orm');
      const [dispute] = await db.select().from(consumerDisputes)
        .where(and(eq(consumerDisputes.id, input.id), eq(consumerDisputes.userId, ctx.user.id)));
      if (!dispute) throw new TRPCError({ code: 'NOT_FOUND', message: 'Dispute not found' });
      return dispute;
    }),

  raise: protectedProcedure
    .input(z.object({
      walletTxnId: z.string().optional(),
      subject: z.string().min(5).max(200),
      description: z.string().min(10).max(2000),
      category: z.enum(['unauthorized', 'duplicate', 'not_received', 'wrong_amount', 'fraud', 'other']),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { consumerDisputes } = await import('../../drizzle/schema');
      const [dispute] = await db.insert(consumerDisputes).values({
        userId: ctx.user.id,
        walletTxnId: input.walletTxnId,
        subject: input.subject,
        description: input.description,
        category: input.category,
        status: 'open',
      }).returning();
      return dispute;
    }),

  uploadEvidence: protectedProcedure
    .input(z.object({
      disputeId: z.string(),
      evidenceUrls: z.array(z.string().url()).min(1).max(5),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { consumerDisputes } = await import('../../drizzle/schema');
      const { eq, and } = await import('drizzle-orm');
      const [dispute] = await db.select().from(consumerDisputes)
        .where(and(eq(consumerDisputes.id, input.disputeId), eq(consumerDisputes.userId, ctx.user.id)));
      if (!dispute) throw new TRPCError({ code: 'NOT_FOUND' });
      const [updated] = await db.update(consumerDisputes)
        .set({ evidenceUrls: JSON.stringify(input.evidenceUrls), updatedAt: new Date() })
        .where(eq(consumerDisputes.id, input.disputeId))
        .returning();
      return updated;
    }),
});

// ─── Consumer Fraud Router ────────────────────────────────────────────────────
export const consumerFraudRouter = router({
  listFlags: protectedProcedure
    .input(z.object({
      status: z.enum(['active', 'reviewed', 'dismissed', 'escalated']).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const { consumerFraudFlags } = await import('../../drizzle/schema');
      const { eq, and, desc } = await import('drizzle-orm');
      const conditions = [eq(consumerFraudFlags.userId, ctx.user.id)];
      if (input.status) conditions.push(eq(consumerFraudFlags.status, input.status));
      return db.select().from(consumerFraudFlags)
        .where(and(...conditions))
        .orderBy(desc(consumerFraudFlags.createdAt))
        .limit(input.limit);
    }),

  getRiskScore: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { score: 0, activeFlags: 0 };
      const { consumerFraudFlags } = await import('../../drizzle/schema');
      const { eq, and, desc, count, max } = await import('drizzle-orm');
      const [row] = await db.select({
        activeFlags: count(),
        maxScore: max(consumerFraudFlags.riskScore),
      })
        .from(consumerFraudFlags)
        .where(and(
          eq(consumerFraudFlags.userId, ctx.user.id),
          eq(consumerFraudFlags.status, 'active'),
        ));
      return { score: row?.maxScore ?? 0, activeFlags: row?.activeFlags ?? 0 };
    }),

  flagTransaction: protectedProcedure
    .input(z.object({
      walletTxnId: z.string(),
      reason: z.string().min(5).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { consumerFraudFlags } = await import('../../drizzle/schema');
      const [flag] = await db.insert(consumerFraudFlags).values({
        userId: ctx.user.id,
        walletTxnId: input.walletTxnId,
        riskScore: 70, // manual flag gets high score
        flagReason: input.reason,
        flagType: 'manual',
        status: 'active',
      }).returning();
      return flag;
    }),
});
