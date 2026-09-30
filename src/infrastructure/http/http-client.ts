import { RateLimiter } from "./rate-limiter.js";
import {
  calculateBackoffDelay,
  defaultRetryOptions,
  isRetryableStatus,
  type RetryOptions,
} from "./retry.js";
import { sleep } from "./sleep.js";
import { createTimeoutController } from "./timeout.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HttpRequestOptions = {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
};

export type HttpResponse<T> = {
  status: number;
  headers: Headers;
  data: T;
};

export type HttpClientOptions = {
  timeoutMs?: number;
  retry?: RetryOptions;
  requestsPerSecond?: number;
};

export class HttpError extends Error {
  public readonly status: number;
  public readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);

    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

export class HttpClient {
  private readonly timeoutMs: number;
  private readonly retryOptions: RetryOptions;
  private readonly rateLimiter: RateLimiter;

  constructor(options: HttpClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retryOptions = options.retry ?? defaultRetryOptions;

    this.rateLimiter = new RateLimiter(options.requestsPerSecond ?? 5);
  }

  async request<T>(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
    const method = options.method ?? "GET";

    for (let attempt = 0; attempt <= this.retryOptions.maxRetries; attempt += 1) {
      await this.rateLimiter.wait();

      const timeout = createTimeoutController(this.timeoutMs);

      try {
        const headers = new Headers(options.headers);

        const requestInit: RequestInit = {
          method,
          headers,
          signal: timeout.signal,
        };

        if (options.body !== undefined) {
          if (!headers.has("content-type")) {
            headers.set("content-type", "application/json");
          }

          requestInit.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, requestInit);

        if (!response.ok) {
          const canRetry =
            isRetryableStatus(response.status) && attempt < this.retryOptions.maxRetries;

          if (canRetry) {
            const delay = calculateBackoffDelay(attempt, this.retryOptions);

            await sleep(delay);
            continue;
          }

          throw new HttpError(
            `HTTP request failed with status ${response.status}`,
            response.status,
            url,
          );
        }

        const data = (await response.json()) as T;

        return {
          status: response.status,
          headers: response.headers,
          data,
        };
      } catch (error) {
        if (error instanceof HttpError) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          throw new Error(`HTTP request timed out after ${this.timeoutMs} ms: ${url}`, {
            cause: error,
          });
        }
        const delay = calculateBackoffDelay(attempt, this.retryOptions);

        await sleep(delay);
      } finally {
        timeout.cleanup();
      }
    }

    throw new Error("HTTP request failed unexpectedly");
  }

  async get<T>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    if (headers === undefined) {
      return this.request<T>(url, {
        method: "GET",
      });
    }

    return this.request<T>(url, {
      method: "GET",
      headers,
    });
  }
}
