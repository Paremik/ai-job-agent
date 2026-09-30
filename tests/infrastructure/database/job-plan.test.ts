import { describe, expect, it } from "vitest";
import type { Job } from "../../../src/domain/job.js";
import { normalizeJobUrl } from "../../../src/domain/job-url.js";
import {
  normalizeCompanyName,
  planJobs,
  type JobObservation,
} from "../../../src/infrastructure/database/job-plan.js";

const companyIds = new Map([["example", "company-id"]]);
const firstSeen = "2026-09-30T12:00:00.000Z";
const later = "2026-09-30T13:00:00.000Z";
const job: Job = {
  id: "test:board:123",
  externalId: "123",
  source: "test",
  company: "Example",
  title: "Engineer",
  description: "Build web applications",
  location: null,
  workplaceType: "unknown",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  sourceUrl: "https://example.com/jobs/123",
  canonicalUrl: "https://example.com/jobs/123",
  discoveredAt: firstSeen,
};
const observation = (changes: Partial<Job> = {}, sourceAccount = "board"): JobObservation => ({
  job: { ...job, ...changes },
  sourceAccount,
});

describe("job persistence reconciliation", () => {
  it("counts repeat observations as unchanged while refreshing last-seen timestamps", () => {
    const first = planJobs([observation()], [], [], companyIds);
    const second = planJobs(
      [observation({ discoveredAt: later })],
      first.jobs,
      first.refs,
      companyIds,
    );
    expect(second.counts).toEqual({ created: 0, updated: 0, unchanged: 1, sourceRefs: 1 });
    expect(second.jobs[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.jobs[0]!.contentHash).toBe(first.jobs[0]!.contentHash);
    expect(second.jobs[0]!.lastSeenAt).toEqual(new Date(later));
  });

  it("backfills legacy hashes without calling unchanged jobs updated", () => {
    const first = planJobs([observation()], [], [], companyIds);
    const legacy = first.jobs.map((row) => ({ ...row, contentHash: null }));
    const second = planJobs([observation({ discoveredAt: later })], legacy, first.refs, companyIds);
    expect(second.counts.unchanged).toBe(1);
    expect(second.counts.updated).toBe(0);
    expect(second.jobs[0]!.contentHash).toBe(first.jobs[0]!.contentHash);
    const changed = planJobs(
      [observation({ description: "New requirements", discoveredAt: later })],
      legacy,
      first.refs,
      companyIds,
    );
    expect(changed.counts.updated).toBe(1);
  });

  it.each<Partial<Job>>([
    { title: "Another title" },
    { description: "Different requirements" },
    { location: "Warsaw" },
    { workplaceType: "remote" },
    { salaryMin: 100 },
    { salaryMax: 200 },
    { salaryCurrency: "PLN" },
  ])("detects content changes: %j", (fields) => {
    const first = planJobs([observation()], [], [], companyIds);
    const second = planJobs(
      [observation({ ...fields, discoveredAt: later })],
      first.jobs,
      first.refs,
      companyIds,
    );
    expect(second.counts.updated).toBe(1);
    expect(second.counts.unchanged).toBe(0);
    expect(second.jobs[0]!.contentHash).not.toBe(first.jobs[0]!.contentHash);
  });

  it("ignores URL-only changes in content statistics", () => {
    const first = planJobs([observation()], [], [], companyIds);
    const second = planJobs(
      [observation({ canonicalUrl: "https://example.com/new-url", discoveredAt: later })],
      first.jobs,
      first.refs,
      companyIds,
    );
    expect(second.counts.unchanged).toBe(1);
    expect(second.jobs[0]!.canonicalUrl).toBe("https://example.com/new-url");
  });
  it("updates a repeated job without changing identities or first-seen timestamps", () => {
    const first = planJobs([observation()], [], [], companyIds);
    const second = planJobs(
      [observation({ title: "Updated title", discoveredAt: later })],
      first.jobs,
      first.refs,
      companyIds,
    );
    expect(first.counts).toEqual({ created: 1, updated: 0, unchanged: 0, sourceRefs: 1 });
    expect(second.counts).toEqual({ created: 0, updated: 1, unchanged: 0, sourceRefs: 1 });
    expect(second.jobs[0]).toMatchObject({
      id: first.jobs[0]!.id,
      title: "Updated title",
      firstSeenAt: new Date(firstSeen),
      lastSeenAt: new Date(later),
    });
    expect(second.refs[0]).toMatchObject({
      id: first.refs[0]!.id,
      jobId: first.jobs[0]!.id,
      firstSeenAt: new Date(firstSeen),
      lastSeenAt: new Date(later),
    });
  });

  it("keeps two source references when a vacancy appears on two sources", () => {
    const result = planJobs(
      [
        observation(),
        observation({
          source: "another",
          externalId: "abc",
          canonicalUrl: `${job.canonicalUrl}?utm_source=another#apply`,
        }),
      ],
      [],
      [],
      companyIds,
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.refs).toHaveLength(2);
    expect(result.refs[0]!.jobId).toBe(result.refs[1]!.jobId);
  });

  it("does not confuse equal external IDs on different boards", () => {
    const result = planJobs(
      [observation(), observation({ canonicalUrl: "https://example.com/jobs/456" }, "other-board")],
      [],
      [],
      companyIds,
    );
    expect(result.jobs).toHaveLength(2);
    expect(result.refs).toHaveLength(2);
  });

  it("keeps the persisted job ID when the source changes its public URL", () => {
    const first = planJobs([observation()], [], [], companyIds);
    const second = planJobs(
      [observation({ canonicalUrl: "https://example.com/new-url", discoveredAt: later })],
      first.jobs,
      first.refs,
      companyIds,
    );
    expect(second.jobs[0]!.id).toBe(first.jobs[0]!.id);
    expect(second.jobs[0]!.canonicalUrl).toBe("https://example.com/new-url");
    expect(second.counts.created).toBe(0);
  });

  it("does not regress stored content or last-seen dates for an older observation", () => {
    const first = planJobs(
      [observation({ title: "Newest", discoveredAt: later })],
      [],
      [],
      companyIds,
    );
    const second = planJobs([observation()], first.jobs, first.refs, companyIds);
    expect(second.jobs[0]!.title).toBe("Newest");
    expect(second.jobs[0]!.lastSeenAt).toEqual(new Date(later));
    expect(second.refs[0]!.lastSeenAt).toEqual(new Date(later));
  });

  it("rejects conflicting existing identities instead of overwriting another vacancy", () => {
    const first = planJobs(
      [observation(), observation({ externalId: "456", canonicalUrl: "https://example.com/456" })],
      [],
      [],
      companyIds,
    );
    expect(() =>
      planJobs(
        [observation({ canonicalUrl: "https://example.com/456" })],
        first.jobs,
        first.refs,
        companyIds,
      ),
    ).toThrow("conflicts");
  });

  it("handles an empty or duplicate input without extra records", () => {
    expect(planJobs([], [], [], companyIds).counts).toEqual({
      created: 0,
      updated: 0,
      unchanged: 0,
      sourceRefs: 0,
    });
    expect(planJobs([observation(), observation()], [], [], companyIds).counts).toEqual({
      created: 1,
      updated: 0,
      unchanged: 0,
      sourceRefs: 1,
    });
  });
});

describe("dedup keys", () => {
  it("removes advertising parameters but retains job identifiers", () => {
    expect(normalizeJobUrl("https://EXAMPLE.com/jobs?jobId=123&utm_source=ads#apply")).toBe(
      "https://example.com/jobs?jobId=123",
    );
    expect(normalizeJobUrl("https://example.com/jobs?jobId=123")).not.toBe(
      normalizeJobUrl("https://example.com/jobs?jobId=456"),
    );
  });
  it("normalizes company spacing and case without removing significant punctuation", () => {
    expect(normalizeCompanyName("  EXAMPLE  Company ")).toBe("example company");
    expect(normalizeCompanyName("A-B")).not.toBe(normalizeCompanyName("AB"));
  });
});
