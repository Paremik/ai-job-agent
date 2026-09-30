import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  HttpClient,
  HttpError,
  type HttpResponse,
} from "../../../src/infrastructure/http/index.js";

import { LeverSource } from "../../../src/sources/lever/index.js";

const fixturePath = new URL("./lever-jobs.json", import.meta.url);
const fixture: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));
const fixturePostings = fixture as Record<string, unknown>[];

type FixtureReply = (url: string) => unknown | Promise<unknown>;

class FixtureHttpClient extends HttpClient {
  readonly requests: { url: string; headers?: Record<string, string> }[] = [];

  constructor(private readonly reply: FixtureReply) {
    super({ requestsPerSecond: 1000 });
  }

  override async get<T>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    this.requests.push({ url, ...(headers === undefined ? {} : { headers }) });

    return {
      status: 200,
      headers: new Headers(),
      data: (await this.reply(url)) as T,
    };
  }
}

const discoveryContext = {
  runId: "test-run",
  startedAt: new Date("2026-09-30T00:00:00.000Z"),
};

describe("LeverSource", () => {
  it("normalizes valid jobs and rejects malformed jobs individually", async () => {
    const httpClient = new FixtureHttpClient(() => fixture);
    const source = new LeverSource(
      { site: "test-company", companyName: "Test Company" },
      httpClient,
    );

    const result = await source.discover(discoveryContext);

    expect(result.stats).toEqual({ fetched: 3, valid: 2, rejected: 1 });
    expect(result.errors.map((error) => error.code)).toEqual(["LEVER_INVALID_JOB"]);
    expect(result.jobs[0]).toMatchObject({
      id: "lever:global:test-company:11111111-1111-4111-8111-111111111111",
      externalId: "11111111-1111-4111-8111-111111111111",
      source: "lever",
      company: "Test Company",
      title: "Junior Frontend Developer",
      location: "Warsaw, Poland",
      workplaceType: "hybrid",
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      sourceUrl: "https://example.com/jobs/11111111-1111-4111-8111-111111111111",
      canonicalUrl: "https://example.com/jobs/11111111-1111-4111-8111-111111111111",
    });

    expect(result.jobs[0]?.description).toContain("Basic JavaScript knowledge");
    expect(result.jobs[0]?.description).toContain("Benefits");
    expect(result.jobs[0]?.description).toContain("university projects are welcome");
    expect(result.jobs[0]?.description).toContain("test-pay-period");
    expect(result.jobs[1]?.workplaceType).toBe("remote");
  });

  it("requests JSON from the regional site and follows pagination", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...fixturePostings[0],
      id: `posting-${index}`,
    }));
    const httpClient = new FixtureHttpClient((url) =>
      new URL(url).searchParams.get("skip") === "0" ? firstPage : [fixturePostings[1]],
    );
    const source = new LeverSource(
      { site: " test site ", companyName: "Test Company", region: "eu" },
      httpClient,
    );

    const result = await source.discover(discoveryContext);

    expect(result.stats).toEqual({ fetched: 101, valid: 101, rejected: 0 });
    expect(result.errors).toEqual([]);
    expect(httpClient.requests).toHaveLength(2);

    const firstUrl = new URL(httpClient.requests[0]!.url);
    const secondUrl = new URL(httpClient.requests[1]!.url);

    expect(firstUrl.origin).toBe("https://api.eu.lever.co");
    expect(firstUrl.pathname).toBe("/v0/postings/test%20site");
    expect(firstUrl.searchParams.get("mode")).toBe("json");
    expect(firstUrl.searchParams.get("limit")).toBe("100");
    expect(firstUrl.searchParams.get("skip")).toBe("0");
    expect(httpClient.requests[0]?.headers).toEqual({ Accept: "application/json" });
    expect(secondUrl.searchParams.get("skip")).toBe("100");
  });

  it("keeps earlier jobs when a later page fails", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...fixturePostings[0],
      id: `posting-${index}`,
    }));
    const httpClient = new FixtureHttpClient((url) => {
      if (new URL(url).searchParams.get("skip") === "0") {
        return firstPage;
      }

      throw new HttpError("Lever request failed", 503, url);
    });
    const source = new LeverSource(
      { site: "test-company", companyName: "Test Company" },
      httpClient,
    );

    const result = await source.discover(discoveryContext);

    expect(result.jobs).toHaveLength(100);
    expect(result.stats).toEqual({ fetched: 100, valid: 100, rejected: 0 });
    expect(result.errors).toMatchObject([{ code: "LEVER_HTTP_503", retryable: true }]);
  });

  it("accepts a board with no published postings", async () => {
    const source = new LeverSource(
      { site: "empty-company", companyName: "Empty Company" },
      new FixtureHttpClient(() => []),
    );

    const result = await source.discover(discoveryContext);

    expect(result).toEqual({
      jobs: [],
      stats: { fetched: 0, valid: 0, rejected: 0 },
      errors: [],
    });
  });

  it("reports an invalid page response", async () => {
    const source = new LeverSource(
      { site: "test-company", companyName: "Test Company" },
      new FixtureHttpClient(() => ({ postings: [] })),
    );

    const result = await source.discover(discoveryContext);

    expect(result.jobs).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "LEVER_INVALID_RESPONSE",
        message: "Lever returned an invalid jobs response.",
        retryable: false,
      },
    ]);
  });

  it.each([
    { site: "", companyName: "Test Company" },
    { site: "test-company", companyName: " " },
  ])("rejects an empty source configuration: %j", (config) => {
    expect(() => new LeverSource(config)).toThrow();
  });
});
