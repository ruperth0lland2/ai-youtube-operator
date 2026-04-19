import { logger } from "./logger.js";

export interface RetryOptions {
  operation: string;
  attempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  const factor = options.factor ?? 2;

  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      logger.info(`${options.operation}: attempt ${attempt}/${options.attempts}`);
      return await fn();
    } catch (error) {
      lastError = error;
      logger.warn(`${options.operation}: attempt ${attempt} failed`, {
        error: String(error),
      });
      if (attempt < options.attempts) {
        const delay = Math.min(baseDelayMs * factor ** (attempt - 1), maxDelayMs);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}
