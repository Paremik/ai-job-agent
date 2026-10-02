# AI Job Application Agent

Existing TypeScript pipeline for discovering jobs, storing them in PostgreSQL and reviewing how they relate to a candidate's documented experience. Applications are not submitted automatically.

## Local dashboard

After setting up the existing database and private candidate profile:

```powershell
pnpm match:profile
pnpm dashboard:start
# Затем открой http://127.0.0.1:4173 в браузере
```

The page shows the latest comparison report, search and filters for city, work format, vacancy site, personal status, review queue and related skills. It also shows job details, original links and prepared CV/letter drafts. You can mark jobs as sent or dismissed, add a star, save a private note and choose a date for the next action. The dashboard shows due actions and the latest 200 sent applications. Decisions are stored in Git-ignored `private/dashboard-reviews.json`. Re-run `pnpm match:profile` and restart the dashboard after importing new jobs or editing the candidate profile.

See [local dashboard details](docs/local-dashboard.md) and the other documents in `docs/` for the current pipeline and its limitations.

## Checks

```powershell
pnpm test
pnpm typecheck
pnpm lint
```
