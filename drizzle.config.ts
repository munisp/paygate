import { defineConfig } from "drizzle-kit";

// PostgreSQL is the database of choice for PayGate.
// PG_DATABASE_URL overrides the local default (useful in production/staging).
const PG_URL =
  process.env.PG_DATABASE_URL ??
  "postgresql://paygate_user:paygate_dev_2026@127.0.0.1:5432/paygate_db";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: PG_URL,
  },
});
