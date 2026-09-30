import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Keep agent data separate from Supabase's public API schema.
export const agentSchema = pgSchema("job_agent");
export const workplaceType = agentSchema.enum("workplace_type", [
  "remote",
  "hybrid",
  "onsite",
  "unknown",
]);
export const runStatus = agentSchema.enum("run_status", [
  "running",
  "completed",
  "partial",
  "failed",
]);

export const companies = agentSchema.table("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const jobs = agentSchema.table(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    // Nullable for rows created before hashing; populated when next observed.
    contentHash: text("content_hash"),
    location: text("location"),
    workplaceType: workplaceType("workplace_type").default("unknown").notNull(),
    salaryMin: numeric("salary_min"),
    salaryMax: numeric("salary_max"),
    salaryCurrency: text("salary_currency"),
    canonicalUrl: text("canonical_url").notNull().unique(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("jobs_company_idx").on(table.companyId),
    check("jobs_seen_order", sql`${table.lastSeenAt} >= ${table.firstSeenAt}`),
  ],
);

export const sourceRefs = agentSchema.table(
  "source_refs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    source: text("source").notNull(),
    // Board/site (including region for Lever) scopes IDs that are not globally unique.
    sourceAccount: text("source_account").notNull(),
    externalId: text("external_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("source_refs_identity_unique").on(table.source, table.sourceAccount, table.externalId),
    index("source_refs_job_idx").on(table.jobId),
    check("source_refs_seen_order", sql`${table.lastSeenAt} >= ${table.firstSeenAt}`),
  ],
);

export const agentRuns = agentSchema.table(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: text("run_id").notNull().unique(),
    status: runStatus("status").default("running").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    fetched: integer("fetched").default(0).notNull(),
    valid: integer("valid").default(0).notNull(),
    rejected: integer("rejected").default(0).notNull(),
  },
  (table) => [
    check(
      "agent_runs_nonnegative_counts",
      sql`${table.fetched} >= 0 AND ${table.valid} >= 0 AND ${table.rejected} >= 0`,
    ),
    check(
      "agent_runs_time_order",
      sql`${table.finishedAt} IS NULL OR ${table.finishedAt} >= ${table.startedAt}`,
    ),
  ],
);
