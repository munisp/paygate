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

    return {
      items: [
        { id: "stripe_claimed", label: "Stripe sandbox claimed", status: stripeMode !== "unconfigured" ? "ok" : "pending", detail: stripeMode === "live" ? "Live keys active" : stripeMode === "test" ? "Test keys active — swap for live keys before go-live" : "Not configured", actionUrl: "https://dashboard.stripe.com/claim_sandbox/YWNjdF8xVEFBTkRSaTdHR0FyY3hXLDE3NzM5MzcwNjcv100Ox49WXeJ", actionLabel: "Claim Stripe Sandbox", sandboxExpiry: "2026-05-11T16:17:47.000Z" },
        { id: "stripe_live_keys", label: "Stripe live keys configured", status: stripeMode === "live" ? "ok" : "pending", detail: stripeMode === "live" ? "sk_live_* and pk_live_* keys are set" : "Still using test keys — update after Stripe KYC", actionUrl: null, actionLabel: "Update in Settings → Secrets" },
        { id: "stripe_webhook", label: "Stripe webhook secret configured", status: stripeWebhook ? "ok" : "pending", detail: stripeWebhook ? "Webhook secret is set" : "STRIPE_WEBHOOK_SECRET not set", actionUrl: null, actionLabel: "Update in Settings → Secrets" },
        { id: "jwt_secret", label: "JWT secret is strong (≥32 chars)", status: jwtSecret.length >= 32 ? "ok" : "warning", detail: jwtSecret.length >= 32 ? "JWT_SECRET is strong" : "JWT_SECRET is too short — rotate it", actionUrl: null, actionLabel: "Rotate in Settings → Secrets" },
        { id: "admin_user", label: "First admin user promoted", status: adminCount > 0 ? "ok" : "pending", detail: adminCount > 0 ? `${adminCount} admin user(s) exist` : "No admin users — use the Admin Setup wizard", actionUrl: "/admin-setup", actionLabel: "Open Admin Setup" },
        { id: "database", label: "Production database connected", status: dbUrl && !dbUrl.includes("localhost") && !dbUrl.includes("127.0.0.1") ? "ok" : "warning", detail: dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1") ? "Using local DB — switch to a managed cloud database" : "Production DB URL is set", actionUrl: null, actionLabel: "Update DATABASE_URL in Settings → Secrets" },
        { id: "domain", label: "Custom domain bound", status: "info", detail: "Bind a custom domain in Settings \u2192 Domains", actionUrl: null, actionLabel: "Open Settings \u2192 Domains" },
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
});
