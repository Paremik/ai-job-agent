import { HttpClient, HttpError } from "../../infrastructure/http/index.js";

import { JobSchema, type Job, type WorkplaceType } from "../../domain/job.js";

import type { DiscoveryContext, JobSource, SourceError, SourceResult } from "../job-source.js";

import { GreenhouseJobSchema, GreenhouseJobsResponseSchema, type GreenhouseJob } from "./schema.js";

export type GreenhouseSourceConfig = {
  boardToken: string;
  companyName: string;
};

export class GreenhouseSource implements JobSource {
  readonly name = "greenhouse";

  private readonly boardToken: string;
  private readonly companyName: string;
  private readonly httpClient: HttpClient;

  constructor(config: GreenhouseSourceConfig, httpClient: HttpClient = new HttpClient()) {
    const boardToken = config.boardToken.trim();
    const companyName = config.companyName.trim();

    if (boardToken.length === 0) {
      throw new Error("Greenhouse boardToken cannot be empty");
    }

    if (companyName.length === 0) {
      throw new Error("Greenhouse companyName cannot be empty");
    }

    this.boardToken = boardToken;
    this.companyName = companyName;
    this.httpClient = httpClient;
  }

  async discover(_context: DiscoveryContext): Promise<SourceResult> {
    const jobs: Job[] = [];
    const errors: SourceError[] = [];

    let fetched = 0;
    let rejected = 0;

    try {
      const url = this.buildJobsUrl();

      const response = await this.httpClient.get<unknown>(url);

      const payloadResult = GreenhouseJobsResponseSchema.safeParse(response.data);

      if (!payloadResult.success) {
        return {
          jobs: [],
          stats: {
            fetched: 0,
            valid: 0,
            rejected: 0,
          },
          errors: [
            {
              code: "GREENHOUSE_INVALID_RESPONSE",
              message: "Greenhouse returned an invalid jobs response.",
              retryable: false,
            },
          ],
        };
      }

      fetched = payloadResult.data.jobs.length;

      const discoveredAt = new Date().toISOString();

      for (const rawJob of payloadResult.data.jobs) {
        const greenhouseJobResult = GreenhouseJobSchema.safeParse(rawJob);

        if (!greenhouseJobResult.success) {
          rejected += 1;

          errors.push({
            code: "GREENHOUSE_INVALID_JOB",
            message: "A Greenhouse job was rejected because its payload was invalid.",
            retryable: false,
          });

          continue;
        }

        const normalizedJob = this.normalizeJob(greenhouseJobResult.data, discoveredAt);

        const normalizedResult = JobSchema.safeParse(normalizedJob);

        if (!normalizedResult.success) {
          rejected += 1;

          errors.push({
            code: "GREENHOUSE_NORMALIZATION_FAILED",
            message: `Greenhouse job ${greenhouseJobResult.data.id} failed normalized Job validation.`,
            retryable: false,
          });

          continue;
        }

        jobs.push(normalizedResult.data);
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
    } catch (error) {
      return {
        jobs: [],
        stats: {
          fetched,
          valid: 0,
          rejected,
        },
        errors: [this.createSourceError(error)],
      };
    }
  }

  private buildJobsUrl(): string {
    const boardToken = encodeURIComponent(this.boardToken);

    return `https://boards-api.greenhouse.io/v1/boards/` + `${boardToken}/jobs?content=true`;
  }

  private normalizeJob(job: GreenhouseJob, discoveredAt: string): Job {
    const location = job.location?.name ?? null;

    return {
      id: `greenhouse:${this.boardToken}:${job.id}`,
      externalId: String(job.id),

      source: this.name,

      company: this.companyName,
      title: job.title.trim(),

      description: job.content?.trim() ?? "",

      location,

      workplaceType: this.detectWorkplaceType(job.title, location),

      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,

      sourceUrl: job.absolute_url,
      canonicalUrl: job.absolute_url,

      discoveredAt,
    };
  }

  private detectWorkplaceType(title: string, location: string | null): WorkplaceType {
    const text = `${title} ${location ?? ""}`.toLowerCase();

    if (/\bremote\b/.test(text)) {
      return "remote";
    }

    if (/\bhybrid\b/.test(text)) {
      return "hybrid";
    }

    if (/\bon[- ]?site\b|\bonsite\b/.test(text)) {
      return "onsite";
    }

    return "unknown";
  }

  private createSourceError(error: unknown): SourceError {
    if (error instanceof HttpError) {
      return {
        code: `GREENHOUSE_HTTP_${error.status}`,
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
        code: "GREENHOUSE_REQUEST_FAILED",
        message: error.message,
        retryable: true,
      };
    }

    return {
      code: "GREENHOUSE_UNKNOWN_ERROR",
      message: "Unknown Greenhouse source error.",
      retryable: false,
    };
  }
}
