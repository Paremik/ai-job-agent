import type { Job } from "../domain/job.js";
import { normalizeJobUrl } from "../domain/job-url.js";
import type { DiscoveryContext, JobSource, SourceError, SourceStats } from "./job-source.js";

export type OrchestratedSourceError = SourceError & { source: string };

export type JobDiscoveryResult = {
  jobs: Job[];
  observations: Job[];
  stats: SourceStats;
  errors: OrchestratedSourceError[];
};

/** Runs configured sources concurrently, preserving successful results when another source fails. */
export class JobSourceOrchestrator {
  private readonly sources: JobSource[];

  constructor(sources: JobSource[]) {
    const names = new Set<string>();
    for (const source of sources) {
      const name = source.name.trim();
      if (!name) throw new Error("Job source name cannot be empty");
      if (names.has(name)) throw new Error(`Duplicate job source name: ${name}`);
      names.add(name);
    }
    this.sources = [...sources];
  }

  async discover(context: DiscoveryContext): Promise<JobDiscoveryResult> {
    const results = await Promise.all(
      this.sources.map(async (source) => {
        try {
          return { source, result: await source.discover(context), failure: undefined };
        } catch (error) {
          return { source, result: undefined, failure: error };
        }
      }),
    );

    const uniqueJobs = new Map<string, Job>();
    // Preserve all source references even when the display list is deduplicated.
    const observations: Job[] = [];
    const errors: OrchestratedSourceError[] = [];
    const stats: SourceStats = { fetched: 0, valid: 0, rejected: 0 };

    for (const { source, result, failure } of results) {
      if (!result) {
        errors.push({
          source: source.name,
          code: `${source.name.toUpperCase()}_SOURCE_FAILED`,
          message: failure instanceof Error ? failure.message : "Unknown source failure.",
          retryable: true,
        });
        continue;
      }

      stats.fetched += result.stats.fetched;
      stats.rejected += result.stats.rejected;
      for (const error of result.errors) errors.push({ ...error, source: source.name });

      for (const job of result.jobs) {
        observations.push(job);
        const key = normalizeJobUrl(job.canonicalUrl);
        if (!uniqueJobs.has(key)) uniqueJobs.set(key, job);
      }
    }

    const jobs = [...uniqueJobs.values()];
    stats.valid = jobs.length;
    return { jobs, observations, stats, errors };
  }
}
