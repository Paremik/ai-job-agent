import type { Job } from "../domain/job.js";

export type SourceError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type DiscoveryContext = {
  runId: string;
  startedAt: Date;
};

export type SourceStats = {
  fetched: number;
  valid: number;
  rejected: number;
};

export type SourceResult = {
  jobs: Job[];
  stats: SourceStats;
  errors: SourceError[];
};

export interface JobSource {
  readonly name: string;

  discover(context: DiscoveryContext): Promise<SourceResult>;
}
