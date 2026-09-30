import { GreenhouseSource } from "../src/sources/greenhouse/index.js";
import { LeverSource, type LeverRegion } from "../src/sources/lever/index.js";
import type { JobSource } from "../src/sources/job-source.js";
import { JobSourceOrchestrator } from "../src/sources/job-source-orchestrator.js";
import { SmartRecruitersSource } from "../src/sources/smartrecruiters/index.js";

const sources: JobSource[] = [];

const greenhouseBoard = process.env.GREENHOUSE_BOARD_TOKEN?.trim();
if (greenhouseBoard) {
  sources.push(
    new GreenhouseSource({
      boardToken: greenhouseBoard,
      companyName: process.env.GREENHOUSE_COMPANY_NAME?.trim() || greenhouseBoard,
    }),
  );
}

const leverSite = process.env.LEVER_SITE?.trim();
if (leverSite) {
  const regionValue = process.env.LEVER_REGION?.trim() || "global";
  if (regionValue !== "global" && regionValue !== "eu") {
    throw new Error("LEVER_REGION must be either global or eu");
  }
  sources.push(
    new LeverSource({
      site: leverSite,
      companyName: process.env.LEVER_COMPANY_NAME?.trim() || leverSite,
      region: regionValue as LeverRegion,
    }),
  );
}

const smartRecruitersCompany = process.env.SMARTRECRUITERS_COMPANY_IDENTIFIER?.trim();
if (smartRecruitersCompany) {
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

if (sources.length === 0) {
  console.error(
    "No job sources configured. Copy .env.example to .env and fill in at least one source identifier.",
  );
  process.exitCode = 1;
} else {
  console.log("Loading sources:", sources.map((source) => source.name).join(", "));
  const result = await new JobSourceOrchestrator(sources).discover({
    runId: `manual-${Date.now()}`,
    startedAt: new Date(),
  });

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
}
