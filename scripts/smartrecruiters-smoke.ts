import { SmartRecruitersSource } from "../src/sources/smartrecruiters/index.js";

const companyIdentifier = process.argv[2];
if (!companyIdentifier) {
  console.error("Usage: pnpm exec tsx scripts/smartrecruiters-smoke.ts <company-identifier>");
  process.exitCode = 1;
} else {
  const result = await new SmartRecruitersSource({
    companyIdentifier,
    companyName: companyIdentifier,
    maxPostings: 3,
  }).discover({
    runId: "manual-smoke-test",
    startedAt: new Date(),
  });
  console.log("STATS:");
  console.log(result.stats);
  console.log("\nERRORS:");
  console.log(result.errors);
  console.log("\nFIRST 3 JOBS:");
  console.log(
    result.jobs
      .slice(0, 3)
      .map((job) => ({ title: job.title, location: job.location, url: job.canonicalUrl })),
  );
}
