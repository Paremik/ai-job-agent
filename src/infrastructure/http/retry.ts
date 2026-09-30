export type RetryOptions = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export const defaultRetryOptions: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
};

export function calculateBackoffDelay(
  attempt: number,
  options: RetryOptions = defaultRetryOptions,
): number {
  const exponentialDelay = options.baseDelayMs * 2 ** attempt;

  return Math.min(exponentialDelay, options.maxDelayMs);
}

export function isRetryableStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}
