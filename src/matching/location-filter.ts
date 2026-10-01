import { z } from "zod";
import type { CandidateProfile } from "../domain/candidate-profile.js";
import { WorkplaceTypeSchema } from "../domain/job.js";

// Supply confirmed facts; never infer commute time from a city's name or distance.
export const WorkLocationSchema = z.object({
  workplaceType: WorkplaceTypeSchema,
  city: z.string().trim().min(1).nullable(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  oneWayCommuteMinutes: z.number().int().nonnegative().nullable(),
  remoteAllowedFromHome: z.boolean().nullable(),
});
export type WorkLocation = z.infer<typeof WorkLocationSchema>;
export type LocationDecision = {
  status: "eligible" | "ineligible" | "needs_review";
  reason: string;
};

export function evaluateLocation(profile: CandidateProfile, input: WorkLocation): LocationDecision {
  const location = WorkLocationSchema.parse(input);
  const preference = profile.preferences;
  const sameCity = location.city?.toLowerCase() === preference.homeCity.toLowerCase();
  const atHome = sameCity && location.country === preference.homeCountry;
  const answer = (status: LocationDecision["status"], reason: string): LocationDecision => ({
    status,
    reason,
  });

  if (location.workplaceType === "remote") {
    if (!preference.remoteAllowed) return answer("ineligible", "REMOTE_NOT_ACCEPTED");
    if (location.remoteAllowedFromHome === false)
      return answer("ineligible", "REMOTE_LOCATION_RESTRICTED");
    if (location.remoteAllowedFromHome === null)
      return answer("needs_review", "CONFIRM_REMOTE_COUNTRY_ELIGIBILITY");
    return answer("eligible", "REMOTE_FROM_HOME_ALLOWED");
  }
  if (location.workplaceType === "onsite") {
    if (atHome)
      return preference.onsiteInHomeCity
        ? answer("eligible", "OFFICE_IN_HOME_CITY")
        : answer("ineligible", "OFFICE_NOT_ACCEPTED");
    if (
      (location.city !== null && !sameCity) ||
      (location.country !== null && location.country !== preference.homeCountry)
    ) {
      return answer("ineligible", "DAILY_OFFICE_OUTSIDE_HOME_CITY");
    }
    return answer("needs_review", "CONFIRM_OFFICE_LOCATION");
  }
  if (location.workplaceType === "hybrid") {
    if (atHome) return answer("eligible", "HYBRID_IN_HOME_CITY");
    if (preference.hybridCommutePolicy === "employer_discussion")
      return answer("needs_review", "DISCUSS_HYBRID_WITH_EMPLOYER");
    if (location.oneWayCommuteMinutes === null)
      return answer("needs_review", "CONFIRM_ONE_WAY_COMMUTE");
    return location.oneWayCommuteMinutes <= preference.hybridMaxOneWayMinutes
      ? answer("eligible", "HYBRID_COMMUTE_WITHIN_LIMIT")
      : answer("ineligible", "HYBRID_COMMUTE_EXCEEDS_LIMIT");
  }
  return answer("needs_review", "CONFIRM_WORKPLACE_TYPE");
}
