import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

const sharedAlias = {
  "@": path.resolve(templateRoot, "client", "src"),
  "@shared": path.resolve(templateRoot, "shared"),
  "@assets": path.resolve(templateRoot, "attached_assets"),
};

// The PG test files that require pg-mem (in-memory PostgreSQL emulator).
// wave25.test.ts is replaced by wave25.pg.test.ts (pg-mem tests) +
// wave25.health.test.ts (server-health tests, handled by server-health-tests project).
const PG_TEST_FILES = [
  "server/wave25.pg.test.ts",
  "server/wave27.test.ts",
  "server/wave81.multitenant.test.ts",
  "server/wave82.security29.test.ts",
  "server/wave83.security30.test.ts",
  "server/wave84.security31.test.ts",
  "server/smoke.test.ts",
  "server/db.pg.test.ts",
];

// Server health test files that require a running HTTP server
const HEALTH_TEST_FILES = [
  "server/wave25.health.test.ts",
];

// Files excluded from standard-tests (handled by other projects)
const NON_STANDARD_FILES = [
  ...PG_TEST_FILES,
  ...HEALTH_TEST_FILES,
  // Keep original wave25.test.ts excluded (replaced by the two split files above)
  "server/wave25.test.ts",
];

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: sharedAlias,
  },
  test: {
    environment: "node",
    projects: [
      // ── Project 1: PG test files — use pg-mem via globalSetup + vi.mock('pg') ──
      {
        test: {
          name: "pg-tests",
          environment: "node",
          include: PG_TEST_FILES,
          // Global setup: starts TCP listener on port 5433 so PG_AVAILABLE checks pass
          globalSetup: ["./server/pgGlobalSetup.ts"],
          // Setup file: activates vi.mock('pg') → uses __mocks__/pg.ts (pg-mem)
          setupFiles: ["./server/pgSetupFile.ts"],
          env: {
            // Use port 5433 (not 5432) so only pg-tests project sees PG_AVAILABLE=true.
            // Other test files (wave25, wave26) check port 5432 which stays closed.
            PG_DATABASE_URL:
              "postgresql://paygate:paygate_dev_2026@127.0.0.1:5433/paygate_dev",
          },
        },
        resolve: {
          alias: sharedAlias,
        },
      },
      // ── Project 2: Server health tests — start a mock HTTP server ──────────
      {
        test: {
          name: "server-health-tests",
          environment: "node",
          include: HEALTH_TEST_FILES,
          // Global setup: starts a minimal mock Express server on port 3000
          globalSetup: ["./server/serverHealthGlobalSetup.ts"],
        },
        resolve: {
          alias: sharedAlias,
        },
      },
      // ── Project 3: All other test files — normal execution without pg-mem ──
      {
        test: {
          name: "standard-tests",
          environment: "node",
          include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
          exclude: NON_STANDARD_FILES,
        },
        resolve: {
          alias: sharedAlias,
        },
      },
    ],
  },
});
