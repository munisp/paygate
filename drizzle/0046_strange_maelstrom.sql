CREATE TYPE "public"."ai_decision_type" AS ENUM('APPROVE', 'REVIEW', 'BLOCK', 'FLAG');--> statement-breakpoint
CREATE TYPE "public"."ai_model_status" AS ENUM('training', 'active', 'archived', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_model_type" AS ENUM('gnn_fraud', 'credit_scoring', 'anomaly_detection', 'churn_prediction', 'aml_detection');--> statement-breakpoint
CREATE TYPE "public"."gnn_job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "ai_audit_trail" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text,
	"merchant_id" text,
	"model_id" text,
	"decision" "ai_decision_type" NOT NULL,
	"confidence" real NOT NULL,
	"risk_score" real,
	"features" text,
	"explanation" text,
	"latency_ms" integer,
	"tools_used" text,
	"art_steps" integer,
	"overridden_by" text,
	"override_reason" text,
	"overridden_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_model_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"model_type" "ai_model_type" NOT NULL,
	"version" text NOT NULL,
	"status" "ai_model_status" DEFAULT 'training' NOT NULL,
	"accuracy" real,
	"precision" real,
	"recall" real,
	"f1_score" real,
	"auc_roc" real,
	"feature_count" integer,
	"training_records" integer,
	"artifact_path" text,
	"hyperparameters" text,
	"trained_by" text,
	"trained_at" timestamp,
	"deployed_at" timestamp,
	"archived_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gnn_training_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"model_type" "ai_model_type" DEFAULT 'gnn_fraud' NOT NULL,
	"status" "gnn_job_status" DEFAULT 'queued' NOT NULL,
	"epochs" integer DEFAULT 50 NOT NULL,
	"hidden_dims" integer DEFAULT 256 NOT NULL,
	"learning_rate" real DEFAULT 0.001 NOT NULL,
	"batch_size" integer DEFAULT 256 NOT NULL,
	"current_epoch" integer DEFAULT 0 NOT NULL,
	"train_loss" real,
	"val_loss" real,
	"best_accuracy" real,
	"dataset_size" integer,
	"artifact_path" text,
	"error_message" text,
	"triggered_by" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_audit_txn_idx" ON "ai_audit_trail" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ai_audit_merchant_idx" ON "ai_audit_trail" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "ai_audit_decision_idx" ON "ai_audit_trail" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "ai_audit_created_idx" ON "ai_audit_trail" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_model_type_idx" ON "ai_model_registry" USING btree ("model_type");--> statement-breakpoint
CREATE INDEX "ai_model_status_idx" ON "ai_model_registry" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gnn_job_status_idx" ON "gnn_training_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gnn_job_created_idx" ON "gnn_training_jobs" USING btree ("created_at");