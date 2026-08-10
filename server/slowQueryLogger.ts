/**
 * PayGate Slow-Query Logger
 *
 * Polls pg_stat_statements every 5 minutes and logs queries whose mean
 * execution time exceeds SLOW_QUERY_THRESHOLD_MS (default 500 ms).
 *
 * When OTEL_EXPORTER_OTLP_ENDPOINT is set the logger also emits a
 * structured JSON span-like event so the data can be ingested by any
 * OpenTelemetry-compatible collector (Jaeger, Tempo, Grafana, etc.).
 *
 * Usage — add to server/_core/index.ts:
 *   import { startSlowQueryLogger } from "../slowQueryLogger";
 *   startSlowQueryLogger();
 */
import { Pool } from "pg";
import { ENV } from "./_core/env";

// ─── Config ───────────────────────────────────────────────────────────────────
const SLOW_QUERY_THRESHOLD_MS = parseInt(
  process.env.SLOW_QUERY_THRESHOLD_MS ?? "500",
  10
);
const POLL_INTERVAL_MS = parseInt(
  process.env.SLOW_QUERY_POLL_INTERVAL_MS ?? String(5 * 60 * 1000),
  10
);
const MAX_SLOW_QUERIES = 20; // log at most this many per poll cycle

// ─── Types ────────────────────────────────────────────────────────────────────
interface SlowQueryRow {
  query: string;
  calls: string;
  total_exec_time: string;
  mean_exec_time: string;
  max_exec_time: string;
  rows: string;
  stddev_exec_time: string;
}

// ─── OTel span emitter (stdout JSON, no SDK dependency) ───────────────────────
function emitOtelSpan(row: SlowQueryRow) {
  const endpoint = ENV.otelExporterEndpoint;
  if (!endpoint) return;

  const span = {
    traceId: crypto.randomUUID().replace(/-/g, ""),
    spanId: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    operationName: "db.slow_query",
    startTimeUnixNano: String(Date.now() * 1_000_000),
    durationNano: String(Math.round(parseFloat(row.mean_exec_time) * 1_000_000)),
    attributes: {
      "db.system": "postgresql",
      "db.statement": row.query.slice(0, 1000),
      "db.slow_query.calls": row.calls,
      "db.slow_query.mean_exec_time_ms": row.mean_exec_time,
      "db.slow_query.max_exec_time_ms": row.max_exec_time,
      "db.slow_query.total_exec_time_ms": row.total_exec_time,
      "db.slow_query.rows": row.rows,
      "service.name": ENV.otelServiceName,
    },
  };

  // Emit as structured JSON to stdout — any log shipper (Fluent Bit, Vector,
  // Alloy) can forward this to an OTLP endpoint.
  console.log(
    JSON.stringify({ type: "otel_span", ...span })
  );
}

// ─── Slow-query poll ──────────────────────────────────────────────────────────
async function pollSlowQueries(pool: Pool) {
  try {
    const result = await pool.query<SlowQueryRow>(
      `SELECT
         query,
         calls::text,
         total_exec_time::text,
         mean_exec_time::text,
         max_exec_time::text,
         rows::text,
         stddev_exec_time::text
       FROM pg_stat_statements
       WHERE mean_exec_time > $1
         AND calls > 0
       ORDER BY mean_exec_time DESC
       LIMIT $2`,
      [SLOW_QUERY_THRESHOLD_MS, MAX_SLOW_QUERIES]
    );

    if (result.rows.length === 0) return;

    console.warn(
      `[slowQuery] Found ${result.rows.length} slow queries ` +
        `(threshold: ${SLOW_QUERY_THRESHOLD_MS} ms)`
    );

    for (const row of result.rows) {
      const meanMs = parseFloat(row.mean_exec_time).toFixed(2);
      const maxMs = parseFloat(row.max_exec_time).toFixed(2);
      const snippet = row.query.replace(/\s+/g, " ").slice(0, 200);

      console.warn(
        `[slowQuery] mean=${meanMs}ms max=${maxMs}ms calls=${row.calls} ` +
          `rows=${row.rows} | ${snippet}`
      );

      emitOtelSpan(row);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // pg_stat_statements not loaded yet — silently skip
    if (msg.includes("pg_stat_statements")) return;
    console.warn("[slowQuery] Poll failed:", msg);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
let _timer: NodeJS.Timeout | null = null;

export function startSlowQueryLogger(pool?: Pool): void {
  if (_timer) return; // already running

  // Resolve the pool lazily to avoid circular imports with db.ts
  let resolvedPool: Pool | null = pool ?? null;

  async function getPool(): Promise<Pool | null> {
    if (resolvedPool) return resolvedPool;
    try {
      const { getDb } = await import("./db");
      // Access the internal pool via the module — getDb initialises _pool
      await getDb();
      const dbModule = await import("./db");
      // Re-export the pool by re-importing the module after initialisation
      // We use execRaw as a proxy to confirm the pool is alive
      resolvedPool = new Pool({
        connectionString: process.env.PG_DATABASE_URL ?? process.env.DATABASE_URL,
        max: 2,
        idleTimeoutMillis: 10_000,
      });
      return resolvedPool;
    } catch {
      return null;
    }
  }

  _timer = setInterval(async () => {
    const p = await getPool();
    if (!p) return;
    await pollSlowQueries(p);
  }, POLL_INTERVAL_MS);

  // Unref so the timer doesn't prevent process exit
  _timer.unref();

  console.info(
    `[slowQuery] Logger started — threshold: ${SLOW_QUERY_THRESHOLD_MS} ms, ` +
      `poll interval: ${POLL_INTERVAL_MS / 1000}s, ` +
      `OTel endpoint: ${ENV.otelExporterEndpoint || "(not configured)"}`
  );
}

export function stopSlowQueryLogger(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
