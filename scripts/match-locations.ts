import { mkdir, readFile, writeFile } from "node:fs/promises";
import { eq, asc } from "drizzle-orm";
import { CandidateProfileSchema } from "../src/domain/candidate-profile.js";
import { createDatabase } from "../src/infrastructure/database/client.js";
import { companies, jobs } from "../src/infrastructure/database/schema.js";
import {
  buildLocationReport,
  renderLocationReport,
  LocationReviewsSchema,
} from "../src/matching/location-report.js";

async function main() {
  const directory = new URL("../private/", import.meta.url);
  const profile = CandidateProfileSchema.parse(
    JSON.parse(await readFile(new URL("candidate-profile.json", directory), "utf8")),
  );
  let reviews: unknown = [];
  try {
    reviews = JSON.parse(await readFile(new URL("location-reviews.json", directory), "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  LocationReviewsSchema.parse(reviews);
  const database = createDatabase();
  try {
    const saved = await database.db
      .select({
        id: jobs.id,
        title: jobs.title,
        company: companies.name,
        location: jobs.location,
        workplaceType: jobs.workplaceType,
        canonicalUrl: jobs.canonicalUrl,
        contentHash: jobs.contentHash,
        description: jobs.description,
      })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .orderBy(asc(jobs.id));
    const report = buildLocationReport(profile, saved, reviews);
    await mkdir(directory, { recursive: true });
    await writeFile(
      new URL("location-report.json", directory),
      JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2) + "\n",
    );
    await writeFile(new URL("location-report.md", directory), renderLocationReport(report));
    console.log(`Проверено вакансий: ${report.total}. Только место и формат работы.`);
    console.table([
      { status: "Подходит", jobs: report.counts.eligible },
      { status: "Не подходит", jobs: report.counts.ineligible },
      { status: "Нужно уточнить", jobs: report.counts.needs_review },
    ]);
    const reasons = new Map<string, number>();
    for (const row of report.rows)
      reasons.set(row.explanation, (reasons.get(row.explanation) ?? 0) + 1);
    console.table([...reasons].map(([reason, count]) => ({ reason, count })));
    console.log("Отчёт: private/location-report.md; ссылки и данные: private/location-report.json");
  } finally {
    await database.close();
  }
}

await main().catch(() => {
  console.error(
    "Не удалось создать отчёт. Проверьте подключение к базе, профиль и private/location-reviews.json (если он существует). Личные данные и реквизиты подключения скрыты.",
  );
  process.exitCode = 1;
});
