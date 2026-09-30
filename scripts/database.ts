import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase, DatabaseConfigError } from "../src/infrastructure/database/client.js";

async function main() {
  const command = process.argv[2];
  if (command !== "check" && command !== "migrate" && command !== "status") {
    console.error("Use pnpm db:check, pnpm db:migrate or pnpm db:status.");
    process.exitCode = 1;
    return;
  }
  const database = createDatabase();
  try {
    if (command === "check") {
      await database.db.execute(sql`select 1`);
      console.log("PostgreSQL connection OK.");
    } else if (command === "status") {
      const counts = await database.db.execute(sql`select
        (select count(*)::integer from job_agent.companies) as companies,
        (select count(*)::integer from job_agent.jobs) as jobs,
        (select count(*)::integer from job_agent.source_refs) as source_refs,
        (select count(*)::integer from job_agent.agent_runs) as runs`);
      console.table(counts.rows);
      const runs = await database.db
        .execute(sql`select status, started_at, finished_at, fetched, valid, rejected
        from job_agent.agent_runs order by started_at desc limit 3`);
      console.table(runs.rows);
    } else {
      await migrate(database.db, {
        migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
      });
      console.log("Database migrations applied successfully.");
    }
  } finally {
    await database.close();
  }
}

await main().catch((error: unknown) => {
  console.error(
    error instanceof DatabaseConfigError
      ? error.message
      : "Database operation failed. Check database availability, connection settings and permissions. Credentials are not printed.",
  );
  process.exitCode = 1;
});
