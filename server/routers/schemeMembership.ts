/**
 * schemeMembership.ts — Full DB-backed scheme membership router.
 */
import { router, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { db } from '../db';
import * as schema from '../../drizzle/schema';
import { eq, and, desc, count } from 'drizzle-orm';

export const schemeMembershipRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const conditions: any[] = [];
      if (input.status) conditions.push(eq(schema.schemeMemberships.status, input.status));
      const [rows, [{ total }]] = await Promise.all([
        db.select().from(schema.schemeMemberships)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(schema.schemeMemberships.createdAt))
          .limit(input.pageSize).offset(offset),
        db.select({ total: count() }).from(schema.schemeMemberships)
          .where(conditions.length ? and(...conditions) : undefined),
      ]);
      return { rows, total, page: input.page, pageSize: input.pageSize };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(schema.schemeMemberships)
        .where(eq(schema.schemeMemberships.id, input.id)).limit(1);
      if (!row) throw new Error('Scheme membership not found');
      return row;
    }),

  create: protectedProcedure
    .input(z.object({
      scheme: z.enum(['visa', 'mastercard', 'verve', 'amex']),
      membershipType: z.string().default('principal'),
      memberId: z.string(),
      effectiveFrom: z.string(),
      renewalDate: z.string().optional(),
      contactEmail: z.string().email().optional(),
      complianceOfficer: z.string().optional(),
      annualFeeUsd: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [row] = await db.insert(schema.schemeMemberships).values({
        ...input,
        effectiveFrom: new Date(input.effectiveFrom),
        renewalDate: input.renewalDate ? new Date(input.renewalDate) : null,
        status: 'active',
      }).returning();
      return row;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.string().optional(),
      renewalDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const [row] = await db.update(schema.schemeMemberships)
        .set({ ...updates, renewalDate: updates.renewalDate ? new Date(updates.renewalDate) : undefined, updatedAt: new Date() })
        .where(eq(schema.schemeMemberships.id, id))
        .returning();
      return row;
    }),
});
