import { LeverSource } from "../src/sources/lever/index.js";

const source = new LeverSource({
  site: "lever",
  companyName: "Lever",
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
