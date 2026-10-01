import { z } from "zod";

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
  rows: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      company: z.string(),
      canonicalUrl: PublicUrl,
      location: z.string().nullable(),
      workplaceType: z.string(),
      locationDecision: z.object({ status: z.string(), explanation: z.string() }).nullish(),
      descriptionReview: z.object({ sourceUrl: PublicUrl }).nullish(),
      comparison: z.object({
        matchedSkills: z.array(z.string()),
        skillsWithoutEvidence: z.array(z.string()),
        statements: z.array(Statement),
      }),
      priority: z.object({ tier: z.string(), reasons: z.array(z.string()) }),
      screening: z.object({
        status: z.enum(["review_now", "clarify_first", "defer"]),
        reasons: z.array(z.string()),
        applicationAllowed: z.literal(false),
      }),
    }),
  ),
});

const SafeFileName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const Tracker = z.array(
  z.object({
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

export function buildDashboardData(reportInput: unknown, trackerInput: unknown) {
  const report = Report.parse(reportInput);
  const tracker = Tracker.parse(trackerInput);
  const rows = report.rows.map((row) => ({
    id: row.id,
    title: plain(row.title, 180),
    company: plain(row.company, 120),
    url: row.canonicalUrl,
    sourceUrl: row.descriptionReview?.sourceUrl ?? null,
    location: plain(row.location ?? "Место не указано", 140),
    workplaceType: row.workplaceType,
    locationStatus: row.locationDecision?.status ?? "needs_review",
    locationExplanation: plain(
      row.locationDecision?.explanation ?? "Уточнить место и формат работы.",
    ),
    status: row.screening.status,
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
  const counts = {
    all: rows.length,
    review_now: rows.filter((row) => row.status === "review_now").length,
    clarify_first: rows.filter((row) => row.status === "clarify_first").length,
    defer: rows.filter((row) => row.status === "defer").length,
  };
  const drafts = tracker.map((item) => ({
    key: item.key,
    company: plain(item.company, 120),
    role: plain(item.role, 180),
    url: item.url,
    status: plain(item.status, 50),
    cv: `applications/2026-10-01/${encodeURIComponent(item.cvFile)}`,
    message: item.messageFile
      ? `applications/2026-10-01/${encodeURIComponent(item.messageFile)}`
      : null,
    certificate: item.attachments?.find((name) => name.includes("certificate"))
      ? `applications/2026-10-01/${encodeURIComponent(item.attachments.find((name) => name.includes("certificate"))!)}`
      : null,
  }));
  return { generatedAt: report.generatedAt, counts, rows, drafts };
}
