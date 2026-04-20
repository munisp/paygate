/**
 * Wave 26 tRPC Router
 * Covers:
 *  - Feature Flags: targeting rules, tenant-scoped flags, bulk evaluation, onboarding integration
 *  - Tenant Management: CRUD, suspend/activate, plan management, feature provisioning
 *  - White-Label: branding editor, custom domain, per-tenant CSS variables, preview
 *  - Suggested Next Steps: chargeback evidence PDF viewer, revenue analytics CSV export
 */
import { z } from "zod";
import { and, desc, eq, ilike, sql, count, sum, asc, inArray } from "drizzle-orm";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  tenants, merchants, transactions, featureFlags,
  chargebacks,
} from "../drizzle/schema";

// ─── Targeting Rules Schema ───────────────────────────────────────────────────
const targetingRulesSchema = z.object({
  segments: z.array(z.string()).optional(),       // e.g. ["enterprise", "growth"]
  tiers: z.array(z.string()).optional(),          // e.g. ["starter", "growth", "enterprise"]
  countries: z.array(z.string()).optional(),      // e.g. ["NG", "GH", "KE"]
  merchantIds: z.array(z.string()).optional(),    // specific merchant IDs
  userIds: z.array(z.string()).optional(),        // specific user IDs
  tenantIds: z.array(z.string()).optional(),      // specific tenant IDs
  minTransactionVolume: z.number().optional(),    // minimum monthly volume in kobo
  kycLevel: z.enum(["none", "basic", "full"]).optional(),
}).default({});

