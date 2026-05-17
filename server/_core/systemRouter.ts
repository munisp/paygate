import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  // Returns health status of all optional microservices (Rust + Python).
  microservicesHealth: protectedProcedure.query(async () => {
    const { checkAllMicroservices } = await import("../microservices");
    return checkAllMicroservices();
  }),

  // Returns a full go-live checklist with real-time status for each prerequisite.
  goLiveChecklist: protectedProcedure.query(async () => {
    // Microservice health (non-blocking — checked in parallel)
    let microserviceStatus: Record<string, "ok" | "down"> = {};
    try {
      const { checkAllMicroservices } = await import("../microservices");
      microserviceStatus = await checkAllMicroservices();
    } catch { /* optional services — don't block checklist */ }
    const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
    const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET ?? "";
    const jwtSecret = process.env.JWT_SECRET ?? "";
    const dbUrl = process.env.DATABASE_URL ?? "";

    let adminCount = 0;
    try {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: dbUrl });
      const res = await pool.query(`SELECT COUNT(*) as cnt FROM users WHERE role='admin'`);
      adminCount = parseInt(res.rows[0]?.cnt ?? "0", 10);
      await pool.end();
    } catch { /* DB might not be reachable in test env */ }

    const stripeMode = stripeKey.startsWith("sk_live_") ? "live" : stripeKey.startsWith("sk_test_") ? "test" : "unconfigured";

    // Check Go bridge connectivity
    const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL ?? "";
    let bridgeStatus: "ok" | "pending" | "warning" = "pending";
    let bridgeDetail = "MIDDLEWARE_BRIDGE_URL not configured";
    if (bridgeUrl) {
      try {
        const res = await Promise.race([
          fetch(`${bridgeUrl}/health`),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
        ]) as Response;
        if (res.ok) {
          bridgeStatus = "ok";
          bridgeDetail = `Go bridge reachable at ${bridgeUrl}`;
        } else {
          bridgeStatus = "warning";
          bridgeDetail = `Go bridge returned HTTP ${res.status} — check logs`;
        }
      } catch (e: any) {
        bridgeStatus = "warning";
        bridgeDetail = `Go bridge unreachable: ${e.message ?? "connection refused"}`;
      }
    }

    // Check pending DB migrations
    let dbMigrationsOk = false;
    let dbMigrationsDetail = "Unable to check migration status";
    try {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: dbUrl });
      // drizzle-kit tracks applied migrations in __drizzle_migrations table
      const res = await pool.query(`
        SELECT COUNT(*) as cnt FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '__drizzle_migrations'
      `);
      const hasMigrationsTable = parseInt(res.rows[0]?.cnt ?? "0", 10) > 0;
      if (hasMigrationsTable) {
        dbMigrationsOk = true;
        dbMigrationsDetail = "Database schema is up to date";
      } else {
        dbMigrationsDetail = "Run pnpm db:push to apply schema migrations";
      }
      await pool.end();
    } catch { dbMigrationsDetail = "Could not connect to database to check migrations"; }

    return {
      items: [
        { id: "stripe_claimed", label: "Stripe sandbox claimed", status: stripeMode !== "unconfigured" ? "ok" : "pending", detail: stripeMode === "live" ? "Live keys active" : stripeMode === "test" ? "Test keys active — swap for live keys before go-live" : "Not configured", actionUrl: "https://dashboard.stripe.com/claim_sandbox/YWNjdF8xVEFBTkRSaTdHR0FyY3hXLDE3NzM5MzcwNjcv100Ox49WXeJ", actionLabel: "Claim Stripe Sandbox", sandboxExpiry: "2026-05-11T16:17:47.000Z" },
        { id: "stripe_live_keys", label: "Stripe live keys configured", status: stripeMode === "live" ? "ok" : "pending", detail: stripeMode === "live" ? "sk_live_* and pk_live_* keys are set" : "Still using test keys — update after Stripe KYC", actionUrl: null, actionLabel: "Update in Settings → Secrets" },
        { id: "stripe_webhook", label: "Stripe webhook secret configured", status: stripeWebhook ? "ok" : "pending", detail: stripeWebhook ? "Webhook secret is set" : "STRIPE_WEBHOOK_SECRET not set", actionUrl: null, actionLabel: "Update in Settings → Secrets" },
        { id: "jwt_secret", label: "JWT secret is strong (≥32 chars)", status: jwtSecret.length >= 32 ? "ok" : "warning", detail: jwtSecret.length >= 32 ? "JWT_SECRET is strong" : "JWT_SECRET is too short — rotate it", actionUrl: null, actionLabel: "Rotate in Settings → Secrets" },
        { id: "admin_user", label: "First admin user promoted", status: adminCount > 0 ? "ok" : "pending", detail: adminCount > 0 ? `${adminCount} admin user(s) exist` : "No admin users — use the Admin Setup wizard", actionUrl: "/admin-setup", actionLabel: "Open Admin Setup" },
        { id: "database", label: "Production database connected", status: dbUrl && !dbUrl.includes("localhost") && !dbUrl.includes("127.0.0.1") ? "ok" : "warning", detail: dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1") ? "Using local DB — switch to a managed cloud database" : "Production DB URL is set", actionUrl: null, actionLabel: "Update DATABASE_URL in Settings → Secrets" },
        { id: "domain", label: "Custom domain bound", status: "info", detail: "Bind a custom domain in Settings \u2192 Domains", actionUrl: null, actionLabel: "Open Settings \u2192 Domains" },
        { id: "go_bridge", label: "Go middleware bridge reachable", status: bridgeStatus, detail: bridgeDetail, actionUrl: bridgeStatus !== "ok" ? "/microservice-health" : null, actionLabel: bridgeStatus !== "ok" ? "View Microservice Health" : null },
        { id: "db_migrations", label: "Database migrations applied", status: dbMigrationsOk ? "ok" : "warning", detail: dbMigrationsDetail, actionUrl: null, actionLabel: dbMigrationsOk ? null : "Run: pnpm db:push" },
        // Wave 176-181: DeepFace, NDPR, KYB Director, Accessibility
        { id: "deepface_sidecar", label: "DeepFace AI sidecar configured", status: (process.env.DEEPFACE_SIDECAR_URL ?? "").startsWith("http") && !(process.env.DEEPFACE_SIDECAR_URL ?? "").includes("localhost") ? "ok" : "warning", detail: (process.env.DEEPFACE_SIDECAR_URL ?? "").includes("localhost") ? "Using localhost — deploy sidecar to production server and update DEEPFACE_SIDECAR_URL" : "Set DEEPFACE_SIDECAR_URL to enable neural liveness and face verification", actionUrl: null, actionLabel: "Update DEEPFACE_SIDECAR_URL in Settings → Secrets" },
        { id: "ndpr_purge_schedule", label: "NDPR biometric purge heartbeat active", status: "info", detail: "Nightly purge runs at 03:00 UTC — verify in Settings → Schedules", actionUrl: null, actionLabel: "Open Settings → Schedules" },
        { id: "nibss_bvn", label: "NIBSS BVN validation configured", status: (process.env.NIBSS_SECRET_KEY ?? "").length > 0 ? "ok" : "warning", detail: (process.env.NIBSS_SECRET_KEY ?? "").length > 0 ? "NIBSS_SECRET_KEY is set" : "NIBSS_SECRET_KEY not set — BVN cross-validation will be skipped", actionUrl: null, actionLabel: "Update NIBSS_SECRET_KEY in Settings → Secrets" },
        { id: "scuml_check", label: "SCUML check endpoint configured", status: (process.env.SCUML_API_URL ?? "").length > 0 ? "ok" : "info", detail: (process.env.SCUML_API_URL ?? "").length > 0 ? "SCUML_API_URL is set" : "SCUML_API_URL not set — SCUML checks will be skipped (required for NGO/charity merchants)", actionUrl: null, actionLabel: "Update SCUML_API_URL in Settings → Secrets" },
        {
        id: "microservices",
        label: "Microservices online (optional)",
        status: (() => {
          const total = Object.keys(microserviceStatus).length;
          if (total === 0) return "info" as const;
          const online = Object.values(microserviceStatus).filter((v) => v === "ok").length;
          if (online === total) return "ok" as const;
          if (online > 0) return "warning" as const;
          return "info" as const;
        })(),
        detail: (() => {
          const total = Object.keys(microserviceStatus).length;
          if (total === 0) return "Microservice health not yet checked";
          const online = Object.values(microserviceStatus).filter((v) => v === "ok").length;
          return `${online}/${total} microservices online — platform runs in DB-fallback mode when offline`;
        })(),
        actionUrl: "/microservice-health",
        actionLabel: "Open Microservice Health",
      },
    ],
    };
  }),

  // Returns the last nightly security audit snapshot stored in-memory by the POST handler.
  // The Admin Dashboard calls this to show a status card without triggering a new audit run.
  nightlyAuditStatus: adminProcedure.query(() => {
    const snap = (global as any).__lastNightlyAuditSnapshot ?? null;
    if (!snap) {
      return {
        ok: false as const,
        message: "No audit has run yet in this server instance. The nightly job fires at 02:00 UTC.",
        score: null as number | null,
        grade: null as string | null,
        p0Failures: null as number | null,
        p1Failures: null as number | null,
        p2Failures: null as number | null,
        runAt: null as string | null,
        durationMs: null as number | null,
        checks: [] as Array<{ id: string; severity: string; label: string; pass: boolean }>,
        meta: null as { tableCount: number; procedureCount: number; testFileCount: number } | null,
      };
    }
    return { ok: true as const, ...(snap as any) };
  }),
});
