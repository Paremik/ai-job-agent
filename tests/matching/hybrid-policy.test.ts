import { it, expect } from "vitest";
import example from "../../config/candidate-profile.example.json" with { type: "json" };
import { CandidateProfileSchema } from "../../src/domain/candidate-profile.js";
import { evaluateLocation } from "../../src/matching/location-filter.js";
const profile = CandidateProfileSchema.parse(example);
it.each([null, 30, 120, 121, 300])("keeps hybrid commute %s for employer discussion", (minutes) => {
  expect(
    evaluateLocation(profile, {
      workplaceType: "hybrid",
      city: "Another City",
      country: "PL",
      oneWayCommuteMinutes: minutes,
      remoteAllowedFromHome: null,
    }),
  ).toEqual({ status: "needs_review", reason: "DISCUSS_HYBRID_WITH_EMPLOYER" });
});
it("still permits hybrid in the confirmed home city", () => {
  expect(
    evaluateLocation(profile, {
      workplaceType: "hybrid",
      city: profile.preferences.homeCity,
      country: "PL",
      oneWayCommuteMinutes: null,
      remoteAllowedFromHome: null,
    }).status,
  ).toBe("eligible");
});
