# Comparing requirements to candidate evidence

Run `pnpm match:profile`. It reads current descriptions directly from PostgreSQL,
extracts requirements again, loads the private candidate profile and location
reviews, and writes `private/comparison-report.md` and `.json`. Nothing in the
database changes. Reports include job content hashes and a hash of the parsed
profile; they must be regenerated after profile or vacancy changes.

Candidate facts may explicitly contain `skillUses` or `languageLevels`. Each fact
still references evidence IDs, and tags must accurately represent that evidence.
Free-text mentions are never automatically promoted to verified skills. Skill tags
belong only to skill/project facts; language tags belong only to language facts.
Older profiles without tags remain valid but produce no automatic matches.

Skill overlap means related evidence exists, not that a proficiency requirement is
satisfied. Missing evidence means unknown, not incapable. No inference from one
technology to another (for example PostgreSQL does not automatically prove SQL).
Years of professional experience are always unresolved in this version; project
duration and internship dates are not automatically converted into commercial work.
Language comparisons use declared CV CEFR levels, not independent verification.

The report retains required/preferred/unspecified status and whole statements.
Alternatives, negations and ambiguous extraction still need review. Education,
authorization, schedules, travel and clearances are not automatically satisfied.
Negated requirements do not create skill matches. Duplicate skills count once.

Rows are ordered for inspection using the level/experience policy in
`docs/job-priority.md`, then by technology overlap within each group. An overlap in a preferred or alternative clause
can affect this order; it never establishes that the complete requirement is met.
This is not a suitability score or application recommendation. Every row requires
review. An empty extraction never means every requirement is satisfied.

All personal comparisons and evidence links remain under the Git-ignored private
directory. No paid API, external LLM, CV rewriting or application sending is used.
