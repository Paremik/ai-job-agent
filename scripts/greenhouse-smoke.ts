import { GreenhouseSource } from "../src/sources/greenhouse/index.js";

const source = new GreenhouseSource({
  boardToken: "atolls",
  companyName: "Atolls",
});

const result = await source.discover({
  runId: "manual-test",
  startedAt: new Date(),
});

console.log("STATS:");
console.log(result.stats);

console.log("\nERRORS:");
console.log(result.errors);

console.log("\nFIRST 3 JOBS:");

console.log(
  result.jobs.slice(0, 3).map((job) => ({
    title: job.title,
    location: job.location,
    url: job.canonicalUrl,
  })),
);
