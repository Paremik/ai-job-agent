# Scheduled public-board discovery

GitHub Actions runs `pnpm discover:boards` at 10:17 and 22:17 Europe/Warsaw. It reads the public Just Join IT, No Fluff Jobs, Bulldogjob and SOLID.Jobs sources and saves results to PostgreSQL. Jooble is excluded so the 500-search API quota is not consumed by the schedule. No application is submitted.

Before the first real run, apply the checked-in database migrations to the intended PostgreSQL database. In the GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret** and set `DATABASE_URL` to a connection string for that database. Enter it directly in GitHub; do not paste it into chat or commit it. The database must accept connections from GitHub-hosted runners. A dedicated database user with access only to the `job_agent` schema is preferable when available.

Without `DATABASE_URL`, scheduled runs skip discovery and record that fact in their run summary. A manual **Run workflow** attempt fails clearly until the secret is configured. After adding it, run **Actions → Scheduled job discovery → Run workflow** and check the run summary and the database run status. A source failure may still save successful results from other sources and mark the workflow failed for investigation.

GitHub schedules are best effort: runs may be delayed or dropped during high load, and a public repository's schedule may be disabled after 60 days without activity. The job uses the default branch and does not run on pull requests. See [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

The local dashboard reads `private/comparison-report.json`, not the database directly. To see newly scheduled results there, run `pnpm match:profile` on your computer and restart `pnpm dashboard:start`. Candidate profile files stay local. Notifications and automatic Jooble searches are separate future steps.
