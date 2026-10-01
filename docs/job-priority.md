# First-job review priority

`pnpm match:profile` now orders jobs using explicit signals for this candidate's
entry-level search. No job is deleted or rejected automatically.

Order: entry titles, unknown/mixed titles, advanced titles or an unambiguous required
minimum of 3+ years, then known location mismatches. Within a group, more distinct
technology overlaps appear first; job ID breaks ties deterministically. The 3-year
threshold is a search policy, not an estimate of the candidate's experience.

Preferred, negated, alternative and ambiguous experience statements do not lower
priority. The largest explicit minimum is used, never a sum. Missing years do not
mean zero experience is required. Title recognition is limited and heuristic;
unknown roles remain reviewable. Entry-level non-IT roles may appear because this
step does not classify occupation or establish overall suitability.

The JSON report stores reasons and experience evidence for each priority. The full
Markdown report shows reasons; `private/priority-shortlist.md` provides the first
20 jobs and links. Location and authorization still require separate confirmation.

## Conservative screening queue

`pnpm match:profile` also writes `screening` for each row and summary counts:
`review_now`, `clarify_first`, or `defer`. This is a deterministic order for
human inspection, not an eligibility score or permission to apply. Every state
has `applicationAllowed: false`.

Only a manually confirmed location conflict or a clearly advanced role / required
3+ years goes to `defer`; the vacancy stays in the report. A location conflict
derived from description rules, an incomplete posting, missing skill evidence, or
a declared language gap goes to `clarify_first`. A junior role with no such flagged
gaps and a confirmed compatible location is `review_now`. Work authorization,
schedule, actual proficiency, and job freshness still require human review.
