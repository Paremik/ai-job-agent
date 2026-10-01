import { describe, it, expect } from "vitest";
import example from "../../config/candidate-profile.example.json" with { type: "json" };
import { CandidateProfileSchema } from "../../src/domain/candidate-profile.js";
import {
  buildLocationReport,
  renderLocationReport,
  type SavedLocationJob,
} from "../../src/matching/location-report.js";

const profile = CandidateProfileSchema.parse({
  ...example,
  preferences: { ...example.preferences, hybridCommutePolicy: "time_limit" },
});
const job: SavedLocationJob = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Developer",
  company: "Example",
  location: "Remote US; Example City",
  workplaceType: "remote",
  canonicalUrl: "https://example.com/job",
  contentHash: "v1",
};
const review = {
  jobId: job.id,
  contentHash: "v1",
  homeCity: profile.preferences.homeCity,
  homeCountry: "PL",
  evidence: "Employer confirmed this arrangement",
  location: {
    workplaceType: "remote",
    city: null,
    country: null,
    oneWayCommuteMinutes: null,
    remoteAllowedFromHome: true,
  },
};

describe("saved vacancy location report", () => {
  it("keeps free text and heuristic modes for review", () => {
    const result = buildLocationReport(profile, [
      job,
      { ...job, id: "other", workplaceType: "onsite", location: "Example City, PL" },
    ]);
    expect(result.counts).toEqual({ eligible: 0, ineligible: 0, needs_review: 2 });
    expect(result.rows[0]?.reason).toBe("CONFIRM_REMOTE_COUNTRY_ELIGIBILITY");
  });
  it("does not reject an unconfirmed mode even if the profile rejects remote", () => {
    const result = buildLocationReport(
      { ...profile, preferences: { ...profile.preferences, remoteAllowed: false } },
      [job],
    );
    expect(result.counts.needs_review).toBe(1);
  });
  it("uses matching evidence and includes explanation and original URL", () => {
    const result = buildLocationReport(profile, [job], [review]);
    expect(result.counts.eligible).toBe(1);
    expect(result.rows[0]).toMatchObject({
      canonicalUrl: job.canonicalUrl,
      evidence: review.evidence,
      reason: "REMOTE_FROM_HOME_ALLOWED",
    });
  });
  it("reports confirmed incompatibility without removing the vacancy", () => {
    const result = buildLocationReport(
      profile,
      [job],
      [{ ...review, location: { ...review.location, remoteAllowedFromHome: false } }],
    );
    expect(result.counts.ineligible).toBe(1);
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
  });
  it.each(["changed", null])("invalidates evidence when content hash becomes %s", (hash) => {
    expect(
      buildLocationReport(profile, [{ ...job, contentHash: hash }], [review]).rows[0]?.reason,
    ).toBe("REVIEW_OUTDATED");
  });
  it("invalidates commute and remote evidence after moving home", () => {
    expect(
      buildLocationReport(
        { ...profile, preferences: { ...profile.preferences, homeCity: "Elsewhere" } },
        [job],
        [review],
      ).rows[0]?.reason,
    ).toBe("REVIEW_OUTDATED");
  });
  it("recalculates against a changed commute limit", () => {
    const hybridReview = {
      ...review,
      location: { ...review.location, workplaceType: "hybrid", oneWayCommuteMinutes: 90 },
    };
    expect(buildLocationReport(profile, [job], [hybridReview]).counts.ineligible).toBe(1);
    expect(
      buildLocationReport(
        { ...profile, preferences: { ...profile.preferences, hybridMaxOneWayMinutes: 120 } },
        [job],
        [hybridReview],
      ).counts.eligible,
    ).toBe(1);
  });
  it("rejects duplicate and malformed reviews", () => {
    expect(() => buildLocationReport(profile, [job], [review, review])).toThrow();
    expect(() => buildLocationReport(profile, [job], [{ ...review, evidence: "" }])).toThrow();
  });
  it("handles an empty database", () => {
    expect(buildLocationReport(profile, []).total).toBe(0);
  });
  it("renders all statuses and escapes table separators", () => {
    const text = renderLocationReport(
      buildLocationReport(profile, [{ ...job, title: "One|Two\nThree" }]),
    );
    expect(text).toContain("One Two Three");
    expect(text).toContain("Нужно уточнить");
    expect(text).not.toContain(profile.displayName);
  });
});
