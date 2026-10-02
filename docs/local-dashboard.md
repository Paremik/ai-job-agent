# Local review dashboard

Run `pnpm match:profile` after changing vacancies or the private candidate profile, then run `pnpm dashboard:start`. Open `http://127.0.0.1:4173` in a browser and keep the terminal open. The command rebuilds the dashboard and starts a local server on this computer. No account is needed.

The dashboard shows search, review filters, job details, original job links and available draft CV/letter links. Filters for city, work format, vacancy site and personal status can be combined with the review queue and skill filters. The city filter searches the location text supplied by the job site; it cannot infer commuting time or remote eligibility. "Work format not specified" reflects missing data, not an on-site requirement. The user can mark a vacancy as planned, sent, replied, rejected or dismissed, and mark it with a star. Sent vacancies move to an archive showing the latest 200 applications, including jobs absent from later reports. Marking a status records a manual decision; it does not send an application. Freshness is the report generation time, not proof that every vacancy is still open.

The panel loads application trackers from every dated folder under `private/applications/`. When a prepared package has exactly the same vacancy URL as a comparison row, its CV, letter and certificate links appear in that vacancy's detail panel. The packages tab also has the same status, star, note and next-action controls; this supports prepared opportunities absent from the current database report. Marking a package as sent places it in the archive. A package link means a local draft exists, not that it has been reviewed, approved or sent. The dashboard's review file is the current manual tracking record; older application trackers remain package manifests.

The "Создать или открыть CV и письмо" button makes editable Polish drafts directly in the vacancy panel. It checks that the comparison report still matches the private candidate profile, selects verified projects for the role, and keeps a review checklist of unresolved gaps. Drafts are saved in `private/local-drafts/<job-id>.json`; opening them again preserves manual edits. The CV print view can be saved as PDF through the browser's Print command. This is a local template, not an AI model: it cannot verify whether an ad is still active or understand every unusual requirement. Read the original ad and edit every claim before applying. The server never sends an application.

The generator reads contact details from Git-ignored `private/applicant-contact.json`. If moving the project to another computer, create the file using your verified details:

```json
{
  "email": "you@example.com",
  "phone": "+48 000 000 000",
  "github": "https://github.com/your-name"
}
```

The earlier `/api/application-brief` endpoint remains available for evidence review, but using the dashboard no longer requires copying a prompt into chat.

Each vacancy can have a private note and a next-action date. Marking a vacancy as sent suggests a date seven days later; the date can be edited or cleared. The "Следующие действия" section lists scheduled items in date order and counts those due today or earlier. This is an in-app checklist, shown when the local page is open; it does not send system notifications or messages to employers. Rejected and dismissed statuses clear the next-action date.

Decisions are saved in Git-ignored `private/dashboard-reviews.json`; the file contains vacancy titles, URLs, statuses, star marks, notes and dates. Existing review files remain readable. It survives report rebuilds. Back up the `private/` folder before moving the project to another computer. The server listens only on `127.0.0.1:4173`. The generated HTML contains only a restricted projection of the report. It omits profile facts, evidence, descriptions, database connection details and environment variables. The generated page and review file must not be published.

`pnpm dashboard:build` still creates a standalone file for viewing, but its action buttons require `pnpm dashboard:start` to save decisions. The panel uses plain HTML/CSS/JavaScript and existing Node tooling. A hosted dashboard can come later with authentication and server-side data access.
