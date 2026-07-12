import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';

export const strRouter = router({
  ping: publicProcedure.query(() => 'pong'),

  getPendingWithCountdown: protectedProcedure
    .input(z.object({ includeBreached: z.boolean().optional() }))
    .query(async () => {
      return [] as Array<{
        id: string; merchantId: string; alertId: string; status: string;
        reportType: string; deadlineAt: string | null; hoursRemaining: number | null;
        isBreached: boolean; createdAt: string; customerName: string | null;
        amountKobo: number | null; currency: string | null;
      }>;
    }),

  list: protectedProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20), status: z.string().optional() }))
    .query(async () => ({
      rows: [] as Array<{
        id: string; merchantId: string; alertId: string; status: string;
        reportType: string; nfiuRef: string | null; submittedAt: string | null; createdAt: string;
      }>,
      total: 0,
    })),

  stats: protectedProcedure
    .query(async () => ({ pending: 0, submitted: 0, breached: 0, submittedThisMonth: 0 })),

  submitToNFIU: protectedProcedure
    .input(z.object({ strId: z.string() }))
    .mutation(async () => ({ success: true, nfiuRef: null as string | null, submittedAt: new Date().toISOString() })),
});
