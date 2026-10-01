import { createHash } from "node:crypto";
import { z } from "zod";
import { platforms } from "./platform-catalog.js";
import { JobSchema, WorkplaceTypeSchema, type Job } from "../domain/job.js";
import { normalizeJobUrl } from "../domain/job-url.js";
const ImportSchema = z
  .array(
    z.object({
      url: z.string().url(),
      country: z.literal("PL"),
      title: z.string().trim().min(1),
      company: z.string().trim().min(1),
      description: z.string().trim().min(1),
      location: z.string().trim().min(1).nullable(),
      workplaceType: WorkplaceTypeSchema.default("unknown"),
    }),
  )
  .max(200);
export function importedJobs(input: unknown, now: Date): Job[] {
  const jobs = ImportSchema.parse(input).map((item) => {
    const url = new URL(item.url);
    const platform = platforms.find((entry) =>
      (entry.hosts as readonly string[]).includes(url.hostname),
    );
    if (!platform || url.protocol !== "https:" || url.username || url.password || url.port)
      throw new Error("Unsupported platform URL");
    if (url.pathname === "/") throw new Error("Use an individual posting URL");
    const canonicalUrl = normalizeJobUrl(url.toString());
    const externalId = createHash("sha256").update(canonicalUrl).digest("hex");
    return JobSchema.parse({
      id: `${platform.id}:${externalId}`,
      externalId,
      source: platform.id,
      company: item.company,
      title: item.title,
      description: `[Manually imported posting; country PL recorded in import, verify conditions.]\n${item.description}`,
      location: item.location,
      workplaceType: item.workplaceType,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      sourceUrl: canonicalUrl,
      canonicalUrl,
      discoveredAt: now.toISOString(),
    });
  });
  return [...new Map(jobs.map((job) => [job.canonicalUrl, job])).values()];
}
