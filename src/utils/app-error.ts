import { ErrorCategory } from "../models/error-category.js";

export class AppError extends Error {
  constructor(
    public readonly category: ErrorCategory,
    message: string,
    public readonly details?: Record<string, unknown> | { cause?: unknown },
  ) {
    super(message);
    this.name = "AppError";
  }
}
