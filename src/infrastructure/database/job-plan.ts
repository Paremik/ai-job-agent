import { randomUUID } from "node:crypto";
import { JobSchema, type Job } from "../../domain/job.js";
import { normalizeJobUrl } from "../../domain/job-url.js";
import type { jobs, sourceRefs } from "./schema.js";
import { hashJobContent } from "./job-content-hash.js";

type StoredJob = typeof jobs.$inferSelect;
type StoredRef = typeof sourceRefs.$inferSelect;
export type JobObservation = { job: Job; sourceAccount: string };

export function normalizeCompanyName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function identity(source: string, account: string, externalId: string): string {
  return JSON.stringify([source, account, externalId]);
}

// Pure reconciliation, separately tested from SQL and network access.
export function planJobs(
  observations: JobObservation[],
  existingJobs: StoredJob[],
  existingRefs: StoredRef[],
  companyIds: Map<string, string>,
) {
  const byId = new Map(existingJobs.map((job) => [job.id, job]));
  const byUrl = new Map(existingJobs.map((job) => [job.canonicalUrl, job]));
  const byIdentity = new Map(
    existingRefs.map((ref) => [identity(ref.source, ref.sourceAccount, ref.externalId), ref]),
  );
  const writtenJobs = new Map<string, StoredJob>();
  const writtenRefs = new Map<string, StoredRef>();
  const oldIds = new Set(existingJobs.map((job) => job.id));
  const oldHashes = new Map(
    existingJobs.map((job) => [job.id, job.contentHash ?? hashJobContent(job)]),
  );

  for (const observation of observations) {
    const job = JobSchema.parse(observation.job);
    const account = observation.sourceAccount.trim();
    if (!account) throw new Error("Source account cannot be empty");
    const companyId = companyIds.get(normalizeCompanyName(job.company));
    if (!companyId) throw new Error("Missing company identity");
    const key = identity(job.source, account, job.externalId);
    const ref = byIdentity.get(key);
    const canonicalUrl = normalizeJobUrl(job.canonicalUrl);
    const urlMatch = byUrl.get(canonicalUrl);
    const sourceMatch = ref ? byId.get(ref.jobId) : undefined;
    if (ref && !sourceMatch) throw new Error("Missing job referenced by source");
    if (sourceMatch && urlMatch && sourceMatch.id !== urlMatch.id) {
      // Do not silently reassign refs when two existing identities disagree.
      throw new Error("Source identity conflicts with an existing canonical URL");
    }
    const previous = sourceMatch ?? urlMatch;
    const id = previous?.id ?? randomUUID();
    const seenAt = new Date(job.discoveredAt);
    const content = {
      companyId,
      title: job.title,
      description: job.description,
      location: job.location,
      workplaceType: job.workplaceType,
      salaryMin: job.salaryMin === null ? null : String(job.salaryMin),
      salaryMax: job.salaryMax === null ? null : String(job.salaryMax),
      salaryCurrency: job.salaryCurrency,
      canonicalUrl,
    };
    const alreadyWritten = writtenJobs.has(id);
    const keepContent = previous && (alreadyWritten || seenAt < previous.lastSeenAt);
    const row: StoredJob = {
      ...(keepContent ? previous : content),
      contentHash: hashJobContent(keepContent ? previous : content),
      id,
      firstSeenAt: previous?.firstSeenAt ?? seenAt,
      lastSeenAt: previous && previous.lastSeenAt > seenAt ? previous.lastSeenAt : seenAt,
    };
    if (previous && previous.canonicalUrl !== row.canonicalUrl) byUrl.delete(previous.canonicalUrl);
    byId.set(id, row);
    byUrl.set(row.canonicalUrl, row);
    writtenJobs.set(id, row);

    const reference: StoredRef = {
      id: ref?.id ?? randomUUID(),
      jobId: id,
      source: job.source,
      sourceAccount: account,
      externalId: job.externalId,
      sourceUrl: ref && ref.lastSeenAt > seenAt ? ref.sourceUrl : job.sourceUrl,
      firstSeenAt: ref?.firstSeenAt ?? seenAt,
      lastSeenAt: ref && ref.lastSeenAt > seenAt ? ref.lastSeenAt : seenAt,
    };
    byIdentity.set(key, reference);
    writtenRefs.set(key, reference);
  }

  const rows = [...writtenJobs.values()];
  const created = rows.filter((row) => !oldIds.has(row.id)).length;
  const updated = rows.filter(
    (row) => oldIds.has(row.id) && oldHashes.get(row.id) !== row.contentHash,
  ).length;
  return {
    jobs: rows,
    refs: [...writtenRefs.values()],
    counts: {
      created,
      updated,
      unchanged: rows.length - created - updated,
      sourceRefs: writtenRefs.size,
    },
  };
}
