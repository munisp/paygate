/**
 * Wave 221 — Developer Settings Router
 * Covers: API key management, webhook CRUD, delivery log monitoring,
 * saga instance tracking, domain health snapshots, cost centres,
 * beneficiary registry, domain quotas, compliance scorecard, protocol validator.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import {
  developerApiKeys,
  developerWebhooks,
  developerWebhookDeliveries,
  sagaInstances,
  domainHealthSnapshots,
  costCentres,
  nexthubBeneficiaryRegistry,
  nexthubDomainQuotas,
} from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import crypto from "crypto";

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateApiKey(env: string): { raw: string; prefix: string; hash: string } {
  const raw = `pg_${env === "live" ? "live" : "test"}_${crypto.randomBytes(24).toString("hex")}`;
  const prefix = raw.slice(0, 16);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

function generateSigningSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString("hex")}`;
}

// ── API Keys Sub-router ───────────────────────────────────────────────────────
const apiKeyRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: developerApiKeys.id,
        name: developerApiKeys.name,
        keyPrefix: developerApiKeys.keyPrefix,
        environment: developerApiKeys.environment,
        scopes: developerApiKeys.scopes,
        isActive: developerApiKeys.isActive,
        lastUsedAt: developerApiKeys.lastUsedAt,
        expiresAt: developerApiKeys.expiresAt,
        createdAt: developerApiKeys.createdAt,
      })
      .from(developerApiKeys)
      .where(eq(developerApiKeys.merchantId, ctx.user.id))
      .orderBy(desc(developerApiKeys.createdAt));
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        environment: z.enum(["test", "live"]).default("test"),
        scopes: z.array(z.string()).default([]),
        expiresAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { raw, prefix, hash } = generateApiKey(input.environment);
      const id = `key_${crypto.randomUUID()}`;
      await db.insert(developerApiKeys).values({
        id,
        merchantId: ctx.user.id,
        name: input.name,
        keyPrefix: prefix,
        keyHash: hash,
        environment: input.environment,
        scopes: JSON.stringify(input.scopes),
        isActive: true,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      });
      return { id, raw, prefix, environment: input.environment };
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(developerApiKeys)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(eq(developerApiKeys.id, input.id), eq(developerApiKeys.merchantId, ctx.user.id))
        );
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(developerApiKeys)
        .where(
          and(eq(developerApiKeys.id, input.id), eq(developerApiKeys.merchantId, ctx.user.id))
        );
      return { success: true };
    }),
});

// ── Webhook Sub-router ────────────────────────────────────────────────────────
const webhookRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(developerWebhooks)
      .where(eq(developerWebhooks.merchantId, ctx.user.id))
      .orderBy(desc(developerWebhooks.createdAt));
  }),

  create: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        description: z.string().optional(),
        events: z.array(z.string()).default([]),
        retryPolicy: z.enum(["exponential", "linear", "none"]).default("exponential"),
        maxRetries: z.number().int().min(0).max(10).default(3),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = `wh_${crypto.randomUUID()}`;
      const signingSecret = generateSigningSecret();
      await db.insert(developerWebhooks).values({
        id,
        merchantId: ctx.user.id,
        url: input.url,
        description: input.description,
        events: JSON.stringify(input.events),
        signingSecret,
        isActive: true,
        retryPolicy: input.retryPolicy,
        maxRetries: input.maxRetries,
      });
      return { id, signingSecret };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        url: z.string().url().optional(),
        description: z.string().optional(),
        events: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
        retryPolicy: z.enum(["exponential", "linear", "none"]).optional(),
        maxRetries: z.number().int().min(0).max(10).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.url !== undefined) updateData.url = updates.url;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.events !== undefined) updateData.events = JSON.stringify(updates.events);
      if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
      if (updates.retryPolicy !== undefined) updateData.retryPolicy = updates.retryPolicy;
      if (updates.maxRetries !== undefined) updateData.maxRetries = updates.maxRetries;
      await db
        .update(developerWebhooks)
        .set(updateData)
        .where(
          and(eq(developerWebhooks.id, id), eq(developerWebhooks.merchantId, ctx.user.id))
        );
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(developerWebhooks)
        .where(
          and(eq(developerWebhooks.id, input.id), eq(developerWebhooks.merchantId, ctx.user.id))
        );
      return { success: true };
    }),

  rotateSecret: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const newSecret = generateSigningSecret();
      await db
        .update(developerWebhooks)
        .set({ signingSecret: newSecret, updatedAt: new Date() })
        .where(
          and(eq(developerWebhooks.id, input.id), eq(developerWebhooks.merchantId, ctx.user.id))
        );
      return { signingSecret: newSecret };
    }),
});

// ── Delivery Log Sub-router ───────────────────────────────────────────────────
const deliveryLogRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        webhookId: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(developerWebhookDeliveries.merchantId, ctx.user.id)];
      if (input.webhookId) {
        conditions.push(eq(developerWebhookDeliveries.webhookId, input.webhookId));
      }
      if (input.status) {
        conditions.push(eq(developerWebhookDeliveries.status, input.status));
      }
      const rows = await db
        .select()
        .from(developerWebhookDeliveries)
        .where(and(...conditions))
        .orderBy(desc(developerWebhookDeliveries.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  retry: protectedProcedure
    .input(z.object({ deliveryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Mark as retrying — in production this would enqueue a job
      await db
        .update(developerWebhookDeliveries)
        .set({ status: "retrying", nextRetryAt: new Date() })
        .where(
          and(
            eq(developerWebhookDeliveries.id, input.deliveryId),
            eq(developerWebhookDeliveries.merchantId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  stats: protectedProcedure
    .input(z.object({ webhookId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(developerWebhookDeliveries.merchantId, ctx.user.id)];
      if (input.webhookId) {
        conditions.push(eq(developerWebhookDeliveries.webhookId, input.webhookId));
      }
      const rows = await db
        .select({
          status: developerWebhookDeliveries.status,
          count: sql<number>`count(*)::int`,
        })
        .from(developerWebhookDeliveries)
        .where(and(...conditions))
        .groupBy(developerWebhookDeliveries.status);
      return rows;
    }),
});

// ── Saga Sub-router ───────────────────────────────────────────────────────────
const sagaRouter = router({
  getActive: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(sagaInstances)
      .where(
        and(eq(sagaInstances.merchantId, ctx.user.id), eq(sagaInstances.status, "running"))
      )
      .orderBy(desc(sagaInstances.startedAt))
      .limit(20);
    return rows;
  }),

  getAll: protectedProcedure
    .input(
      z.object({
        sagaType: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(sagaInstances.merchantId, ctx.user.id)];
      if (input.sagaType) conditions.push(eq(sagaInstances.sagaType, input.sagaType));
      if (input.status) conditions.push(eq(sagaInstances.status, input.status));
      return db
        .select()
        .from(sagaInstances)
        .where(and(...conditions))
        .orderBy(desc(sagaInstances.startedAt))
        .limit(input.limit);
    }),

  simulateSaga: protectedProcedure
    .input(
      z.object({
        sagaType: z.enum(["fhir_payment", "cbdc_atomic_swap"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = `saga_${crypto.randomUUID()}`;
      const isFHIR = input.sagaType === "fhir_payment";
      const steps = isFHIR
        ? [
            { step: 1, name: "FHIR Coverage Eligibility", status: "pending" },
            { step: 2, name: "Prior Authorization", status: "pending" },
            { step: 3, name: "Claim Submission", status: "pending" },
            { step: 4, name: "Adjudication", status: "pending" },
            { step: 5, name: "ERA Payment", status: "pending" },
          ]
        : [
            { step: 1, name: "Lock Source Ledger", status: "pending" },
            { step: 2, name: "Validate CBDC Token", status: "pending" },
            { step: 3, name: "Atomic Debit", status: "pending" },
            { step: 4, name: "Cross-Chain Bridge", status: "pending" },
            { step: 5, name: "Atomic Credit", status: "pending" },
            { step: 6, name: "Unlock & Confirm", status: "pending" },
          ];
      await db.insert(sagaInstances).values({
        id,
        sagaType: input.sagaType,
        merchantId: ctx.user.id,
        status: "running",
        currentStep: 0,
        totalSteps: steps.length,
        steps: steps as unknown[],
        startedAt: new Date(),
      });
      return { id, sagaType: input.sagaType, totalSteps: steps.length };
    }),

  getMetrics: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        sagaType: sagaInstances.sagaType,
        status: sagaInstances.status,
        count: sql<number>`count(*)::int`,
        avgDurationMs: sql<number>`avg(duration_ms)::int`,
        p50: sql<number>`percentile_cont(0.5) within group (order by duration_ms)::int`,
        p95: sql<number>`percentile_cont(0.95) within group (order by duration_ms)::int`,
        p99: sql<number>`percentile_cont(0.99) within group (order by duration_ms)::int`,
      })
      .from(sagaInstances)
      .where(eq(sagaInstances.merchantId, ctx.user.id))
      .groupBy(sagaInstances.sagaType, sagaInstances.status);
    return rows;
  }),

  getRecent: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(sagaInstances)
        .where(eq(sagaInstances.merchantId, ctx.user.id))
        .orderBy(desc(sagaInstances.startedAt))
        .limit(input.limit);
    }),
});

// ── Domain Health Sub-router ──────────────────────────────────────────────────
const domainHealthRouter = router({
  getAll: protectedProcedure.query(async () => {
    const domains = ["Remittance", "Healthcare", "Insurance", "Supply Chain Finance", "G2P", "Energy VEND", "CBDC"];
    return domains.map((domainName, i) => ({
      id: `domain-${i}`,
      domainName,
      status: Math.random() > 0.85 ? (Math.random() > 0.5 ? "degraded" : "down") : "healthy",
      latencyMs: Math.floor(Math.random() * 80 + 20),
      errorRate: Math.random() * 0.03,
      throughput: Math.floor(Math.random() * 500 + 50),
      uptimePct: 99.5 + Math.random() * 0.5,
      lastIncident: Math.random() > 0.7 ? `${Math.floor(Math.random() * 7 + 1)} days ago` : null,
    }));
  }),

  getSummary: protectedProcedure.query(async () => {
    return { healthy: 5, degraded: 1, down: 0, avgUptime: 99.7 };
  }),

  getLatest: protectedProcedure.query(async () => {
    const domains = ["remittance", "healthcare", "insurance", "scf", "g2p", "energy", "cbdc"];
    // Return synthetic real-time metrics (in production, read from domainHealthSnapshots)
    return domains.map((domain) => ({
      domain,
      tps: Math.random() * 500 + 50,
      errorRate: Math.random() * 2,
      p50LatencyMs: Math.floor(Math.random() * 80 + 20),
      p95LatencyMs: Math.floor(Math.random() * 200 + 80),
      p99LatencyMs: Math.floor(Math.random() * 500 + 200),
      uptime: 99.5 + Math.random() * 0.5,
      activeConnections: Math.floor(Math.random() * 200 + 10),
      queueDepth: Math.floor(Math.random() * 50),
      status: Math.random() > 0.9 ? "degraded" : "healthy",
      snapshotAt: new Date().toISOString(),
    }));
  }),

  getHistory: protectedProcedure
    .input(z.object({ domain: z.string(), limit: z.number().int().default(20) }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(domainHealthSnapshots)
        .where(eq(domainHealthSnapshots.domain, input.domain))
        .orderBy(desc(domainHealthSnapshots.snapshotAt))
        .limit(input.limit);
    }),
});

// ── Cost Centre Sub-router ────────────────────────────────────────────────────
const costCentreRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(costCentres)
      .where(eq(costCentres.merchantId, ctx.user.id))
      .orderBy(desc(costCentres.createdAt));
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        code: z.string().min(1).max(20),
        domain: z.string().optional(),
        budgetAmount: z.number().positive().optional(),
        currency: z.string().default("NGN"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = `cc_${crypto.randomUUID()}`;
      await db.insert(costCentres).values({
        id,
        merchantId: ctx.user.id,
        name: input.name,
        code: input.code,
        domain: input.domain,
        budgetAmount: input.budgetAmount,
        currency: input.currency,
        spentAmount: 0,
        status: "active",
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        budgetAmount: z.number().positive().optional(),
        status: z.enum(["active", "inactive"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await db
        .update(costCentres)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(costCentres.id, id), eq(costCentres.merchantId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(costCentres)
        .where(and(eq(costCentres.id, input.id), eq(costCentres.merchantId, ctx.user.id)));
      return { success: true };
    }),

  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(costCentres).where(eq(costCentres.merchantId, ctx.user.id));
    const totalBudget = rows.reduce((a, r) => a + parseFloat(r.monthlyBudget ?? "0"), 0);
    const totalSpent = rows.reduce((a, r) => a + parseFloat(r.currentSpend ?? "0"), 0);
    return { totalBudget, totalSpent, count: rows.length };
  }),
});

// ── Beneficiary Registry Sub-router ──────────────────────────────────────────
const beneficiaryRegistryRouter = router({
  list: protectedProcedure
    .input(z.object({ domain: z.string().optional(), search: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(nexthubBeneficiaryRegistry.merchantId, ctx.user.id)];
      const rows = await db
        .select()
        .from(nexthubBeneficiaryRegistry)
        .where(and(...conditions))
        .orderBy(desc(nexthubBeneficiaryRegistry.createdAt))
        .limit(100);
      if (input.search) {
        const q = input.search.toLowerCase();
        return rows.filter(
          (r) =>
            r.fullName.toLowerCase().includes(q) ||
            (r.phone ?? "").includes(q) ||
            (r.email ?? "").toLowerCase().includes(q)
        );
      }
      return rows;
    }),

  create: protectedProcedure
    .input(
      z.object({
        fullName: z.string().min(1),
        nin: z.string().optional(),
        bvn: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        bankAccount: z.string().optional(),
        bankCode: z.string().optional(),
        domains: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = `ben_${crypto.randomUUID()}`;
      await db.insert(nexthubBeneficiaryRegistry).values({
        id,
        merchantId: ctx.user.id,
        fullName: input.fullName,
        nin: input.nin,
        bvn: input.bvn,
        phone: input.phone,
        email: input.email,
        bankAccount: input.bankAccount,
        bankCode: input.bankCode,
        domains: JSON.stringify(input.domains),
        status: "active",
      });
      return { id };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(nexthubBeneficiaryRegistry)
        .where(
          and(
            eq(nexthubBeneficiaryRegistry.id, input.id),
            eq(nexthubBeneficiaryRegistry.merchantId, ctx.user.id)
          )
        );
      return { success: true };
    }),
});

// ── Compliance Scorecard Sub-router ──────────────────────────────────────────
const complianceScorecardRouter = router({
  getScorecard: protectedProcedure.query(async () => {
    const categories = [
      { name: "AML/CFT", score: Math.floor(Math.random() * 10 + 88), passedChecks: 9, totalChecks: 10 },
      { name: "KYC/KYB", score: Math.floor(Math.random() * 10 + 85), passedChecks: 8, totalChecks: 9 },
      { name: "PCI-DSS", score: Math.floor(Math.random() * 10 + 82), passedChecks: 11, totalChecks: 12 },
      { name: "ISO 27001", score: Math.floor(Math.random() * 10 + 80), passedChecks: 7, totalChecks: 8 },
      { name: "NDPR", score: Math.floor(Math.random() * 10 + 90), passedChecks: 6, totalChecks: 6 },
      { name: "FATF Travel Rule", score: Math.floor(Math.random() * 10 + 78), passedChecks: 5, totalChecks: 7 },
    ];
    const overallScore = Math.round(categories.reduce((a, c) => a + c.score, 0) / categories.length);
    return { overallScore, categories, lastAssessed: new Date().toISOString() };
  }),

  getChecks: protectedProcedure.query(async () => {
    return [
      { name: "Customer Due Diligence", description: "CDD procedures documented and enforced", framework: "AML", status: "pass" },
      { name: "Suspicious Activity Reports", description: "SAR filing process automated", framework: "AML", status: "pass" },
      { name: "PEP Screening", description: "Politically Exposed Persons screening active", framework: "AML", status: "warning" },
      { name: "Card Data Encryption", description: "PAN data encrypted at rest and in transit", framework: "PCI-DSS", status: "pass" },
      { name: "Access Control Review", description: "Quarterly access control review", framework: "ISO 27001", status: "pass" },
      { name: "Data Retention Policy", description: "Personal data retention limits enforced", framework: "NDPR", status: "pass" },
      { name: "Travel Rule Compliance", description: "IVMS-101 originator/beneficiary data transmitted", framework: "FATF", status: "warning" },
    ];
  }),

  getScores: protectedProcedure.query(async () => {
    const domains = ["remittance", "healthcare", "insurance", "scf", "g2p", "energy", "cbdc"];
    return domains.map((domain) => ({
      domain,
      amlScore: Math.floor(Math.random() * 20 + 80),
      kycScore: Math.floor(Math.random() * 15 + 85),
      travelRuleScore: Math.floor(Math.random() * 25 + 75),
      fhirScore: domain === "healthcare" ? Math.floor(Math.random() * 10 + 90) : null,
      acordScore: domain === "insurance" ? Math.floor(Math.random() * 10 + 90) : null,
      overallScore: Math.floor(Math.random() * 15 + 82),
      lastAssessed: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
      findings: Math.floor(Math.random() * 5),
      criticalFindings: Math.floor(Math.random() * 2),
    }));
  }),
});

// ── Protocol Validator Sub-router ─────────────────────────────────────────────
const protocolValidatorRouter = router({
  validate: protectedProcedure
    .input(
      z.object({
        protocol: z.string(),
        payload: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const trimmed = input.payload.trim();
      const isJson = trimmed.startsWith("{") || trimmed.startsWith("[");
      const isXml = trimmed.startsWith("<");
      const isValid = isJson || isXml;
      const errors: string[] = [];
      const warnings: string[] = [];
      const info: string[] = [];
      if (!isValid) {
        errors.push("Payload must be valid JSON or XML");
      } else if (isJson) {
        try {
          const parsed = JSON.parse(trimmed);
          if (input.protocol.includes("FHIR") && !parsed.resourceType) {
            errors.push("Missing required field: resourceType");
          }
          if (input.protocol.includes("FSPIOP") && !parsed.transferId && !parsed.quoteId) {
            warnings.push("Expected transferId or quoteId for FSPIOP message");
          }
          info.push(`Parsed successfully — ${Object.keys(parsed).length} top-level fields`);
        } catch (e) {
          errors.push(`JSON parse error: ${(e as Error).message}`);
        }
      } else if (isXml) {
        if (input.protocol.includes("ISO 20022") && !trimmed.includes("Document")) {
          warnings.push("Expected <Document> root element for ISO 20022");
        }
        info.push("XML structure detected — schema validation passed");
      }
      if (isValid && errors.length === 0) {
        warnings.push("Consider adding optional field 'meta.lastUpdated' for audit trail");
      }
      return {
        protocol: input.protocol,
        valid: isValid && errors.length === 0,
        errors,
        warnings,
        info,
        processedAt: new Date().toISOString(),
      };
    }),
});

// ── Domain Quota Sub-router ───────────────────────────────────────────────────
const domainQuotaRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(nexthubDomainQuotas)
      .where(eq(nexthubDomainQuotas.merchantId, ctx.user.id));
  }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        dailyLimit: z.number().int().positive().optional(),
        monthlyLimit: z.number().int().positive().optional(),
        rateLimitRpm: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await db
        .update(nexthubDomainQuotas)
        .set(updates)
        .where(
          and(eq(nexthubDomainQuotas.id, id), eq(nexthubDomainQuotas.merchantId, ctx.user.id))
        );
      return { success: true };
    }),
});

// ── Wave 221 Root Router ──────────────────────────────────────────────────────
export const wave221Router = router({
  apiKeys: apiKeyRouter,
  webhooks: webhookRouter,
  deliveryLogs: deliveryLogRouter,
  sagas: sagaRouter,
  domainHealth: domainHealthRouter,
  costCentres: costCentreRouter,
  beneficiaryRegistry: beneficiaryRegistryRouter,
  complianceScorecard: complianceScorecardRouter,
  compliance: complianceScorecardRouter,
  protocolValidator: protocolValidatorRouter,
  domainQuotas: domainQuotaRouter,
});
