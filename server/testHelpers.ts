/**
 * testHelpers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared test utilities for the PayGate test suite.
 *
 * Key export: `PG_AVAILABLE` — a boolean that is true only when a live
 * PostgreSQL instance is reachable at PG_DATABASE_URL.  Use with
 * `describe.skipIf(!PG_AVAILABLE)` or `it.skipIf(!PG_AVAILABLE)` to
 * gracefully skip PG-dependent tests in MySQL/sandbox environments.
 */

import net from "net";

const PG_URL =
  process.env.PG_DATABASE_URL ??
  "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_db";

/**
 * Parse host and port from a PostgreSQL connection string.
 * Handles: postgresql://user:pass@host:port/db
 */
function parsePgHostPort(url: string): { host: string; port: number } {
  try {
    const u = new URL(url);
    return { host: u.hostname || "127.0.0.1", port: parseInt(u.port || "5432", 10) };
  } catch {
    return { host: "127.0.0.1", port: 5432 };
  }
}

/**
 * Synchronously probe TCP connectivity to PG host:port.
 * Returns a promise that resolves to true if connectable within 500ms.
 */
async function probePg(): Promise<boolean> {
  const { host, port } = parsePgHostPort(PG_URL);
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 500);
    socket.connect(port, host, () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

// Eagerly probe at module load time so tests can use the result synchronously.
// The probe result is cached for the lifetime of the test process.
let _pgAvailable: boolean | null = null;

export async function checkPgAvailable(): Promise<boolean> {
  if (_pgAvailable !== null) return _pgAvailable;
  _pgAvailable = await probePg();
  return _pgAvailable;
}

// Synchronous accessor — only valid after checkPgAvailable() has been awaited.
export function isPgAvailable(): boolean {
  return _pgAvailable ?? false;
}

/**
 * PG_AVAILABLE — top-level await so test files can import this directly.
 * Usage:
 *   import { PG_AVAILABLE } from "./testHelpers";
 *   describe.skipIf(!PG_AVAILABLE)("My PG tests", () => { ... });
 */
export const PG_AVAILABLE: boolean = await probePg();

/**
 * Convenience wrapper: returns a describe block that skips if PG is unavailable.
 * Usage:
 *   pgDescribe("My PG tests", () => { ... });
 */
export function pgDescribe(name: string, fn: () => void) {
  if (PG_AVAILABLE) {
    return { name, fn };
  }
  return { name: `[SKIPPED — no PG] ${name}`, fn: () => {} };
}
