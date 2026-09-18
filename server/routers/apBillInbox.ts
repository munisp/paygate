/**
 * apBillInbox.ts — AP Bill Inbox + OCR (Melio spec P0-b)
 * ─────────────────────────────────────────────────────────────────────────────
 * Upload / email-ingress of supplier invoices, async OCR extraction via the
 * kyc-ocr python service (doc_type=supplier_invoice), and a human-in-the-loop
 * confirm step that applies the extracted fields onto the bill.
 *
 * Procedures:
 *   uploadBillDocument   — base64 → S3 (storagePut) → ap_bills(pending_extraction) → OCR
 *   getExtractionStatus  — ownership-checked status + extracted_data
 *   confirmExtractedBill — extracted→draft guarded flip applying extracted fields + corrections
 *   listInbox            — merchant-scoped inbox listing
 *   receiveEmailBill     — INTERNAL endpoint (X-Internal-Key) used by the
 *                          python-services/bill-inbox ingress for emailed attachments
 *
 * Extraction failures set status='draft' with source preserved and the error
 * logged — no fabricated OCR results ever reach the bill.
 */

import { z } from "zod";
import crypto from "node:crypto";
import { eq, and, desc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId, logAuditEvent } from "../db";
import { apBills, apBillLineItems } from "../../drizzle/schema";
import { storagePut } from "../storage";
import { ENV as env } from "../_core/env";
import { logger } from "../logger";
import { withIdempotency } from "../idempotency";
import { publishEvent } from "../kafkaClient";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve the caller's merchant from the server-side session (never client input). */
async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant.id;
}

/** Sanitize every storage-key segment so crafted names cannot escape the prefix. */
const safeSegment = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
]);

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15 MB per invoice document

/** Structured extraction payload returned by kyc-ocr for supplier_invoice docs. */
interface BillExtraction {
  vendor_name?: string | null;
  tin?: string | null;
  bill_number?: string | null;
  due_date?: string | null;
  currency?: string | null;
  subtotal_kobo?: number | null;
  tax_kobo?: number | null;
  total_kobo?: number | null;
  line_items?: Array<{
    description?: string | null;
    quantity?: number | null;
    unit_price_kobo?: number | null;
    amount_kobo?: number | null;
  }> | null;
}

