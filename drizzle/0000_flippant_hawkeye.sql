CREATE SCHEMA "job_agent";
--> statement-breakpoint
CREATE TYPE "job_agent"."run_status" AS ENUM('running', 'completed', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "job_agent"."workplace_type" AS ENUM('remote', 'hybrid', 'onsite', 'unknown');--> statement-breakpoint
CREATE TABLE "job_agent"."agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"status" "job_agent"."run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched" integer DEFAULT 0 NOT NULL,
	"valid" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "agent_runs_run_id_unique" UNIQUE("run_id"),
	CONSTRAINT "agent_runs_nonnegative_counts" CHECK ("job_agent"."agent_runs"."fetched" >= 0 AND "job_agent"."agent_runs"."valid" >= 0 AND "job_agent"."agent_runs"."rejected" >= 0),
	CONSTRAINT "agent_runs_time_order" CHECK ("job_agent"."agent_runs"."finished_at" IS NULL OR "job_agent"."agent_runs"."finished_at" >= "job_agent"."agent_runs"."started_at")
);
--> statement-breakpoint
CREATE TABLE "job_agent"."companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
CREATE TABLE "job_agent"."jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"location" text,
	"workplace_type" "job_agent"."workplace_type" DEFAULT 'unknown' NOT NULL,
	"salary_min" numeric,
	"salary_max" numeric,
	"salary_currency" text,
	"canonical_url" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_canonical_url_unique" UNIQUE("canonical_url"),
	CONSTRAINT "jobs_seen_order" CHECK ("job_agent"."jobs"."last_seen_at" >= "job_agent"."jobs"."first_seen_at")
);
--> statement-breakpoint
CREATE TABLE "job_agent"."source_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_account" text NOT NULL,
	"external_id" text NOT NULL,
	"source_url" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_refs_identity_unique" UNIQUE("source","source_account","external_id"),
	CONSTRAINT "source_refs_seen_order" CHECK ("job_agent"."source_refs"."last_seen_at" >= "job_agent"."source_refs"."first_seen_at")
);
--> statement-breakpoint
ALTER TABLE "job_agent"."jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "job_agent"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_agent"."source_refs" ADD CONSTRAINT "source_refs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "job_agent"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_company_idx" ON "job_agent"."jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "source_refs_job_idx" ON "job_agent"."source_refs" USING btree ("job_id");