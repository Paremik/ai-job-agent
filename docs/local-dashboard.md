# Local review dashboard

## Notifications

The "Уведомления" section shows unread reminders for actions due today or earlier and newly observed vacancies in the `review_now` queue. It also shows new junior or internship vacancies in a chosen role family with at least one matched skill when they need clarification and have no known location mismatch. New-job notifications require an explicit Opole location or an `eligible` location decision; distant jobs with unconfirmed work format remain in the full list without an alert. These candidates remain in `clarify_first`; the notification does not authorize applying. Deferred vacancies do not trigger alerts. The first successful load establishes a baseline of all current report URLs, without treating the existing backlog as new. A vacancy is new relative to that local baseline, not necessarily newly published. Reviewed, dismissed and submitted vacancies do not produce new-job reminders.

Notification state is saved separately in Git-ignored `private/dashboard-notifications.json`. Marking a reminder as read survives page reloads and report rebuilds; it does not complete an action or change its date. Changing an action to a different due date creates a different reminder. Acknowledgement applies to that URL and date, so restoring an already acknowledged date does not alert again. Back up this file with the rest of `private/`.

The panel refreshes notifications once a minute while visible, when returning to the tab, and after saving a review. It reads the latest local comparison report; GitHub discovery alone does not refresh that report. Rebuild the report and dashboard to see new vacancies. Failures are shown with a retry button and never silently replace damaged saved state. These are local in-panel notifications only, available while the local server is running.

## Using the dashboard

The report now includes the latest saved discovery run's finish time, overall status and accepted/rejected counts. The panel shows a warning for partial or failed runs. This is one aggregate run status; it does not prove every configured source was checked or every posting is still open. Each vacancy detail shows its database `last_seen_at` time: when a source last returned that vacancy. Older vacancies stay visible and require checking at the original site. A new profile comparison changes the report date but does not change a vacancy's last-seen date.
If a saved run or vacancy timestamp is more than five minutes ahead of the browser's current clock, the panel warns about clock mismatch and does not treat that timestamp as freshness evidence. Such rows remain available for manual review.

"Обновить из базы" reads the vacancies already collected in PostgreSQL, rebuilds the comparison report using the current private profile, and then rebuilds the dashboard. It does not scrape job sites or start a GitHub workflow. One refresh can run at a time per dashboard server. Each subprocess has a two-minute timeout; connection details and subprocess output are not exposed in the browser. The panel reports progress and offers a link to the refreshed list when ready. It never reloads the page automatically, so the user can save an open draft before navigating. Manual review marks and saved drafts are preserved.

The JSON report and dashboard HTML are each replaced atomically after writing a complete temporary file. A failed comparison leaves the existing HTML available. If comparison succeeds but the dashboard build fails, the report may be newer than the HTML; retry the refresh. The displayed report date is when profile comparison ran, not the last successful source scrape or proof that the vacancies remain open. Refresh progress is held in memory and resets when the server restarts.

Run `pnpm match:profile` after changing vacancies or the private candidate profile, then run `pnpm dashboard:start`. Open `http://127.0.0.1:4173` in a browser and keep the terminal open. The command rebuilds the dashboard and starts a local server on this computer. No account is needed.

The dashboard shows search, review filters, job details, original job links and available draft CV/letter links. Filters for city, work format, vacancy site and personal status can be combined with the review queue and skill filters. The city filter searches the location text supplied by the job site; it cannot infer commuting time or remote eligibility. "Work format not specified" reflects missing data, not an on-site requirement. The user can mark a vacancy as planned, sent, replied, rejected or dismissed, and mark it with a star. Sent vacancies move to an archive showing the latest 200 applications, including jobs absent from later reports. Marking a status records a manual decision; it does not send an application. Freshness is the report generation time, not proof that every vacancy is still open.

Remote vacancy cards display whether work from Poland is confirmed, denied or still requires clarification. A generic remote label does not establish eligibility. The location decision can be based on explicit description wording or a current manual review; the details show its explanation.

The "Удалённо из Польши подтверждено" switch narrows the list to remote vacancies whose location decision is `eligible`. It combines with the other filters and has its own removable filter label. The count is the number of active records, not an estimate of how many employers would accept a candidate.

The search panel groups location and source filters separately from the review queue. "Моя отметка" is a manual tracking status, while "Очередь проверки" is the report's review order. Selected filters appear as removable labels; "Очистить всё" resets them together. The count beside each vacancy site is its total in the current report, before other filters are applied.

The "Ополе" shortcut fills the city filter with `Opole` and shows active vacancies whose site-provided location contains that city name. Clicking it again clears the city filter. It does not infer commute time or include every location in Opole province.

"Первый просмотр" narrows the list to vacancies already in `review_now`, plus junior or internship ads in development, testing, IT support or system administration that need clarification and have no known location mismatch. For postings outside the exact city `Opole`, it requires at least one documented skill match. An exact Opole junior title can enter without a skill match because Jooble snippets often lack the full requirements; the original posting must be checked. The added clarification candidates exclude known language gaps and titles specifying German, Portuguese or Spanish, as well as mixed mid/manager titles. It is a short human-review queue, not a decision to apply. Such vacancies keep their original `clarify_first` badge and must have their work format, location and requirements checked.

A current, hash-matched manual source check can also establish that the employer lists a junior level when the aggregator's title omits it. The panel links the checked source, but keeps the vacancy in `clarify_first` until the requirements and conditions are resolved.

The dashboard labels possible repeats when company, title and stated location normalize to the same values. The detail panel links the other records. It retains each record and manual status separately because two similar ads can be distinct requisitions. Entries from different cities are not grouped.

When several possible repeats first appear together, the inbox creates one new-job notification for the group. A read acknowledgement remains effective if one source later disappears. This can suppress a later distinct requisition with exactly the same company, title and location; it remains visible in the vacancy list. Due-action reminders stay tied to their individual vacancy and date.

The panel loads application trackers from every dated folder under `private/applications/`. When a prepared package has exactly the same vacancy URL as a comparison row, its CV, letter and certificate links appear in that vacancy's detail panel. The packages tab also has the same status, star, note and next-action controls; this supports prepared opportunities absent from the current database report. Marking a package as sent places it in the archive. A package link means a local draft exists, not that it has been reviewed, approved or sent. The dashboard's review file is the current manual tracking record; older application trackers remain package manifests.

The "Создать или открыть CV и письмо" button makes editable Polish drafts directly in the vacancy panel. It checks that the comparison report still matches the private candidate profile, selects verified projects for the role, and keeps a review checklist of unresolved gaps. Letters include the candidate's GitHub profile, up to two required skills without profile evidence phrased as items to confirm, and a work-mode question tailored to the vacancy's stated remote, hybrid, on-site or unknown mode. Missing profile evidence does not mean the candidate lacks that skill. Drafts are saved in `private/local-drafts/<job-id>.json`; opening them again preserves manual edits. The CV print view can be saved as PDF through the browser's Print command. This is a local template, not an AI model: it cannot verify whether an ad is still active or understand every unusual requirement. Read the original ad and edit every claim before applying. The server never sends an application.

For IT support or system administration titles, a new draft emphasizes documented Windows troubleshooting, PC assembly and monitoring-system installation from the school internship. It presents system administration as an area for development, not prior Linux administration experience. Existing edited drafts are retained and are not overwritten by template changes.

When a prepared package already provides a CV PDF for the vacancy, the panel shows that CV in "Подготовленные материалы" and offers only the editable letter below it. The generated alternative CV stays hidden in this case to avoid confusing it with the prepared PDF. Other vacancies still offer both editable drafts.

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
