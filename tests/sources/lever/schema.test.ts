import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { LeverJobSchema, LeverJobsResponseSchema } from "../../../src/sources/lever/schema.js";

// Synthetic postings based on the documented API, not a live company's vacancies.
const fixturePath = new URL("./lever-schema-jobs.json", import.meta.url);
const fixture: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));

const minimalJob = {
  id: "test-posting",
  text: "QA Intern",
  hostedUrl: "https://example.com/jobs/test-posting",
};

describe("LeverJobsResponseSchema", () => {
  it("keeps malformed postings for individual validation", () => {
    const postings = LeverJobsResponseSchema.parse(fixture);
    const results = postings.map((posting) => LeverJobSchema.safeParse(posting));

    expect(postings).toHaveLength(3);
    expect(results.map((result) => result.success)).toEqual([true, true, false]);
  });

  it("accepts an empty board", () => {
    expect(LeverJobsResponseSchema.parse([])).toEqual([]);
  });

  it("rejects an object envelope instead of a postings array", () => {
    expect(LeverJobsResponseSchema.safeParse({ jobs: [] }).success).toBe(false);
  });
});

describe("LeverJobSchema", () => {
  it("preserves description sections and the salary interval for normalization", () => {
    const postings = LeverJobsResponseSchema.parse(fixture);
    const job = LeverJobSchema.parse(postings[0]);

    expect(job.description).toContain("React and TypeScript");
    expect(job.descriptionPlain).toBe("Build web interfaces with React and TypeScript.");
    expect(job.lists).toHaveLength(2);
    expect(job.lists?.[0]).toEqual({
      text: "Requirements",
      content: "<li>Basic JavaScript knowledge.</li><li>A portfolio project.</li>",
    });
    expect(job.additional).toContain("Personal and university projects");
    expect(job.additionalPlain).toBe("Personal and university projects are welcome.");
    expect(job.salaryRange).toEqual({
      currency: "PLN",
      interval: "per-year-salary",
      min: 60000,
      max: 84000,
    });
    expect(job.salaryDescription).toBe("<p>Annual gross salary.</p>");
    expect(job.salaryDescriptionPlain).toBe("Annual gross salary.");
  });

  it("accepts a posting with no optional metadata", () => {
    expect(LeverJobSchema.parse(minimalJob)).toEqual(minimalJob);
  });

  it("accepts unknown locations and unfamiliar workplace values", () => {
    const job = LeverJobSchema.parse({
      ...minimalJob,
      categories: { location: null },
      workplaceType: "future-workplace-type",
    });

    expect(job.categories?.location).toBeNull();
    expect(job.workplaceType).toBe("future-workplace-type");
    expect(LeverJobSchema.safeParse({ ...minimalJob, categories: null }).success).toBe(true);
  });

  it.each([
    { id: "" },
    { text: "" },
    { hostedUrl: "not-a-url" },
    { lists: [{ text: "Requirements", content: 42 }] },
  ])("rejects malformed fields: %j", (fields) => {
    expect(LeverJobSchema.safeParse({ ...minimalJob, ...fields }).success).toBe(false);
  });
});
