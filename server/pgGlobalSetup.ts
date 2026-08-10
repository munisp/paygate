/**
 * pgGlobalSetup.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vitest globalSetup that starts a TCP listener on port 5433 so the
 * PG_AVAILABLE TCP check in the 8 PG test files resolves to `true`.
 *
 * We use port 5433 (not 5432) to avoid interfering with other test files
 * (wave25, wave26, etc.) that also check port 5432 but use MySQL/Drizzle.
 *
 * The PG_DATABASE_URL env var in vitest.config.ts is set to port 5433 for
 * the pg-tests project, so only those 8 files see PG_AVAILABLE = true.
 *
 * This runs ONCE before all test files (in the main process, not workers).
 * Referenced in vitest.config.ts as `globalSetup: ['./server/pgGlobalSetup.ts']`
 */
import net from "net";

let server: net.Server | null = null;

export async function setup() {
  // Start a TCP listener on port 5433 so PG_AVAILABLE checks pass for pg-tests project
  server = net.createServer((socket) => {
    // Accept connections silently — pg-mem handles actual queries via vi.mock('pg')
    socket.end();
  });

  await new Promise<void>((resolve, reject) => {
    server!.listen(5433, "127.0.0.1", () => {
      console.log("[pgGlobalSetup] TCP listener started on 127.0.0.1:5433");
      resolve();
    });
    server!.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        // Port already in use — that's fine
        console.log("[pgGlobalSetup] Port 5433 already in use — skipping mock listener");
        server = null;
        resolve();
      } else {
        reject(err);
      }
    });
  });
}

export async function teardown() {
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => {
        console.log("[pgGlobalSetup] TCP listener stopped");
        resolve();
      });
    });
  }
}
