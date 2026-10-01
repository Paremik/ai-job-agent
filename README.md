# AI Job Application Agent

Existing TypeScript pipeline for discovering jobs, storing them in PostgreSQL and reviewing how they relate to a candidate's documented experience. Applications are not submitted automatically.

## Local dashboard

After setting up the existing database and private candidate profile:

```powershell
pnpm match:profile
pnpm dashboard:build
Start-Process .\private\dashboard.html
```

The page shows the latest comparison report, search and review filters, job details, original links and prepared CV/letter drafts. Re-run the first two commands after importing new jobs or editing the candidate profile. The generated HTML and personal application files stay under Git-ignored `private/`.

See [local dashboard details](docs/local-dashboard.md) and the other documents in `docs/` for the current pipeline and its limitations.

## Checks

```powershell
pnpm test
pnpm typecheck
pnpm lint
```
