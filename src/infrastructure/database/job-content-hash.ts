import { createHash } from "node:crypto";
import type { jobs } from "./schema.js";

type JobContent = Pick<
  typeof jobs.$inferSelect,
  | "companyId"
  | "title"
  | "description"
  | "location"
  | "workplaceType"
  | "salaryMin"
  | "salaryMax"
  | "salaryCurrency"
>;

// Fixed field order and explicit nulls. URLs, source IDs and observation dates are metadata.
export function hashJobContent(job: JobContent): string {
  const content = [
    1,
    job.companyId,
    job.title,
    job.description,
    job.location,
    job.workplaceType,
    job.salaryMin,
    job.salaryMax,
    job.salaryCurrency,
  ];
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
