# First-job review priority

`pnpm match:profile` now orders jobs using explicit signals for this candidate's
entry-level search. No job is deleted or rejected automatically.

Order: `review_now`, `clarify_first`, then `defer`. Within each queue: entry titles,
unknown/mixed titles, advanced titles or an unambiguous required minimum of 3+
years, then known location mismatches. More distinct technology overlaps appear
first; recent `last_seen_at` and job ID break ties. The 3-year
threshold is a search policy, not an estimate of the candidate's experience.

Preferred, negated, alternative and ambiguous experience statements do not lower
priority. The largest explicit minimum is used, never a sum. Missing years do not
mean zero experience is required. Title recognition is limited and heuristic;
unknown roles remain reviewable. Entry-level non-IT roles may appear because this
step does not classify occupation or establish overall suitability.

Within otherwise comparable rows, titles that mention software development,
testing/QA, IT support, or system administration get a soft ordering preference because these are the
candidate's stated search directions. This uses title keywords only: it does not
verify duties, remove other roles or authorize an application.

The JSON report stores reasons and experience evidence for each priority. The full
Markdown report shows reasons; `private/priority-shortlist.md` provides the first
20 jobs and links. Location and authorization still require separate confirmation.

## Conservative screening queue

`pnpm match:profile` also writes `screening` for each row and summary counts:
`review_now`, `clarify_first`, or `defer`. This is a deterministic order for
human inspection, not an eligibility score or permission to apply. Every state
has `applicationAllowed: false`.

A manually confirmed location conflict or a clearly advanced role / required 3+
years goes to `defer`. An unknown-level role with no sign of a chosen IT direction
and no matched required or preferred skill evidence also goes there as a lower
search priority. Every vacancy remains in the report and is searchable.

A location conflict derived from description rules, missing required skill evidence
or a declared language gap goes to `clarify_first`. A junior target role without
explicit skill or language gaps can enter `review_now` despite an incomplete
description when the location is confirmed compatible. A junior target role
explicitly in the home city can enter this queue when its format is unclear;
the reason says to check the format. `review_now` means inspect the original
promptly, not that applying is safe. Work authorization, schedule, actual
proficiency, and job freshness still require human review.
