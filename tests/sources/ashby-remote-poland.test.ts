import { describe, expect, it } from "vitest";
import {
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
    expect(
      normalizeAshbyRemotePoland(
        {
          ...posting,
          address: { postalAddress: { addressCountry: "Germany" } },
          secondaryLocations: [{ address: { addressCountry: "PL" } }],
        },
        board,
        discoveredAt,
      ),
    ).not.toBeNull();
  });

  it("rejects duplicate board entries", () => {
    expect(() =>
      RemoteSearchSchema.parse({ boards: [board, { ...board, slug: "Docplanner" }] }),
    ).toThrow();
  });
});
