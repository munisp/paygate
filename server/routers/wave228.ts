/**
 * wave228.ts — Wave 228 Quick Wins
 *
 * 1. PDF export for transactions and settlements (server-side, pdfkit)
 * 2. Cashback / rewards engine (earn on spend, balance query, redeem, history)
 * 3. API docs procedures (OpenAPI-style spec, SDK info, changelog)
 */
import { router, protectedProcedure, publicProcedure } from '../_core/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { getUserByOpenId, getMerchantByOwnerId, getDb } from '../db';
import * as schema from '../../drizzle/schema';
import { eq, and, desc, gte, lte, sql, sum, count } from 'drizzle-orm';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveUser(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not found' });
  return user;
}

async function requireMerchant(userId: number | string) {
  const merchant = await getMerchantByOwnerId(String(userId));
  if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
  return merchant;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
  return db;
}

/** Generate a simple PDF as base64 using pdfkit */
async function buildPdf(title: string, subtitle: string, headers: string[], rows: string[][]): Promise<string> {
  const PDFDocument = (await import('pdfkit')).default;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    doc.on('error', reject);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('PayGate', 40, 40);
    doc.fontSize(13).font('Helvetica').text(title, 40, 65);
    doc.fontSize(9).fillColor('#666').text(subtitle, 40, 85);
    doc.moveDown(2);

    // Table header
    const colWidth = Math.floor((doc.page.width - 80) / headers.length);
    let y = doc.y;
    doc.fillColor('#1a1a2e').rect(40, y, doc.page.width - 80, 18).fill();
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
    headers.forEach((h, i) => {
      doc.text(h, 42 + i * colWidth, y + 4, { width: colWidth - 4, lineBreak: false });
    });
    y += 20;

    // Table rows
    doc.font('Helvetica').fontSize(7.5);
    rows.forEach((row, ri) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 40;
      }
      const bg = ri % 2 === 0 ? '#f8f9fa' : '#ffffff';
      doc.fillColor(bg).rect(40, y, doc.page.width - 80, 16).fill();
      doc.fillColor('#1a1a2e');
      row.forEach((cell, i) => {
        doc.text(cell, 42 + i * colWidth, y + 3, { width: colWidth - 4, lineBreak: false });
      });
      y += 17;
    });

    // Footer
    doc.fillColor('#999').fontSize(8)
      .text(`Generated ${new Date().toUTCString()} · PayGate Platform`, 40, doc.page.height - 30, { align: 'center' });

    doc.end();
  });
}

// ─── 1. PDF Export Router ─────────────────────────────────────────────────────

