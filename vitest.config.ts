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
      // Ensure PostgreSQL is always used in tests (not MySQL/TiDB)
      PG_DATABASE_URL:
        process.env.PG_DATABASE_URL ??
        "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev",
    },
  },
});
