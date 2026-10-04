import { describe, expect, it, vi } from "vitest";
import {
  LeverRemotePolandSource,
  LeverRemoteSearchSchema,
  normalizeLeverRemotePoland,
} from "../../src/sources/lever-remote-poland.js";

const board = { site: "provectus", company: "Provectus", region: "global" as const };
const posting = {
  id: "dc77e23a-c453-4683-9e17-f8e5ddf8ba7c",
  text: "Junior AI/ML Engineer (GenAI, AWS)",
  workplaceType: "remote",
  country: "AM",
  categories: { location: "Yerevan", allLocations: ["Yerevan", "Poland"] },
  descriptionPlain: "Experience with machine learning is required.",
  hostedUrl:
    "https://jobs.lever.co/provectus/dc77e23a-c453-4683-9e17-f8e5ddf8ba7c?lever-source=test",
};
const discoveredAt = "2026-10-04T00:00:00.000Z";

describe("Lever remote Poland source", () => {
  it("keeps a junior remote role with Poland in all locations", () => {
    expect(normalizeLeverRemotePoland(posting, board, discoveredAt)).toMatchObject({
      source: "lever_remote_pl",
      workplaceType: "remote",
      location: "Poland (also listed)",
      canonicalUrl: "https://jobs.lever.co/provectus/dc77e23a-c453-4683-9e17-f8e5ddf8ba7c",
    });
  });

  it.each([
    { workplaceType: "hybrid" },
    { text: "Senior AI/ML Engineer" },
    { categories: { location: "Yerevan", allLocations: ["Yerevan", "Serbia"] } },
    { hostedUrl: "https://evil.example/provectus/dc77e23a-c453-4683-9e17-f8e5ddf8ba7c" },
  ])("skips unconfirmed or unsafe posting %j", (change) => {
    expect(normalizeLeverRemotePoland({ ...posting, ...change }, board, discoveredAt)).toBeNull();
  });

  it("accepts a Polish primary country", () => {
    expect(
      normalizeLeverRemotePoland(
        { ...posting, country: "PL", categories: { location: "Warsaw" } },
        board,
        discoveredAt,
      )?.location,
    ).toBe("Warsaw");
  });

  it("continues to another board after an HTTP failure", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/unavailable")
        ? new Response("unavailable", { status: 503 })
        : Response.json([posting]),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await new LeverRemotePolandSource({
        boards: [
          { site: "unavailable", company: "Unavailable" },
          { site: "provectus", company: "Provectus" },
        ],
      }).discover({ runId: "test", startedAt: new Date(discoveredAt) });
      expect(result.jobs).toHaveLength(1);
      expect(result.stats).toEqual({ fetched: 1, valid: 1, rejected: 0 });
      expect(result.errors).toMatchObject([{ code: "LEVER_REMOTE_HTTP_503", retryable: true }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects duplicate board entries", () => {
    expect(() =>
      LeverRemoteSearchSchema.parse({ boards: [board, { ...board, site: "Provectus" }] }),
    ).toThrow();
  });
});
