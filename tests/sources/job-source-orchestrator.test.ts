import { describe, expect, it } from "vitest";
import type { Job } from "../../src/domain/job.js";
import type { DiscoveryContext, JobSource, SourceResult } from "../../src/sources/job-source.js";
import { JobSourceOrchestrator } from "../../src/sources/job-source-orchestrator.js";

const context: DiscoveryContext = {
  runId: "orchestrator-test",
  startedAt: new Date("2026-09-30T00:00:00.000Z"),
};
const job = (id: string, url = `https://jobs.example.com/${id}`): Job => ({
  id,
  externalId: id,
  source: "test",
  company: "Test Company",
  title: `Job ${id}`,
  description: "",
  location: null,
  workplaceType: "unknown",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  sourceUrl: url,
  canonicalUrl: url,
  discoveredAt: "2026-09-30T00:00:00.000Z",
});

class FakeSource implements JobSource {
  constructor(
    readonly name: string,
    private readonly action: () => Promise<SourceResult>,
  ) {}
  discover(_context: DiscoveryContext): Promise<SourceResult> {
    return this.action();
  }
}

const result = (jobs: Job[], fetched = jobs.length): SourceResult => ({
  jobs,
  stats: { fetched, valid: jobs.length, rejected: 0 },
  errors: [],
});

describe("JobSourceOrchestrator", () => {
  it("combines sources concurrently, deduplicates canonical URLs, and preserves error attribution", async () => {
    const orchestrator = new JobSourceOrchestrator([
      new FakeSource("greenhouse", async () => result([job("one"), job("two")])),
      new FakeSource("lever", async () => ({
        ...result([
          job("duplicate", "https://jobs.example.com/one?utm_source=lever#apply"),
          job("three"),
        ]),
        errors: [{ code: "LEVER_BAD_JOB", message: "Rejected job", retryable: false }],
      })),
      new FakeSource("smartrecruiters", async () => {
        throw new Error("service unavailable");
      }),
    ]);

    const discovered = await orchestrator.discover(context);
    expect(discovered.jobs.map((item) => item.id)).toEqual(["one", "two", "three"]);
    expect(discovered.stats).toEqual({ fetched: 4, valid: 3, rejected: 0 });
    expect(discovered.errors).toEqual([
      { code: "LEVER_BAD_JOB", message: "Rejected job", retryable: false, source: "lever" },
      {
        code: "SMARTRECRUITERS_SOURCE_FAILED",
        message: "service unavailable",
        retryable: true,
        source: "smartrecruiters",
      },
    ]);
  });

  it("supports an empty source list", async () => {
    await expect(new JobSourceOrchestrator([]).discover(context)).resolves.toEqual({
      jobs: [],
      stats: { fetched: 0, valid: 0, rejected: 0 },
      errors: [],
    });
  });

  it("rejects duplicate source names", () => {
    const source = new FakeSource("same", async () => result([]));
    expect(() => new JobSourceOrchestrator([source, source])).toThrow(
      "Duplicate job source name: same",
    );
  });
});
