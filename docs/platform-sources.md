# Poland source coverage

Run `pnpm sources:status` for the honest capability list. It is not a live health
check. `pnpm discover:boards` runs Just Join IT, No Fluff Jobs, Bulldogjob and SOLID.Jobs without
using Jooble quota. `pnpm discover:poland` combines them with Jooble when a key is
configured. Existing `pnpm discover` still supports configured ATS sources.

Public adapters read one listing page (four IT category pages for No Fluff Jobs) and at most eight detail pages per HTML board;
SOLID.Jobs reads one published RSS feed and keeps eight IT summaries. Links found on
the listing are prioritized for junior/intern titles; this is not exhaustive search.
No pagination, login, CAPTCHA solving or hidden API is used. HTML detail requests
are spaced one second apart, capped at 8 MB and 20 seconds. Access denials stop the
source and keep previous successful results; other sources can continue.

Just Join IT, No Fluff Jobs and Bulldogjob use JobPosting JSON-LD. No Fluff Jobs rotates backend, frontend, testing and support; explicit driver/recruiter/accountant titles are skipped. They require an explicitly
Polish office location, skip expired postings and keep the original public URL.
Remote-only postings without such a location are currently skipped, even if they
might accept Polish candidates. Remote eligibility is not inferred from a generic
country list. No Fluff Jobs descriptions can be very short; skills are kept as
unspecified qualifications, never automatically required. RSS locations/expiry are
unverified. All public descriptions carry a completeness warning. Salary units are
not discarded into misleading numeric ranges; normalized salary remains null.

OLX detail access returned 403. Its official Partner API permits reading only one's
own adverts: https://developer.olx.pl/artykuly/czeste-pytania . Pracuj.pl
and theprotocol.it did not return usable pages during this environment's probe.
LinkedIn/Indeed public search API access is unconfirmed; their partner integrations
are not implemented. These five platforms are **manual import**, not automatic search.

## Manual import

Create `private/import-jobs.json` as an array of records copied from actual postings:

```json
[
  {
    "url": "https://www.olx.pl/oferta/praca/REPLACE-WITH-ACTUAL-POSTING.html",
    "country": "PL",
    "title": "Actual title",
    "company": "Actual employer",
    "description": "Paste the actual description here",
    "location": "Actual location or use JSON null if unknown",
    "workplaceType": "unknown"
  }
]
```

Run `pnpm import:jobs`, then `pnpm match:profile`. A link alone cannot provide a
blocked page's contents. Unknown company/title must be resolved, not invented.
Only supported platform domains and HTTPS are accepted. This local import makes no
network requests to the board; it persists actual supplied content to the database.
The manual country field expresses user review, not proof of remote eligibility.

Same canonical URLs merge through existing persistence. Different board URLs for
the same employer vacancy may still remain distinct; cross-board fuzzy deduplication
is not implemented. Import records and live probe HTML remain in Git-ignored private.

References: https://schema.org/JobPosting , https://solid.jobs/rss/job-offers ,
https://docs.indeed.com/api-guides/ , https://learn.microsoft.com/en-us/linkedin/
