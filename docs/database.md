# Database setup — phase 2, step 1

The project uses PostgreSQL, Drizzle ORM and versioned SQL migrations. Node.js 22.9+ is needed for the existing environment-file commands.

## Configure a database

1. Create a Supabase project (or use a PostgreSQL database dedicated to this application).
2. In Supabase, open **Connect** and copy a PostgreSQL connection URI. For an IPv4 connection, use the **Session pooler** URI; use a direct connection when IPv6 is available. Use session/direct mode for migrations.
3. Add `DATABASE_URL=` to your local `.env` and paste the actual connection URI after `=`. Replace the password placeholder locally; URL-encode special characters in the password. Do not paste credentials in chat or commit `.env`.
4. Run `pnpm db:check`, then `pnpm db:migrate`. The first command only checks connectivity. The second applies the checked-in SQL migrations to the configured database.

Tables are in the `job_agent` schema: `companies`, `jobs`, `source_refs`, `agent_runs`. Keep this schema outside Supabase's exposed Data API schemas. The backend connects via PostgreSQL directly.

## Schema decisions

- Company normalized names and job canonical URLs are unique. URL normalization and company matching will be implemented alongside persistence.
- Source identity is `(source, source_account, external_id)` so site-local IDs cannot collide across boards. Multiple source references may point to one job.
- First/last-seen timestamps preserve discovery history. Run records track counts and completion status.
- No automated vacancy closing is implemented: an incomplete or failed discovery must not mark unseen jobs closed.

## Development

`pnpm db:generate` creates migrations from the TypeScript schema without connecting to a database. Review and commit the generated SQL and metadata together. `pnpm db:migrate` applies pending migrations and records their completion; it can be run again. Do not edit a migration after it has been applied.

`pnpm test`, `pnpm typecheck`, and `pnpm lint` do not require database access. They do not substitute for applying the migration on a real PostgreSQL database.

## Saving discovery results

After migrations have been applied, `pnpm discover` requires a configured database and saves results. It prints `SAVED: { created, updated, unchanged, sourceRefs }`. `updated` means the stored content changed; `unchanged` means it was found again with the same content. Last-seen timestamps are refreshed in both cases.

Every run is recorded before fetching. Successful results from partially failing sources are saved with a `partial` run status. Job/company/source-reference changes and the final run status commit in one transaction. A save failure rolls them back and attempts to mark the run failed. A hard process termination may leave a run in `running`; automatic recovery is not implemented yet.

The save transaction uses a PostgreSQL advisory lock to serialize this application's writes. Batched upserts avoid one network request per job. Existing source identities take precedence over URL matching; contradictory existing identities fail rather than silently merge unrelated jobs. URL keys remove fragments and known advertising parameters while preserving functional query parameters such as `jobId`. Source references are kept even when discovery's display list merges duplicates. Same-name companies currently share a normalized-name identity; richer company resolution is a later step.

Run `pnpm discover` twice and then `pnpm db:status`. Unless new vacancies appeared upstream, the second run should create zero new jobs and the job count should remain unchanged. Tests for reconciliation and URL identity run with `pnpm test` without a database. `pnpm db:status` reads table counts and the last three run statuses without displaying credentials.

SHA-256 content hashes cover company identity, title, description, location, workplace type and salary. URLs, source IDs and observation timestamps are excluded. Comparison is exact, not semantic. The hash is for change detection, not a unique key or a reason to merge jobs. Existing rows without a hash are compared against their stored content and receive a hash on their next observation, without falsely reporting them all as changed. Apply the new migration with `pnpm db:migrate` before discovery. Fuzzy duplicate matching remains outside this step.

References: [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new), [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres).
