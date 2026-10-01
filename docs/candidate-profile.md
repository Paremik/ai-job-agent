# Candidate profile and location compatibility

The personal profile lives in `private/candidate-profile.json`. The entire
`private/` directory is excluded from Git. Start from
`config/candidate-profile.example.json` and run `pnpm profile:check` to validate it.
The check prints counts, not personal statements or contact details.

Each fact references evidence. `documented` means a CV, certificate or repository
contains the information; it does not certify independent proficiency. A project
using a technology is evidence of project usage, not years of professional work.
`user_confirmed` records an explicit user statement. Unresolved information must
remain unresolved rather than being filled by an AI model.

`evaluateLocation` checks only location compatibility, not overall job suitability:

- `eligible`: the confirmed location conditions meet the preferences.
- `ineligible`: the confirmed conditions conflict with the preferences.
- `needs_review`: important conditions are unknown.

Daily office work is accepted in the home city. Hybrid work elsewhere defaults to employer discussion: city, attendance frequency, schedule and commute require personal agreement. The commute value is indicative. Only an explicit hybridCommutePolicy of time_limit enables automatic time comparisons. Remote work requires
confirmation that the employer permits working from the candidate's home location.
Do not infer travel times from distance or assume that “remote” means worldwide.
Inputs use canonical city names and ISO country codes; raw vacancy text must first
be resolved to these facts. Alternative workplace arrangements should be assessed
individually rather than flattened to a single arbitrary mode.

Run `pnpm match:locations` to apply this filter in a read-only report (see
`docs/location-report.md`). Discovery and stored
vacancies are unchanged: no automatic rejection or deletion is connected yet.
Work authorization, skills, seniority, schedule and availability require separate
checks before any overall suitability decision or CV tailoring.
