import { mkdir, writeFile } from "node:fs/promises";
import { asc, eq } from "drizzle-orm";
import { createDatabase } from "../src/infrastructure/database/client.js";
import { companies, jobs } from "../src/infrastructure/database/schema.js";
import { extractRequirements } from "../src/matching/extract-requirements.js";

async function main() {
  const database = createDatabase();
  try {
    const saved = await database.db
      .select({
        id: jobs.id,
        title: jobs.title,
        company: companies.name,
        canonicalUrl: jobs.canonicalUrl,
        contentHash: jobs.contentHash,
        description: jobs.description,
      })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .orderBy(asc(jobs.id));
    const rows = saved.map(({ description, ...metadata }) => ({
      ...metadata,
      requirements: extractRequirements(description),
    }));
    const summary = {
      jobs: rows.length,
      withStatements: rows.filter((row) => row.requirements.statements.length).length,
      withSkills: rows.filter((row) =>
        row.requirements.statements.some((statement) => statement.skills.length),
      ).length,
      withExperience: rows.filter((row) =>
        row.requirements.statements.some((statement) => statement.experienceYears.length),
      ).length,
      withLanguages: rows.filter((row) =>
        row.requirements.statements.some((statement) => statement.languages.length),
      ).length,
    };
    const folder = new URL("../private/", import.meta.url);
    await mkdir(folder, { recursive: true });
    await writeFile(
      new URL("requirements-report.json", folder),
      JSON.stringify({ generatedAt: new Date().toISOString(), summary, rows }, null, 2) + "\n",
    );
    const clean = (text: string) => text.replace(/[\r\n|<>`[\]*_]/g, " ");
    const labels = {
      required: "Обязательно",
      preferred: "Желательно",
      unspecified: "Обязательность неясна",
      not_required: "Не требуется / проверить отрицание",
    };
    const markdown = [
      "# Требования из сохранённых вакансий",
      "",
      "Частичное извлечение по правилам. Это не оценка соответствия кандидата. Отсутствие требования в отчёте не означает, что его нет в вакансии.",
      "Фразы с альтернативами, отрицаниями и сложными условиями требуют проверки. Годы опыта относятся к своей фразе и не складываются.",
      "",
      `Вакансий: ${summary.jobs}. С извлечёнными фразами: ${summary.withStatements}. С навыками: ${summary.withSkills}. С годами опыта: ${summary.withExperience}. С языками: ${summary.withLanguages}.`,
      "",
      ...rows.flatMap((row) => [
        `## ${clean(row.company)} — ${clean(row.title)}`,
        "",
        `ID: ${row.id}`,
        "",
        ...(row.requirements.statements.length
          ? row.requirements.statements.map(
              (statement) =>
                `- **${labels[statement.importance]}${statement.needsReview ? "; уточнить" : ""}:** ${clean(statement.evidence.text)}`,
            )
          : ["Требования не распознаны; проверить оригинал."]),
        "",
      ]),
      "Полные ссылки, структурированные поля и хеши объявлений находятся в requirements-report.json.",
      "",
    ].join("\n");
    await writeFile(new URL("requirements-report.md", folder), markdown);
    console.table(summary);
    console.log(
      "Готово: private/requirements-report.md и private/requirements-report.json. Частичное извлечение, без оценки кандидата.",
    );
  } finally {
    await database.close();
  }
}

await main().catch(() => {
  console.error(
    "Не удалось извлечь требования. Проверьте доступность базы и права на локальную папку private. Реквизиты подключения скрыты.",
  );
  process.exitCode = 1;
});
