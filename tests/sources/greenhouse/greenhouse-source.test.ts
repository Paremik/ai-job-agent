import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { HttpClient, type HttpResponse } from "../../../src/infrastructure/http/index.js";

import { GreenhouseSource } from "../../../src/sources/greenhouse/index.js";

const fixturePath = new URL("./greenhouse-jobs.json", import.meta.url);
const fixture: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));

class FixtureHttpClient extends HttpClient {
  constructor(private readonly payload: unknown) {
    super({
      requestsPerSecond: 1000,
    });
  }

  override async get<T>(_url: string, _headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return {
      status: 200,
      headers: new Headers(),
      data: this.payload as T,
    };
  }
}

describe("GreenhouseSource", () => {
  it("normalizes valid jobs and rejects malformed jobs", async () => {
    const httpClient = new FixtureHttpClient(fixture);

    const source = new GreenhouseSource(
      {
        boardToken: "test-company",
        companyName: "Test Company",
      },
      httpClient,
    );

    const result = await source.discover({
      runId: "test-run",
      startedAt: new Date(),
    });

    expect(result.stats).toEqual({
      fetched: 3,
      valid: 2,
      rejected: 1,
    });

    expect(result.jobs).toHaveLength(2);
    expect(result.errors).toHaveLength(1);

    expect(result.jobs[0]?.title).toBe("Junior Backend Developer");

    expect(result.jobs[0]?.id).toBe("greenhouse:test-company:1001");

    expect(result.jobs[1]?.workplaceType).toBe("remote");
  });

  it("returns normalized Greenhouse jobs", async () => {
    const httpClient = new FixtureHttpClient(fixture);

    const source = new GreenhouseSource(
      {
        boardToken: "test-company",
        companyName: "Test Company",
      },
      httpClient,
    );

    const result = await source.discover({
      runId: "test-run",
      startedAt: new Date(),
    });

    const firstJob = result.jobs[0];

    expect(firstJob).toBeDefined();

    expect(firstJob?.source).toBe("greenhouse");
    expect(firstJob?.company).toBe("Test Company");
    expect(firstJob?.externalId).toBe("1001");
    expect(firstJob?.canonicalUrl).toBe("https://example.com/jobs/1001");
  });
});
