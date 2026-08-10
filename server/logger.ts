/**
 * Structured logger using Winston.
 * In production: outputs JSON to stdout (compatible with Datadog, CloudWatch, Loki).
 * In development: outputs colourised, human-readable text.
 */
import winston from "winston";

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "HH:mm:ss.SSS" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${ts} [${level}] ${message}${metaStr}${stack ? `\n${stack}` : ""}`;
  })
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  format: process.env.NODE_ENV === "production" ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

// ─── Convenience helpers ─────────────────────────────────────────────────────

/** Log an HTTP request summary (used by tRPC onError and mobile bridge). */
export function logRequest(method: string, path: string, statusCode: number, durationMs: number, meta?: Record<string, unknown>) {
  logger.info("http_request", { method, path, statusCode, durationMs, ...meta });
}

/** Log a tRPC procedure call. */
export function logProcedure(path: string, type: "query" | "mutation" | "subscription", durationMs: number, ok: boolean, meta?: Record<string, unknown>) {
  const level = ok ? "info" : "warn";
  logger[level]("trpc_procedure", { path, type, durationMs, ok, ...meta });
}

/** Log a background worker heartbeat. */
export function logWorker(name: string, message: string, meta?: Record<string, unknown>) {
  logger.debug("worker", { worker: name, message, ...meta });
}

/** Log an external API call result. */
export function logExternalCall(service: string, endpoint: string, statusCode: number, durationMs: number, ok: boolean, meta?: Record<string, unknown>) {
  const level = ok ? "info" : "warn";
  logger[level]("external_call", { service, endpoint, statusCode, durationMs, ok, ...meta });
}
