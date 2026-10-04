import { z } from "zod";
import { HttpClient, HttpError } from "../infrastructure/http/index.js";
import { JobSchema, type Job } from "../domain/job.js";
import type { DiscoveryContext, JobSource, SourceError, SourceResult } from "./job-source.js";
import { juniorItTitle, polishCountry } from "./remote-poland-filters.js";

export const RemoteSearchSchema = z.object({
  boards: z
    .array(
      z.object({
        slug: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
        company: z.string().trim().min(1).max(120),
      }),
    )
    .min(1)
    .max(5)
    .refine(
      (boards) => new Set(boards.map((board) => board.slug.toLowerCase())).size === boards.length,
    ),
});

const Posting = z.object({
  title: z.string().trim().min(1),
  location: z.string().nullable().optional(),
  isListed: z.boolean(),
  workplaceType: z.string().nullish(),
  descriptionPlain: z.string(),
  jobUrl: z.url(),
  address: z
    .object({ postalAddress: z.object({ addressCountry: z.string().nullish() }).optional() })
    .optional(),
  secondaryLocations: z
    .array(
      z.object({
        address: z
          .object({
            addressCountry: z.string().nullish(),
            postalAddress: z.object({ addressCountry: z.string().nullish() }).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});
const Response = z.object({ apiVersion: z.string(), jobs: z.array(z.unknown()) });

export function normalizeAshbyRemotePoland(
  raw: unknown,
  board: z.infer<typeof RemoteSearchSchema>["boards"][number],
  discoveredAt: string,
): Job | null {
  const parsed = Posting.safeParse(raw);
  if (!parsed.success) return null;
  const posting = parsed.data;
  const primaryPoland = polishCountry(posting.address?.postalAddress?.addressCountry);
  const secondaryPoland = (posting.secondaryLocations ?? []).some((item) =>
    polishCountry(item.address?.postalAddress?.addressCountry ?? item.address?.addressCountry),
  );
  if (
    !posting.isListed ||
    posting.workplaceType !== "Remote" ||
    !(primaryPoland || secondaryPoland) ||
    !juniorItTitle(posting.title)
  )
    return null;
  const url = new URL(posting.jobUrl);
  const match = new RegExp(
    `^/${board.slug}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/?$`,
    "iu",
  ).exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "jobs.ashbyhq.com" ||
    url.port ||
    !match ||
    url.username ||
    url.password
  )
    return null;
  url.search = "";
  url.hash = "";
  const externalId = `${board.slug}:${match[1]}`;
  return JobSchema.parse({
    id: `ashby:${externalId}`,
    externalId,
    source: "ashby_remote_pl",
    company: board.company,
    title: posting.title,
    description:
      "This role is remote from Poland.\n[Workplace and country derived from the employer's Ashby job-board fields; verify the original posting.]\n" +
      posting.descriptionPlain,
    location: primaryPoland ? (posting.location ?? "Poland") : "Poland (also listed)",
    workplaceType: "remote",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    sourceUrl: url.toString(),
    canonicalUrl: url.toString(),
    discoveredAt,
  });
}

export class AshbyRemotePolandSource implements JobSource {
  readonly name = "ashby_remote_pl";
  private readonly config: z.infer<typeof RemoteSearchSchema>;

  constructor(
    config: z.infer<typeof RemoteSearchSchema>,
    private readonly http = new HttpClient({
      timeoutMs: 20_000,
      retry: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0 },
    }),
  ) {
    this.config = RemoteSearchSchema.parse(config);
  }

  async discover(_context: DiscoveryContext): Promise<SourceResult> {
    const jobs: Job[] = [];
    const errors: SourceError[] = [];
    let fetched = 0;
    let rejected = 0;
    const discoveredAt = new Date().toISOString();
    for (const board of this.config.boards) {
      try {
        const response = await this.http.get<unknown>(
          `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.slug)}`,
        );
        const payload = Response.safeParse(response.data);
        if (!payload.success) {
          errors.push({
            code: "ASHBY_INVALID_RESPONSE",
            message: `Invalid public board response: ${board.slug}`,
            retryable: false,
          });
          continue;
        }
        fetched += payload.data.jobs.length;
        for (const raw of payload.data.jobs) {
          const parsed = Posting.safeParse(raw);
          if (!parsed.success) {
            rejected++;
            continue;
          }
          const normalized = normalizeAshbyRemotePoland(parsed.data, board, discoveredAt);
          if (normalized) jobs.push(normalized);
        }
      } catch (error) {
        errors.push({
          code: error instanceof HttpError ? `ASHBY_HTTP_${error.status}` : "ASHBY_REQUEST_FAILED",
          message: `Could not read public board ${board.slug}.`,
          retryable:
            !(error instanceof HttpError) ||
            [408, 425, 429].includes(error.status) ||
            error.status >= 500,
        });
      }
    }
    return { jobs, stats: { fetched, valid: jobs.length, rejected }, errors };
  }
}