async function storeDocument(opts: {
  merchantId: string;
  source: "upload" | "email";
  fileName: string;
  contentType: string;
  base64Data: string;
}) {
  if (!ALLOWED_CONTENT_TYPES.has(opts.contentType)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unsupported content type ${opts.contentType}. Allowed: ${[...ALLOWED_CONTENT_TYPES].join(", ")}`,
    });
  }
  const buffer = Buffer.from(opts.base64Data, "base64");
  if (buffer.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Empty document payload" });
  }
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Document exceeds 15 MB limit" });
  }
  const suffix = crypto.randomUUID().slice(0, 8);
  const fileKey = `ap-bills/${safeSegment(opts.merchantId)}/${opts.source}/${safeSegment(opts.fileName)}-${suffix}`;
  const { url } = await storagePut(fileKey, buffer, opts.contentType);
  return url;
}

/**
 * Fire-and-forget OCR extraction. On success the bill flips
 * pending_extraction → extracted with extracted_data populated; on any failure
 * the bill falls back to status='draft' (source preserved) and the error is
 * logged — a human can still key the bill in manually.
 */
async function triggerExtraction(opts: { billId: string; merchantId: string; documentUrl: string }) {
  const { billId, merchantId, documentUrl } = opts;
  try {
    const resp = await fetch(`${env.kycOcrUrl}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": env.internalApiKey },
      body: JSON.stringify({
        submission_id: billId,
        doc_type: "supplier_invoice",
        image_url: documentUrl,
        mode: "full",
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!resp.ok) throw new Error(`OCR service error: ${resp.status}`);
    const result = (await resp.json()) as any;
    const structured: BillExtraction =
      result?.structured_data && typeof result.structured_data === "object" ? result.structured_data : {};
    const db = (await getDb())!;
    // Guarded flip — if a human already touched the bill we never overwrite.
    const updated = await db
      .update(apBills)
      .set({ extractedData: structured as any, status: "extracted", updatedAt: new Date() })
      .where(and(eq(apBills.id, billId), eq(apBills.merchantId, merchantId), eq(apBills.status, "pending_extraction")))
      .returning({ id: apBills.id });
    if (updated.length === 0) {
      logger.warn(`[apBillInbox] extraction completed but bill ${billId} no longer pending_extraction — not overwriting`);
      return;
    }
    logger.info(`[apBillInbox] extraction complete bill=${billId} confidence=${result?.overall_confidence ?? "n/a"}`);
    // Domain event — non-fatal (log + continue).
    publishEvent("paygate.ap.bills", {
      type: "ap.bill.extracted",
      billId,
      merchantId,
      extractedAt: new Date().toISOString(),
    }).catch((e) => logger.warn(`[apBillInbox] kafka publish failed: ${e instanceof Error ? e.message : e}`));
  } catch (e) {
    logger.error(`[apBillInbox] extraction failed bill=${billId}: ${e instanceof Error ? e.message : e}`);
    try {
      const db = (await getDb())!;
      await db
        .update(apBills)
        .set({ status: "draft", updatedAt: new Date() })
        .where(and(eq(apBills.id, billId), eq(apBills.merchantId, merchantId), eq(apBills.status, "pending_extraction")));
    } catch (dbErr) {
      logger.error(`[apBillInbox] failed to revert bill ${billId} to draft: ${dbErr instanceof Error ? dbErr.message : dbErr}`);
    }
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

const INBOX_STATUSES = [
  "draft", "pending_extraction", "extracted", "pending_approval", "approved",
  "scheduled", "paid", "partially_paid", "rejected", "void",
] as const;

export const apBillInboxRouter = router({
  // ── Upload a supplier invoice document ─────────────────────────────────────
  uploadBillDocument: protectedProcedure
    .input(z.object({
      fileName: z.string().min(1).max(255),
      contentType: z.string().min(1).max(64),
      base64Data: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const user = (await getUserByOpenId(ctx.user.openId))!;
      const documentUrl = await storeDocument({
        merchantId,
        source: "upload",
        fileName: input.fileName,
        contentType: input.contentType,
        base64Data: input.base64Data,
      });
      const billId = crypto.randomUUID();
      await db.insert(apBills).values({
        id: billId,
        merchantId,
        status: "pending_extraction",
        source: "upload",
        documentUrl,
        totalKobo: 0,
        createdBy: user.id,
      });
      logAuditEvent({
        merchantId, actorId: String(user.id), actorName: user.name ?? user.email ?? "unknown",
        action: "ap.bill.uploaded", resource: "ap_bill", resourceId: billId,
        metadata: { fileName: input.fileName, contentType: input.contentType },
      }).catch((e) => logger.warn(`[apBillInbox] auditLog failed: ${e instanceof Error ? e.message : e}`));
      // Async extraction — caller gets an immediate pending_extraction ack.
      void triggerExtraction({ billId, merchantId, documentUrl });
      return { billId, status: "pending_extraction" as const, documentUrl };
    }),

  // ── Poll extraction status ─────────────────────────────────────────────────
  getExtractionStatus: protectedProcedure
    .input(z.object({ billId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [bill] = await db
        .select()
        .from(apBills)
        .where(and(eq(apBills.id, input.billId), eq(apBills.merchantId, merchantId)))
        .limit(1);
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
      return {
        billId: bill.id,
        status: bill.status,
        source: bill.source,
        documentUrl: bill.documentUrl,
        extractedData: bill.extractedData as BillExtraction | null,
        updatedAt: bill.updatedAt,
      };
    }),

  // ── Human-in-the-loop confirm: apply extracted fields onto the bill ────────
  confirmExtractedBill: protectedProcedure
    .input(z.object({
      billId: z.string().uuid(),
      corrections: z.record(z.string(), z.unknown()).optional(),
      idempotencyKey: z.string().min(8).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const user = (await getUserByOpenId(ctx.user.openId))!;
      return withIdempotency({
        key: input.idempotencyKey,
        merchantId,
        operation: "ap.bill.confirm_extracted",
        requestBody: input,
        execute: async () => {
          const [bill] = await db
            .select()
            .from(apBills)
            .where(and(eq(apBills.id, input.billId), eq(apBills.merchantId, merchantId)))
            .limit(1);
          if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });

          // Extracted fields win by default; human corrections override them.
          const extracted = ((bill.extractedData ?? {}) as BillExtraction) ?? {};
          const corrections = (input.corrections ?? {}) as Partial<BillExtraction>;
          const merged: BillExtraction = { ...extracted, ...corrections };

          const toInt = (v: unknown): number | null => {
            if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
            if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Math.round(Number(v));
            return null;
          };
          const subtotal = toInt(merged.subtotal_kobo);
          const tax = toInt(merged.tax_kobo);
          const total = toInt(merged.total_kobo) ?? ((subtotal ?? 0) + (tax ?? 0));
          const dueDate = typeof merged.due_date === "string" && merged.due_date
            ? new Date(merged.due_date)
            : null;
          const lineItems = Array.isArray(merged.line_items) ? merged.line_items : [];

          // Guarded status flip extracted→draft — rejects races with the
          // extraction writer and double-confirms.
          const [flipped] = await db
            .update(apBills)
            .set({
              status: "draft",
              billNumber: typeof merged.bill_number === "string" && merged.bill_number ? merged.bill_number.slice(0, 64) : bill.billNumber,
              currency: typeof merged.currency === "string" && merged.currency ? merged.currency.slice(0, 3).toUpperCase() : bill.currency,
              subtotalKobo: subtotal,
              taxKobo: tax,
              totalKobo: total,
              dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : bill.dueDate,
              extractedData: merged as any,
              updatedAt: new Date(),
            })
            .where(and(
              eq(apBills.id, input.billId),
              eq(apBills.merchantId, merchantId),
              eq(apBills.status, "extracted"),
            ))
            .returning({ id: apBills.id });
          if (!flipped) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Bill is not in 'extracted' status (current: ${bill.status}) — extraction must complete before confirming`,
            });
          }

          // Replace line items with the confirmed set.
          await db.delete(apBillLineItems).where(eq(apBillLineItems.billId, input.billId));
          if (lineItems.length > 0) {
            await db.insert(apBillLineItems).values(
              lineItems.map((li) => ({
                billId: input.billId,
                description: li?.description ?? null,
                quantity: li?.quantity != null ? String(li.quantity) : null,
                unitPriceKobo: toInt(li?.unit_price_kobo),
                amountKobo: toInt(li?.amount_kobo),
              })),
            );
          }

          logAuditEvent({
            merchantId, actorId: String(user.id), actorName: user.name ?? user.email ?? "unknown",
            action: "ap.bill.extraction_confirmed", resource: "ap_bill", resourceId: input.billId,
            metadata: { totalKobo: total, lineItemCount: lineItems.length, corrected: Boolean(input.corrections) },
          }).catch((e) => logger.warn(`[apBillInbox] auditLog failed: ${e instanceof Error ? e.message : e}`));
          publishEvent("paygate.ap.bills", {
            type: "ap.bill.confirmed",
            billId: input.billId,
            merchantId,
            totalKobo: total,
          }).catch((e) => logger.warn(`[apBillInbox] kafka publish failed: ${e instanceof Error ? e.message : e}`));

          return { billId: input.billId, status: "draft" as const, totalKobo: total, lineItemCount: lineItems.length };
        },
      });
    }),

  // ── Inbox listing ──────────────────────────────────────────────────────────
  listInbox: protectedProcedure
    .input(z.object({
      status: z.enum(INBOX_STATUSES).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const conditions = [eq(apBills.merchantId, merchantId), inArray(apBills.source, ["upload", "email", "ocr"])];
      if (input?.status) conditions.push(eq(apBills.status, input.status));
      const bills = await db
        .select()
        .from(apBills)
        .where(and(...conditions))
        .orderBy(desc(apBills.createdAt))
        .limit(input?.limit ?? 50);
      return bills.map((b) => ({
        billId: b.id,
        status: b.status,
        source: b.source,
        documentUrl: b.documentUrl,
        billNumber: b.billNumber,
        totalKobo: b.totalKobo,
        currency: b.currency,
        dueDate: b.dueDate,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      }));
    }),

  // ── INTERNAL: emailed bill ingress (called by python-services/bill-inbox) ──
  // Not callable by end users — authenticated via the X-Internal-Key header
  // with a constant-time comparison. FAILS CLOSED when INTERNAL_API_KEY unset.
  receiveEmailBill: publicProcedure
    .input(z.object({
      merchantId: z.string().min(1),
      fileName: z.string().min(1).max(255),
      contentType: z.string().min(1).max(64),
      base64Data: z.string().min(1),
      fromAddress: z.string().max(255).optional(),
      subject: z.string().max(512).optional(),
      messageId: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const headerKey = ctx.req?.headers?.["x-internal-key"];
      const provided = Array.isArray(headerKey) ? headerKey[0] : headerKey ?? "";
      const expected = env.internalApiKey;
      const keysMatch = expected.length > 0 &&
        provided.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
      if (!keysMatch) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid internal key" });
      }

      const db = (await getDb())!;
      const documentUrl = await storeDocument({
        merchantId: input.merchantId,
        source: "email",
        fileName: input.fileName,
        contentType: input.contentType,
        base64Data: input.base64Data,
      });
      const billId = crypto.randomUUID();
      await db.insert(apBills).values({
        id: billId,
        merchantId: input.merchantId,
        status: "pending_extraction",
        source: "email",
        sourceRef: input.messageId ?? input.fromAddress ?? null,
        documentUrl,
        totalKobo: 0,
      });
      logger.info(`[apBillInbox] email bill ingested bill=${billId} merchant=${input.merchantId} from=${input.fromAddress ?? "unknown"}`);
      void triggerExtraction({ billId, merchantId: input.merchantId, documentUrl });
      return { billId, status: "pending_extraction" as const };
    }),
});

// Exported for unit tests.
export const __apBillInboxInternals = { safeSegment, ALLOWED_CONTENT_TYPES, MAX_DOCUMENT_BYTES };
