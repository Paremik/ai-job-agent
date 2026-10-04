# AI Job Application Agent

Existing TypeScript pipeline for discovering jobs, storing them in PostgreSQL and reviewing how they relate to a candidate's documented experience. Applications are not submitted automatically.

## Local dashboard

After setting up the existing database and private candidate profile:

```powershell
pnpm match:profile
pnpm dashboard:start
# Затем открой http://127.0.0.1:4173 в браузере
```

The page shows the latest comparison report, search and filters for city, work format, vacancy site, personal status, review queue and related skills. It also shows job details, original links and prepared CV/letter drafts. Existing CV and letters appear on a vacancy when their URL matches, and every prepared package can be tracked from the packages tab. You can mark jobs as sent or dismissed, add a star, save a private note and choose a date for the next action. The dashboard shows due actions and the latest 200 sent applications. Decisions are stored in Git-ignored `private/dashboard-reviews.json`. After importing new jobs or editing the candidate profile, use **Обновить из базы** in the running dashboard and open the refreshed view after saving any unsaved edits.

For a vacancy without a package, choose **Создать или открыть CV и письмо** in its detail panel. The page creates editable Polish drafts from verified profile facts and saves them privately. It also offers a printable CV view. These are local templates for human review; the app does not contact an AI provider or send applications.

See [local dashboard details](docs/local-dashboard.md) and the other documents in `docs/` for the current pipeline and its limitations.

Public Polish boards and selected employers' remote roles can also be refreshed on [a GitHub Actions schedule](docs/scheduled-discovery.md) after configuring a database secret. The schedule does not use the Jooble API key.

For a manual refresh of junior IT roles explicitly marked remote within Poland on
selected employers' official Ashby and Lever boards, run `pnpm discover:remote`, then
`pnpm match:profile` and refresh the dashboard. The same search runs daily in GitHub;
the local dashboard still needs a refresh from the database. See [source coverage](docs/platform-sources.md).

## Checks

GitHub Actions runs these checks on pushes to `main` and pull requests. The workflow uses no database credentials or private candidate files and does not fetch jobs or send applications.

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```
