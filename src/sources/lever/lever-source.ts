import { HttpClient, HttpError } from "../../infrastructure/http/index.js";

import { JobSchema, type Job, type WorkplaceType } from "../../domain/job.js";

import type { DiscoveryContext, JobSource, SourceError, SourceResult } from "../job-source.js";

import { LeverJobSchema, LeverJobsResponseSchema, type LeverJob } from "./schema.js";

const PAGE_SIZE = 100;

export type LeverRegion = "global" | "eu";

export type LeverSourceConfig = {
  site: string;
  companyName: string;
  region?: LeverRegion;
};

export class LeverSource implements JobSource {
  readonly name = "lever";

  private readonly site: string;
  private readonly companyName: string;
  private readonly region: LeverRegion;
  private readonly httpClient: HttpClient;

  constructor(config: LeverSourceConfig, httpClient: HttpClient = new HttpClient()) {
    const site = config.site.trim();
    const companyName = config.companyName.trim();

    if (site.length === 0) {
      throw new Error("Lever site cannot be empty");
    }

    if (companyName.length === 0) {
      throw new Error("Lever companyName cannot be empty");
    }

    this.site = site;
    this.companyName = companyName;
    this.region = config.region ?? "global";
    this.httpClient = httpClient;
  }

  async discover(_context: DiscoveryContext): Promise<SourceResult> {
    const jobs: Job[] = [];
    const errors: SourceError[] = [];

    let fetched = 0;
    let rejected = 0;
    let skip = 0;

    while (true) {
      let payload: unknown;

      try {
        const response = await this.httpClient.get<unknown>(this.buildJobsUrl(skip), {
          Accept: "application/json",
        });
        payload = response.data;
      } catch (error) {
        errors.push(this.createSourceError(error));
        break;
      }

      const payloadResult = LeverJobsResponseSchema.safeParse(payload);

      if (!payloadResult.success) {
        errors.push({
          code: "LEVER_INVALID_RESPONSE",
          message: "Lever returned an invalid jobs response.",
          retryable: false,
        });
        break;
      }

      const postings = payloadResult.data;
      fetched += postings.length;

      const discoveredAt = new Date().toISOString();

      for (const rawJob of postings) {
        const leverJobResult = LeverJobSchema.safeParse(rawJob);

        if (!leverJobResult.success) {
          rejected += 1;
          errors.push({
            code: "LEVER_INVALID_JOB",
            message: "A Lever job was rejected because its payload was invalid.",
            retryable: false,
          });
          continue;
        }

        const normalizedResult = JobSchema.safeParse(
          this.normalizeJob(leverJobResult.data, discoveredAt),
        );

        if (!normalizedResult.success) {
          rejected += 1;
          errors.push({
            code: "LEVER_NORMALIZATION_FAILED",
            message: `Lever job ${leverJobResult.data.id} failed normalized Job validation.`,
            retryable: false,
          });
          continue;
        }

        jobs.push(normalizedResult.data);
      }

      if (postings.length < PAGE_SIZE) {
        break;
      }

      skip += postings.length;
    }

    return {
      jobs,
      stats: {
        fetched,
        valid: jobs.length,
        rejected,
      },
      errors,
    };
  }

  private buildJobsUrl(skip: number): string {
    const host = this.region === "eu" ? "api.eu.lever.co" : "api.lever.co";
    const url = new URL(`https://${host}/v0/postings/${encodeURIComponent(this.site)}`);

    url.searchParams.set("mode", "json");
    url.searchParams.set("skip", String(skip));
    url.searchParams.set("limit", String(PAGE_SIZE));

    return url.toString();
  }

  private normalizeJob(job: LeverJob, discoveredAt: string): Job {
    const location = job.categories?.location?.trim() || null;

    return {
      id: `lever:${this.region}:${this.site}:${job.id}`,
      externalId: job.id,

      source: this.name,

      company: this.companyName,
      title: job.text.trim(),
      description: this.buildDescription(job),

      location,
      workplaceType: this.normalizeWorkplaceType(job.workplaceType),

      // The current domain model cannot represent salary intervals safely.
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,

      sourceUrl: job.hostedUrl,
      canonicalUrl: job.hostedUrl,

      discoveredAt,
    };
  }

  private buildDescription(job: LeverJob): string {
    const parts = [job.descriptionPlain?.trim() || job.description?.trim() || ""];

    for (const list of job.lists ?? []) {
      parts.push(`${list.text}\n${list.content}`);
    }

    const additional = job.additionalPlain?.trim() || job.additional?.trim();

    if (additional) {
      parts.push(additional);
    }

    if (job.salaryRange) {
      parts.push(
        `Salary range: ${job.salaryRange.min}-${job.salaryRange.max} ${job.salaryRange.currency} (${job.salaryRange.interval})`,
      );
    }

    const salaryDescription = job.salaryDescriptionPlain?.trim() || job.salaryDescription?.trim();

    if (salaryDescription) {
      parts.push(salaryDescription);
    }

    return parts.filter(Boolean).join("\n\n");
  }

  private normalizeWorkplaceType(value: string | undefined): WorkplaceType {
    switch (value?.trim().toLowerCase()) {
      case "remote":
        return "remote";
      case "hybrid":
        return "hybrid";
      case "on-site":
      case "onsite":
      case "on site":
        return "onsite";
      default:
        return "unknown";
    }
  }

  private createSourceError(error: unknown): SourceError {
    if (error instanceof HttpError) {
      return {
        code: `LEVER_HTTP_${error.status}`,
        message: error.message,
        retryable:
          error.status === 408 ||
          error.status === 425 ||
          error.status === 429 ||
          error.status >= 500,
      };
    }

    if (error instanceof Error) {
      return {
        code: "LEVER_REQUEST_FAILED",
        message: error.message,
        retryable: true,
      };
    }

    return {
      code: "LEVER_UNKNOWN_ERROR",
      message: "Unknown Lever source error.",
      retryable: false,
    };
  }
}
