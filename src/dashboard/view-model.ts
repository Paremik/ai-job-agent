import { z } from "zod";
import { possibleDuplicateKey } from "../matching/duplicate-groups.js";

const PublicUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  });

const Statement = z.object({
  ignored: z.boolean(),
  requirement: z.object({
    importance: z.string(),
    evidence: z.object({ text: z.string() }),
  }),
});

const Report = z.object({
  generatedAt: z.string(),
  discovery: z
    .object({
      status: z.enum(["running", "completed", "partial", "failed"]),
      finishedAt: z.iso.datetime().nullable(),
      fetched: z.number().int().nonnegative(),
      valid: z.number().int().nonnegative(),
      rejected: z.number().int().nonnegative(),
    })
    .nullish(),
  rows: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      company: z.string(),
      canonicalUrl: PublicUrl,
      location: z.string().nullable(),
      workplaceType: z.string(),
      lastSeenAt: z.iso.datetime().optional(),
      locationDecision: z.object({ status: z.string(), explanation: z.string() }).nullish(),
      descriptionReview: z.object({ sourceUrl: PublicUrl }).nullish(),
      sourceCheck: z
        .object({
          sourceUrl: PublicUrl,
          checkedAt: z.iso.datetime(),
          entryLevelListed: z.boolean(),
        })
        .nullish(),
      comparison: z.object({
        matchedSkills: z.array(z.string()),
        skillsWithoutEvidence: z.array(z.string()),
        statements: z.array(Statement),
      }),
      priority: z.object({
        tier: z.string(),
        titleLevel: z.string().default("unknown"),
        signals: z
          .object({ targetRole: z.string(), languageGap: z.boolean().default(false) })
          .nullish(),
        reasons: z.array(z.string()),
      }),
      screening: z.object({
        status: z.enum(["review_now", "clarify_first", "defer"]),
        reasons: z.array(z.string()),
        applicationAllowed: z.literal(false),
      }),
    }),
  ),
});

const SafeFileName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const SafeFolder = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Tracker = z.array(
  z.object({
    folder: SafeFolder,
    key: SafeFileName,
    company: z.string(),
    role: z.string(),
    url: PublicUrl,
    status: z.string(),
    cvFile: SafeFileName,
    messageFile: SafeFileName.optional(),
    attachments: z.array(SafeFileName).optional(),
  }),
);

function plain(value: string, limit = 400): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function jobSite(value: string): string {
  const host = new URL(value).hostname.toLowerCase();
  const isSite = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (isSite("greenhouse.io")) return "Greenhouse";
  if (isSite("ashbyhq.com")) return "Ashby";
  if (isSite("lever.co")) return "Lever";
  if (isSite("smartrecruiters.com")) return "SmartRecruiters";
  if (isSite("jooble.org")) return "Jooble";
  if (isSite("justjoin.it")) return "Just Join IT";
  if (isSite("nofluffjobs.com")) return "No Fluff Jobs";
  if (isSite("solid.jobs")) return "Solid.jobs";
  if (isSite("bulldogjob.pl")) return "Bulldogjob";
  return host;
}

export function buildDashboardData(reportInput: unknown, trackerInput: unknown) {
  const report = Report.parse(reportInput);
  const tracker = Tracker.parse(trackerInput);
  const rows = report.rows.map((row) => ({
    id: row.id,
    title: plain(row.title, 180),
    company: plain(row.company, 120),
    url: row.canonicalUrl,
    site: jobSite(row.canonicalUrl),
    sourceUrl: row.descriptionReview?.sourceUrl ?? row.sourceCheck?.sourceUrl ?? null,
    sourceCheckedAt: row.sourceCheck?.checkedAt ?? null,
    location: plain(row.location ?? "Место не указано", 140),
    workplaceType: row.workplaceType,
    lastSeenAt: row.lastSeenAt ?? null,
    locationStatus: row.locationDecision?.status ?? "needs_review",
    locationExplanation: plain(
      row.locationDecision?.explanation ?? "Уточнить место и формат работы.",
    ),
    status: row.screening.status,
    firstLook:
      row.screening.status === "review_now" ||
      (row.screening.status === "clarify_first" &&
        (row.priority.titleLevel === "entry" || row.sourceCheck?.entryLevelListed === true) &&
        row.priority.signals?.targetRole !== undefined &&
        row.priority.signals.targetRole !== "other_or_unclear" &&
        !row.priority.signals.languageGap &&
        !/\bgerman\b|niemieck\p{L}*|\b(?:brazilian )?portuguese\b|\bspanish\b|\b(?:mid|middle|manager)\b/iu.test(
          row.title,
        ) &&
        (row.comparison.matchedSkills.length > 0 || /^Opole$/iu.test(row.location?.trim() ?? "")) &&
        row.locationDecision?.status !== "ineligible"),
    tier: row.priority.tier,
    reasons: row.screening.reasons.map((reason) => plain(reason)),
    matchedSkills: row.comparison.matchedSkills.map((skill) => plain(skill, 80)),
    skillsWithoutEvidence: row.comparison.skillsWithoutEvidence.map((skill) => plain(skill, 80)),
    requirements: row.comparison.statements
      .filter(
        (statement) =>
          !statement.ignored &&
          ["required", "preferred"].includes(statement.requirement.importance),
      )
      .slice(0, 14)
      .map((statement) => ({
        importance: statement.requirement.importance,
        text: plain(statement.requirement.evidence.text, 320),
      })),
  }));
  // Only flag the same role at the same stated location. Keep every source record visible.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = possibleDuplicateKey(row);
    if (!key || row.location === "Место не указано") continue;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const rowsWithDuplicates = rows.map((row) => ({
    ...row,
    possibleDuplicates:
      groups
        .get(possibleDuplicateKey(row) ?? "")
        ?.filter((item) => item.id !== row.id)
        .map((item) => ({ id: item.id, url: item.url, site: item.site })) ?? [],
  }));
  const counts = {
    all: rows.length,
    review_now: rows.filter((row) => row.status === "review_now").length,
    clarify_first: rows.filter((row) => row.status === "clarify_first").length,
    defer: rows.filter((row) => row.status === "defer").length,
  };
  const drafts = tracker.map((item) => ({
    key: item.key,
    folder: item.folder,
    company: plain(item.company, 120),
    role: plain(item.role, 180),
    title: plain(item.role, 180),
    url: item.url,
    status: plain(item.status, 50),
    cv: `applications/${item.folder}/${encodeURIComponent(item.cvFile)}`,
    message: item.messageFile
      ? `applications/${item.folder}/${encodeURIComponent(item.messageFile)}`
      : null,
    certificate: item.attachments?.find((name) => name.includes("certificate"))
      ? `applications/${item.folder}/${encodeURIComponent(item.attachments.find((name) => name.includes("certificate"))!)}`
      : null,
  }));
  return {
    generatedAt: report.generatedAt,
    discovery: report.discovery ?? null,
    counts,
    rows: rowsWithDuplicates,
    drafts,
  };
}
