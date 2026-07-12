import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here

/**
 * Persisted alert threshold settings (one row per owner, keyed by openId).
 * Stores warning and critical thresholds for consumer lag (messages) and
 * Redis memory utilization (percent). Defaults are applied in the router
 * when no row exists yet.
 */
export const alertThresholds = mysqlTable("alert_thresholds", {
  id: int("id").autoincrement().primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull().unique(),
  lagWarn: int("lagWarn").notNull().default(5),
  lagCritical: int("lagCritical").notNull().default(20),
  memWarnPct: int("memWarnPct").notNull().default(70),
  memCriticalPct: int("memCriticalPct").notNull().default(85),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlertThresholds = typeof alertThresholds.$inferSelect;
export type InsertAlertThresholds = typeof alertThresholds.$inferInsert;

/**
 * Breach event log — one row per threshold crossing detected by checkBreaches.
 * Supports the /alerts history page with sorting, filtering, and acknowledgement.
 */
export const breachEvents = mysqlTable("breach_events", {
  id: int("id").autoincrement().primaryKey(),
  /** "kafka_lag" | "redis_memory" */
  metric: varchar("metric", { length: 64 }).notNull(),
  /** "warn" | "critical" */
  severity: mysqlEnum("severity", ["warn", "critical"]).notNull(),
  /** Human-readable description, e.g. "audit-archiver lag=45 (critical >20)" */
  message: text("message").notNull(),
  /** Raw metric value at time of breach */
  value: int("value").notNull(),
  /** Threshold that was crossed */
  threshold: int("threshold").notNull(),
  /** Whether the operator has acknowledged this event */
  acknowledged: int("acknowledged").notNull().default(0),
  /** UTC epoch ms when the breach was detected */
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  /** UTC epoch ms when it was acknowledged (null = unacknowledged) */
  acknowledgedAt: timestamp("acknowledgedAt"),
});

export type BreachEvent = typeof breachEvents.$inferSelect;
export type InsertBreachEvent = typeof breachEvents.$inferInsert;
