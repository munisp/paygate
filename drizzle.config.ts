import { defineConfig } from "drizzle-kit";

// The Manus platform injects a MySQL/TiDB DATABASE_URL.
// This project uses PostgreSQL (pg-core), so we always use the local PG instance.
const PG_URL =
  process.env.PG_DATABASE_URL ??
  "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: PG_URL,
  },
});
