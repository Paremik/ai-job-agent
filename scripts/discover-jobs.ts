import { PublicBoardSource } from "../src/sources/public-boards.js";
import { AshbyRemotePolandSource, RemoteSearchSchema } from "../src/sources/ashby-remote-poland.js";
import {
  LeverRemotePolandSource,
  LeverRemoteSearchSchema,
} from "../src/sources/lever-remote-poland.js";
import { readFile } from "node:fs/promises";
import { JoobleSource, PolandSearchSchema } from "../src/sources/jooble/jooble-source.js";
import { GreenhouseSource } from "../src/sources/greenhouse/index.js";
import { randomUUID } from "node:crypto";
import { createDatabase, DatabaseConfigError } from "../src/infrastructure/database/client.js";
import { startRun, failRun, saveDiscovery } from "../src/infrastructure/database/job-store.js";
import { LeverSource } from "../src/sources/lever/index.js";
import type { JobSource } from "../src/sources/job-source.js";
import { JobSourceOrchestrator } from "../src/sources/job-source-orchestrator.js";
import { SmartRecruitersSource } from "../src/sources/smartrecruiters/index.js";

async function main() {
  const onlyBoards = process.argv.includes("--boards");
  const onlyRemote = process.argv.includes("--remote");
  const requestedPoland = process.argv.includes("--poland");
  if ([onlyBoards, onlyRemote, requestedPoland].filter(Boolean).length > 1) {
    console.error("Choose only one discovery mode: --boards, --poland or --remote.");
    process.exitCode = 1;
    return;
  }
  const onlyPoland = requestedPoland || onlyBoards;
  const sources: JobSource[] = [];
  const sourceAccounts = new Map<string, string>();

  const greenhouseBoard = process.env.GREENHOUSE_BOARD_TOKEN?.trim();
  if (greenhouseBoard && !onlyPoland && !onlyRemote) {
    sourceAccounts.set("greenhouse", greenhouseBoard);
    sources.push(
      new GreenhouseSource({
        boardToken: greenhouseBoard,
        companyName: process.env.GREENHOUSE_COMPANY_NAME?.trim() || greenhouseBoard,
      }),
    );
  }

  const leverSite = process.env.LEVER_SITE?.trim();
  if (leverSite && !onlyPoland && !onlyRemote) {
    const regionValue = process.env.LEVER_REGION?.trim() || "global";
    if (regionValue !== "global" && regionValue !== "eu") {
      throw new Error("LEVER_REGION must be either global or eu");
    }
    sourceAccounts.set("lever", `${regionValue}:${leverSite}`);
    sources.push(
      new LeverSource({
        site: leverSite,
        companyName: process.env.LEVER_COMPANY_NAME?.trim() || leverSite,
        region: regionValue,
      }),
    );
  }

  const smartRecruitersCompany = process.env.SMARTRECRUITERS_COMPANY_IDENTIFIER?.trim();
  if (smartRecruitersCompany && !onlyPoland && !onlyRemote) {
    sourceAccounts.set("smartrecruiters", smartRecruitersCompany);
    const limitValue = process.env.SMARTRECRUITERS_MAX_POSTINGS?.trim();
    const maxPostings = limitValue ? Number(limitValue) : undefined;
    if (maxPostings !== undefined && (!Number.isInteger(maxPostings) || maxPostings < 1)) {
      throw new Error("SMARTRECRUITERS_MAX_POSTINGS must be a positive integer");
    }

    sources.push(
      new SmartRecruitersSource({
        companyIdentifier: smartRecruitersCompany,
        companyName: process.env.SMARTRECRUITERS_COMPANY_NAME?.trim() || smartRecruitersCompany,
        ...(maxPostings === undefined ? {} : { maxPostings }),
      }),
    );
  }

  const joobleKey = process.env.JOOBLE_API_KEY?.trim();
  if (onlyPoland) {
    for (const name of ["justjoin", "nofluffjobs", "solidjobs", "bulldogjob"] as const) {
      sources.push(new PublicBoardSource(name));
      sourceAccounts.set(name, "pl");
    }
    if (!joobleKey && !onlyBoards)
      console.log("Jooble skipped: no key configured; public boards still run.");
  }
  if (joobleKey && !onlyBoards && !onlyRemote) {
    const config = PolandSearchSchema.parse(
      JSON.parse(await readFile(new URL("../config/search-poland.json", import.meta.url), "utf8")),
    );
    sources.push(new JoobleSource(joobleKey, config));
    sourceAccounts.set("jooble", "pl");
    console.log(
      `Poland Jooble search: up to ${config.queries.length * config.pagesPerQuery} requests; snippets need full-posting review.`,
    );
  }
  if (onlyRemote) {
    const ashbyConfig = RemoteSearchSchema.parse(
      JSON.parse(await readFile(new URL("../config/search-remote.json", import.meta.url), "utf8")),
    );
    const leverConfig = LeverRemoteSearchSchema.parse(
      JSON.parse(
        await readFile(new URL("../config/search-remote-lever.json", import.meta.url), "utf8"),
      ),
    );
    sources.push(new AshbyRemotePolandSource(ashbyConfig));
    sourceAccounts.set("ashby_remote_pl", "selected-boards");
    sources.push(new LeverRemotePolandSource(leverConfig));
    sourceAccounts.set("lever_remote_pl", "selected-boards");
  }
  if (sources.length === 0) {
    console.error(
      "No job sources configured. Copy .env.example to .env and fill in at least one source identifier.",
    );
    process.exitCode = 1;
  } else {
    const database = createDatabase();
    const context = { runId: randomUUID(), startedAt: new Date() };
    let started = false;
    try {
      await startRun(database.db, context);
      started = true;
      console.log("Loading sources:", sources.map((source) => source.name).join(", "));
      const result = await new JobSourceOrchestrator(sources).discover(context);
      console.log("Saving jobs to PostgreSQL...");
      const saved = await saveDiscovery(database.db, context.runId, result, sourceAccounts);
      console.log("SAVED:", saved);

      console.log(`Sources: ${sources.map((source) => source.name).join(", ")}`);
      console.table(
        sources.map((source) => ({
          source: source.name,
          jobs: result.jobs.filter((job) => job.source === source.name).length,
        })),
      );
      console.log("STATS:");
      console.log(result.stats);
      console.log("\nERRORS:");
      console.log(result.errors);
      console.log("\nFIRST 10 JOBS:");
      console.log(
        result.jobs.slice(0, 10).map((job) => ({
          source: job.source,
          company: job.company,
          title: job.title,
          location: job.location,
          url: job.canonicalUrl,
        })),
      );
      if (result.errors.length > 0) process.exitCode = 1;
    } catch {
      if (started) {
        try {
          await failRun(database.db, context.runId);
        } catch {
          console.error("Could not mark this run as failed; check the database connection.");
        }
      }
      console.error(
        "Discovery could not be saved. Check the database connection and migrations. Credentials and SQL data are not printed.",
      );
      process.exitCode = 1;
    } finally {
      await database.close();
    }
  }
}

await main().catch((error: unknown) => {
  console.error(
    error instanceof DatabaseConfigError
      ? error.message
      : "Discovery configuration or database connection failed. Check local settings.",
  );
  process.exitCode = 1;
});
