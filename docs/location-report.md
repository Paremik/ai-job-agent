# Saved vacancy location report

Run `pnpm match:locations` after discovery. This reads the local profile and saved
jobs from PostgreSQL, then writes `private/location-report.md` and
`private/location-report.json`. It never changes database records or removes jobs.
Reports include all saved jobs, which may include expired postings. The result is
location compatibility only, not a recommendation to apply or a skills score.

The first run may mark every job `needs_review`: stored location text and heuristic
workplace types do not establish travel time or permission to work remotely from
the candidate's country. Stored modes choose a question rather than establish facts. Explicit supported
description statements are now extracted with evidence; see `location-extraction.md`.
Automated decisions are provisional and manual reviews take priority.

Optional `private/location-reviews.json` is a JSON array of reviewed conditions.
Only add entries after checking the actual vacancy or confirming with the employer.
Copy `jobId` from the report's `id` and `contentHash` exactly; use the candidate's
current home city/country. Each entry has this shape (illustrative values only):

```json
[
  {
    "jobId": "00000000-0000-4000-8000-000000000001",
    "contentHash": "copy-the-current-report-hash",
    "homeCity": "Example City",
    "homeCountry": "PL",
    "evidence": "Source URL, checked date and statement confirming these conditions",
    "location": {
      "workplaceType": "remote",
      "city": null,
      "country": null,
      "oneWayCommuteMinutes": null,
      "remoteAllowedFromHome": true
    }
  }
]
```

Use canonical city names and ISO country codes. Unknown facts must be `null`.
Commute time is one way from the stated home location. Remote permission here is
geographic permission, not confirmation of the candidate's legal work authorization.
For jobs offering multiple alternatives, record a confirmed acceptable arrangement.
Do not use an office address alone as proof that daily attendance is mandatory.

Changed job content or home city/country invalidates the review. A changed commute
limit is evaluated automatically only under the time_limit policy. Under employer_discussion, hybrid outside the home city remains needs_review regardless of travel time. A null job hash cannot validate a review;
rediscover the job first. Malformed/duplicate reviews stop report generation and
previous report files remain from the previous run (check `generatedAt` in JSON).
Reports and reviews stay in the Git-ignored `private/` directory.
