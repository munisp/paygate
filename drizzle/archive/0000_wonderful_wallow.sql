CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('warn', 'critical');--> statement-breakpoint
CREATE TABLE "alert_thresholds" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerOpenId" varchar(64) NOT NULL,
	"lagWarn" integer DEFAULT 5 NOT NULL,
	"lagCritical" integer DEFAULT 20 NOT NULL,
	"memWarnPct" integer DEFAULT 70 NOT NULL,
	"memCriticalPct" integer DEFAULT 85 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "alert_thresholds_ownerOpenId_unique" UNIQUE("ownerOpenId")
);
--> statement-breakpoint
CREATE TABLE "breach_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric" varchar(64) NOT NULL,
	"severity" "severity" NOT NULL,
	"message" text NOT NULL,
	"value" integer NOT NULL,
	"threshold" integer NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"detectedAt" timestamp DEFAULT now() NOT NULL,
	"acknowledgedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "named_alert_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"metric" varchar(64) NOT NULL,
	"target" varchar(128) NOT NULL,
	"severity" "severity" NOT NULL,
	"threshold" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
