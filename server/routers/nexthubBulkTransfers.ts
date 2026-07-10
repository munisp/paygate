import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { nexthubBulkTransfers } from "../../drizzle/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const nexthubBulkTransfersRouter = router({
  // List bulk transfers with optional filters
  list: protectedProcedure
    .input(z.object({
      state: z.enum(["RECEIVED", "PENDING", "ACCEPTED", "PROCESSING", "COMPLETED", "REJECTED"]).optional(),
      payerFsp: z.string().optional(),
      payeeFsp: z.string().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [];
      if (input?.state) conditions.push(eq(nexthubBulkTransfers.state, input.state));
      if (input?.payerFsp) conditions.push(eq(nexthubBulkTransfers.payerFsp, input.payerFsp));
      if (input?.payeeFsp) conditions.push(eq(nexthubBulkTransfers.payeeFsp, input.payeeFsp));
      if (input?.from) conditions.push(gte(nexthubBulkTransfers.createdAt, input.from));
      if (input?.to) conditions.push(lte(nexthubBulkTransfers.createdAt, input.to));

      const rows = await db
        .select()
        .from(nexthubBulkTransfers)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(nexthubBulkTransfers.createdAt))
        .limit(input?.limit ?? 25)
        .offset(input?.offset ?? 0);

      return rows;
    }),

  // Get a single bulk transfer by ID
  getById: protectedProcedure
    .input(z.object({ bulkTransferId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [row] = await db
        .select()
        .from(nexthubBulkTransfers)
        .where(eq(nexthubBulkTransfers.bulkTransferId, input.bulkTransferId))
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Bulk transfer ${input.bulkTransferId} not found` });
      }
      return row;
    }),

  // Summary statistics for the dashboard
  stats: protectedProcedure.query(async () => {
    const db = await getDb();
    const all = await db.select().from(nexthubBulkTransfers);
    const total = all.length;
    const byState = Object.fromEntries(
      ["RECEIVED", "PENDING", "ACCEPTED", "PROCESSING", "COMPLETED", "REJECTED"].map((s) => [
        s,
        all.filter((r) => r.state === s).length,
      ])
    );
    const totalIndividual = all.reduce((sum, r) => sum + (r.totalTransfers ?? 0), 0);
    const completedIndividual = all.reduce((sum, r) => sum + (r.completedTransfers ?? 0), 0);
    const failedIndividual = all.reduce((sum, r) => sum + (r.failedTransfers ?? 0), 0);
    return { total, byState, totalIndividual, completedIndividual, failedIndividual };
  }),
});
