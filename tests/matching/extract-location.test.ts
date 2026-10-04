import { describe, expect, it } from "vitest";
import { descriptionText, extractLocation } from "../../src/matching/extract-location.js";
import { buildLocationReport, type SavedLocationJob } from "../../src/matching/location-report.js";
import { CandidateProfileSchema } from "../../src/domain/candidate-profile.js";
import example from "../../config/candidate-profile.example.json" with { type: "json" };

describe("description location extraction", () => {
  it("handles twice escaped HTML and retains normalized supporting sentences", () => {
    const result = extractLocation(
      "&amp;lt;p&amp;gt;This role is fully remote from Poland.&amp;lt;/p&amp;gt;",
      "PL",
    );
    expect(result.location.remoteAllowedFromHome).toBe(true);
    expect(result.evidence[0]?.quote).toBe("This role is fully remote from Poland");
  });
  it("ignores unrelated uses of only and depending on in benefits text", () => {
    const result = extractLocation(
      "This role is remote from Poland. You only have a couple of meetings weekly. Paid leave depends on your contract. We can only be equal if we adapt.",
      "PL",
    );
    expect(result.location.remoteAllowedFromHome).toBe(true);
    expect(result.issues).toEqual([]);
  });
  it.each([
    "We support remote customers and hybrid events.",
    "This role is not remote.",
    "This role might become remote from Poland.",
    "This role is fully remote from Poland if approved by your manager.",
    "We previously said this role is fully remote from Poland.",
    "For example, this role is fully remote from Poland.",
  ])("does not assert an arrangement from %s", (description) => {
    expect(extractLocation(description, "PL").location.workplaceType).toBe("unknown");
  });
  it("distinguishes permission from an exclusive restriction", () => {
    expect(
      extractLocation("This role is remote from Germany.", "PL").location.remoteAllowedFromHome,
    ).toBeNull();
    expect(
      extractLocation("This role is remote from Germany only.", "PL").location
        .remoteAllowedFromHome,
    ).toBe(false);
    expect(
      extractLocation("This role is remote from Germany only.", "DE").location
        .remoteAllowedFromHome,
    ).toBe(true);
  });
  it("supports explicit worldwide work, not an unspecified remote label", () => {
    expect(
      extractLocation("You can work remotely from anywhere in the world.", "PL").location
        .remoteAllowedFromHome,
    ).toBe(true);
    expect(extractLocation("This role is remote.", "PL").location.remoteAllowedFromHome).toBeNull();
  });
  it.each([
    "This role is fully remote from Poland. Candidates must reside in Germany.",
    "This role is fully remote from Poland. This role is onsite.",
    "This role is fully remote from Poland. This role is not remote.",
    "This role is fully remote from Poland. This role is remote from Germany only.",
  ])("defers conflicting or additional conditions: %s", (description) => {
    const result = extractLocation(description, "PL");
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.location.workplaceType).toBe("unknown");
  });
  it("extracts a hybrid policy but never invents commute time", () => {
    const result = extractLocation(
      "Location-based hybrid policy: Currently, we expect all staff to be in one of our offices at least 25% of the time.",
      "PL",
    );
    expect(result.location.workplaceType).toBe("hybrid");
    expect(result.location.oneWayCommuteMinutes).toBeNull();
  });
  it("extracts mandatory daily office and explicit city/country independently", () => {
    const result = extractLocation(
      "This role is expected to be in office 5 days per week. This role will be based in our Opole, Poland office.",
      "PL",
    );
    expect(result.location).toMatchObject({
      workplaceType: "onsite",
      city: "Opole",
      country: "PL",
    });
    expect(
      extractLocation("This role will be based in our Opole, Poland office.", "PL").location
        .workplaceType,
    ).toBe("unknown");
  });
  it("ignores scripts and invalid code points without throwing", () => {
    expect(
      extractLocation("<script>This role is remote from Poland.</script>", "PL").evidence,
    ).toHaveLength(0);
    expect(() => descriptionText("&#99999999999; &#xD800; &amp;")).not.toThrow();
  });
});

describe("report with extracted conditions", () => {
  const profile = CandidateProfileSchema.parse(example);
  const job: SavedLocationJob = {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Engineer",
    company: "Example",
    location: null,
    workplaceType: "unknown",
    canonicalUrl: "https://example.com/job",
    contentHash: "v1",
    description: "This role is remote from Poland.",
  };
  it("uses evidence to make a location decision without including the full description", () => {
    const row = buildLocationReport(profile, [job]).rows[0];
    expect(row).toMatchObject({ status: "eligible", decisionSource: "description_rules" });
    expect(row).not.toHaveProperty("description");
    expect(row?.extraction.evidence.length).toBeGreaterThan(0);
  });
  it("gives current manual review priority over extraction", () => {
    const result = buildLocationReport(
      profile,
      [job],
      [
        {
          jobId: job.id,
          contentHash: "v1",
          homeCity: profile.preferences.homeCity,
          homeCountry: "PL",
          evidence: "Employer clarified restriction",
          location: {
            workplaceType: "remote",
            city: null,
            country: null,
            oneWayCommuteMinutes: null,
            remoteAllowedFromHome: false,
          },
        },
      ],
    );
    expect(result.rows[0]).toMatchObject({ status: "ineligible", decisionSource: "manual_review" });
  });
  it("does not override an outdated review with automated extraction", () => {
    const result = buildLocationReport(
      profile,
      [job],
      [
        {
          jobId: job.id,
          contentHash: "old",
          homeCity: profile.preferences.homeCity,
          homeCountry: "PL",
          evidence: "Previously checked",
          location: {
            workplaceType: "remote",
            city: null,
            country: null,
            oneWayCommuteMinutes: null,
            remoteAllowedFromHome: true,
          },
        },
      ],
    );
    expect(result.rows[0]?.reason).toBe("REVIEW_OUTDATED");
  });
});
