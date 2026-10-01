import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { importedJobs } from "../src/sources/imported-jobs.js";
import { createDatabase } from "../src/infrastructure/database/client.js";
import { startRun, failRun, saveDiscovery } from "../src/infrastructure/database/job-store.js";
async function main() {
  const input = JSON.parse(
    await readFile(
      process.argv[2] ?? new URL("../private/import-jobs.json", import.meta.url),
      "utf8",
    ),
  );
  const context = { runId: randomUUID(), startedAt: new Date() };
  const jobs = importedJobs(input, context.startedAt);
  if (!jobs.length) {
    console.log("Нет записей для импорта. См. docs/platform-sources.md.");
    return;
  }
  const database = createDatabase();
  let started = false;
  try {
    await startRun(database.db, context);
    started = true;
    console.log(
      await saveDiscovery(
        database.db,
        context.runId,
        {
          jobs,
          observations: jobs,
          stats: { fetched: jobs.length, valid: jobs.length, rejected: 0 },
          errors: [],
        },
        new Map(jobs.map((job) => [job.source, "pl"])),
      ),
    );
  } catch {
    if (started) await failRun(database.db, context.runId);
    throw new Error("Import failed");
  } finally {
    await database.close();
  }
}
await main().catch(() => {
  console.error(
    "Импорт не выполнен. Проверьте JSON, ссылки, обязательные поля и подключение к базе; личные данные скрыты.",
  );
  process.exitCode = 1;
});
