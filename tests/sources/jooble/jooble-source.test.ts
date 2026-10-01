import { describe, it, expect } from "vitest";
import { JoobleSource, parseJoobleResponse } from "../../../src/sources/jooble/jooble-source.js";
const config = {
  country: "PL",
  queries: [{ keywords: "helpdesk IT", location: "Polska" }],
  pagesPerQuery: 1,
  resultsPerPage: 20,
};
const posting = {
  id: 123,
  title: "Junior Developer",
  company: "Example",
  location: "Opole",
  snippet: "Python required",
  link: "https://pl.jooble.org/jdp/123",
};
const context = { runId: "test", startedAt: new Date("2026-10-01T00:00:00Z") };
describe("Polish Jooble source", () => {
  it("preserves long numeric IDs without rounding", async () => {
    const payload = parseJoobleResponse(
      '{"totalCount":1,"jobs":[{"id":9223372036854775801,"title":"Developer","company":"Example","link":"https://pl.jooble.org/jdp/9223372036854775801"}]}',
    );
    const result = await new JoobleSource("secret", config, async () => ({
      status: 200,
      payload,
    })).discover(context);
    expect(result.jobs[0]?.externalId).toBe("9223372036854775801");
  });
  it("sends Poland search and normalizes incomplete data conservatively", async () => {
    const source = new JoobleSource("secret", config, async (url, body) => {
      expect(url).toBe("https://pl.jooble.org/api/secret");
      expect(body).toMatchObject({
        location: "Polska",
        keywords: "helpdesk IT",
        page: 1,
        ResultOnPage: 20,
      });
      return { status: 200, payload: { totalCount: 1, jobs: [posting] } };
    });
    const result = await source.discover(context);
    expect(result.stats).toEqual({ fetched: 1, valid: 1, rejected: 0 });
    expect(result.jobs[0]).toMatchObject({
      source: "jooble",
      externalId: "123",
      workplaceType: "unknown",
      salaryMin: null,
    });
    expect(result.jobs[0]?.description).toContain("incomplete description");
  });
  it("deduplicates across queries with stable IDs", async () => {
    const source = new JoobleSource(
      "secret",
      { ...config, queries: [...config.queries, ...config.queries] },
      async () => ({ status: 200, payload: { totalCount: 1, jobs: [posting] } }),
    );
    expect((await source.discover(context)).stats).toEqual({ fetched: 2, valid: 1, rejected: 0 });
  });
  it("rejects malformed postings without losing valid ones", async () => {
    const result = await new JoobleSource("secret", config, async () => ({
      status: 200,
      payload: {
        totalCount: 3,
        jobs: [posting, { ...posting, company: "" }, { ...posting, link: "javascript:alert(1)" }],
      },
    })).discover(context);
    expect(result.stats).toEqual({ fetched: 3, valid: 1, rejected: 2 });
    expect(result.errors[0]?.code).toBe("JOOBLE_INVALID_JOBS");
  });
  it.each([403, 429, 500])("stops without retries on %s", async (status) => {
    let calls = 0;
    const result = await new JoobleSource(
      "secret",
      { ...config, queries: [...config.queries, ...config.queries] },
      async () => {
        calls++;
        return { status, payload: "secret" };
      },
    ).discover(context);
    expect(calls).toBe(1);
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("redacts thrown transport errors", async () => {
    const result = await new JoobleSource("PRIVATE_KEY", config, async () => {
      throw new Error("https://pl.jooble.org/api/PRIVATE_KEY");
    }).discover(context);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_KEY");
  });
  it("retains earlier jobs when a later page fails", async () => {
    let calls = 0;
    const result = await new JoobleSource(
      "secret",
      { ...config, pagesPerQuery: 2, resultsPerPage: 1 },
      async () =>
        ++calls === 1
          ? { status: 200, payload: { totalCount: 2, jobs: [posting] } }
          : { status: 500, payload: null },
    ).discover(context);
    expect(result.jobs).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
  });
  it("stops repeated pages and handles invalid response envelopes", async () => {
    let calls = 0;
    await new JoobleSource("secret", { ...config, pagesPerQuery: 3 }, async () => {
      calls++;
      return { status: 200, payload: { totalCount: 1000, jobs: [posting] } };
    }).discover(context);
    expect(calls).toBe(2);
    const result = await new JoobleSource("secret", config, async () => ({
      status: 200,
      payload: {},
    })).discover(context);
    expect(result.errors[0]?.code).toBe("JOOBLE_INVALID_RESPONSE");
  });
  it("requires a key and bounded Poland configuration", () => {
    expect(() => new JoobleSource("", config)).toThrow();
    expect(() => new JoobleSource("secret", { ...config, country: "US" })).toThrow();
    expect(() => new JoobleSource("secret", { ...config, pagesPerQuery: 100 })).toThrow();
  });
});
