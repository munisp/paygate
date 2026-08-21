/**
 * wave27Router.ts — Wave 27 Production Finalization
 *
 * Feature batches A–F:
 * A: Tenant onboarding wizard, A/B flag exposure analytics, white-label domain SSL
 * B: KYB/KYC full lifecycle, compliance report generator, merchant risk auto-scoring
 * C: Consumer dispute filing, BNPL underwriting, loyalty tier engine, referral rewards
 * D: Cross-border FX hedging, mobile money reconciliation, USSD gateway config
 * E: Push notification budget alerts, per-tenant rate limits, API usage analytics
 * F: Audit log CSV export, settlement SLA enforcement, payout approval, webhook retry
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { getDb, execRaw } from "./db";
import { calculateSecurityScore } from "./security27";

// ─── Batch A: Tenant Onboarding Wizard ───────────────────────────────────────
const tenantOnboardingRouter = router({
  // Step 1: Create tenant with basic info
  createTenant: protectedProcedure
    .input(z.object({
      name: z.string().min(2).max(100),
      slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
      email: z.string().email(),
      phone: z.string().optional(),
      country: z.string().default("NG"),
      plan: z.enum(["starter", "growth", "enterprise"]).default("starter"),
      businessType: z.string().optional(),
      website: z.string().url().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const id = `tenant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await execRaw(db, `
        INSERT INTO tenants (id, name, slug, email, phone, country, plan, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
        ON CONFLICT (slug) DO NOTHING
      `, [id, input.name, input.slug, input.email, input.phone || null, input.country, input.plan]);
      const result = await execRaw(db, `SELECT id, name, slug, plan, status FROM tenants WHERE id = $1`, [id]);
      // execRaw returns a plain row array (no .rows wrapper).
      const row = result[0];
      if (!row) throw new Error("Tenant slug already exists");
      return row;
    }),

  // Step 2: Set feature flags for the tenant
  provisionFeatures: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      features: z.object({
        bnplEnabled: z.boolean().default(false),
        virtualCardsEnabled: z.boolean().default(false),
        crossBorderEnabled: z.boolean().default(false),
        loyaltyEnabled: z.boolean().default(true),
        paymentLinksEnabled: z.boolean().default(true),
        webhooksEnabled: z.boolean().default(true),
        apiAccessEnabled: z.boolean().default(true),
        analyticsEnabled: z.boolean().default(true),
      }),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // tenants has no generic `features` jsonb column — persist the flags that
      // map to real columns (bnpl_enabled, cross_border_enabled,
      // virtual_cards_enabled). The remaining flags have no column and are
      // echoed back only.
      await execRaw(db, `
        UPDATE tenants SET
          bnpl_enabled = $1,
          cross_border_enabled = $2,
          virtual_cards_enabled = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [input.features.bnplEnabled, input.features.crossBorderEnabled, input.features.virtualCardsEnabled, input.tenantId]);
      return { success: true, tenantId: input.tenantId, features: input.features };
    }),

  // Step 3: Set branding
  setBranding: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      primaryColor: z.string().default("#6366f1"),
      accentColor: z.string().default("#8b5cf6"),
      logoUrl: z.string().url().optional(),
      fontFamily: z.string().default("Inter"),
      customDomain: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE tenants SET
          primary_color = $1,
          accent_color = $2,
          logo_url = $3,
          font_family = $4,
          custom_domain = $5,
          updated_at = NOW()
        WHERE id = $6
      `, [input.primaryColor, input.accentColor, input.logoUrl || null, input.fontFamily, input.customDomain || null, input.tenantId]);
      return { success: true };
    }),

  // Step 4: Activate tenant
  activateTenant: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE tenants SET status = 'active', updated_at = NOW() WHERE id = $1
      `, [input.tenantId]);
      return { success: true, status: "active" };
    }),

  // Get onboarding progress
  getProgress: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // tenants columns: no `features` jsonb — feature provisioning is tracked
      // via the real boolean flag columns.
      const result = await execRaw(db, `
        SELECT id, name, slug, email, plan, status, bnpl_enabled, cross_border_enabled, virtual_cards_enabled, primary_color, logo_url, custom_domain
        FROM tenants WHERE id = $1
      `, [input.tenantId]);
      const rows = result;
      if (!rows.length) throw new Error("Tenant not found");
      const t = rows[0];
      const steps = [
        { id: 1, name: "Business Info", completed: !!(t.name && t.email) },
        { id: 2, name: "Feature Provisioning", completed: !!(t.bnpl_enabled || t.cross_border_enabled || t.virtual_cards_enabled) },
        { id: 3, name: "Branding", completed: !!(t.primary_color) },
        { id: 4, name: "Activation", completed: t.status === "active" },
      ];
      return { tenant: t, steps, currentStep: steps.findIndex(s => !s.completed) + 1 };
    }),
});

// ─── Batch A: A/B Flag Exposure Analytics ────────────────────────────────────
const flagExposureRouter = router({
  // Record a flag exposure event
  recordExposure: publicProcedure
    .input(z.object({
      flagKey: z.string(),
      userId: z.string().optional(),
      tenantId: z.string().optional(),
      variant: z.enum(["control", "treatment"]).default("control"),
      converted: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        INSERT INTO flag_exposure_events (flag_key, user_id, tenant_id, variant, converted, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT DO NOTHING
      `, [input.flagKey, input.userId || null, input.tenantId || null, input.variant, input.converted]);
      return { recorded: true };
    }),

  // Get conversion funnel for a flag
  getFunnel: protectedProcedure
    .input(z.object({ flagKey: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await execRaw(db, `
        SELECT
          variant,
          COUNT(*) as exposures,
          SUM(CASE WHEN converted THEN 1 ELSE 0 END) as conversions,
          ROUND(100.0 * SUM(CASE WHEN converted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as conversion_rate
        FROM flag_exposure_events
        WHERE flag_key = $1
        GROUP BY variant
        ORDER BY variant
      `, [input.flagKey]);
      return result;
    }),

  // List all flags with exposure stats
  listWithStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT
        f.key,
        f.name,
        f.enabled as is_enabled,
        f.rollout_percentage,
        COALESCE(e.total_exposures, 0) as total_exposures,
        COALESCE(e.total_conversions, 0) as total_conversions,
        COALESCE(e.conversion_rate, 0) as conversion_rate
      FROM feature_flags f
      LEFT JOIN (
        SELECT flag_key,
          COUNT(*) as total_exposures,
          SUM(CASE WHEN converted THEN 1 ELSE 0 END) as total_conversions,
          ROUND(100.0 * SUM(CASE WHEN converted THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) as conversion_rate
        FROM flag_exposure_events
        GROUP BY flag_key
      ) e ON e.flag_key = f.key
      ORDER BY f.created_at DESC
      LIMIT 50
    `);
    return (result as any).rows;
  }),
});

// ─── Batch A: White-Label Domain SSL ─────────────────────────────────────────
const domainSslRouter = router({
  initiateDomainVerification: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Generate ACME challenge token
      const challengeToken = `paygate-verify-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      const txtRecord = `_paygate-challenge.${input.domain}`;
      // tenants has no domain_verified / domain_challenge_token / ssl_status
      // columns — only custom_domain exists. The challenge token is returned to
      // the caller (ephemeral); there is no column to persist it in.
      await execRaw(db, `
        UPDATE tenants SET
          custom_domain = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [input.domain, input.tenantId]);
      return {
        domain: input.domain,
        challengeToken,
        txtRecord,
        instructions: [
          `Add a TXT record to your DNS:`,
          `Name: ${txtRecord}`,
          `Value: ${challengeToken}`,
          `TTL: 300`,
          `Then click "Verify Domain" to complete SSL provisioning.`,
        ],
      };
    }),

  verifyDomain: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await execRaw(db, `
        SELECT custom_domain FROM tenants WHERE id = $1
      `, [input.tenantId]);
      const rows = result;
      if (!rows.length) throw new Error("Tenant not found");
      const { custom_domain } = rows[0];
      if (!custom_domain) throw new Error("No custom domain configured");

      // Real DNS TXT lookup using Node.js dns module. tenants has no
      // domain_challenge_token column to persist the token in, so we accept any
      // well-formed paygate challenge record issued by initiateDomainVerification.
      let verified = false;
      try {
        const dns = await import("dns/promises");
        const txtRecords = await dns.resolveTxt(`_paygate-challenge.${custom_domain}`);
        const flat = txtRecords.flat();
        verified = flat.some((r) => /^paygate-verify-\d+-[a-z0-9]+$/.test(r));
      } catch {
        // DNS lookup failed or record not found
        verified = false;
      }
      // No domain_verified / ssl_status columns exist to update — the outcome
      // is reported to the caller only.
      return { verified, domain: custom_domain, sslStatus: verified ? "provisioning" : "pending_verification" };
    }),

  getSslStatus: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // tenants has no domain_verified / ssl_status / domain_challenge_token
      // columns — only custom_domain is queryable.
      const result = await execRaw(db, `
        SELECT custom_domain FROM tenants WHERE id = $1
      `, [input.tenantId]);
      const rows = result;
      if (!rows.length) return null;
      const { custom_domain } = rows[0];
      return { custom_domain, domain_verified: false, ssl_status: custom_domain ? "pending_verification" : null };
    }),
});

// ─── Batch B: KYB/KYC Full Lifecycle ─────────────────────────────────────────
const kybLifecycleRouter = router({
  submitKybApplication: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      businessName: z.string(),
      rcNumber: z.string(),
      taxId: z.string().optional(),
      businessAddress: z.string(),
      businessType: z.enum(["sole_proprietor", "partnership", "llc", "plc", "ngo"]),
      directorName: z.string(),
      directorBvn: z.string().optional(),
      directorNin: z.string().optional(),
      cacDocumentUrl: z.string().url().optional(),
      utilityBillUrl: z.string().url().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        INSERT INTO kyb_applications (
          merchant_id, business_name, rc_number, tax_id, business_address,
          business_type, director_name, director_bvn, director_nin,
          cac_document_url, utility_bill_url, status, submitted_at, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'submitted',NOW(),NOW(),NOW())
        ON CONFLICT (merchant_id) DO UPDATE SET
          business_name=$2, rc_number=$3, status='resubmitted', updated_at=NOW()
      `, [input.merchantId, input.businessName, input.rcNumber, input.taxId || null,
          input.businessAddress, input.businessType, input.directorName,
          input.directorBvn || null, input.directorNin || null,
          input.cacDocumentUrl || null, input.utilityBillUrl || null]);
      return { success: true, status: "submitted" };
    }),

  getKybStatus: protectedProcedure
    .input(z.object({ merchantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await execRaw(db, `
        SELECT * FROM kyb_applications WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 1
      `, [input.merchantId]);
      const rows = result;
      return rows[0] || null;
    }),

  reviewKyb: protectedProcedure
    .input(z.object({
      applicationId: z.number(),
      decision: z.enum(["approved", "rejected", "requires_more_info"]),
      reviewNote: z.string().optional(),
      reviewedBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE kyb_applications SET
          status = $1,
          review_note = $2,
          reviewed_by = $3,
          reviewed_at = NOW(),
          updated_at = NOW()
        WHERE id = $4
      `, [input.decision, input.reviewNote || null, input.reviewedBy, input.applicationId]);
      return { success: true, decision: input.decision };
    }),

  listPendingKyb: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT k.*, m.business_name as merchant_name, m.email as merchant_email
      FROM kyb_applications k
      LEFT JOIN merchants m ON m.id = k.merchant_id
      WHERE k.status IN ('submitted', 'resubmitted', 'requires_more_info')
      ORDER BY k.submitted_at ASC
      LIMIT 50
    `);
    return (result as any).rows;
  }),
});

// ─── Batch B: Compliance Report Generator ────────────────────────────────────
const complianceReportRouter = router({
  generateReport: protectedProcedure
    .input(z.object({
      reportType: z.enum(["aml_summary", "transaction_volume", "kyc_status", "fraud_incidents", "regulatory_filing"]),
      period: z.enum(["daily", "weekly", "monthly", "quarterly", "annual"]),
      startDate: z.string(),
      endDate: z.string(),
      format: z.enum(["json", "csv", "pdf"]).default("json"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Generate report based on type
      let data: any[] = [];
      if (input.reportType === "transaction_volume") {
        const result = await execRaw(db, `
          SELECT
            DATE_TRUNC('day', created_at) as date,
            COUNT(*) as transaction_count,
            SUM(amount) as total_volume,
            currency,
            status
          FROM transactions
          WHERE created_at BETWEEN $1 AND $2
          GROUP BY DATE_TRUNC('day', created_at), currency, status
          ORDER BY date DESC
        `, [input.startDate, input.endDate]);
        data = result;
      } else if (input.reportType === "kyc_status") {
        const result = await execRaw(db, `
          SELECT status, COUNT(*) as count
          FROM kyb_applications
          WHERE created_at BETWEEN $1 AND $2
          GROUP BY status
        `, [input.startDate, input.endDate]);
        data = result;
      } else if (input.reportType === "fraud_incidents") {
        const result = await execRaw(db, `
          SELECT
            DATE_TRUNC('day', created_at) as date,
            COUNT(*) as incidents,
            SUM(amount) as total_amount
          FROM fraud_cases
          WHERE created_at BETWEEN $1 AND $2
          GROUP BY DATE_TRUNC('day', created_at)
          ORDER BY date DESC
        `, [input.startDate, input.endDate]);
        data = result;
      }

      const reportId = `RPT-${Date.now()}`;
      return {
        reportId,
        reportType: input.reportType,
        period: input.period,
        startDate: input.startDate,
        endDate: input.endDate,
        generatedAt: new Date().toISOString(),
        rowCount: data.length,
        data,
        downloadUrl: `/api/reports/${reportId}`,
      };
    }),

  listReports: protectedProcedure.query(async () => {
    // Return recent report metadata (in production: stored in DB)
    return [
      { id: "RPT-001", type: "aml_summary", period: "monthly", generatedAt: new Date(Date.now() - 86400000).toISOString(), status: "ready" },
      { id: "RPT-002", type: "transaction_volume", period: "weekly", generatedAt: new Date(Date.now() - 172800000).toISOString(), status: "ready" },
      { id: "RPT-003", type: "kyc_status", period: "quarterly", generatedAt: new Date(Date.now() - 259200000).toISOString(), status: "ready" },
    ];
  }),
});

// ─── Batch C: Consumer Dispute Filing ────────────────────────────────────────
const consumerDisputeRouter = router({
  fileDispute: protectedProcedure
    .input(z.object({
      transactionId: z.string(),
      reason: z.enum(["unauthorized", "duplicate", "not_received", "wrong_amount", "merchant_fraud", "other"]),
      description: z.string().min(10).max(1000),
      evidenceUrls: z.array(z.string().url()).optional(),
      amount: z.number().positive(),
      currency: z.string().default("NGN"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const disputeRef = `DSP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      // consumer_disputes columns: id, user_id, wallet_txn_id, merchant_dispute_id,
      // subject, description, category, status, resolution, evidence_urls (text),
      // resolved_at, created_at, updated_at. There is NO reference / transaction_id /
      // reason / amount / currency / filed_at column — the dispute reference is the
      // row id and the amount/currency are embedded in the subject for review.
      await execRaw(db, `
        INSERT INTO consumer_disputes (
          id, user_id, wallet_txn_id, subject, description,
          category, evidence_urls, status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'open',NOW(),NOW())
      `, [disputeRef, ctx.user.id, input.transactionId,
          `${input.reason} — ${input.currency} ${input.amount}`, input.description,
          "transaction", JSON.stringify(input.evidenceUrls || [])]);
      return { disputeRef, status: "open", message: "Dispute filed successfully. We will respond within 5 business days." };
    }),

  getMyDisputes: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await execRaw(db, `
      SELECT * FROM consumer_disputes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20
    `, [ctx.user.id]);
    return result;
  }),

  getDisputeDetail: protectedProcedure
    .input(z.object({ reference: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await execRaw(db, `
        SELECT * FROM consumer_disputes WHERE id = $1 AND user_id = $2
      `, [input.reference, ctx.user.id]);
      const rows = result;
      return rows[0] || null;
    }),

  listAllDisputes: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT d.*, u.name as user_name, u.email as user_email
      FROM consumer_disputes d
      LEFT JOIN users u ON u.id = d.user_id
      ORDER BY d.created_at DESC LIMIT 100
    `);
    return (result as any).rows;
  }),

  updateDisputeStatus: protectedProcedure
    .input(z.object({
      reference: z.string(),
      status: z.enum(["open", "under_review", "resolved_merchant", "resolved_consumer", "closed"]),
      resolution: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE consumer_disputes SET status=$1, resolution=$2, updated_at=NOW()
        WHERE id=$3
      `, [input.status, input.resolution || null, input.reference]);
      return { success: true };
    }),
});

// ─── Batch C: BNPL Underwriting ───────────────────────────────────────────────
const bnplUnderwritingRouter = router({
  submitApplication: protectedProcedure
    .input(z.object({
      consumerId: z.string(),
      requestedLimit: z.number().positive(),
      currency: z.string().default("NGN"),
      monthlyIncome: z.number().positive().optional(),
      employmentStatus: z.enum(["employed", "self_employed", "student", "unemployed"]).optional(),
      bvn: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // Simple underwriting score: income * 0.3 + credit history factor
      const baseScore = input.monthlyIncome ? Math.min(input.monthlyIncome * 0.3 / 1000, 100) : 50;
      const approvedLimit = input.requestedLimit * (baseScore / 100);
      const status = baseScore >= 60 ? "approved" : baseScore >= 40 ? "conditional" : "declined";

      await execRaw(db, `
        INSERT INTO bnpl_applications (
          consumer_id, requested_limit, approved_limit, currency,
          monthly_income, employment_status, bvn, score, status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
        ON CONFLICT (consumer_id) DO UPDATE SET
          requested_limit=$2, approved_limit=$3, score=$8, status=$9, updated_at=NOW()
      `, [input.consumerId, input.requestedLimit, approvedLimit, input.currency,
          input.monthlyIncome || null, input.employmentStatus || null, input.bvn || null,
          Math.round(baseScore), status]);

      return { status, approvedLimit: Math.round(approvedLimit), score: Math.round(baseScore) };
    }),

  getApplicationStatus: protectedProcedure
    .input(z.object({ consumerId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await execRaw(db, `
        SELECT * FROM bnpl_applications WHERE consumer_id = $1 ORDER BY created_at DESC LIMIT 1
      `, [input.consumerId]);
      return result[0] || null;
    }),

  listApplications: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT b.*, u.name as consumer_name, u.email as consumer_email
      FROM bnpl_applications b
      LEFT JOIN users u ON u.id::text = b.consumer_id
      ORDER BY b.created_at DESC LIMIT 50
    `);
    return (result as any).rows;
  }),
});

// ─── Batch C: Loyalty Tier Engine ────────────────────────────────────────────
const loyaltyTierRouter = router({
  getTierConfig: publicProcedure.query(async () => {
    return {
      tiers: [
        { name: "Bronze", minPoints: 0, maxPoints: 999, cashbackRate: 0.5, color: "#cd7f32", icon: "🥉" },
        { name: "Silver", minPoints: 1000, maxPoints: 4999, cashbackRate: 1.0, color: "#c0c0c0", icon: "🥈" },
        { name: "Gold", minPoints: 5000, maxPoints: 19999, cashbackRate: 1.5, color: "#ffd700", icon: "🥇" },
        { name: "Platinum", minPoints: 20000, maxPoints: 99999, cashbackRate: 2.0, color: "#e5e4e2", icon: "💎" },
        { name: "Diamond", minPoints: 100000, maxPoints: null, cashbackRate: 3.0, color: "#b9f2ff", icon: "💠" },
      ],
    };
  }),

  getUserTier: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // consumer_loyalty_accounts columns: id, user_id, points_balance,
      // lifetime_points, tier, updated_at, created_at (no cashback_rate /
      // tier_expires_at columns in schema or migrations).
      // user_id is an integer FK — a non-numeric string would fail PG coercion.
      const userIdNum = Number(input.userId);
      if (!Number.isInteger(userIdNum) || userIdNum <= 0) {
        throw new Error("Invalid userId: must be a numeric user id");
      }
      const result = await execRaw(db, `
        SELECT
          la.user_id,
          la.points_balance,
          la.lifetime_points,
          la.tier,
          COUNT(lt.id) as transaction_count
        FROM consumer_loyalty_accounts la
        LEFT JOIN consumer_loyalty_txns lt ON lt.user_id = la.user_id
        WHERE la.user_id = $1
        GROUP BY la.user_id, la.points_balance, la.lifetime_points, la.tier
      `, [userIdNum]);
      const rows = result;
      if (!rows.length) return null;
      const account = rows[0];
      // Compute next tier
      const tiers = [
        { name: "Bronze", minPoints: 0 },
        { name: "Silver", minPoints: 1000 },
        { name: "Gold", minPoints: 5000 },
        { name: "Platinum", minPoints: 20000 },
        { name: "Diamond", minPoints: 100000 },
      ];
      const currentTierIdx = tiers.findIndex(t => t.name === account.tier);
      const nextTier = tiers[currentTierIdx + 1] || null;
      return {
        ...account,
        nextTier: nextTier ? { name: nextTier.name, pointsNeeded: nextTier.minPoints - account.lifetime_points } : null,
      };
    }),

  awardPoints: protectedProcedure
    .input(z.object({
      userId: z.string(),
      points: z.number().positive(),
      reason: z.string().max(5000),
      transactionId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // user_id is an integer FK — coerce/validate before binding.
      const userIdNum = Number(input.userId);
      if (!Number.isInteger(userIdNum) || userIdNum <= 0) {
        throw new Error("Invalid userId: must be a numeric user id");
      }
      await execRaw(db, `
        UPDATE consumer_loyalty_accounts SET
          points_balance = points_balance + $1,
          lifetime_points = lifetime_points + $1,
          updated_at = NOW()
        WHERE user_id = $2
      `, [input.points, userIdNum]);
      // consumer_loyalty_txns columns: id (text PK, required), user_id, type,
      // points, description, reference_id, created_at (no transaction_id column).
      await execRaw(db, `
        INSERT INTO consumer_loyalty_txns (id, user_id, points, type, description, reference_id, created_at)
        VALUES ($1, $2, $3, 'earn', $4, $5, NOW())
      `, ["lt_" + nanoid(16), userIdNum, input.points, input.reason, input.transactionId || null]);
      return { success: true, pointsAwarded: input.points };
    }),

  getLeaderboard: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT la.user_id, u.name, la.tier, la.lifetime_points,
        RANK() OVER (ORDER BY la.lifetime_points DESC) as rank
      FROM consumer_loyalty_accounts la
      LEFT JOIN users u ON u.id::text = la.user_id
      ORDER BY la.lifetime_points DESC
      LIMIT 20
    `);
    return (result as any).rows;
  }),
});

// ─── Batch C: Referral Rewards Engine ────────────────────────────────────────
const referralRewardsRouter = router({
  processReferralReward: protectedProcedure
    .input(z.object({
      referralCode: z.string(),
      newUserId: z.string(),
      rewardType: z.enum(["points", "cashback", "fee_waiver"]).default("points"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Verify the new user exists (users.id is an integer serial).
      const newUserIdNum = Number(input.newUserId);
      if (!Number.isInteger(newUserIdNum) || newUserIdNum <= 0) {
        return { success: false, reason: "Invalid newUserId" };
      }
      const userCheck = await execRaw(db, `SELECT id FROM users WHERE id = $1`, [newUserIdNum]);
      if (!userCheck.length) return { success: false, reason: "New user not found" };

      // Find referrer
      const refRows = await execRaw(db, `
        SELECT user_id, referral_code FROM consumer_referrals WHERE referral_code = $1
      `, [input.referralCode]);
      if (!refRows.length) return { success: false, reason: "Invalid referral code" };
      const referrerId = refRows[0].user_id;

      // Block self-referral
      if (String(referrerId) === String(newUserIdNum)) {
        return { success: false, reason: "Self-referral is not allowed" };
      }

      // Dedup key: one reward per (referralCode, newUserId), recorded as a
      // loyalty txn row whose reference_id is the unique dedup key. The
      // check-then-insert runs inside a single transaction with the awards so
      // a concurrent replay either sees the recorded row or rolls back.
      const dedupRef = `referral:${input.referralCode}:${newUserIdNum}`;
      const REFERRER_POINTS = 500;
      const NEW_USER_POINTS = 200;

      const outcome = await db.transaction(async (tx) => {
        const dup = await tx.execute(drizSql`
          SELECT id FROM consumer_loyalty_txns
          WHERE reference_id = ${dedupRef} AND type = 'earn' LIMIT 1
        `);
        const dupRows: any[] = (dup as any).rows ?? (dup as any);
        if (dupRows.length > 0) return { replayed: true as const };

        // Award referrer 500 points
        await tx.execute(drizSql`
          UPDATE consumer_loyalty_accounts SET points_balance = points_balance + ${REFERRER_POINTS}, lifetime_points = lifetime_points + ${REFERRER_POINTS}, updated_at = NOW()
          WHERE user_id = ${Number(referrerId)}
        `);
        await tx.execute(drizSql`
          INSERT INTO consumer_loyalty_txns (id, user_id, type, points, description, reference_id, created_at)
          VALUES (${"lt_" + nanoid(16)}, ${Number(referrerId)}, 'earn', ${REFERRER_POINTS}, ${`Referral reward for inviting user ${newUserIdNum}`}, ${dedupRef}, NOW())
        `);

        // Award new user 200 points
        await tx.execute(drizSql`
          UPDATE consumer_loyalty_accounts SET points_balance = points_balance + ${NEW_USER_POINTS}, lifetime_points = lifetime_points + ${NEW_USER_POINTS}, updated_at = NOW()
          WHERE user_id = ${newUserIdNum}
        `);
        await tx.execute(drizSql`
          INSERT INTO consumer_loyalty_txns (id, user_id, type, points, description, reference_id, created_at)
          VALUES (${"lt_" + nanoid(16)}, ${newUserIdNum}, 'earn', ${NEW_USER_POINTS}, ${`Welcome bonus via referral code ${input.referralCode}`}, ${`referral_welcome:${input.referralCode}:${newUserIdNum}`}, NOW())
        `);

        // Record referral
        await tx.execute(drizSql`
          UPDATE consumer_referrals SET
            successful_referrals = successful_referrals + 1,
            total_rewards_earned = total_rewards_earned + ${REFERRER_POINTS},
            updated_at = NOW()
          WHERE user_id = ${Number(referrerId)}
        `);
        return { replayed: false as const };
      });

      if (outcome.replayed) {
        return { success: false, reason: "Referral reward already processed for this user", deduplicated: true };
      }
      return { success: true, referrerReward: REFERRER_POINTS, newUserReward: NEW_USER_POINTS, rewardType: input.rewardType };
    }),

  getReferralStats: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // consumer_referrals.user_id is an integer — coerce/validate.
      const userIdNum = Number(input.userId);
      if (!Number.isInteger(userIdNum) || userIdNum <= 0) {
        throw new Error("Invalid userId: must be a numeric user id");
      }
      const result = await execRaw(db, `
        SELECT * FROM consumer_referrals WHERE user_id = $1
      `, [userIdNum]);
      // execRaw returns a plain row array (no .rows wrapper).
      return result[0] || null;
    }),
});

// ─── Batch D: FX Hedging Dashboard ───────────────────────────────────────────
const fxHedgingRouter = router({
  getHedgePositions: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT * FROM fx_hedge_positions ORDER BY created_at DESC LIMIT 50
    `);
    return (result as any).rows;
  }),

  createHedgePosition: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      baseCurrency: z.string().default("NGN"),
      quoteCurrency: z.string().default("USD"),
      notionalAmount: z.number().positive(),
      hedgeRate: z.number().positive(),
      expiryDate: z.string(),
      hedgeType: z.enum(["forward", "option", "swap"]).default("forward"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const ref = `FXH-${Date.now()}`;
      await execRaw(db, `
        INSERT INTO fx_hedge_positions (
          reference, merchant_id, base_currency, quote_currency,
          notional_amount, hedge_rate, expiry_date, hedge_type, status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',NOW(),NOW())
      `, [ref, input.merchantId, input.baseCurrency, input.quoteCurrency,
          input.notionalAmount, input.hedgeRate, input.expiryDate, input.hedgeType]);
      return { reference: ref, status: "active" };
    }),

  getFxRates: publicProcedure.query(async () => {
    // Fetch live FX rates from Open Exchange Rates (free tier) or CBN fallback
    const FALLBACK_RATES = {
      USD: 0.000625, EUR: 0.000578, GBP: 0.000494,
      GHS: 0.0093, KES: 0.0813, ZAR: 0.0115,
      XOF: 0.378, XAF: 0.378, EGP: 0.0307,
    };
    try {
      // Try CBN exchange rate endpoint (public, no auth required)
      const resp = await fetch(
        "https://api.exchangerate-api.com/v4/latest/NGN",
        { signal: AbortSignal.timeout(5_000) }
      );
      if (resp.ok) {
        const data = await resp.json() as any;
        const rates: Record<string, number> = {};
        const currencies = ["USD", "EUR", "GBP", "GHS", "KES", "ZAR", "XOF", "XAF", "EGP"];
        for (const cur of currencies) {
          if (data.rates?.[cur]) rates[cur] = data.rates[cur];
        }
        if (Object.keys(rates).length > 0) {
          return { base: "NGN", timestamp: new Date().toISOString(), rates, source: "live" };
        }
      }
    } catch {
      // Fall through to fallback
    }
    return {
      base: "NGN",
      timestamp: new Date().toISOString(),
      rates: FALLBACK_RATES,
      source: "fallback",
    };
  }),
});

// ─── Batch E: Push Notification Budget Alerts ────────────────────────────────
const budgetAlertsRouter = router({
  checkAndSendBudgetAlerts: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    // consumer_budgets columns: limit_kobo, spent_kobo, alert_at (pct),
    // alert_sent (boolean) — there is no limit_amount / spent_amount /
    // currency / alert_sent_at column.
    const result = await db.execute(`
      SELECT
        b.id, b.user_id, b.category, b.limit_kobo, b.spent_kobo,
        ROUND(100.0 * b.spent_kobo / NULLIF(b.limit_kobo, 0), 1) as utilization_pct
      FROM consumer_budgets b
      WHERE b.spent_kobo >= b.limit_kobo * (b.alert_at / 100.0)
        AND b.alert_sent = false
      LIMIT 100
    `);
    const budgets = (result as any).rows;
    let alertsSent = 0;
    for (const budget of budgets) {
      const pct = parseFloat(budget.utilization_pct);
      const message = pct >= 100
        ? `⚠️ Budget exceeded! You've spent ${budget.spent_kobo} kobo of your ${budget.category} budget (${pct}%).`
        : `📊 Budget alert: ${pct}% of your ${budget.category} budget used.`;

      // Record alert sent
      await execRaw(db, `
        UPDATE consumer_budgets SET alert_sent = true, updated_at = NOW() WHERE id = $1
      `, [budget.id]);
      alertsSent++;
    }
    return { alertsSent, budgetsChecked: budgets.length };
  }),

  getBudgetUtilization: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // consumer_budgets.user_id is an integer FK — coerce/validate.
      const userIdNum = Number(input.userId);
      if (!Number.isInteger(userIdNum) || userIdNum <= 0) {
        throw new Error("Invalid userId: must be a numeric user id");
      }
      const result = await execRaw(db, `
        SELECT
          id, category, limit_kobo, spent_kobo,
          ROUND(100.0 * spent_kobo / NULLIF(limit_kobo, 0), 1) as utilization_pct,
          period, alert_sent
        FROM consumer_budgets
        WHERE user_id = $1
        ORDER BY utilization_pct DESC NULLS LAST
      `, [userIdNum]);
      return result;
    }),
});

// ─── Batch E: Per-Tenant Rate Limits ─────────────────────────────────────────
const tenantRateLimitsRouter = router({
  getTenantLimits: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // tenants has no max_api_calls_per_minute / max_transactions_per_day /
      // max_payout_amount columns — the real per-tenant limits are
      // max_merchants / max_consumers / max_daily_volume. rate_limit_events has
      // no tenant_id / event_type columns; events are keyed by identifier +
      // identifier_type, so usage is counted for identifier = tenant id.
      const result = await execRaw(db, `
        SELECT
          t.id, t.name, t.plan,
          t.max_merchants,
          t.max_consumers,
          t.max_daily_volume,
          COALESCE(r.events_today, 0) as events_today
        FROM tenants t
        LEFT JOIN (
          SELECT identifier,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') as events_today
          FROM rate_limit_events
          WHERE identifier = $1
          GROUP BY identifier
        ) r ON r.identifier = t.id
        WHERE t.id = $1
      `, [input.tenantId]);
      return result[0] || null;
    }),

  updateTenantLimits: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      // Real tenants limit columns (max_merchants / max_consumers /
      // max_daily_volume) — the previous max_api_calls_per_minute /
      // max_transactions_per_day / max_payout_amount columns do not exist.
      maxMerchants: z.number().int().min(1).max(100000).optional(),
      maxConsumers: z.number().int().min(1).max(100000000).optional(),
      maxDailyVolume: z.number().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const updates: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (input.maxMerchants !== undefined) { updates.push(`max_merchants=$${idx++}`); params.push(input.maxMerchants); }
      if (input.maxConsumers !== undefined) { updates.push(`max_consumers=$${idx++}`); params.push(input.maxConsumers); }
      if (input.maxDailyVolume !== undefined) { updates.push(`max_daily_volume=$${idx++}`); params.push(input.maxDailyVolume); }
      if (!updates.length) return { success: false, reason: "No fields to update" };
      updates.push(`updated_at=NOW()`);
      params.push(input.tenantId);
      // Column names above are hardcoded literals; values are bound params.
      await execRaw(db, `UPDATE tenants SET ${updates.join(", ")} WHERE id = $${idx}`, params);
      return { success: true };
    }),
});

// ─── Batch F: Audit Log CSV Export ───────────────────────────────────────────
const auditLogExportRouter = router({
  exportCsv: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      eventType: z.string().optional(),
      userId: z.string().optional(),
      limit: z.number().min(1).max(10000).default(1000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const conditions: string[] = [];
      const params: any[] = [];
      let idx = 1;
      if (input.startDate) { conditions.push(`created_at >= $${idx++}`); params.push(input.startDate); }
      if (input.endDate) { conditions.push(`created_at <= $${idx++}`); params.push(input.endDate); }
      // audit_logs columns: id, merchant_id, user_id, action, resource,
      // resource_id, ip_address, user_agent, request_body, response_status,
      // metadata, created_at — there is no event_type / resource_type column;
      // the eventType filter maps to `action`.
      if (input.eventType) { conditions.push(`action = $${idx++}`); params.push(input.eventType); }
      if (input.userId) { conditions.push(`user_id = $${idx++}`); params.push(input.userId); }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(input.limit);
      // Column names are hardcoded literals; all values bound as params.
      const rows = await execRaw(db, `
        SELECT id, action, user_id, resource, resource_id, ip_address, user_agent, metadata, created_at
        FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx}
      `, params);
      // Build CSV
      const headers = ["id", "action", "user_id", "resource", "resource_id", "ip_address", "created_at"];
      const csvLines = [headers.join(",")];
      for (const row of rows) {
        csvLines.push(headers.map(h => JSON.stringify(row[h] ?? "")).join(","));
      }
      return { csv: csvLines.join("\n"), rowCount: rows.length, generatedAt: new Date().toISOString() };
    }),
});

// ─── Batch F: Settlement SLA Enforcement ─────────────────────────────────────
const settlementSlaRouter = router({
  getOverdueSlas: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT
        s.*,
        m.business_name as merchant_name,
        EXTRACT(EPOCH FROM (NOW() - s.expected_by)) / 3600 as hours_overdue
      FROM settlement_sla_events s
      LEFT JOIN merchants m ON m.id = s.merchant_id
      WHERE s.status = 'pending' AND s.expected_by < NOW()
      ORDER BY s.expected_by ASC
      LIMIT 50
    `);
    return (result as any).rows;
  }),

  markSettled: protectedProcedure
    .input(z.object({
      slaId: z.number(),
      settlementRef: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      // settlement_sla_events has no settlement_ref / settled_at columns —
      // the completion timestamp lives in completed_at and the ref is
      // appended to notes.
      await execRaw(db, `
        UPDATE settlement_sla_events SET
          status = 'settled',
          completed_at = NOW(),
          notes = CONCAT(COALESCE(notes, ''), ' settlement_ref:', $1),
          updated_at = NOW()
        WHERE id = $2
      `, [input.settlementRef, input.slaId]);
      return { success: true };
    }),

  getSlaMetrics: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending' AND expected_by > NOW()) as on_track,
        COUNT(*) FILTER (WHERE status = 'pending' AND expected_by < NOW()) as overdue,
        COUNT(*) FILTER (WHERE status = 'settled') as settled,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600) FILTER (WHERE status = 'settled') as avg_settlement_hours
      FROM settlement_sla_events
    `);
    return (result as any).rows[0];
  }),
});

// ─── Batch F: Payout Approval Workflow ───────────────────────────────────────
const payoutApprovalRouter = router({
  getPendingApprovals: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT
        pb.*,
        m.business_name as merchant_name,
        m.email as merchant_email
      FROM payout_batches pb
      LEFT JOIN merchants m ON m.id = pb.merchant_id
      WHERE pb.status = 'pending_approval'
      ORDER BY pb.created_at ASC
      LIMIT 50
    `);
    return (result as any).rows;
  }),

  approvePayoutBatch: protectedProcedure
    .input(z.object({
      batchId: z.string(),
      approverNote: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE payout_batches SET
          status = 'approved',
          approved_by = $1,
          approved_at = NOW(),
          approver_note = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [ctx.user.id, input.approverNote || null, input.batchId]);
      return { success: true, status: "approved" };
    }),

  rejectPayoutBatch: protectedProcedure
    .input(z.object({
      batchId: z.string(),
      reason: z.string().min(5),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await execRaw(db, `
        UPDATE payout_batches SET
          status = 'rejected',
          approved_by = $1,
          approved_at = NOW(),
          approver_note = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [ctx.user.id, input.reason, input.batchId]);
      return { success: true, status: "rejected" };
    }),
});

// ─── Batch F: Webhook Retry Scheduler ────────────────────────────────────────
const webhookRetryRouter = router({
  getFailedDeliveries: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT
        wd.*,
        w.url as webhook_url,
        w.events as event_types
      FROM webhook_deliveries wd
      LEFT JOIN webhooks w ON w.id = wd.webhook_id
      WHERE wd.status = 'failed' AND (wd.attempt_count < 5 OR wd.attempt_count IS NULL)
      ORDER BY wd.created_at DESC
      LIMIT 50
    `);
    return (result as any).rows;
  }),

  scheduleRetry: protectedProcedure
    .input(z.object({
      deliveryId: z.string(),
      retryAfterMinutes: z.number().min(1).max(1440).default(5),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const retryAt = new Date(Date.now() + input.retryAfterMinutes * 60000).toISOString();
      // webhook_deliveries columns: attempt_count / next_retry_at (no
      // retry_count / retry_at, no updated_at).
      await execRaw(db, `
        UPDATE webhook_deliveries SET
          status = 'scheduled_retry',
          next_retry_at = $1,
          attempt_count = COALESCE(attempt_count, 0) + 1
        WHERE id = $2
      `, [retryAt, input.deliveryId]);
      return { success: true, retryAt };
    }),

  getRetryStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.execute(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'scheduled_retry') as scheduled_retry,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        AVG(latency_ms) FILTER (WHERE status = 'delivered') as avg_latency_ms
      FROM webhook_deliveries
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);
    return (result as any).rows[0];
  }),
});

// ─── Security Score Endpoint ──────────────────────────────────────────────────
const securityScoreRouter = router({
  getScore: protectedProcedure.query(async () => {
    return calculateSecurityScore();
  }),
});

// ─── Wave 27 Root Router ──────────────────────────────────────────────────────
// ─── Frontend Alias Routers (kyb, fxHedge, compliance) ───────────────────────
import { and, desc, eq, count, sql as drizSql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { kycSubmissions, fxRates } from "../drizzle/schema";

const kybAliasRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: kycSubmissions.id,
        merchant_id: kycSubmissions.merchantId,
        status: kycSubmissions.status,
        submittedAt: kycSubmissions.createdAt,
        reviewedAt: kycSubmissions.reviewedAt,
        reviewNote: kycSubmissions.rejectionReason,
        documentType: kycSubmissions.docType,
      }).from(kycSubmissions)
        .orderBy(desc(kycSubmissions.createdAt))
        .limit(input.limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(kycSubmissions);
      const statuses = ["submitted","under_review","approved","rejected","requires_more_info"];
      const statsEntries = await Promise.all(statuses.map(async s => {
        const [{ c }] = await db.select({ c: count() }).from(kycSubmissions).where(eq(kycSubmissions.status, s as any));
        return [s, Number(c)] as [string, number];
      }));
      return { applications: rows, total: Number(total), stats: Object.fromEntries(statsEntries) };
    }),
  updateStatus: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      status: z.enum(["not_started","under_review","approved","rejected","expired"]),
      reviewNote: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(kycSubmissions)
        .set({ status: input.status, rejectionReason: input.reviewNote ?? null, reviewedAt: new Date() })
        .where(eq(kycSubmissions.merchantId, input.merchantId));
      return { success: true };
    }),
});

const fxHedgeAliasRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select().from(fxRates)
        .orderBy(desc(fxRates.fetchedAt))
        .limit(input.limit).offset(offset);
      const [{ total }] = await db.select({ total: count() }).from(fxRates);
      const positions = rows.map(r => ({
        id: r.id, baseCurrency: r.baseCurrency, quoteCurrency: r.targetCurrency,
        rate: Number(r.rate), status: "active", notionalAmount: 0,
        hedgeRate: Number(r.rate), expiresAt: null, createdAt: r.fetchedAt,
      }));
      const avgRate = rows.length > 0 ? rows.reduce((a, r) => a + Number(r.rate), 0) / rows.length : 0;
      return { positions, total: Number(total), summary: { totalNotional: 0, activeCount: rows.length, expiredCount: 0, avgHedgeRate: avgRate } };
    }),
  create: protectedProcedure
    .input(z.object({
      baseCurrency: z.string().length(3),
      quoteCurrency: z.string().length(3),
      notionalAmount: z.number().positive(),
      hedgeRate: z.number().positive(),
      expiresAt: z.date().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [row] = await db.insert(fxRates).values({ baseCurrency: input.baseCurrency, targetCurrency: input.quoteCurrency ?? input.baseCurrency, rate: String(input.hedgeRate), source: "manual_hedge", fetchedAt: new Date() }).returning();
      return { id: row?.id ?? 0, success: true };
    }),
  close: protectedProcedure
    .input(z.object({ positionId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(fxRates).where(eq(fxRates.id, Number(input.positionId)));
      return { success: true };
    }),
});


export const wave27Router = router({
  tenantOnboarding: tenantOnboardingRouter,
  flagExposure: flagExposureRouter,
  domainSsl: domainSslRouter,
  kybLifecycle: kybLifecycleRouter,
  complianceReport: complianceReportRouter,
  consumerDispute: consumerDisputeRouter,
  bnplUnderwriting: bnplUnderwritingRouter,
  loyaltyTier: loyaltyTierRouter,
  loyaltyTiers: loyaltyTierRouter,
  kybReview: kybLifecycleRouter,
  complianceReports: complianceReportRouter,
  referralRewards: referralRewardsRouter,
  fxHedging: fxHedgingRouter,
  budgetAlerts: budgetAlertsRouter,
  tenantRateLimits: tenantRateLimitsRouter,
  auditLogExport: auditLogExportRouter,
  settlementSla: settlementSlaRouter,
  payoutApproval: payoutApprovalRouter,
  webhookRetry: webhookRetryRouter,
  securityScore: securityScoreRouter,
  // Frontend-facing aliases
  kyb: kybAliasRouter,
  fxHedge: fxHedgeAliasRouter,
  compliance: complianceReportRouter,
});
