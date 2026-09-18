import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    env: {
      // Default test database (CI provides a PG service on 5432). Override with
      // PAYGATE_TEST_DATABASE_URL for local/alternative test databases.
      DATABASE_URL: process.env.PAYGATE_TEST_DATABASE_URL ?? "postgresql://paygate:paygate_secret@localhost:5432/paygate_monitor",
      // Legacy suites read PG_DATABASE_URL directly; point them at the same
      // test database so real-PG gates execute instead of failing to connect.
      PG_DATABASE_URL: process.env.PAYGATE_TEST_DATABASE_URL ?? "postgresql://paygate:paygate_secret@localhost:5432/paygate_monitor",
    },
    testTimeout: 15000,
  },
});
