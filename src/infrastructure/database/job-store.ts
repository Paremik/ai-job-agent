import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { DiscoveryContext } from "../../sources/job-source.js";
import type { JobDiscoveryResult } from "../../sources/job-source-orchestrator.js";
import { normalizeJobUrl } from "../../domain/job-url.js";
import type { createDatabase } from "./client.js";
import { normalizeCompanyName, planJobs, type JobObservation } from "./job-plan.js";
import { agentRuns, companies, jobs, sourceRefs } from "./schema.js";

type Database = ReturnType<typeof createDatabase>["db"];

export async function startRun(db: Database, context: DiscoveryContext) {
  await db.insert(agentRuns).values({ runId: context.runId, startedAt: context.startedAt });
}

export async function failRun(db: Database, runId: string) {
  await db
    .update(agentRuns)
    .set({ status: "failed", finishedAt: new Date() })
    .where(eq(agentRuns.runId, runId));
}

export async function saveDiscovery(
  db: Database,
  runId: string,
  result: JobDiscoveryResult,
  sourceAccounts: ReadonlyMap<string, string>,
) {
  const observations: JobObservation[] = result.observations.map((job) => {
    const sourceAccount = sourceAccounts.get(job.source);
    if (!sourceAccount) throw new Error("Missing source account configuration");
    return { job, sourceAccount };
  });

  return db.transaction(async (tx) => {
    // Serialize only the short save phase. Concurrent discovery/network work stays independent.
    await tx.execute(sql`select pg_advisory_xact_lock(17290431)`);
    let counts = { created: 0, updated: 0, unchanged: 0, sourceRefs: 0 };
    if (observations.length > 0) {
      const companyRows = [
        ...new Map(
          observations.map(({ job }) => {
            const normalizedName = normalizeCompanyName(job.company);
            return [normalizedName, { normalizedName, name: job.company.trim() }] as const;
          }),
        ).values(),
      ];
      const savedCompanies = await tx
        .insert(companies)
        .values(companyRows)
        .onConflictDoUpdate({
          target: companies.normalizedName,
          set: { name: sql`excluded.name` },
        })
        .returning();

      const scopes = [...sourceAccounts].map(([source, account]) =>
        and(
          eq(sourceRefs.source, source),
          eq(sourceRefs.sourceAccount, account),
          inArray(
            sourceRefs.externalId,
            observations
              .filter(({ job }) => job.source === source)
              .map(({ job }) => job.externalId),
          ),
        ),
      );
      const refs = await tx
        .select()
        .from(sourceRefs)
        .where(or(...scopes));
      const oldJobs = await tx
        .select()
        .from(jobs)
        .where(
          or(
            inArray(
              jobs.id,
              refs.map((ref) => ref.jobId),
            ),
            inArray(
              jobs.canonicalUrl,
              observations.map(({ job }) => normalizeJobUrl(job.canonicalUrl)),
            ),
          ),
        );
      const plan = planJobs(
        observations,
        oldJobs,
        refs,
        new Map(savedCompanies.map((company) => [company.normalizedName, company.id])),
      );

      // Batches keep parameter counts and SQL message sizes bounded.
      for (let offset = 0; offset < plan.jobs.length; offset += 100) {
        await tx
          .insert(jobs)
          .values(plan.jobs.slice(offset, offset + 100))
          .onConflictDoUpdate({
            target: jobs.id,
            set: {
              companyId: sql`excluded.company_id`,
              title: sql`excluded.title`,
              description: sql`excluded.description`,
              contentHash: sql`excluded.content_hash`,
              location: sql`excluded.location`,
              workplaceType: sql`excluded.workplace_type`,
              salaryMin: sql`excluded.salary_min`,
              salaryMax: sql`excluded.salary_max`,
              salaryCurrency: sql`excluded.salary_currency`,
              canonicalUrl: sql`excluded.canonical_url`,
              lastSeenAt: sql`excluded.last_seen_at`,
            },
          });
      }
      for (let offset = 0; offset < plan.refs.length; offset += 100) {
        await tx
          .insert(sourceRefs)
          .values(plan.refs.slice(offset, offset + 100))
          .onConflictDoUpdate({
            target: [sourceRefs.source, sourceRefs.sourceAccount, sourceRefs.externalId],
            set: { sourceUrl: sql`excluded.source_url`, lastSeenAt: sql`excluded.last_seen_at` },
          });
      }
      counts = plan.counts;
    }
    const status =
      result.errors.length === 0 ? "completed" : observations.length > 0 ? "partial" : "failed";
    const completed = await tx
      .update(agentRuns)
      .set({
        status,
        finishedAt: new Date(),
        ...result.stats,
      })
      .where(eq(agentRuns.runId, runId))
      .returning({ id: agentRuns.id });
    if (completed.length !== 1) throw new Error("Discovery run was not started");
    return counts;
  });
}
