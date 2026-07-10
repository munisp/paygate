/**
 * Wave 227 — Regulator Doc Upload + NDC Breach Auto-Notify
 *
 * Procedures:
 * - regulatorDocs.upload        — presigned S3 URL for regulator document upload
 * - regulatorDocs.list          — list documents submitted by a regulator
 * - regulatorDocs.updateStatus  — admin: approve/reject a submitted document
 * - ndcBreachNotify.trigger     — internal: fire owner notification on NDC breach
 * - ndcBreachNotify.getBreaches — list recent NDC breach events
 */
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  nexthubRegulators,
  regulatorDocuments,
  ndcBreachEvents,
  dfspNdcLimits,
} from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";
import { notifyOwner } from "../_core/notification";
import * as crypto from "crypto";

// ─── Regulator Documents ─────────────────────────────────────────────────────

export const regulatorDocsRouter = router({
  /** Get a presigned upload URL for a regulator document */
  getUploadUrl: protectedProcedure
    .input(z.object({
      regulatorId: z.string(),
      filename: z.string().max(255),
      mimeType: z.string().max(100),
      documentType: z.enum(["audit_report", "compliance_notice", "data_request", "inspection_order", "other"]),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [reg] = await db.select().from(nexthubRegulators).where(eq(nexthubRegulators.id, input.regulatorId)).limit(1);
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Regulator not found" });

      const suffix = crypto.randomBytes(8).toString("hex");
      const key = `regulator-docs/${input.regulatorId}/${input.documentType}/${suffix}-${input.filename}`;

      // Insert a pending document record
      const [doc] = await db.insert(regulatorDocuments).values({
        regulatorId: input.regulatorId,
        documentType: input.documentType,
        filename: input.filename,
        mimeType: input.mimeType,
        s3Key: key,
        status: "pending_upload",
        uploadedAt: null,
      }).returning();

      return { docId: doc.id, s3Key: key, uploadUrl: `/api/regulator-docs/upload?key=${encodeURIComponent(key)}` };
    }),

  /** Confirm upload complete and mark document as uploaded */
  confirmUpload: protectedProcedure
    .input(z.object({ docId: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(regulatorDocuments)
        .set({ status: "submitted", uploadedAt: new Date() })
        .where(eq(regulatorDocuments.id, input.docId));
      return { success: true };
    }),

  /** List documents for a regulator */
  list: protectedProcedure
    .input(z.object({ regulatorId: z.string(), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const db = getDb();
      return db.select().from(regulatorDocuments)
        .where(eq(regulatorDocuments.regulatorId, input.regulatorId))
        .orderBy(desc(regulatorDocuments.uploadedAt))
        .limit(input.limit);
    }),

  /** Admin: update document review status */
  updateStatus: protectedProcedure
    .input(z.object({
      docId: z.string(),
      status: z.enum(["submitted", "under_review", "approved", "rejected"]),
      reviewNote: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(regulatorDocuments)
        .set({ status: input.status, reviewNote: input.reviewNote ?? null, reviewedAt: new Date() })
        .where(eq(regulatorDocuments.id, input.docId));
      return { success: true };
    }),
});

// ─── NDC Breach Auto-Notify ──────────────────────────────────────────────────

export const ndcBreachRouter = router({
  /** Trigger an NDC breach notification (called by Go bridge webhook) */
  trigger: publicProcedure
    .input(z.object({
      dfspId: z.string(),
      dfspName: z.string(),
      currentPositionKobo: z.number(),
      ndcLimitKobo: z.number(),
      breachPercentage: z.number(),
      windowId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      // Record the breach event
      const [event] = await db.insert(ndcBreachEvents).values({
        dfspId: input.dfspId,
        dfspName: input.dfspName,
        currentPositionKobo: input.currentPositionKobo,
        ndcLimitKobo: input.ndcLimitKobo,
        breachPercentage: Math.round(input.breachPercentage * 100) / 100,
        windowId: input.windowId ?? null,
        severity: input.breachPercentage >= 100 ? "critical" : input.breachPercentage >= 90 ? "high" : "medium",
        resolvedAt: null,
      }).returning();

      // Fire owner notification
      const naira = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
      await notifyOwner({
        title: `⚠️ NDC Breach — ${input.dfspName} (${input.breachPercentage.toFixed(1)}%)`,
        content: `DFSP **${input.dfspName}** has breached its Net Debit Cap.\n\n` +
          `- Current position: **${naira(input.currentPositionKobo)}**\n` +
          `- NDC limit: **${naira(input.ndcLimitKobo)}**\n` +
          `- Breach: **${input.breachPercentage.toFixed(1)}%**\n` +
          `- Severity: **${event.severity?.toUpperCase()}**\n` +
          (input.windowId ? `- Window: ${input.windowId}\n` : "") +
          `\nImmediate action may be required to prevent settlement failure.`,
      });

      return { eventId: event.id, severity: event.severity };
    }),

  /** List recent NDC breach events */
  getBreaches: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(50),
      unresolved: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const conditions = input.unresolved
        ? [sql`${ndcBreachEvents.resolvedAt} IS NULL`]
        : [];
      return db.select().from(ndcBreachEvents)
        .where(conditions.length > 0 ? conditions[0] : undefined)
        .orderBy(desc(ndcBreachEvents.createdAt))
        .limit(input.limit);
    }),

  /** Mark an NDC breach event as resolved */
  resolve: protectedProcedure
    .input(z.object({ eventId: z.string(), resolution: z.string().max(500).optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(ndcBreachEvents)
        .set({ resolvedAt: new Date(), resolution: input.resolution ?? "Manually resolved" })
        .where(eq(ndcBreachEvents.id, input.eventId));
      return { success: true };
    }),
});
