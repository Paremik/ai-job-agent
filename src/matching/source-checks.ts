import { z } from "zod";

const PublicUrl = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
});

export const SourceChecksSchema = z.array(
  z.object({
    jobId: z.uuid(),
    contentHash: z.string().min(1),
    sourceUrl: PublicUrl,
    checkedAt: z.iso.datetime(),
    entryLevelListed: z.boolean(),
  }),
);

export function verifiedSourceCheck(
  job: { id: string; contentHash: string | null },
  checks: z.infer<typeof SourceChecksSchema>,
) {
  const check = checks.find(
    (item) => item.jobId === job.id && item.contentHash === job.contentHash,
  );
  return check
    ? {
        sourceUrl: check.sourceUrl,
        checkedAt: check.checkedAt,
        entryLevelListed: check.entryLevelListed,
      }
    : null;
}
