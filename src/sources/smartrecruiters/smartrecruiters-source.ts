import { HttpClient, HttpError } from "../../infrastructure/http/index.js";
import { JobSchema, type Job, type WorkplaceType } from "../../domain/job.js";
import type { DiscoveryContext, JobSource, SourceError, SourceResult } from "../job-source.js";
import {
  SmartRecruitersPostingDetailsSchema,
  SmartRecruitersPostingsResponseSchema,
  SmartRecruitersPostingSchema,
  type SmartRecruitersPosting,
  type SmartRecruitersPostingDetails,
} from "./schema.js";

const PAGE_SIZE = 100;

export type SmartRecruitersSourceConfig = {
  companyIdentifier: string;
  companyName: string;
  maxPostings?: number;
};

export class SmartRecruitersSource implements JobSource {
  readonly name = "smartrecruiters";
  private readonly companyIdentifier: string;
  private readonly companyName: string;
  private readonly httpClient: HttpClient;
  private readonly maxPostings: number;

  constructor(config: SmartRecruitersSourceConfig, httpClient: HttpClient = new HttpClient()) {
    const companyIdentifier = config.companyIdentifier.trim();
    const companyName = config.companyName.trim();
    if (!companyIdentifier) throw new Error("SmartRecruiters companyIdentifier cannot be empty");
    if (!companyName) throw new Error("SmartRecruiters companyName cannot be empty");
    const maxPostings = config.maxPostings ?? Number.POSITIVE_INFINITY;
    if (
      maxPostings !== Number.POSITIVE_INFINITY &&
      (!Number.isInteger(maxPostings) || maxPostings < 1)
    ) {
      throw new Error("SmartRecruiters maxPostings must be a positive integer");
    }
    this.companyIdentifier = companyIdentifier;
    this.companyName = companyName;
    this.httpClient = httpClient;
    this.maxPostings = maxPostings;
  }

  async discover(_context: DiscoveryContext): Promise<SourceResult> {
    const jobs: Job[] = [];
    const errors: SourceError[] = [];
    let fetched = 0;
    let rejected = 0;
    let offset = 0;
    let totalFound = Number.POSITIVE_INFINITY;
    let processedCount = 0;

    while (offset < totalFound) {
      let payload: unknown;
      try {
        payload = (
          await this.httpClient.get<unknown>(this.buildListUrl(offset), {
            Accept: "application/json",
          })
        ).data;
      } catch (error) {
        errors.push(this.createSourceError(error));
        break;
      }

      const pageResult = SmartRecruitersPostingsResponseSchema.safeParse(payload);
      if (!pageResult.success) {
        errors.push({
          code: "SMARTRECRUITERS_INVALID_RESPONSE",
          message: "SmartRecruiters returned an invalid postings response.",
          retryable: false,
        });
        break;
      }

      const page = pageResult.data;
      totalFound = page.totalFound;
      if (page.content.length === 0) break;
      fetched += page.content.length;

      for (const rawPosting of page.content.slice(0, this.maxPostings - processedCount)) {
        processedCount += 1;
        const postingResult = SmartRecruitersPostingSchema.safeParse(rawPosting);
        if (!postingResult.success) {
          rejected += 1;
          errors.push({
            code: "SMARTRECRUITERS_INVALID_POSTING",
            message: "A SmartRecruiters posting was rejected because its payload was invalid.",
            retryable: false,
          });
          continue;
        }

        try {
          const detailsPayload = (
            await this.httpClient.get<unknown>(this.buildDetailsUrl(postingResult.data.id), {
              Accept: "application/json",
            })
          ).data;
          const detailsResult = SmartRecruitersPostingDetailsSchema.safeParse(detailsPayload);
          if (!detailsResult.success || detailsResult.data.active === false) {
            rejected += 1;
            errors.push({
              code: "SMARTRECRUITERS_INVALID_DETAILS",
              message: `SmartRecruiters posting ${postingResult.data.id} returned invalid or inactive details.`,
              retryable: false,
            });
            continue;
          }

          const normalized = JobSchema.safeParse(
            this.normalizeJob(postingResult.data, detailsResult.data, new Date().toISOString()),
          );
          if (!normalized.success) {
            rejected += 1;
            errors.push({
              code: "SMARTRECRUITERS_NORMALIZATION_FAILED",
              message: `SmartRecruiters posting ${postingResult.data.id} failed normalized Job validation.`,
              retryable: false,
            });
            continue;
          }
          jobs.push(normalized.data);
        } catch (error) {
          rejected += 1;
          errors.push(this.createPostingError(postingResult.data.id, error));
        }
      }

      offset = page.offset + page.content.length;
      if (processedCount >= this.maxPostings) break;
      if (offset >= page.totalFound || page.content.length < page.limit) break;
    }

    return { jobs, stats: { fetched, valid: jobs.length, rejected }, errors };
  }

  private buildListUrl(offset: number): string {
    const url = new URL(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(this.companyIdentifier)}/postings`,
    );
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("destination", "PUBLIC");
    return url.toString();
  }

  private buildDetailsUrl(postingId: string): string {
    return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(this.companyIdentifier)}/postings/${encodeURIComponent(postingId)}`;
  }

  private normalizeJob(
    posting: SmartRecruitersPosting,
    details: SmartRecruitersPostingDetails,
    discoveredAt: string,
  ): Job {
    const location = details.location ?? posting.location;
    const locationText =
      [location?.city, location?.region, location?.country]
        .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
        .join(", ") || null;
    const postingUrl = details.postingUrl;
    if (!postingUrl)
      throw new Error("SmartRecruiters posting details did not include a public postingUrl");

    return {
      id: `smartrecruiters:${this.companyIdentifier}:${details.id}`,
      externalId: details.uuid ?? details.id,
      source: this.name,
      company: details.company?.name ?? posting.company?.name ?? this.companyName,
      title: details.name.trim(),
      description: this.buildDescription(details),
      location: locationText,
      workplaceType: this.normalizeWorkplaceType(location?.remote, locationText),
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      sourceUrl: postingUrl,
      canonicalUrl: postingUrl,
      discoveredAt,
    };
  }

  private buildDescription(details: SmartRecruitersPostingDetails): string {
    const sections = Object.values(details.jobAd?.sections ?? {});
    return sections
      .map((section) => {
        const body = section.text?.trim();
        const title = section.title?.trim();
        return body ? (title ? `${title}\n${body}` : body) : "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  private normalizeWorkplaceType(
    remote: boolean | undefined,
    location: string | null,
  ): WorkplaceType {
    if (remote === true) return "remote";
    if (remote === false && location) return "onsite";
    return "unknown";
  }

  private createSourceError(error: unknown): SourceError {
    if (error instanceof HttpError) {
      return {
        code: `SMARTRECRUITERS_HTTP_${error.status}`,
        message: error.message,
        retryable:
          error.status === 408 ||
          error.status === 425 ||
          error.status === 429 ||
          error.status >= 500,
      };
    }
    return {
      code: "SMARTRECRUITERS_REQUEST_FAILED",
      message: error instanceof Error ? error.message : "Unknown SmartRecruiters source error.",
      retryable: true,
    };
  }

  private createPostingError(postingId: string, error: unknown): SourceError {
    const sourceError = this.createSourceError(error);
    return { ...sourceError, code: `${sourceError.code}_POSTING_${postingId}` };
  }
}
