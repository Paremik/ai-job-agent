import { describe, expect, it } from "vitest";

import { JobSchema } from "../../src/domain/job.js";

const validJob = {
  id: "greenhouse:test:123",
  externalId: "123",
  source: "greenhouse",

  company: "Test Company",
  title: "Junior Software Developer",
  description: "Example job description",

  location: "Warsaw, Poland",
  workplaceType: "hybrid",

  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,

  sourceUrl: "https://example.com/jobs/123",
  canonicalUrl: "https://example.com/jobs/123",

  discoveredAt: new Date().toISOString(),
};

describe("JobSchema", () => {
  it("accepts a valid normalized job", () => {
    const result = JobSchema.safeParse(validJob);

    expect(result.success).toBe(true);
  });

  it("rejects a job with an empty title", () => {
    const result = JobSchema.safeParse({
      ...validJob,
      title: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid source URL", () => {
    const result = JobSchema.safeParse({
      ...validJob,
      sourceUrl: "not-a-url",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unsupported workplace type", () => {
    const result = JobSchema.safeParse({
      ...validJob,
      workplaceType: "spaceship",
    });

    expect(result.success).toBe(false);
  });
});