export const pdfExportRouter = router({
  /** Export transactions as PDF */
  transactions: protectedProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await requireDb();

      const conditions: any[] = [eq(schema.transactions.merchantId, merchant.id)];
      if (input.status) conditions.push(eq(schema.transactions.status, input.status as any));
      if (input.from) conditions.push(gte(schema.transactions.createdAt, input.from));
      if (input.to) conditions.push(lte(schema.transactions.createdAt, input.to));

      const rows = await db
        .select({
          id: schema.transactions.id,
          reference: schema.transactions.reference,
          amount: schema.transactions.amount,
          currency: schema.transactions.currency,
          status: schema.transactions.status,
          channel: schema.transactions.channel,
          customerEmail: schema.transactions.customerEmail,
          createdAt: schema.transactions.createdAt,
        })
        .from(schema.transactions)
        .where(and(...conditions))
        .orderBy(desc(schema.transactions.createdAt))
        .limit(5000);

      const totalVol = rows.filter(r => r.status === 'completed').reduce((s, r) => s + r.amount, 0);
      const subtitle = `${rows.length} transactions · Total volume: ₦${(totalVol / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })} · ${merchant.businessName}`;

      const pdfBase64 = await buildPdf(
        'Transaction Report',
        subtitle,
        ['Reference', 'Amount (NGN)', 'Currency', 'Status', 'Channel', 'Customer', 'Date'],
        rows.map(r => [
          r.reference,
          (r.amount / 100).toFixed(2),
          r.currency,
          r.status,
          r.channel ?? '',
          r.customerEmail ?? '',
          new Date(r.createdAt).toLocaleDateString('en-GB'),
        ])
      );

      return {
        pdfBase64,
        filename: `transactions-${new Date().toISOString().split('T')[0]}.pdf`,
        count: rows.length,
      };
    }),

  /** Export settlements as PDF */
  settlements: protectedProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await requireDb();

      const conditions: any[] = [eq(schema.settlements.merchantId, merchant.id)];
      if (input.status) conditions.push(eq(schema.settlements.status, input.status as any));
      if (input.from) conditions.push(gte(schema.settlements.createdAt, input.from));
      if (input.to) conditions.push(lte(schema.settlements.createdAt, input.to));

      const rows = await db
        .select({
          id: schema.settlements.id,
          reference: schema.settlements.reference,
          amount: schema.settlements.amount,
          currency: schema.settlements.currency,
          status: schema.settlements.status,
          bankCode: schema.settlements.bankCode,
          accountNumber: schema.settlements.accountNumber,
          accountName: schema.settlements.accountName,
          createdAt: schema.settlements.createdAt,
        })
        .from(schema.settlements)
        .where(and(...conditions))
        .orderBy(desc(schema.settlements.createdAt))
        .limit(5000);

      const totalVol = rows.filter(r => r.status === 'completed').reduce((s, r) => s + r.amount, 0);
      const subtitle = `${rows.length} settlements · Total: ₦${(totalVol / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })} · ${merchant.businessName}`;

      const pdfBase64 = await buildPdf(
        'Settlement Report',
        subtitle,
        ['Reference', 'Amount (NGN)', 'Status', 'Bank Code', 'Account No.', 'Account Name', 'Date'],
        rows.map(r => [
          r.reference ?? '',
          (r.amount / 100).toFixed(2),
          r.status,
          r.bankCode ?? '',
          r.accountNumber ?? '',
          r.accountName ?? '',
          new Date(r.createdAt).toLocaleDateString('en-GB'),
        ])
      );

      return {
        pdfBase64,
        filename: `settlements-${new Date().toISOString().split('T')[0]}.pdf`,
        count: rows.length,
      };
    }),

  /** Export monthly statement as PDF */
  monthlyStatement: protectedProcedure
    .input(z.object({
      year: z.number().int().min(2020).max(2100),
      month: z.number().int().min(1).max(12),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await requireDb();

      const from = new Date(input.year, input.month - 1, 1);
      const to = new Date(input.year, input.month, 0, 23, 59, 59, 999);
      const monthName = from.toLocaleString('en-US', { month: 'long', year: 'numeric' });

      const rows = await db
        .select({
          id: schema.transactions.id,
          reference: schema.transactions.reference,
          amount: schema.transactions.amount,
          currency: schema.transactions.currency,
          status: schema.transactions.status,
          channel: schema.transactions.channel,
          customerEmail: schema.transactions.customerEmail,
          createdAt: schema.transactions.createdAt,
        })
        .from(schema.transactions)
        .where(and(
          eq(schema.transactions.merchantId, merchant.id),
          gte(schema.transactions.createdAt, from),
          lte(schema.transactions.createdAt, to),
        ))
        .orderBy(desc(schema.transactions.createdAt))
        .limit(10000);

      const completed = rows.filter(r => r.status === 'completed');
      const totalVol = completed.reduce((s, r) => s + r.amount, 0);
      const subtitle = [
        `${monthName} · ${merchant.businessName}`,
        `${rows.length} transactions · ${completed.length} successful · ₦${(totalVol / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })} volume`,
      ].join(' | ');

      const pdfBase64 = await buildPdf(
        `Monthly Statement — ${monthName}`,
        subtitle,
        ['Reference', 'Amount (NGN)', 'Status', 'Channel', 'Customer Email', 'Date'],
        rows.map(r => [
          r.reference,
          (r.amount / 100).toFixed(2),
          r.status,
          r.channel ?? '',
          r.customerEmail ?? '',
          new Date(r.createdAt).toLocaleDateString('en-GB'),
        ])
      );

      return {
        pdfBase64,
        filename: `statement-${monthName.replace(/\s/g, '-')}.pdf`,
        count: rows.length,
        summary: {
          period: monthName,
          totalTransactions: rows.length,
          successCount: completed.length,
          failedCount: rows.filter(r => r.status === 'failed').length,
          pendingCount: rows.filter(r => r.status === 'pending').length,
          totalVolumeNgn: totalVol / 100,
          merchantName: merchant.businessName,
        },
      };
    }),
});

