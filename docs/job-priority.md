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
