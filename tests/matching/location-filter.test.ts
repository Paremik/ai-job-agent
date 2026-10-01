import { describe, expect, it } from "vitest";
import example from "../../config/candidate-profile.example.json" with { type: "json" };
import { CandidateProfileSchema } from "../../src/domain/candidate-profile.js";
import { evaluateLocation, type WorkLocation } from "../../src/matching/location-filter.js";

const profile = CandidateProfileSchema.parse({
  ...example,
  preferences: {
    ...example.preferences,
    hybridMaxOneWayMinutes: 120,
    hybridCommutePolicy: "time_limit",
  },
});
const location = (overrides: Partial<WorkLocation> = {}): WorkLocation => ({
  workplaceType: "unknown",
  city: null,
  country: null,
  oneWayCommuteMinutes: null,
  remoteAllowedFromHome: null,
  ...overrides,
});

describe("location eligibility only", () => {
  it.each([
    [120, "eligible"],
    [121, "ineligible"],
    [0, "eligible"],
    [null, "needs_review"],
  ] as const)("checks hybrid commute of %s minutes", (minutes, expected) => {
    expect(
      evaluateLocation(
        profile,
        location({ workplaceType: "hybrid", oneWayCommuteMinutes: minutes }),
      ).status,
    ).toBe(expected);
  });
  it("accepts office in the confirmed home city", () => {
    expect(
      evaluateLocation(
        profile,
        location({ workplaceType: "onsite", city: "Example City", country: "PL" }),
      ).status,
    ).toBe("eligible");
  });
  it("rejects daily office outside the home city even for a short commute", () => {
    expect(
      evaluateLocation(
        profile,
        location({
          workplaceType: "onsite",
          city: "Another City",
          country: "PL",
          oneWayCommuteMinutes: 20,
        }),
      ).status,
    ).toBe("ineligible");
  });
  it("does not treat a matching city name with missing country as confirmed", () => {
    expect(
      evaluateLocation(profile, location({ workplaceType: "onsite", city: "Example City" })).status,
    ).toBe("needs_review");
  });
  it.each([
    [true, "eligible"],
    [false, "ineligible"],
    [null, "needs_review"],
  ] as const)("checks remote eligibility %s", (allowed, expected) => {
    expect(
      evaluateLocation(
        profile,
        location({ workplaceType: "remote", remoteAllowedFromHome: allowed }),
      ).status,
    ).toBe(expected);
  });
  it("keeps unknown work mode for review", () => {
    expect(evaluateLocation(profile, location()).status).toBe("needs_review");
  });
  it("rejects malformed travel times instead of guessing", () => {
    expect(() =>
      evaluateLocation(profile, location({ workplaceType: "hybrid", oneWayCommuteMinutes: -1 })),
    ).toThrow();
  });
});

describe("candidate evidence", () => {
  it("accepts the anonymous example", () => {
    expect(CandidateProfileSchema.safeParse(example).success).toBe(true);
  });
  it("rejects claims referencing missing evidence", () => {
    expect(
      CandidateProfileSchema.safeParse({
        ...example,
        facts: [
          {
            id: "f1",
            category: "skill",
            statement: "Used JavaScript",
            basis: "documented",
            evidenceIds: ["missing"],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("rejects duplicate evidence IDs", () => {
    expect(
      CandidateProfileSchema.safeParse({
        ...example,
        evidence: [...example.evidence, ...example.evidence],
      }).success,
    ).toBe(false);
  });
});
