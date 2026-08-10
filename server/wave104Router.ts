import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { bridgeFetch } from "./middlewareBridge";

// ─── Admin Data Pipeline Router ───────────────────────────────────────────────
// Provides Airflow DAG status, dbt model runs, and NiFi flow health
// for the AdminDataPipeline.tsx page.
export const adminDataPipelineRouter = router({
  /**
   * List Airflow DAGs with last run status
   */
  listDags: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ input }) => {
      // Try to fetch from Airflow REST API via bridge; fall back to mock
      const result = await bridgeFetch("/v1/airflow/dags", "GET").catch(() => null);
      if (result && Array.isArray((result as any).dags)) {
        return (result as any).dags as Array<{
          dag_id: string; description: string; is_active: boolean;
          last_run_state: string; last_run_at: string; schedule_interval: string;
        }>;
      }
      // Fallback: return empty list — UI will show "no data" state
      return [] as Array<{
        dag_id: string; description: string; is_active: boolean;
        last_run_state: string; last_run_at: string; schedule_interval: string;
      }>;
    }),

  /**
   * Trigger an Airflow DAG run
   */
  triggerDag: protectedProcedure
    .input(z.object({ dagId: z.string(), conf: z.record(z.string(), z.any()).optional() }))
    .mutation(async ({ input }) => {
      const result = await bridgeFetch("/v1/airflow/trigger", "POST", {
        dag_id: input.dagId,
        conf: input.conf ?? {},
      });
      if (!result) return { triggered: false, fallback: true, runId: null };
      return { triggered: true, fallback: false, runId: (result as any).run_id ?? null };
    }),

  /**
   * List dbt model run results
   */
  listDbtRuns: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ input }) => {
      const result = await bridgeFetch("/v1/dbt/runs", "GET").catch(() => null);
      if (result && Array.isArray((result as any).runs)) {
        return (result as any).runs as Array<{
          run_id: string; model_name: string; status: string;
          started_at: string; completed_at: string; rows_affected: number;
        }>;
      }
      return [] as Array<{
        run_id: string; model_name: string; status: string;
        started_at: string; completed_at: string; rows_affected: number;
      }>;
    }),

  /**
   * List NiFi flow health metrics
   */
  listNifiFlows: protectedProcedure
    .query(async () => {
      const result = await bridgeFetch("/v1/nifi/flows", "GET").catch(() => null);
      if (result && Array.isArray((result as any).flows)) {
        return (result as any).flows as Array<{
          id: string; name: string; status: string;
          queued_count: number; bytes_in: number; bytes_out: number;
        }>;
      }
      return [] as Array<{
        id: string; name: string; status: string;
        queued_count: number; bytes_in: number; bytes_out: number;
      }>;
    }),
});
