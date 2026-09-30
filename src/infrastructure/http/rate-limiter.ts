import { sleep } from "./sleep.js";

export class RateLimiter {
  private readonly minIntervalMs: number;
  private nextAllowedAt = 0;

  constructor(requestsPerSecond: number) {
    if (requestsPerSecond <= 0) {
      throw new Error("requestsPerSecond must be greater than 0");
    }

    this.minIntervalMs = 1000 / requestsPerSecond;
  }

  async wait(): Promise<void> {
    const now = Date.now();

    const scheduledAt = Math.max(now, this.nextAllowedAt);

    this.nextAllowedAt = scheduledAt + this.minIntervalMs;

    const waitMs = scheduledAt - now;

    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }
}
