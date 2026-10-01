# Local review dashboard

Run `pnpm match:profile` after changing vacancies or the private candidate profile, then run `pnpm dashboard:build`. Open `private/dashboard.html` in a browser. The file works offline and needs no server or account.

The dashboard is a read-only view of the current comparison report: search, review-status filters, job details, requirement excerpts, original job links and available draft CV/letter links. It is not a suitability score and cannot approve or submit an application. Freshness is the report generation time, not proof that every vacancy is still open.

The generated HTML contains only a restricted projection of the report. It omits profile facts, evidence, descriptions, database connection details and environment variables. It still contains job titles and local links to draft CV files, so it is written under Git-ignored `private/` and must not be published. The source template and builder are safe to commit; the generated page is not.

This first panel intentionally uses plain HTML/CSS/JavaScript and existing Node tooling. It adds no dependency and keeps the existing pipeline unchanged. A hosted dashboard can come later with authentication and server-side data access.