// ─── 2. Cashback / Rewards Engine ────────────────────────────────────────────

export const cashbackRewardsRouter = router({
  /** Get the merchant's cashback balance and tier */
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    const db = await requireDb();

    const [balance] = await db
      .select()
      .from(schema.cashbackBalances)
      .where(eq(schema.cashbackBalances.merchantId, merchant.id))
      .limit(1);

    if (!balance) {
      // Auto-create a balance record for new merchants
      const [created] = await db
        .insert(schema.cashbackBalances)
        .values({ merchantId: merchant.id })
        .returning();
      return created;
    }
    return balance;
  }),

  /** List cashback transaction history */
  listHistory: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      type: z.enum(['earn', 'redeem', 'expire', 'adjust']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await requireDb();

      const conditions: any[] = [eq(schema.cashbackTransactions.merchantId, merchant.id)];
      if (input.type) conditions.push(eq(schema.cashbackTransactions.type, input.type));

      const [rows, [{ total }]] = await Promise.all([
        db.select().from(schema.cashbackTransactions)
          .where(and(...conditions))
          .orderBy(desc(schema.cashbackTransactions.createdAt))
          .limit(input.limit).offset(input.offset),
        db.select({ total: count() }).from(schema.cashbackTransactions)
          .where(and(...conditions)),
      ]);

      return { rows, total, limit: input.limit, offset: input.offset };
    }),

  /** Earn cashback on a completed transaction (called internally after payment success) */
  earnOnTransaction: protectedProcedure
    .input(z.object({
      transactionId: z.string(),
      transactionAmountKobo: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await requireDb();

      // Get or create balance record
      let [balance] = await db
        .select()
        .from(schema.cashbackBalances)
        .where(eq(schema.cashbackBalances.merchantId, merchant.id))
        .limit(1);

      if (!balance) {
        const [created] = await db
          .insert(schema.cashbackBalances)
          .values({ merchantId: merchant.id })
          .returning();
        balance = created;
      }

      if (!balance.enabled || balance.enabled === 0) return { earned: 0, newBalance: balance.cashbackBalanceKobo ?? 0 };

      // Check minimum transaction threshold
      const minTx = balance.minTransactionKobo ?? 10000;
      if (input.transactionAmountKobo < minTx) {
        return { earned: 0, newBalance: balance.cashbackBalanceKobo ?? 0 };
      }

      // Calculate cashback
      const rate = parseFloat(balance.cashbackRate ?? '0.02');
      const maxCashback = balance.maxCashbackKobo ?? 50000;
      const rawEarned = Math.floor(input.transactionAmountKobo * rate);
      const earnedKobo = Math.min(rawEarned, maxCashback);

      if (earnedKobo <= 0) return { earned: 0, newBalance: balance.cashbackBalanceKobo ?? 0 };

      // Update balance
      const newBalance = (balance.cashbackBalanceKobo ?? 0) + earnedKobo;
      const newTotalEarned = (balance.totalEarnedKobo ?? 0) + earnedKobo;

      // Determine tier upgrade
      let newTier = balance.tier ?? 'bronze';
      if (newTotalEarned >= 5_000_000) newTier = 'platinum';
      else if (newTotalEarned >= 1_000_000) newTier = 'gold';
      else if (newTotalEarned >= 200_000) newTier = 'silver';

      await db.transaction(async (tx) => {
        await tx.update(schema.cashbackBalances)
          .set({
            cashbackBalanceKobo: newBalance,
            totalEarnedKobo: newTotalEarned,
            tier: newTier,
            updatedAt: new Date(),
          })
          .where(eq(schema.cashbackBalances.merchantId, merchant.id));

        await tx.insert(schema.cashbackTransactions).values({
          merchantId: merchant.id,
          type: 'earn',
          amountKobo: earnedKobo,
          description: `Cashback earned on transaction ${input.transactionId}`,
          relatedTransactionId: input.transactionId,
          status: 'completed',
        });
      });

      return { earned: earnedKobo, newBalance, tier: newTier };
    }),

  /** Redeem cashback balance (apply to next transaction) */
  redeem: protectedProcedure
    .input(z.object({
      amountKobo: z.number().int().positive(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await requireDb();

      const [balance] = await db
        .select()
        .from(schema.cashbackBalances)
        .where(eq(schema.cashbackBalances.merchantId, merchant.id))
        .limit(1);

      if (!balance) throw new TRPCError({ code: 'NOT_FOUND', message: 'No cashback balance found' });
      if (!balance.enabled || balance.enabled === 0) throw new TRPCError({ code: 'FORBIDDEN', message: 'Cashback is disabled for this merchant' });

      const available = balance.cashbackBalanceKobo ?? 0;
      if (input.amountKobo > available) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Insufficient cashback balance. Available: ₦${(available / 100).toFixed(2)}`,
        });
      }

      const newBalance = available - input.amountKobo;
      const newTotalRedeemed = (balance.totalRedeemedKobo ?? 0) + input.amountKobo;

      await db.transaction(async (tx) => {
        await tx.update(schema.cashbackBalances)
          .set({
            cashbackBalanceKobo: newBalance,
            totalRedeemedKobo: newTotalRedeemed,
            updatedAt: new Date(),
          })
          .where(eq(schema.cashbackBalances.merchantId, merchant.id));

        await tx.insert(schema.cashbackTransactions).values({
          merchantId: merchant.id,
          type: 'redeem',
          amountKobo: input.amountKobo,
          description: input.description ?? 'Cashback redeemed',
          status: 'completed',
        });
      });

      return {
        redeemed: input.amountKobo,
        newBalance,
        totalRedeemed: newTotalRedeemed,
      };
    }),

  /** Get cashback tier info and rates */
  getTierInfo: publicProcedure.query(() => {
    return {
      tiers: [
        { name: 'bronze', label: 'Bronze', minEarnedKobo: 0, cashbackRate: 0.02, maxCashbackKobo: 50_000, color: '#CD7F32' },
        { name: 'silver', label: 'Silver', minEarnedKobo: 200_000, cashbackRate: 0.025, maxCashbackKobo: 100_000, color: '#C0C0C0' },
        { name: 'gold', label: 'Gold', minEarnedKobo: 1_000_000, cashbackRate: 0.03, maxCashbackKobo: 200_000, color: '#FFD700' },
        { name: 'platinum', label: 'Platinum', minEarnedKobo: 5_000_000, cashbackRate: 0.04, maxCashbackKobo: 500_000, color: '#E5E4E2' },
      ],
      description: 'Earn cashback on every successful transaction. Redeem at checkout or withdraw to your settlement account.',
    };
  }),

  /** Get cashback analytics summary */
  getAnalytics: protectedProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await requireDb();

      const conditions: any[] = [eq(schema.cashbackTransactions.merchantId, merchant.id)];
      if (input.from) conditions.push(gte(schema.cashbackTransactions.createdAt, input.from));
      if (input.to) conditions.push(lte(schema.cashbackTransactions.createdAt, input.to));

      const rows = await db
        .select({
          type: schema.cashbackTransactions.type,
          total: sum(schema.cashbackTransactions.amountKobo),
          txCount: count(),
        })
        .from(schema.cashbackTransactions)
        .where(and(...conditions))
        .groupBy(schema.cashbackTransactions.type);

      const earned = rows.find(r => r.type === 'earn');
      const redeemed = rows.find(r => r.type === 'redeem');

      return {
        totalEarnedKobo: Number(earned?.total ?? 0),
        totalRedeemedKobo: Number(redeemed?.total ?? 0),
        earnCount: Number(earned?.txCount ?? 0),
        redeemCount: Number(redeemed?.txCount ?? 0),
      };
    }),
});

// ─── 3. API Docs Router ───────────────────────────────────────────────────────

const API_VERSION = '2.0.0';
const API_BASE_URL = 'https://api.paygate.ng/v2';

const PROCEDURE_CATALOGUE = [
  // Payments
  { group: 'Payments', name: 'payments.charge', method: 'POST', path: '/payments/charge', summary: 'Initiate a payment charge', auth: true, params: ['amount', 'currency', 'reference', 'channel', 'customerEmail'] },
  { group: 'Payments', name: 'payments.verify', method: 'GET', path: '/payments/verify', summary: 'Verify a payment by reference', auth: true, params: ['reference'] },
  { group: 'Payments', name: 'payments.list', method: 'GET', path: '/payments/list', summary: 'List transactions with filters', auth: true, params: ['status', 'from', 'to', 'limit', 'offset'] },
  { group: 'Payments', name: 'payments.refund', method: 'POST', path: '/payments/refund', summary: 'Initiate a full or partial refund', auth: true, params: ['transactionId', 'amount', 'reason'] },
  // Settlements
  { group: 'Settlements', name: 'settlements.list', method: 'GET', path: '/settlements/list', summary: 'List settlement records', auth: true, params: ['status', 'from', 'to'] },
  { group: 'Settlements', name: 'settlements.export', method: 'GET', path: '/settlements/export', summary: 'Export settlements as CSV', auth: true, params: ['from', 'to', 'status'] },
  { group: 'Settlements', name: 'settlements.exportPdf', method: 'GET', path: '/settlements/export-pdf', summary: 'Export settlements as PDF', auth: true, params: ['from', 'to', 'status'] },
  // Wallets
  { group: 'Wallet', name: 'wallet.getWallet', method: 'GET', path: '/wallet', summary: 'Get wallet balance and recent transactions', auth: true, params: [] },
  { group: 'Wallet', name: 'wallet.sendMoney', method: 'POST', path: '/wallet/send', summary: 'P2P transfer to another wallet', auth: true, params: ['recipientId', 'amount', 'currency', 'note'] },
  { group: 'Wallet', name: 'wallet.topUp', method: 'POST', path: '/wallet/topup', summary: 'Top up wallet via bank transfer', auth: true, params: ['amount', 'channel'] },
  // Cashback
  { group: 'Cashback', name: 'cashbackRewards.getBalance', method: 'GET', path: '/cashback/balance', summary: 'Get cashback balance and tier', auth: true, params: [] },
  { group: 'Cashback', name: 'cashbackRewards.listHistory', method: 'GET', path: '/cashback/history', summary: 'List cashback transaction history', auth: true, params: ['limit', 'offset', 'type'] },
  { group: 'Cashback', name: 'cashbackRewards.earnOnTransaction', method: 'POST', path: '/cashback/earn', summary: 'Earn cashback on a completed transaction', auth: true, params: ['transactionId', 'transactionAmountKobo'] },
  { group: 'Cashback', name: 'cashbackRewards.redeem', method: 'POST', path: '/cashback/redeem', summary: 'Redeem cashback balance', auth: true, params: ['amountKobo', 'description'] },
  // KYC
  { group: 'KYC', name: 'kyc.submitTier1', method: 'POST', path: '/kyc/tier1', summary: 'Submit Tier 1 KYC (BVN + NIN)', auth: true, params: ['bvn', 'nin', 'dateOfBirth'] },
  { group: 'KYC', name: 'kyc.getStatus', method: 'GET', path: '/kyc/status', summary: 'Get current KYC tier and status', auth: true, params: [] },
  // Webhooks
  { group: 'Webhooks', name: 'webhooks.create', method: 'POST', path: '/webhooks', summary: 'Register a webhook endpoint', auth: true, params: ['url', 'events', 'secret'] },
  { group: 'Webhooks', name: 'webhooks.list', method: 'GET', path: '/webhooks', summary: 'List registered webhooks', auth: true, params: [] },
  { group: 'Webhooks', name: 'webhooks.delete', method: 'DELETE', path: '/webhooks/{id}', summary: 'Delete a webhook endpoint', auth: true, params: ['id'] },
  // Export
  { group: 'Export', name: 'export.transactions', method: 'GET', path: '/export/transactions', summary: 'Export transactions as CSV', auth: true, params: ['from', 'to', 'status'] },
  { group: 'Export', name: 'pdfExport.transactions', method: 'GET', path: '/export/transactions/pdf', summary: 'Export transactions as PDF', auth: true, params: ['from', 'to', 'status'] },
  { group: 'Export', name: 'pdfExport.monthlyStatement', method: 'GET', path: '/export/statement/pdf', summary: 'Export monthly statement as PDF', auth: true, params: ['year', 'month'] },
];

const CHANGELOG = [
  { version: '2.0.0', date: '2026-07-01', changes: ['Wave 228: PDF export for transactions and settlements', 'Cashback/rewards engine with tier progression', 'API docs portal v2 with full procedure catalogue'] },
  { version: '1.9.0', date: '2026-06-15', changes: ['Wave 227: NDC breach events, regulator document upload, settlement CSV export'] },
  { version: '1.8.0', date: '2026-06-01', changes: ['Wave 226: Admin regulator access management, magic-link audit log'] },
  { version: '1.7.0', date: '2026-05-15', changes: ['Wave 225: Regulator magic-link auth, Temporal saga wiring'] },
  { version: '1.6.0', date: '2026-05-01', changes: ['Wave 221: Developer portal, sandbox mode, live API key injection'] },
  { version: '1.5.0', date: '2026-04-15', changes: ['Wave 218: Production hardening, APISIX integration, monitoring dashboard'] },
];

const SDK_INFO = {
  packages: [
    { language: 'Node.js / TypeScript', package: '@paygate/sdk', version: '2.0.0', installCmd: 'npm install @paygate/sdk', docsUrl: 'https://docs.paygate.ng/sdk/node' },
    { language: 'Python', package: 'paygate-sdk', version: '2.0.0', installCmd: 'pip install paygate-sdk', docsUrl: 'https://docs.paygate.ng/sdk/python' },
    { language: 'Go', package: 'github.com/paygateng/paygate-go', version: 'v2.0.0', installCmd: 'go get github.com/paygateng/paygate-go', docsUrl: 'https://docs.paygate.ng/sdk/go' },
    { language: 'Rust', package: 'paygate-client', version: '2.0.0', installCmd: 'cargo add paygate-client', docsUrl: 'https://docs.paygate.ng/sdk/rust' },
  ],
  webhookEvents: [
    'payment.completed', 'payment.failed', 'payment.pending',
    'settlement.initiated', 'settlement.completed', 'settlement.failed',
    'refund.created', 'refund.completed',
    'dispute.opened', 'dispute.resolved',
    'kyc.approved', 'kyc.rejected',
    'cashback.earned', 'cashback.redeemed',
    'fraud.flagged', 'fraud.cleared',
  ],
};

export const apiDocsRouter = router({
  /** Get the full API procedure catalogue */
  getCatalogue: publicProcedure.query(() => {
    return {
      version: API_VERSION,
      baseUrl: API_BASE_URL,
      procedures: PROCEDURE_CATALOGUE,
      groups: [...new Set(PROCEDURE_CATALOGUE.map(p => p.group))],
      totalProcedures: PROCEDURE_CATALOGUE.length,
    };
  }),

  /** Get OpenAPI-compatible spec (simplified) */
  getOpenAPISpec: publicProcedure.query(() => {
    const paths: Record<string, any> = {};
    for (const proc of PROCEDURE_CATALOGUE) {
      const pathKey = proc.path;
      if (!paths[pathKey]) paths[pathKey] = {};
      paths[pathKey][proc.method.toLowerCase()] = {
        summary: proc.summary,
        tags: [proc.group],
        security: proc.auth ? [{ bearerAuth: [] }] : [],
        parameters: proc.params.map(p => ({ name: p, in: 'query', schema: { type: 'string' } })),
        responses: { '200': { description: 'Success' }, '401': { description: 'Unauthorized' } },
      };
    }
    return {
      openapi: '3.0.3',
      info: { title: 'PayGate API', version: API_VERSION, description: 'PayGate Payment Infrastructure API' },
      servers: [{ url: API_BASE_URL, description: 'Production' }, { url: 'https://sandbox.paygate.ng/v2', description: 'Sandbox' }],
      paths,
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    };
  }),

  /** Get SDK info */
  getSDKInfo: publicProcedure.query(() => SDK_INFO),

  /** Get changelog */
  getChangelog: publicProcedure.query(() => CHANGELOG),

  /** Search procedures by keyword */
  search: publicProcedure
    .input(z.object({ query: z.string().min(1).max(100) }))
    .query(({ input }) => {
      const q = input.query.toLowerCase();
      return PROCEDURE_CATALOGUE.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.group.toLowerCase().includes(q) ||
        p.path.toLowerCase().includes(q)
      );
    }),
});
