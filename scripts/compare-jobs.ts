import { groupPossibleDuplicates } from "../src/matching/duplicate-groups.js";
import {
  DescriptionReviewsSchema,
  reviewedDescription,
} from "../src/matching/reviewed-description.js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { CandidateProfileSchema } from "../src/domain/candidate-profile.js";
import { createDatabase } from "../src/infrastructure/database/client.js";
import { jobs, companies } from "../src/infrastructure/database/schema.js";
import { extractRequirements } from "../src/matching/extract-requirements.js";
import { compareRequirements } from "../src/matching/compare-requirements.js";
import { buildLocationReport } from "../src/matching/location-report.js";
import { jobPriority, compareJobPriority } from "../src/matching/job-priority.js";
import { prioritySignals } from "../src/matching/priority-signals.js";

async function main() {
  const folder = new URL("../private/", import.meta.url);
  const profile = CandidateProfileSchema.parse(
    JSON.parse(await readFile(new URL("candidate-profile.json", folder), "utf8")),
  );
  let reviews: unknown = [];
  try {
    reviews = JSON.parse(await readFile(new URL("location-reviews.json", folder), "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const database = createDatabase();
  try {
    const stored = await database.db
      .select({
        id: jobs.id,
        title: jobs.title,
        company: companies.name,
        canonicalUrl: jobs.canonicalUrl,
        contentHash: jobs.contentHash,
        description: jobs.description,
        location: jobs.location,
        workplaceType: jobs.workplaceType,
      })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .orderBy(asc(jobs.id));
    const descriptionReviews = DescriptionReviewsSchema.parse(
      await readFile(new URL("description-reviews.json", folder), "utf8")
        .then(JSON.parse)
        .catch((error: unknown) => {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
          throw error;
        }),
    );
    const saved = stored.map((job) => ({
      ...job,
      ...reviewedDescription(job, descriptionReviews),
    }));
    const locations = new Map(
      buildLocationReport(profile, saved, reviews).rows.map((row) => [row.id, row]),
    );
    const rows = saved
      .map(({ description, ...metadata }) => {
        const requirements = extractRequirements(description);
        const comparison = compareRequirements(profile, requirements);
        const signals = prioritySignals(metadata.title, description, profile, comparison);
        return {
          ...metadata,
          locationDecision: locations.get(metadata.id),
          comparison,
          priority: jobPriority(
            metadata.title,
            requirements,
            locations.get(metadata.id)?.status ?? "needs_review",
            signals,
          ),
        };
      })
      .sort(compareJobPriority);
    const summary = {
      jobs: rows.length,
      incompleteRequirements: rows.filter((row) => row.priority.signals?.incomplete).length,
      languageNeedsReview: rows.filter((row) => row.priority.signals?.languageReview).length,
      entryPriority: rows.filter((row) => row.priority.tier === "entry").length,
      levelNeedsReview: rows.filter((row) => row.priority.tier === "review").length,
      experiencedLowerPriority: rows.filter((row) => row.priority.tier === "experienced").length,
      locationMismatch: rows.filter((row) => row.priority.tier === "location_mismatch").length,
      withRelatedSkills: rows.filter((row) => row.comparison.matchedSkills.length).length,
      withMissingSkillEvidence: rows.filter((row) => row.comparison.skillsWithoutEvidence.length)
        .length,
      withDeclaredLanguageGap: rows.filter((row) =>
        row.comparison.statements.some((statement) =>
          statement.findings.some((finding) => finding.status === "declared_level_below"),
        ),
      ).length,
    };
    await mkdir(folder, { recursive: true });
    await writeFile(
      new URL("comparison-report.json", folder),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          profileHash: createHash("sha256").update(JSON.stringify(profile)).digest("hex"),
          summary,
          rows,
        },
        null,
        2,
      ) + "\n",
    );
    const clean = (value: string) => value.replace(/[\r\n|<>`[\]*_]/g, " ");
    const md = [
      "# Сравнение вакансий с профилем",
      "",
      "Начальные роли с пробелами и неполными требованиями направляются на проверку. Внутри группы учитываются языковые ограничения, полнота разбора, обязательные навыки, затем дополнительные. Известные ограничения места работы — в конце. Это порядок просмотра, не гарантия соответствия.",
      "Нет подтверждения в профиле ≠ нет навыка. Проектный опыт ≠ подтверждённый коммерческий стаж. Сведения о языках взяты из CV.",
      "",
      `Вакансий: ${summary.jobs}. С совпадениями технологий: ${summary.withRelatedSkills}. С навыками без подтверждения: ${summary.withMissingSkillEvidence}. С возможным разрывом языкового уровня: ${summary.withDeclaredLanguageGap}.`,
      "",
      ...rows.flatMap((row) => [
        `## ${clean(row.company)} — ${clean(row.title)}`,
        "",
        `ID: ${row.id}`,
        `Приоритет: ${row.priority.tier}. ${row.priority.reasons.map(clean).join(" ")}`,
        "",
        `Место работы: ${clean(row.locationDecision?.explanation ?? "Уточнить")}`,
        `Совпадения технологий: ${row.comparison.matchedSkills.join(", ") || "нет"}.`,
        `Нет подтверждения: ${row.comparison.skillsWithoutEvidence.join(", ") || "среди распознанных навыков не выявлено"}.`,
        "",
        ...row.comparison.statements
          .filter((statement) => !statement.ignored)
          .flatMap((statement) => [
            `- Требование (${statement.requirement.importance}): ${clean(statement.requirement.evidence.text)}`,
            ...statement.findings.map(
              (finding) =>
                `  - ${clean(finding.label)}: ${clean(finding.explanation)}${finding.factIds.length ? ` Факты: ${finding.factIds.join(", ")}; источники: ${finding.evidenceIds.join(", ")}.` : ""}`,
            ),
          ]),
        "",
      ]),
      "Источники профиля:",
      ...profile.evidence.map((item) => `- ${clean(item.id)}: ${clean(item.reference)}`),
      "",
      "Ссылки на вакансии и структурированные результаты находятся в comparison-report.json.",
      "",
    ].join("\n");
    await writeFile(new URL("comparison-report.md", folder), md);
    const shortlist = [
      "# Первые 20 вакансий для проверки",
      "",
      "Это очередь просмотра, а не рекомендация откликаться. Проверить уровень, обязанности, место и право на работу.",
      "",
      ...groupPossibleDuplicates(rows)
        .map((group) => ({ ...group.representative, duplicateMembers: group.members }))
        .slice(0, 20)
        .flatMap((row, index) => [
          `## ${index + 1}. ${clean(row.title)} — ${clean(row.company)}`,
          "",
          `Приоритет: ${row.priority.tier}.`,
          ...row.priority.reasons.map((reason) => `- ${clean(reason)}`),
          `- Совпадения технологий: ${row.comparison.matchedSkills.join(", ") || "нет"}.`,
          `- Место: ${clean(row.locationDecision?.explanation ?? "Уточнить")}`,
          `- Ссылка: ${clean(row.canonicalUrl)}`,
          ...row.duplicateMembers
            .slice(1)
            .map(
              (member) =>
                `- Возможный повтор (проверить город и заявку): ${clean(member.canonicalUrl)} — ${clean(member.location ?? "место неизвестно")}`,
            ),
          "",
        ]),
      "Полное сравнение и подтверждающие фразы — в comparison-report.md и comparison-report.json.",
      "",
    ].join("\n");
    await writeFile(new URL("priority-shortlist.md", folder), shortlist);
    console.table(summary);
    console.log(
      "Готово: private/comparison-report.md и private/comparison-report.json. Все вакансии требуют проверки перед откликом.",
    );
  } finally {
    await database.close();
  }
}
await main().catch(() => {
  console.error(
    "Не удалось сравнить вакансии. Проверьте базу, локальный профиль и подтверждения условий. Реквизиты подключения скрыты.",
  );
  process.exitCode = 1;
});
