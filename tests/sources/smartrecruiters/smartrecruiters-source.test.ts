import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HttpClient,
  HttpError,
  type HttpResponse,
} from "../../../src/infrastructure/http/index.js";
import { SmartRecruitersSource } from "../../../src/sources/smartrecruiters/index.js";

const fixture = JSON.parse(
  readFileSync(new URL("./smartrecruiters-postings.json", import.meta.url), "utf8"),
) as {
  content: Record<string, unknown>[];
};
type Reply = (url: string) => unknown | Promise<unknown>;

class FixtureHttpClient extends HttpClient {
  readonly requests: string[] = [];
  constructor(private readonly reply: Reply) {
    super({ requestsPerSecond: 1000 });
  }
  override async get<T>(url: string): Promise<HttpResponse<T>> {
    this.requests.push(url);
    return { status: 200, headers: new Headers(), data: (await this.reply(url)) as T };
  }
}

const context = { runId: "test-run", startedAt: new Date("2026-09-30T00:00:00.000Z") };
const details = (id: string, remote: boolean) => ({
  id,
  name: id === "posting-101" ? "Backend Engineer" : "Remote Designer",
  uuid: id === "posting-101" ? fixture.content[0]?.uuid : fixture.content[1]?.uuid,
  company: { identifier: "example-company", name: "Example Company" },
  location: { city: "Warsaw", region: "Mazowieckie", country: "Poland", remote },
  postingUrl: `https://jobs.smartrecruiters.com/example-company/${id}`,
  active: true,
  jobAd: {
    sections: {
      companyDescription: { title: "About us", text: "A sample employer." },
      jobDescription: { title: "The role", text: "Build reliable services." },
      qualifications: { title: "Qualifications", text: "TypeScript experience." },
    },
  },
});

describe("SmartRecruitersSource", () => {
  it("normalizes public posting details and keeps job-ad sections", async () => {
    const http = new FixtureHttpClient((url) => {
      const id = decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "");
      return new URL(url).pathname.endsWith("/postings")
        ? { limit: 100, offset: 0, totalFound: 2, content: fixture.content }
        : details(id, id === "posting-102");
    });
    const result = await new SmartRecruitersSource(
      { companyIdentifier: "example-company", companyName: "Fallback" },
      http,
    ).discover(context);

    expect(result.stats).toEqual({ fetched: 2, valid: 2, rejected: 0 });
    expect(result.errors).toEqual([]);
    expect(result.jobs[0]).toMatchObject({
      id: "smartrecruiters:example-company:posting-101",
      externalId: "a1b2c3d4-1111-4111-8111-111111111111",
      source: "smartrecruiters",
      company: "Example Company",
      title: "Backend Engineer",
      location: "Warsaw, Mazowieckie, Poland",
      workplaceType: "onsite",
      sourceUrl: "https://jobs.smartrecruiters.com/example-company/posting-101",
    });
    expect(result.jobs[0]?.description).toContain("Build reliable services.");
    expect(result.jobs[0]?.description).toContain("TypeScript experience.");
    expect(result.jobs[1]?.workplaceType).toBe("remote");
  });

  it("follows list pagination and preserves successes when one detail fetch fails", async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({
      ...fixture.content[0],
      id: `posting-${index}`,
    }));
    const http = new FixtureHttpClient((url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/postings")) {
        return parsed.searchParams.get("offset") === "0"
          ? { limit: 100, offset: 0, totalFound: 101, content: first }
          : { limit: 100, offset: 100, totalFound: 101, content: [fixture.content[1]] };
      }
      const id = decodeURIComponent(parsed.pathname.split("/").at(-1) ?? "");
      if (id === "posting-0") throw new HttpError("temporary error", 503, url);
      return details(id, false);
    });
    const result = await new SmartRecruitersSource(
      { companyIdentifier: "example-company", companyName: "Example" },
      http,
    ).discover(context);
    expect(http.requests.filter((url) => new URL(url).pathname.endsWith("/postings"))).toHaveLength(
      2,
    );
    expect(
      new URL(
        http.requests.find((url) => new URL(url).searchParams.get("offset") === "100")!,
      ).searchParams.get("destination"),
    ).toBe("PUBLIC");
    expect(result.stats).toEqual({ fetched: 101, valid: 100, rejected: 1 });
    expect(result.errors[0]).toMatchObject({
      code: "SMARTRECRUITERS_HTTP_503_POSTING_posting-0",
      retryable: true,
    });
  });

  it("returns cleanly when the public company has no postings", async () => {
    const result = await new SmartRecruitersSource(
      { companyIdentifier: "empty", companyName: "Empty" },
      new FixtureHttpClient(() => ({ limit: 100, offset: 0, totalFound: 0, content: [] })),
    ).discover(context);
    expect(result).toEqual({ jobs: [], stats: { fetched: 0, valid: 0, rejected: 0 }, errors: [] });
  });

  it("respects an optional posting limit", async () => {
    const http = new FixtureHttpClient((url) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/postings")) {
        return { limit: 100, offset: 0, totalFound: 2, content: fixture.content };
      }
      return details(path.split("/").at(-1) ?? "", false);
    });
    const result = await new SmartRecruitersSource(
      { companyIdentifier: "example-company", companyName: "Example", maxPostings: 1 },
      http,
    ).discover(context);
    expect(result.jobs).toHaveLength(1);
    expect(
      http.requests.filter((url) => !new URL(url).pathname.endsWith("/postings")),
    ).toHaveLength(1);
  });

  it("rejects empty configuration and malformed list response", async () => {
    expect(
      () => new SmartRecruitersSource({ companyIdentifier: " ", companyName: "Name" }),
    ).toThrow();
    expect(
      () => new SmartRecruitersSource({ companyIdentifier: "id", companyName: " " }),
    ).toThrow();
    const result = await new SmartRecruitersSource(
      { companyIdentifier: "id", companyName: "Name" },
      new FixtureHttpClient(() => ({ content: [] })),
    ).discover(context);
    expect(result.errors[0]?.code).toBe("SMARTRECRUITERS_INVALID_RESPONSE");
  });
});
