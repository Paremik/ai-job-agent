import { z } from "zod";
import { JobSchema, type Job } from "../../domain/job.js";
import type { DiscoveryContext, JobSource, SourceResult } from "../job-source.js";

export const PolandSearchSchema = z.object({
  country: z.literal("PL"),
  queries: z
    .array(z.object({ keywords: z.string().trim().min(1), location: z.string().trim().min(1) }))
    .min(1)
    .max(20),
  pagesPerQuery: z.number().int().min(1).max(3),
  resultsPerPage: z.number().int().min(1).max(100),
});
const PostingSchema = z.object({
  id: z.union([z.number().int().safe(), z.string().trim().min(1)]),
  title: z.string().trim().min(1),
  company: z.string().trim().min(1),
  location: z.string().optional(),
  snippet: z.string().optional(),
  link: z
    .string()
    .url()
    .refine((value) => ["https:", "http:"].includes(new URL(value).protocol)),
});
const PayloadSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  jobs: z.array(z.unknown()),
});

export function parseJoobleResponse(text: string): unknown {
  return JSON.parse(text, (key: string, value: unknown, context?: { source?: string }) => {
    if (
      key === "id" &&
      typeof value === "number" &&
      context?.source &&
      /^-?\d+$/.test(context.source)
    )
      return context.source;
    return value;
  });
}
// Separate transport so tests cannot accidentally consume an API quota.
type Transport = (url: string, body: object) => Promise<{ status: number; payload: unknown }>;
const transport: Transport = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  return {
    status: response.status,
    payload: response.ok ? parseJoobleResponse(await response.text()) : null,
  };
};

export class JoobleSource implements JobSource {
  readonly name = "jooble";
  private readonly config: z.infer<typeof PolandSearchSchema>;
  private readonly apiKey: string;
  constructor(
    apiKey: string,
    config: unknown,
    private readonly request: Transport = transport,
  ) {
    this.apiKey = apiKey.trim();
    if (!this.apiKey)
      throw new Error("Set JOOBLE_API_KEY in your local .env; use a key for Poland.");
    this.config = PolandSearchSchema.parse(config);
  }
  async discover(context: DiscoveryContext): Promise<SourceResult> {
    const result: SourceResult = {
      jobs: [],
      stats: { fetched: 0, valid: 0, rejected: 0 },
      errors: [],
    };
    const unique = new Map<string, Job>();
    let stop = false;
    for (const query of this.config.queries) {
      if (stop) break;
      const queryIds = new Set<string>();
      for (let page = 1; page <= this.config.pagesPerQuery; page++) {
        try {
          // Polish API endpoint; the key must be registered for the same region.
          const reply = await this.request(
            `https://pl.jooble.org/api/${encodeURIComponent(this.apiKey)}`,
            {
              ...query,
              page,
              ResultOnPage: this.config.resultsPerPage,
              companysearch: false,
            },
          );
          if (reply.status !== 200) {
            result.errors.push({
              code: `JOOBLE_HTTP_${reply.status}`,
              message:
                "Jooble request failed. Check regional key, quota and service availability; request details are hidden.",
              retryable: reply.status === 429 || reply.status >= 500,
            });
            stop = true;
            break;
          }
          const payload = PayloadSchema.safeParse(reply.payload);
          if (!payload.success) {
            result.errors.push({
              code: "JOOBLE_INVALID_RESPONSE",
              message: "Invalid Jooble response.",
              retryable: false,
            });
            stop = true;
            break;
          }
          result.stats.fetched += payload.data.jobs.length;
          let newIds = 0;
          for (const raw of payload.data.jobs) {
            const parsed = PostingSchema.safeParse(raw);
            if (!parsed.success) {
              result.stats.rejected++;
              continue;
            }
            const item = parsed.data;
            const externalId = String(item.id);
            const job = JobSchema.parse({
              id: `jooble:pl:${externalId}`,
              externalId,
              source: this.name,
              title: item.title,
              company: item.company,
              description: `[Jooble search snippet — incomplete description; check the original posting before deciding.]\n${item.snippet ?? ""}`,
              location: item.location?.trim() || null,
              workplaceType: "unknown",
              salaryMin: null,
              salaryMax: null,
              salaryCurrency: null,
              sourceUrl: item.link,
              canonicalUrl: item.link,
              discoveredAt: context.startedAt.toISOString(),
            });
            if (!queryIds.has(externalId)) {
              queryIds.add(externalId);
              newIds++;
            }
            if (!unique.has(externalId)) unique.set(externalId, job);
          }
          if (
            !payload.data.jobs.length ||
            !newIds ||
            page * this.config.resultsPerPage >= payload.data.totalCount
          )
            break;
        } catch {
          // Never print thrown transport messages: URLs contain the API key.
          result.errors.push({
            code: "JOOBLE_REQUEST_FAILED",
            message: "Jooble request or normalization failed; private request details are hidden.",
            retryable: true,
          });
          stop = true;
          break;
        }
      }
    }
    if (result.stats.rejected)
      result.errors.push({
        code: "JOOBLE_INVALID_JOBS",
        message: `${result.stats.rejected} malformed postings were skipped.`,
        retryable: false,
      });
    result.jobs = [...unique.values()];
    result.stats.valid = result.jobs.length;
    return result;
  }
}