// ─── Feature Flags (Enhanced) ─────────────────────────────────────────────────
const featureFlagsEnhancedRouter = router({
  // List all flags with targeting rules
  list: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      environment: z.string().optional(),
      tenantId: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: ReturnType<typeof eq>[] = [];
      if (input?.category) conditions.push(eq(featureFlags.category, input.category));
      if (input?.environment) conditions.push(eq(featureFlags.environment, input.environment));
      if (input?.tenantId) {
        // Include global flags + tenant-specific flags
        conditions.push(
          sql`(${featureFlags.tenantId} IS NULL OR ${featureFlags.tenantId} = ${input.tenantId})`
        );
      }
      const rows = await db.select().from(featureFlags)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(featureFlags.createdAt));
      // Apply search filter in memory for simplicity
      if (input?.search) {
        const s = input.search.toLowerCase();
        return rows.filter(r =>
          r.key.toLowerCase().includes(s) ||
          r.name.toLowerCase().includes(s) ||
          (r.description ?? "").toLowerCase().includes(s)
        );
      }
      return rows;
    }),

  // Create flag with targeting rules
  create: protectedProcedure
    .input(z.object({
      key: z.string().min(2).regex(/^[a-z0-9_.-]+$/),
      name: z.string().min(2),
      description: z.string().optional(),
      enabled: z.boolean().default(false),
      rolloutPercentage: z.number().int().min(0).max(100).default(0),
      category: z.enum(["feature", "experiment", "kill-switch", "onboarding"]).default("feature"),
      environment: z.enum(["production", "staging", "development"]).default("production"),
      tenantId: z.string().optional(),
      targetingRules: targetingRulesSchema,
      expiresAt: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const existing = await db.select({ id: featureFlags.id })
        .from(featureFlags).where(eq(featureFlags.key, input.key)).limit(1);
      if (existing.length > 0) throw new Error(`Flag key '${input.key}' already exists`);
      const [flag] = await db.insert(featureFlags).values({
        key: input.key,
        name: input.name,
        description: input.description,
        enabled: input.enabled,
        rolloutPercentage: input.rolloutPercentage,
        category: input.category,
        environment: input.environment,
        createdBy: ctx.user.id,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        // Store targeting rules in targetMerchantIds/targetUserIds as JSON strings
        targetMerchantIds: input.targetingRules.merchantIds?.join(","),
        targetUserIds: input.targetingRules.userIds?.join(","),
      }).returning();
      return flag;
    }),

  // Update flag with targeting rules
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      enabled: z.boolean().optional(),
      rolloutPercentage: z.number().int().min(0).max(100).optional(),
      category: z.string().optional(),
      environment: z.string().optional(),
      targetingRules: targetingRulesSchema.optional(),
      expiresAt: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, targetingRules, expiresAt, ...rest } = input;
      const updateData: Record<string, unknown> = {
        ...rest,
        updatedAt: new Date(),
      };
      if (targetingRules) {
        updateData.targetMerchantIds = targetingRules.merchantIds?.join(",");
        updateData.targetUserIds = targetingRules.userIds?.join(",");
      }
      if (expiresAt !== undefined) {
        updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
      }
      const [updated] = await db.update(featureFlags)
        .set(updateData as Parameters<typeof db.update>[0])
        .where(eq(featureFlags.id, id))
        .returning();
      return updated;
    }),

  // Toggle flag on/off
  toggle: protectedProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [updated] = await db.update(featureFlags)
        .set({ enabled: input.enabled, updatedAt: new Date() })
        .where(eq(featureFlags.id, input.id))
        .returning();
      return updated;
    }),

  // Delete flag
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(featureFlags).where(eq(featureFlags.id, input.id));
      return { success: true };
    }),

  // Evaluate flag for a specific user/merchant context
  evaluate: publicProcedure
    .input(z.object({
      key: z.string(),
      userId: z.string().optional(),
      merchantId: z.string().optional(),
      tenantId: z.string().optional(),
      country: z.string().optional(),
      plan: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select({
        enabled: featureFlags.enabled,
        rolloutPercentage: featureFlags.rolloutPercentage,
        targetMerchantIds: featureFlags.targetMerchantIds,
        targetUserIds: featureFlags.targetUserIds,
        expiresAt: featureFlags.expiresAt,
      }).from(featureFlags).where(eq(featureFlags.key, input.key)).limit(1);

      if (!rows[0] || !rows[0].enabled) return { enabled: false, reason: "flag_disabled" };

      const flag = rows[0];

      // Check expiry
      if (flag.expiresAt && new Date() > flag.expiresAt) {
        return { enabled: false, reason: "flag_expired" };
      }

      // Check merchant targeting
      if (flag.targetMerchantIds && input.merchantId) {
        const ids = flag.targetMerchantIds.split(",").map(s => s.trim());
        if (ids.length > 0 && !ids.includes(input.merchantId)) {
          return { enabled: false, reason: "merchant_not_targeted" };
        }
      }

      // Check user targeting
      if (flag.targetUserIds && input.userId) {
        const ids = flag.targetUserIds.split(",").map(s => s.trim());
        if (ids.length > 0 && !ids.includes(input.userId)) {
          return { enabled: false, reason: "user_not_targeted" };
        }
      }

      // Rollout percentage check
      const pct = flag.rolloutPercentage ?? 100;
      if (pct >= 100) return { enabled: true, reason: "full_rollout" };
      if (pct <= 0) return { enabled: false, reason: "zero_rollout" };

      // Deterministic hash-based rollout
      const seed = input.userId ?? input.merchantId ?? Math.random().toString();
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
      }
      const inRollout = (Math.abs(hash) % 100) < pct;
      return { enabled: inRollout, reason: inRollout ? "rollout_included" : "rollout_excluded" };
    }),

  // Bulk evaluate multiple flags at once
  bulkEvaluate: publicProcedure
    .input(z.object({
      keys: z.array(z.string()).max(50),
      userId: z.string().optional(),
      merchantId: z.string().optional(),
      tenantId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select({
        key: featureFlags.key,
        enabled: featureFlags.enabled,
        rolloutPercentage: featureFlags.rolloutPercentage,
        targetMerchantIds: featureFlags.targetMerchantIds,
        targetUserIds: featureFlags.targetUserIds,
        expiresAt: featureFlags.expiresAt,
      }).from(featureFlags)
        .where(inArray(featureFlags.key, input.keys))

      const result: Record<string, boolean> = {};
      for (const key of input.keys) {
        const flag = rows.find(r => r.key === key);
        if (!flag || !flag.enabled) { result[key] = false; continue; }
        if (flag.expiresAt && new Date() > flag.expiresAt) { result[key] = false; continue; }
        const pct = flag.rolloutPercentage ?? 100;
        if (pct >= 100) { result[key] = true; continue; }
        if (pct <= 0) { result[key] = false; continue; }
        const seed = input.userId ?? input.merchantId ?? "anon";
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
          hash = ((hash << 5) - hash) + seed.charCodeAt(i);
          hash |= 0;
        }
        result[key] = (Math.abs(hash) % 100) < pct;
      }
      return result;
    }),

  // Get per-tenant flag overrides
  getTenantOverrides: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.execute(
        sql`SELECT * FROM tenant_feature_flags WHERE tenant_id = ${input.tenantId} ORDER BY flag_key`
      );
      return rows.rows as Array<{
        id: string; tenant_id: string; flag_key: string; enabled: boolean;
        rollout_percentage: number; override_reason: string | null; set_by: string | null;
        created_at: Date; updated_at: Date;
      }>;
    }),

  // Set per-tenant flag override
  setTenantOverride: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      flagKey: z.string(),
      enabled: z.boolean(),
      rolloutPercentage: z.number().int().min(0).max(100).default(100),
      overrideReason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await db.execute(sql`
        INSERT INTO tenant_feature_flags (id, tenant_id, flag_key, enabled, rollout_percentage, override_reason, set_by, updated_at)
        VALUES (gen_random_uuid()::text, ${input.tenantId}, ${input.flagKey}, ${input.enabled}, ${input.rolloutPercentage}, ${input.overrideReason ?? null}, ${ctx.user.id}, now())
        ON CONFLICT (tenant_id, flag_key) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          rollout_percentage = EXCLUDED.rollout_percentage,
          override_reason = EXCLUDED.override_reason,
          set_by = EXCLUDED.set_by,
          updated_at = now()
      `);
      return { success: true };
    }),

  // Get onboarding feature selection for a tenant
  getOnboardingFeatures: publicProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select({
        bnplEnabled: tenants.bnplEnabled,
        crossBorderEnabled: tenants.crossBorderEnabled,
        virtualCardsEnabled: tenants.virtualCardsEnabled,
        onboardingFeaturesEnabled: sql<string>`onboarding_features_enabled`,
      }).from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
      return rows[0] ?? null;
    }),

  // Update onboarding feature selection for a tenant (admin only)
  setOnboardingFeatures: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      bnplEnabled: z.boolean().optional(),
      crossBorderEnabled: z.boolean().optional(),
      virtualCardsEnabled: z.boolean().optional(),
      features: z.record(z.boolean()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.bnplEnabled !== undefined) updateData.bnplEnabled = input.bnplEnabled;
      if (input.crossBorderEnabled !== undefined) updateData.crossBorderEnabled = input.crossBorderEnabled;
      if (input.virtualCardsEnabled !== undefined) updateData.virtualCardsEnabled = input.virtualCardsEnabled;
      if (input.features) {
        await db.execute(sql`
          UPDATE tenants SET onboarding_features_enabled = ${JSON.stringify(input.features)}::jsonb, updated_at = now()
          WHERE id = ${input.tenantId}
        `);
      }
      if (Object.keys(updateData).length > 1) {
        await db.update(tenants).set(updateData as Parameters<typeof db.update>[0]).where(eq(tenants.id, input.tenantId));
      }
      return { success: true };
    }),
});

