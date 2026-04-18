import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";

export interface HttpRequestOptions {
  operation: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  retries?: number;
  timeoutMs?: number;
}

export class HttpClient {
  // Centralized HTTP client with retry+logging for all external APIs.
  async request<T>(options: HttpRequestOptions): Promise<T> {
    const {
      operation,
      method,
      url,
      headers,
      body,
      retries = env.MAX_RETRIES,
      timeoutMs = env.HTTP_TIMEOUT_MS,
    } = options;
    return withRetry(
      async () => {
        logger.info("Outgoing HTTP request", { operation, method, url });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(url, {
            method,
            headers: {
              "Content-Type": "application/json",
              ...(headers ?? {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
          });

          const rawBody = await response.text();
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}: ${rawBody}`);
          }

          if (!rawBody) {
            return {} as T;
          }

          try {
            return JSON.parse(rawBody) as T;
          } catch {
            return { rawBody } as T;
          }
        } finally {
          clearTimeout(timeout);
        }
      },
      {
        operation,
        attempts: retries,
        baseDelayMs: env.RETRY_BASE_DELAY_MS,
      },
    );
  }
}
