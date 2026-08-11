/**
 * Wave 225 — Temporal Saga Wiring
 *
 * Provides three mechanisms for keeping saga_instances in sync with Temporal:
 *
 * 1. `updateSagaStep` — called by the Go bridge to push individual step updates
 *    from Temporal workflow history events into saga_instances.
 *
 * 2. `getTemporalStatus` — queries the Temporal HTTP API (if TEMPORAL_HOST_PORT
 *    is set) to return raw workflow execution status.
 *
 * 3. `syncFromTemporal` — batch-sync from Temporal event history, called by
 *    the Go bridge after workflow completion.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sagaInstances } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { env } from "../_core/env";

// ─── Temporal HTTP API helper ─────────────────────────────────────────────────
async function fetchTemporalWorkflow(workflowId: string, runId?: string) {
  const host = (env as Record<string, unknown>)["temporalHostPort"] as string | undefined;
  if (!host) return null;

  const [hostname] = host.split(":");
  const baseUrl = `http://${hostname}:7243`;

  try {
    const path = runId
      ? `/api/v1/namespaces/default/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}`
      : `/api/v1/namespaces/default/workflows/${encodeURIComponent(workflowId)}`;

    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return null;
    return (await res.json()) as Record<string, any>;
  } catch {
    return null;
  }
}

// ─── Temporal event → step status mapping ────────────────────────────────────
const TEMPORAL_STATUS_MAP: Record<string, "pending" | "active" | "completed" | "failed"> = {
  WORKFLOW_EXECUTION_STARTED: "active",
  WORKFLOW_EXECUTION_COMPLETED: "completed",
  WORKFLOW_EXECUTION_FAILED: "failed",
  WORKFLOW_EXECUTION_TIMED_OUT: "failed",
  WORKFLOW_EXECUTION_CANCELED: "failed",
  ACTIVITY_TASK_STARTED: "active",
  ACTIVITY_TASK_COMPLETED: "completed",
  ACTIVITY_TASK_FAILED: "failed",
  ACTIVITY_TASK_TIMED_OUT: "failed",
};

// ─── Router ──────────────────────────────────────────────────────────────────
export const sagaWiringRouter = router({
  /**
   * Called by the Go bridge to push a saga step update from Temporal workflow
   * history into the saga_instances table.
   */
  updateSagaStep: protectedProcedure
    .input(
      z.object({
        sagaId: z.string(),
        stepIndex: z.number().int().min(0),
        stepName: z.string(),
        status: z.enum(["pending", "active", "completed", "failed"]),
        temporalWorkflowId: z.string().optional(),
        temporalRunId: z.string().optional(),
        errorMessage: z.string().optional(),
        completedAt: z.date().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      const [saga] = await db
        .select()
        .from(sagaInstances)
        .where(eq(sagaInstances.id, input.sagaId))
        .limit(1);

      if (!saga) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Saga ${input.sagaId} not found` });
      }

      let steps: Array<{
        name: string;
        status: string;
        completedAt?: string;
        errorMessage?: string;
      }> = [];

      try {
        steps = JSON.parse((saga.steps as string) ?? "[]");
      } catch {
        steps = [];
      }

      while (steps.length <= input.stepIndex) {
        steps.push({ name: `Step ${steps.length + 1}`, status: "pending" });
      }

      steps[input.stepIndex] = {
        name: input.stepName,
        status: input.status,
        ...(input.completedAt ? { completedAt: input.completedAt.toISOString() } : {}),
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      };

      const allCompleted = steps.every((s) => s.status === "completed");
      const anyFailed = steps.some((s) => s.status === "failed");
      const overallStatus = anyFailed ? "failed" : allCompleted ? "completed" : "running";

      await db
        .update(sagaInstances)
        .set({
          steps: JSON.stringify(steps),
          status: overallStatus,
          ...(input.temporalWorkflowId ? { workflowId: input.temporalWorkflowId } : {}),
          ...(input.temporalRunId ? { runId: input.temporalRunId } : {}),
          ...(overallStatus !== "running" ? { completedAt: new Date() } : {}),
        })
        .where(eq(sagaInstances.id, input.sagaId));

      return { updated: true, overallStatus };
    }),

  /**
   * Returns the live Temporal workflow execution status.
   * Falls back gracefully if Temporal HTTP API is not available.
   */
  getTemporalStatus: publicProcedure
    .input(
      z.object({
        workflowId: z.string(),
        runId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const data = await fetchTemporalWorkflow(input.workflowId, input.runId);
      if (!data) {
        return {
          available: false,
          status: null,
          startTime: null,
          closeTime: null,
          historyLength: null,
          workflowType: null,
        };
      }

      const exec = data?.workflowExecutionInfo ?? data?.execution_info ?? {};
      const rawStatus = exec?.status ?? exec?.execution?.status ?? "UNKNOWN";

      return {
        available: true,
        status: rawStatus,
        startTime: exec?.startTime ?? exec?.start_time ?? null,
        closeTime: exec?.closeTime ?? exec?.close_time ?? null,
        historyLength: exec?.historyLength ?? exec?.history_length ?? null,
        workflowType: exec?.type?.name ?? exec?.workflow_type?.name ?? null,
      };
    }),

  /**
   * Batch-sync: reads Temporal event history and updates all saga steps in DB.
   * Called by the Go bridge after workflow completion.
   */
  syncFromTemporal: protectedProcedure
    .input(
      z.object({
        sagaId: z.string(),
        workflowId: z.string(),
        runId: z.string().optional(),
        events: z.array(
          z.object({
            eventType: z.string(),
            eventTime: z.string().optional(),
            activityName: z.string().optional(),
            failure: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      const [saga] = await db
        .select()
        .from(sagaInstances)
        .where(eq(sagaInstances.id, input.sagaId))
        .limit(1);

      if (!saga) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Saga ${input.sagaId} not found` });
      }

      const activityEvents = input.events.filter(
        (e) => e.eventType.startsWith("ACTIVITY_TASK_") && e.activityName
      );

      const stepMap = new Map<
        string,
        { status: "pending" | "active" | "completed" | "failed"; completedAt?: string; errorMessage?: string }
      >();

      const statusOrder: Record<string, number> = { pending: 0, active: 1, completed: 2, failed: 2 };

      for (const ev of activityEvents) {
        const name = ev.activityName!;
        const status = TEMPORAL_STATUS_MAP[ev.eventType] ?? "pending";
        const existing = stepMap.get(name);

        if (!existing || statusOrder[status] > statusOrder[existing.status]) {
          stepMap.set(name, {
            status,
            completedAt: ev.eventTime,
            errorMessage: ev.failure,
          });
        }
      }

      const steps = Array.from(stepMap.entries()).map(([name, s]) => ({ name, ...s }));

      const allCompleted = steps.every((s) => s.status === "completed");
      const anyFailed = steps.some((s) => s.status === "failed");
      const overallStatus = anyFailed ? "failed" : allCompleted ? "completed" : "running";

      await db
        .update(sagaInstances)
        .set({
          steps: JSON.stringify(steps),
          status: overallStatus,
          workflowId: input.workflowId,
          runId: input.runId,
          ...(overallStatus !== "running" ? { completedAt: new Date() } : {}),
        })
        .where(eq(sagaInstances.id, input.sagaId));

      return { synced: true, stepCount: steps.length, overallStatus };
    }),
});