// ─── Tenant Management ────────────────────────────────────────────────────────
const tenantManagementRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      status: z.enum(["pending", "active", "suspended", "banned"]).optional(),
      plan: z.enum(["starter", "growth", "enterprise"]).optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;
      const conditions: ReturnType<typeof eq>[] = [];
      if (input?.status) conditions.push(eq(tenants.status, input.status));
      if (input?.plan) conditions.push(eq(tenants.plan, input.plan));
      if (input?.search) {
        conditions.push(
          sql`(${tenants.name} ILIKE ${'%' + input.search + '%'} OR ${tenants.slug} ILIKE ${'%' + input.search + '%'} OR ${tenants.email} ILIKE ${'%' + input.search + '%'})`
        );
      }
      const rows = await db.select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
        plan: tenants.plan,
        email: tenants.email,
        country: tenants.country,
        logoUrl: tenants.logoUrl,
        primaryColor: tenants.primaryColor,
        maxMerchants: tenants.maxMerchants,
        maxConsumers: tenants.maxConsumers,
        bnplEnabled: tenants.bnplEnabled,
        crossBorderEnabled: tenants.crossBorderEnabled,
        virtualCardsEnabled: tenants.virtualCardsEnabled,
        createdAt: tenants.createdAt,
        updatedAt: tenants.updatedAt,
        suspendedAt: tenants.suspendedAt,
        suspendReason: tenants.suspendReason,
      }).from(tenants)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(tenants.createdAt))
        .limit(limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(tenants)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      return { rows, total: Number(total), page, limit };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select().from(tenants).where(eq(tenants.id, input.id)).limit(1);
      if (!rows[0]) throw new Error("Tenant not found");
      // Get merchant count
      const [{ merchantCount }] = await db.select({ merchantCount: count() })
        .from(merchants).where(eq(merchants.tenantId, input.id));
      return { ...rows[0], merchantCount: Number(merchantCount) };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2),
      slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
      email: z.string().email(),
      phone: z.string().optional(),
      country: z.string().default("NG"),
      plan: z.enum(["starter", "growth", "enterprise"]).default("starter"),
      logoUrl: z.string().url().optional(),
      primaryColor: z.string().default("#6366f1"),
      maxMerchants: z.number().int().min(1).default(10),
      maxConsumers: z.number().int().min(1).default(10000),
      bnplEnabled: z.boolean().default(false),
      crossBorderEnabled: z.boolean().default(false),
      virtualCardsEnabled: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const id = `ten_${input.slug}_${Date.now().toString(36)}`;
      const [tenant] = await db.insert(tenants).values({
        id,
        name: input.name,
        slug: input.slug,
        email: input.email,
        phone: input.phone,
        country: input.country,
        plan: input.plan,
        status: "pending",
        logoUrl: input.logoUrl,
        primaryColor: input.primaryColor,
        maxMerchants: input.maxMerchants,
        maxConsumers: input.maxConsumers,
        bnplEnabled: input.bnplEnabled,
        crossBorderEnabled: input.crossBorderEnabled,
        virtualCardsEnabled: input.virtualCardsEnabled,
        provisionedBy: ctx.user.id,
        provisionedAt: new Date(),
      }).returning();
      return tenant;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      plan: z.enum(["starter", "growth", "enterprise"]).optional(),
      logoUrl: z.string().url().nullable().optional(),
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      fontFamily: z.string().optional(),
      footerText: z.string().optional(),
      supportEmail: z.string().email().optional(),
      customDomain: z.string().optional(),
      faviconUrl: z.string().url().nullable().optional(),
      maxMerchants: z.number().int().min(1).optional(),
      maxConsumers: z.number().int().min(1).optional(),
      maxDailyVolume: z.number().optional(),
      bnplEnabled: z.boolean().optional(),
      crossBorderEnabled: z.boolean().optional(),
      virtualCardsEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, ...rest } = input;
      // Use raw SQL for columns not in Drizzle schema yet
      const setClauses: string[] = ["updated_at = now()"];
      const values: unknown[] = [];
      let paramIdx = 1;

      const directFields: Record<string, string> = {
        name: "name", email: "email", phone: "phone", plan: "plan",
        logoUrl: "logo_url", primaryColor: "primary_color",
        maxMerchants: "max_merchants", maxConsumers: "max_consumers",
        maxDailyVolume: "max_daily_volume",
        bnplEnabled: "bnpl_enabled", crossBorderEnabled: "cross_border_enabled",
        virtualCardsEnabled: "virtual_cards_enabled",
        // New white-label columns
        secondaryColor: "secondary_color", fontFamily: "font_family",
        footerText: "footer_text", supportEmail: "support_email",
        customDomain: "custom_domain", faviconUrl: "favicon_url",
      };

      for (const [key, col] of Object.entries(directFields)) {
        const val = (rest as Record<string, unknown>)[key];
        if (val !== undefined) {
          setClauses.push(`${col} = $${paramIdx++}`);
          values.push(val);
        }
      }
      values.push(id);
      const pool = (await getDb() as unknown as { _pool?: { query: (q: string, v: unknown[]) => Promise<{ rows: unknown[] }> } })._pool;
      if (pool) {
        const result = await pool.query(
          `UPDATE tenants SET ${setClauses.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
          values
        );
        return result.rows[0];
      }
      // Fallback: use drizzle for basic fields
      const drizzleUpdate: Record<string, unknown> = { updatedAt: new Date() };
      if (rest.name) drizzleUpdate.name = rest.name;
      if (rest.plan) drizzleUpdate.plan = rest.plan;
      if (rest.bnplEnabled !== undefined) drizzleUpdate.bnplEnabled = rest.bnplEnabled;
      if (rest.crossBorderEnabled !== undefined) drizzleUpdate.crossBorderEnabled = rest.crossBorderEnabled;
      if (rest.virtualCardsEnabled !== undefined) drizzleUpdate.virtualCardsEnabled = rest.virtualCardsEnabled;
      const [updated] = await db.update(tenants)
        .set(drizzleUpdate as Parameters<typeof db.update>[0])
        .where(eq(tenants.id, id)).returning();
      return updated;
    }),

  activate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [updated] = await db.update(tenants)
        .set({ status: "active", suspendedAt: null, suspendReason: null, updatedAt: new Date() } as Parameters<typeof db.update>[0])
        .where(eq(tenants.id, input.id)).returning();
      return updated;
    }),

  suspend: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().min(5) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [updated] = await db.update(tenants)
        .set({
          status: "suspended",
          suspendedAt: new Date(),
          suspendReason: input.reason,
          updatedAt: new Date(),
        } as Parameters<typeof db.update>[0])
        .where(eq(tenants.id, input.id)).returning();
      return updated;
    }),

  getStats: protectedProcedure.query(async () => {
    const db = await getDb();
    const [{ total }] = await db.select({ total: count() }).from(tenants);
    const [{ active }] = await db.select({ active: count() }).from(tenants).where(eq(tenants.status, "active"));
    const [{ pending }] = await db.select({ pending: count() }).from(tenants).where(eq(tenants.status, "pending"));
    const [{ suspended }] = await db.select({ suspended: count() }).from(tenants).where(eq(tenants.status, "suspended"));
    const [{ enterprise }] = await db.select({ enterprise: count() }).from(tenants).where(eq(tenants.plan, "enterprise"));
    return {
      total: Number(total),
      active: Number(active),
      pending: Number(pending),
      suspended: Number(suspended),
      enterprise: Number(enterprise),
    };
  }),
});

// ─── White-Label Branding ─────────────────────────────────────────────────────
const whiteLabelRouter = router({
  getBranding: publicProcedure
    .input(z.object({ tenantId: z.string().optional(), slug: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const condition = input.tenantId
        ? eq(tenants.id, input.tenantId)
        : input.slug
          ? eq(tenants.slug, input.slug)
          : undefined;
      if (!condition) return null;
      const rows = await db.execute(sql`
        SELECT id, name, slug, logo_url, primary_color, secondary_color,
               font_family, footer_text, support_email, custom_domain, favicon_url
        FROM tenants WHERE ${condition}
        LIMIT 1
      `);
      return (rows.rows[0] as Record<string, unknown>) ?? null;
    }),

  updateBranding: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      logoUrl: z.string().url().nullable().optional(),
      faviconUrl: z.string().url().nullable().optional(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      fontFamily: z.enum(["Inter", "Roboto", "Poppins", "Nunito", "Lato", "Open Sans"]).optional(),
      footerText: z.string().max(200).optional(),
      supportEmail: z.string().email().optional(),
      customDomain: z.string().optional(),
      name: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { tenantId, ...branding } = input;
      const setClauses: string[] = ["updated_at = now()"];
      const values: unknown[] = [];
      let paramIdx = 1;
      const colMap: Record<string, string> = {
        logoUrl: "logo_url", faviconUrl: "favicon_url",
        primaryColor: "primary_color", secondaryColor: "secondary_color",
        fontFamily: "font_family", footerText: "footer_text",
        supportEmail: "support_email", customDomain: "custom_domain",
        name: "name",
      };
      for (const [key, col] of Object.entries(colMap)) {
        const val = (branding as Record<string, unknown>)[key];
        if (val !== undefined) {
          setClauses.push(`${col} = $${paramIdx++}`);
          values.push(val);
        }
      }
      if (setClauses.length === 1) return { success: true }; // nothing to update
      values.push(tenantId);
      // Use postgres directly (parameterized query below)
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: process.env.PG_DATABASE_URL ?? process.env.DATABASE_URL });
      try {
        await pool.query(`UPDATE tenants SET ${setClauses.join(", ")} WHERE id = $${paramIdx}`, values);
      } finally {
        await pool.end();
      }
      return { success: true };
    }),

  // Generate CSS variables for a tenant's branding
  getCssVariables: publicProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.execute(sql`
        SELECT primary_color, secondary_color, font_family
        FROM tenants WHERE id = ${input.tenantId} LIMIT 1
      `);
      const row = rows.rows[0] as { primary_color?: string; secondary_color?: string; font_family?: string } | undefined;
      if (!row) return null;
      return {
        "--color-primary": row.primary_color ?? "#6366f1",
        "--color-secondary": row.secondary_color ?? "#8b5cf6",
        "--font-family": row.font_family ?? "Inter",
      };
    }),

  // List all tenants with their branding for admin
  listBrandings: protectedProcedure.query(async () => {
    const db = await getDb();
    const rows = await db.execute(sql`
      SELECT id, name, slug, logo_url, primary_color, secondary_color, font_family,
             custom_domain, status, plan
      FROM tenants ORDER BY created_at DESC LIMIT 100
    `);
    return rows.rows as Array<Record<string, unknown>>;
  }),
});

// ─── Chargeback Evidence PDF Viewer ──────────────────────────────────────────
const chargebackPdfRouter = router({
  getEvidenceForViewer: protectedProcedure
    .input(z.object({ chargebackId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.select({
        id: chargebacks.id,
        reference: chargebacks.reference,
        amount: chargebacks.amount,
        status: chargebacks.status,
        reason: chargebacks.reason,
        evidenceUrl: chargebacks.evidenceUrl,
        evidenceFileName: chargebacks.evidenceFileName,
        createdAt: chargebacks.createdAt,
      }).from(chargebacks).where(eq(chargebacks.id, input.chargebackId)).limit(1);
      return rows[0] ?? null;
    }),
});

// ─── Revenue Analytics CSV Export ────────────────────────────────────────────
const revenueExportRouter = router({
  getCsvData: protectedProcedure
    .input(z.object({
      from: z.date().optional(),
      to: z.date().optional(),
      groupBy: z.enum(["day", "week", "month"]).default("month"),
      merchantId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions: ReturnType<typeof eq>[] = [eq(transactions.status, "completed")];
      if (input.from) conditions.push(sql`${transactions.createdAt} >= ${input.from}` as ReturnType<typeof eq>);
      if (input.to) conditions.push(sql`${transactions.createdAt} <= ${input.to}` as ReturnType<typeof eq>);
      if (input.merchantId) conditions.push(eq(transactions.merchantId, input.merchantId));

      const truncFn = input.groupBy === "day" ? "day" : input.groupBy === "week" ? "week" : "month";

      const rows = await db.execute(sql`
        SELECT
          date_trunc(${truncFn}, created_at) as period,
          COUNT(*) as transaction_count,
          SUM(amount) as gross_volume,
          SUM(fee) as total_fees,
          SUM(amount - COALESCE(fee, 0)) as net_revenue,
          COUNT(DISTINCT merchant_id) as active_merchants,
          AVG(amount) as avg_transaction_value,
          currency
        FROM transactions
        WHERE status = 'completed'
          ${input.from ? sql`AND created_at >= ${input.from}` : sql``}
          ${input.to ? sql`AND created_at <= ${input.to}` : sql``}
          ${input.merchantId ? sql`AND merchant_id = ${input.merchantId}` : sql``}
        GROUP BY date_trunc(${truncFn}, created_at), currency
        ORDER BY period DESC
        LIMIT 500
      `);

      // Format as CSV-ready rows
      return (rows.rows as Array<Record<string, unknown>>).map(r => ({
        period: r.period,
        transactionCount: Number(r.transaction_count),
        grossVolume: Number(r.gross_volume),
        totalFees: Number(r.total_fees),
        netRevenue: Number(r.net_revenue),
        activeMerchants: Number(r.active_merchants),
        avgTransactionValue: Number(r.avg_transaction_value),
        currency: r.currency,
      }));
    }),

  // Generate CSV string server-side
  exportCsv: protectedProcedure
    .input(z.object({
      from: z.date().optional(),
      to: z.date().optional(),
      groupBy: z.enum(["day", "week", "month"]).default("month"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const truncFn = input.groupBy === "day" ? "day" : input.groupBy === "week" ? "week" : "month";
      const rows = await db.execute(sql`
        SELECT
          date_trunc(${truncFn}, created_at)::text as period,
          COUNT(*)::text as transaction_count,
          SUM(amount)::text as gross_volume,
          SUM(fee)::text as total_fees,
          SUM(amount - COALESCE(fee, 0))::text as net_revenue,
          COUNT(DISTINCT merchant_id)::text as active_merchants,
          currency
        FROM transactions
        WHERE status = 'completed'
          ${input.from ? sql`AND created_at >= ${input.from}` : sql``}
          ${input.to ? sql`AND created_at <= ${input.to}` : sql``}
        GROUP BY date_trunc(${truncFn}, created_at), currency
        ORDER BY period DESC
        LIMIT 1000
      `);
      const header = "Period,Transaction Count,Gross Volume,Total Fees,Net Revenue,Active Merchants,Currency";
      const csvRows = (rows.rows as Array<Record<string, string>>).map(r =>
        `${r.period},${r.transaction_count},${r.gross_volume},${r.total_fees},${r.net_revenue},${r.active_merchants},${r.currency}`
      );
      return { csv: [header, ...csvRows].join("\n"), rowCount: csvRows.length };
    }),
});

// ─── Export ───────────────────────────────────────────────────────────────────
export const wave26Router = router({
  featureFlags: featureFlagsEnhancedRouter,
  tenantManagement: tenantManagementRouter,
  whiteLabel: whiteLabelRouter,
  chargebackPdf: chargebackPdfRouter,
  revenueExport: revenueExportRouter,
});
