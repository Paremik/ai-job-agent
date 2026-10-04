import { describe, expect, it, vi } from "vitest";
import {
  AshbyRemotePolandSource,
  normalizeAshbyRemotePoland,
  RemoteSearchSchema,
} from "../../src/sources/ashby-remote-poland.js";

const board = { slug: "docplanner", company: "Docplanner" };
const posting = {
  title: "Junior Software Engineer",
  location: "Warsaw, Poland",
  isListed: true,
  workplaceType: "Remote",
  descriptionPlain: "Join the engineering team.",
  jobUrl:
    "https://jobs.ashbyhq.com/docplanner/9031585a-7b58-4d06-8d4d-6bf6522a5dda?utm_source=test",
  address: { postalAddress: { addressCountry: "Poland" } },
};
const discoveredAt = "2026-10-03T00:00:00.000Z";

describe("Ashby remote Poland source", () => {
  it("keeps a listed junior remote role explicitly available in Poland", () => {
    const job = normalizeAshbyRemotePoland(posting, board, discoveredAt);
    expect(job).toMatchObject({
      source: "ashby_remote_pl",
      company: "Docplanner",
      workplaceType: "remote",
      canonicalUrl: "https://jobs.ashbyhq.com/docplanner/9031585a-7b58-4d06-8d4d-6bf6522a5dda",
    });
    expect(job?.description).toContain("remote from Poland");
  });

  it.each([
    { isListed: false },
    { workplaceType: "OnSite" },
    { workplaceType: undefined },
    { workplaceType: null },
    { title: "Senior Software Engineer" },
    { address: { postalAddress: { addressCountry: "Germany" } } },
    { jobUrl: "https://evil.example/docplanner/9031585a-7b58-4d06-8d4d-6bf6522a5dda" },
  ])("skips ineligible or unsafe posting %j", (change) => {
    expect(normalizeAshbyRemotePoland({ ...posting, ...change }, board, discoveredAt)).toBeNull();
  });

  it("accepts Poland in a secondary location", () => {
    const job = normalizeAshbyRemotePoland(
      {
        ...posting,
        address: { postalAddress: { addressCountry: "Germany" } },
        secondaryLocations: [{ address: { postalAddress: { addressCountry: "PL" } } }],
      },
      board,
      discoveredAt,
    );
    expect(job?.location).toBe("Poland (also listed)");
  });

  it("rejects duplicate board entries", () => {
    expect(() =>
      RemoteSearchSchema.parse({ boards: [board, { ...board, slug: "Docplanner" }] }),
    ).toThrow();
  });

  it("continues to the next board after an HTTP failure", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/n8n")
        ? new Response("unavailable", { status: 503 })
        : Response.json({ apiVersion: "1", jobs: [posting] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await new AshbyRemotePolandSource({
        boards: [{ slug: "n8n", company: "n8n" }, board],
      }).discover({ runId: "test", startedAt: new Date(discoveredAt) });
      expect(result.jobs).toHaveLength(1);
      expect(result.stats).toEqual({ fetched: 1, valid: 1, rejected: 0 });
      expect(result.errors).toMatchObject([{ code: "ASHBY_HTTP_503", retryable: true }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
