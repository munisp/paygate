import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const severityEnum = pgEnum("severity", ["warn", "critical"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Persisted alert threshold settings (one row per owner, keyed by openId).
 */
export const alertThresholds = pgTable("alert_thresholds", {
  id: serial("id").primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull().unique(),
  lagWarn: integer("lagWarn").notNull().default(5),
  lagCritical: integer("lagCritical").notNull().default(20),
  memWarnPct: integer("memWarnPct").notNull().default(70),
  memCriticalPct: integer("memCriticalPct").notNull().default(85),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AlertThresholds = typeof alertThresholds.$inferSelect;
export type InsertAlertThresholds = typeof alertThresholds.$inferInsert;

/**
 * Breach event log — one row per threshold crossing detected by checkBreaches.
 */
export const breachEvents = pgTable("breach_events", {
  id: serial("id").primaryKey(),
  metric: varchar("metric", { length: 64 }).notNull(),
  severity: severityEnum("severity").notNull(),
  message: text("message").notNull(),
  value: integer("value").notNull(),
  threshold: integer("threshold").notNull(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledgedAt"),
});

export type BreachEvent = typeof breachEvents.$inferSelect;
export type InsertBreachEvent = typeof breachEvents.$inferInsert;

/**
 * Named alert rules — per-metric, per-target (e.g. per consumer group or per Redis node).
 */
export const namedAlertRules = pgTable("named_alert_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  metric: varchar("metric", { length: 64 }).notNull(),
  target: varchar("target", { length: 128 }).notNull(),
  severity: severityEnum("severity").notNull(),
  threshold: integer("threshold").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type NamedAlertRule = typeof namedAlertRules.$inferSelect;
export type InsertNamedAlertRule = typeof namedAlertRules.$inferInsert;
