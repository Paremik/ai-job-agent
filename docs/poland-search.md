# Poland-first discovery with Jooble

1. Obtain a Polish-region key at https://pl.jooble.org/api/about .
2. Add `JOOBLE_API_KEY=your-real-key` only to local `.env`.
3. Run `pnpm discover:poland`, then `pnpm match:profile`.

`discover:poland` combines Jooble queries from `config/search-poland.json` with the public boards described in `docs/platform-sources.md`. Use `pnpm discover:boards` for public boards without spending Jooble quota.
Existing Greenhouse/Lever/SmartRecruiters settings and records remain unchanged.
Ordinary `pnpm discover` includes Jooble if its key is configured. It will also run
the other configured sources, so use the Poland command for this search phase.

Default: four queries, one page each, 20 results requested per page. Maximum four
API requests per run, no automatic retries. Increasing queries/pages consumes more
quota; repeated manual runs also consume quota. The documented free quota is 500
lifetime requests per key, not monthly. There is no account-level quota tracker.

The Polish endpoint https://pl.jooble.org/api/ requires a Polish-region key. A key for a
different country is not a Poland key. Country configuration expresses search
intent, not verified eligibility: returned locations, remote restrictions and hybrid
conditions still need checking. No commute radius is imposed; hybrid conditions
outside Opole are discussed personally with the employer.

API snippets are explicitly marked incomplete, salary strings are not interpreted,
and workplace type remains unknown. This stage does not fetch full job pages.
Titles, stable Jooble IDs and posting URLs feed the existing persistence pipeline.
Duplicates across queries are merged by Jooble ID; identical URLs can be merged by
the orchestrator. Different URLs for the same ad across sites may remain duplicates.

Authentication/rate-limit failures stop the run without retries; already fetched
jobs are retained and the existing run bookkeeping records partial/failed status.
URLs containing keys and response error bodies are never included in source errors.
Transport tests use fake responses and do not consume a key or quota.

Reference: https://jooblehelpcenter.freshdesk.com/pl/support/solutions/articles/60001448238-dokumentacja-rest-api
