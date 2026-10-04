import { z } from "zod";
import { HttpClient, HttpError } from "../infrastructure/http/index.js";
import { JobSchema, type Job } from "../domain/job.js";
import { LeverJobSchema, LeverJobsResponseSchema, type LeverJob } from "./lever/schema.js";
import type { DiscoveryContext, JobSource, SourceError, SourceResult } from "./job-source.js";
import { juniorItTitle, polishCountry, polishLocation } from "./remote-poland-filters.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export const LeverRemoteSearchSchema = z.object({
  boards: z
    .array(
      z.object({
        site: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
        company: z.string().trim().min(1).max(120),
        region: z.enum(["global", "eu"]).default("global"),
      }),
    )
    .min(1)
    .max(3)
    .refine(
      (boards) =>
        new Set(boards.map((board) => `${board.region}:${board.site.toLowerCase()}`)).size ===
        boards.length,
    ),
});
type Board = z.output<typeof LeverRemoteSearchSchema>["boards"][number];

export function normalizeLeverRemotePoland(
  raw: unknown,
  board: Board,
  discoveredAt: string,
): Job | null {
  const parsed = LeverJobSchema.safeParse(raw);
  if (!parsed.success) return null;
  const posting: LeverJob = parsed.data;
  const locations = posting.categories?.allLocations ?? [posting.categories?.location ?? ""];
  const primaryPoland =
    polishCountry(posting.country) || polishLocation(posting.categories?.location);
  if (
    posting.workplaceType?.toLowerCase() !== "remote" ||
    !(primaryPoland || locations.some(polishLocation)) ||
    !juniorItTitle(posting.text)
  )
    return null;
  const url = new URL(posting.hostedUrl);
  const expectedHost = board.region === "eu" ? "jobs.eu.lever.co" : "jobs.lever.co";
  if (
    url.protocol !== "https:" ||
    url.hostname !== expectedHost ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== `/${board.site}/${posting.id}` ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(posting.id)
  )
    return null;
  url.search = "";
  url.hash = "";
  const externalId = `${board.region}:${board.site}:${posting.id}`;
  const description = [
    "This role is remote from Poland.",
    "[Workplace and Poland location derived from the employer's Lever job-board fields; verify the original posting.]",
    posting.descriptionPlain?.trim() || posting.description?.trim() || "",
    ...(posting.lists ?? []).map((list) => `${list.text}\n${list.content}`),
    posting.additionalPlain?.trim() || posting.additional?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return JobSchema.parse({
    id: `lever_remote_pl:${externalId}`,
    externalId,
    source: "lever_remote_pl",
    company: board.company,
    title: posting.text.trim(),
    description,
    location: primaryPoland ? (posting.categories?.location ?? "Poland") : "Poland (also listed)",
    workplaceType: "remote",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    sourceUrl: url.toString(),
    canonicalUrl: url.toString(),
    discoveredAt,
  });
}

export class LeverRemotePolandSource implements JobSource {
  readonly name = "lever_remote_pl";
  private readonly config: z.output<typeof LeverRemoteSearchSchema>;

  constructor(
    config: z.input<typeof LeverRemoteSearchSchema>,
    private readonly http = new HttpClient({
      timeoutMs: 20_000,
      retry: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0 },
    }),
  ) {
    this.config = LeverRemoteSearchSchema.parse(config);
  }

  async discover(_context: DiscoveryContext): Promise<SourceResult> {
    const jobs: Job[] = [];
    const errors: SourceError[] = [];
    let fetched = 0;
    let rejected = 0;
    const discoveredAt = new Date().toISOString();
    for (const board of this.config.boards) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const host = board.region === "eu" ? "api.eu.lever.co" : "api.lever.co";
        const url = new URL(`https://${host}/v0/postings/${encodeURIComponent(board.site)}`);
        url.searchParams.set("mode", "json");
        url.searchParams.set("skip", String(page * PAGE_SIZE));
        url.searchParams.set("limit", String(PAGE_SIZE));
        try {
          const response = await this.http.get<unknown>(url.toString());
          const payload = LeverJobsResponseSchema.safeParse(response.data);
          if (!payload.success) {
            errors.push({
              code: "LEVER_REMOTE_INVALID_RESPONSE",
              message: `Invalid public board response: ${board.site}.`,
              retryable: false,
            });
            break;
          }
          fetched += payload.data.length;
          for (const raw of payload.data) {
            if (!LeverJobSchema.safeParse(raw).success) {
              rejected++;
              continue;
            }
            const job = normalizeLeverRemotePoland(raw, board, discoveredAt);
            if (job) jobs.push(job);
          }
          if (payload.data.length < PAGE_SIZE) break;
          if (page === MAX_PAGES - 1)
            errors.push({
              code: "LEVER_REMOTE_PAGE_LIMIT",
              message: `Public board ${board.site} exceeded the page limit.`,
              retryable: false,
            });
        } catch (error) {
          errors.push({
            code:
              error instanceof HttpError
                ? `LEVER_REMOTE_HTTP_${error.status}`
                : "LEVER_REMOTE_REQUEST_FAILED",
            message: `Could not read public board ${board.site}.`,
            retryable:
              !(error instanceof HttpError) ||
              [408, 425, 429].includes(error.status) ||
              error.status >= 500,
          });
          break;
        }
      }
    }
    return { jobs, stats: { fetched, valid: jobs.length, rejected }, errors };
  }
}
