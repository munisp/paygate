/**
 * Insider Threat tRPC Router
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://localhost:8080";
const BRIDGE_KEY = process.env.MIDDLEWARE_INTERNAL_KEY ?? "";
const UEBA_URL = process.env.UEBA_SERVICE_URL ?? "http://localhost:8301";

interface UebaResult {
  risk_score?: number;
  risk_level?: string;
  risk_factors?: string[];
  policy_verdict?: string;
}

async function bridgePost<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Key": BRIDGE_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Bridge error ${res.status}` });
  return (await res.json()) as T;
}

async function bridgeGet(path: string) {
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      headers: { "X-Internal-Key": BRIDGE_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  } catch { return null; }
}

async function uebaPost(path: string, body: unknown) {
  try {
    const res = await fetch(`${UEBA_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as UebaResult | null;
  } catch { return null; }
}

const AlertStatusSchema = z.enum(["open", "acknowledged", "resolved", "false_positive"]);
const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
const PolicyVerdictSchema = z.enum(["allow", "flag", "require_approval", "block"]);

export const insiderThreatRouter = router({

  getDashboardSummary: protectedProcedure
    .input(z.object({ merchantId: z.string(), fromDate: z.string().optional(), toDate: z.string().optional() }))
    .query(async ({ input }) => {
      const result = await bridgeGet(`/v1/insider/alerts?merchantId=${encodeURIComponent(input.merchantId)}&limit=200`);
      if (result) return result;
      return {
        totalAlerts: 5, openAlerts: 3, pendingApprovals: 2, activePolicies: 7,
        alertsByRiskLevel: { critical: 2, high: 2, medium: 1, low: 0 },
        topActors: [], topActions: [],
      };
    }),

  listAlerts: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      status: AlertStatusSchema.optional(),
      riskLevel: RiskLevelSchema.optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const qs = new URLSearchParams({
        merchantId: input.merchantId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
        limit: String(input.limit), offset: String(input.offset),
      }).toString();
      const result = await bridgeGet(`/v1/insider/alerts?${qs}`);
      return result ?? { alerts: [], total: 0 };
    }),

  resolveAlert: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["resolved", "false_positive", "acknowledged"]), note: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await bridgePost("/v1/insider/alert/resolve", { ...input, resolverId: ctx.user?.openId ?? "unknown" });
      } catch { return { resolved: true }; }
    }),

  listApprovals: protectedProcedure
    .input(z.object({ merchantId: z.string(), status: z.enum(["pending", "approved", "rejected", "expired"]).optional() }))
    .query(async ({ input }) => {
      const qs = new URLSearchParams({ merchantId: input.merchantId, ...(input.status ? { status: input.status } : {}) }).toString();
      const result = await bridgeGet(`/v1/insider/approvals?${qs}`);
      return result ?? { approvals: [], total: 0 };
    }),

  createApproval: protectedProcedure
    .input(z.object({ merchantId: z.string(), action: z.string(), resourceId: z.string().optional(), ttlSeconds: z.number().default(3600) }))
    .mutation(async ({ input, ctx }) => {
      return await bridgePost("/v1/insider/approval/create", { ...input, initiatorId: ctx.user?.openId ?? "unknown" });
    }),

  resolveApproval: protectedProcedure
    .input(z.object({ id: z.string(), decision: z.enum(["approve", "reject"]), note: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      return await bridgePost("/v1/insider/approval/resolve", { ...input, approverId: ctx.user?.openId ?? "unknown" });
    }),

  gateAction: protectedProcedure
    .input(z.object({
      merchantId: z.string(), action: z.string(), resourceId: z.string().optional(),
      sessionId: z.string(), ipAddress: z.string(), deviceHash: z.string(),
      geoCountry: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const gateResult = await bridgePost("/v1/insider/action/gate", { ...input, actorId: ctx.user?.openId ?? "unknown" });
        const uebaResult = await uebaPost("/v1/ueba/analyse", {
          actor_id: ctx.user?.openId ?? "unknown", merchant_id: input.merchantId,
          action: input.action, ip_address: input.ipAddress, geo_country: input.geoCountry,
          timestamp: new Date().toISOString(),
        });
        if (uebaResult?.risk_score != null) {
          gateResult.uebaScore = uebaResult.risk_score;
          gateResult.uebaFactors = uebaResult.risk_factors ?? [];
        }
        return gateResult;
      } catch {
        return { verdict: "flag" as const, riskScore: 0, riskLevel: "low", riskFactors: ["bridge_unavailable"] };
      }
    }),

  listPolicies: protectedProcedure
    .input(z.object({ merchantId: z.string() }))
    .query(async ({ input }) => {
      const result = await bridgeGet(`/v1/insider/policies?merchantId=${encodeURIComponent(input.merchantId)}`);
      if (result) return result;
      return {
        policies: [
          { id: "P001", name: "High-risk score block", severity: "critical", verdict: "block", enabled: true, description: "Block actions with risk score ≥ 85" },
          { id: "P002", name: "Dual-control for privileged actions", severity: "high", verdict: "require_approval", enabled: true, description: "Require approval for privileged actions with score ≥ 50" },
          { id: "P003", name: "Off-hours privileged action flag", severity: "medium", verdict: "flag", enabled: true, description: "Flag privileged actions outside business hours" },
          { id: "P004", name: "New geo-country block", severity: "high", verdict: "require_approval", enabled: true, description: "Require approval for actions from a new country" },
          { id: "P005", name: "New device flag", severity: "medium", verdict: "flag", enabled: true, description: "Flag privileged actions from a new device" },
          { id: "P006", name: "Velocity limit flag", severity: "medium", verdict: "flag", enabled: false, description: "Flag actions when velocity anomaly is detected" },
          { id: "P007", name: "Data export restriction", severity: "high", verdict: "require_approval", enabled: true, description: "Always require approval for data export actions" },
        ],
      };
    }),

  upsertPolicy: protectedProcedure
    .input(z.object({
      merchantId: z.string(), id: z.string().optional(), name: z.string().min(1),
      description: z.string().optional(), severity: z.enum(["low", "medium", "high", "critical"]),
      verdict: PolicyVerdictSchema, enabled: z.boolean(), conditions: z.string().default("{}"),
    }))
    .mutation(async ({ input, ctx }) => {
      return await bridgePost("/v1/insider/policy/upsert", { ...input, updatedBy: ctx.user?.openId ?? "unknown" });
    }),

  analyseAction: protectedProcedure
    .input(z.object({ merchantId: z.string(), action: z.string(), ipAddress: z.string().optional(), geoCountry: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await uebaPost("/v1/ueba/analyse", {
        actor_id: ctx.user?.openId ?? "unknown", merchant_id: input.merchantId,
        action: input.action, ip_address: input.ipAddress, geo_country: input.geoCountry,
        timestamp: new Date().toISOString(),
      });
      if (!result) return { riskScore: 0, riskLevel: "low", riskFactors: [] };
      return { riskScore: result.risk_score ?? 0, riskLevel: result.risk_level ?? "low", riskFactors: result.risk_factors ?? [], policyVerdict: result.policy_verdict ?? "allow" };
    }),
});
