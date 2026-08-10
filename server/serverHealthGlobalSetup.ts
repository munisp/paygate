/**
 * serverHealthGlobalSetup.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vitest globalSetup for the `server-health-tests` project.
 *
 * Starts a minimal mock HTTP server that implements /api/health with a
 * realistic response. Automatically finds a free port (tries 3099, 3098, ...
 * to avoid conflicting with the dev server on 3000).
 *
 * Sets process.env.SERVER_PORT so wave25.health.test.ts connects to the
 * correct port.
 */
import http from "http";
import net from "net";

let server: http.Server | null = null;

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => { s.close(); resolve(true); });
    s.listen(port, "127.0.0.1");
  });
}

async function findFreePort(candidates: number[]): Promise<number> {
  for (const port of candidates) {
    if (await isPortFree(port)) return port;
  }
  throw new Error("No free port found for mock server");
}

export async function setup() {
  // Prefer port 3099; fall back to 3098, 3097, ... to avoid dev server on 3000
  const port = await findFreePort([3099, 3098, 3097, 3096, 3095, 3094, 3093]);

  server = http.createServer((req, res) => {
    const url = req.url ?? "";

    if (url === "/api/health" || url.startsWith("/api/health?")) {
      const body = JSON.stringify({
        status: "ok",
        timestamp: Date.now(),
        service: "paygate-merchant",
        version: "1.0.0",
        checks: {
          database: "ok",
          bridge: "configured",
          circuitBreakers: "all_closed",
        },
        circuitBreakers: [],
        integrations: {
          stripe: true,
          vtpass: false,
          termii: false,
          youverify: false,
          nip: false,
          webPush: false,
          pushService: false,
        },
      });

      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        // Security headers expected by the health test
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      });
      res.end(body);
      return;
    }

    // 404 for all other routes
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server!.listen(port, "127.0.0.1", () => {
      console.log(`[serverHealthGlobalSetup] Mock server started on port ${port}`);
      // Inject the port so test files can read it via process.env.SERVER_PORT
      process.env.SERVER_PORT = String(port);
      resolve();
    });
    server!.on("error", reject);
  });
}

export async function teardown() {
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => {
        console.log("[serverHealthGlobalSetup] Mock server stopped");
        resolve();
      });
    });
    server = null;
  }
}
