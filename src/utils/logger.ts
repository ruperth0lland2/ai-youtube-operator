import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

export type LogLevel = "info" | "warn" | "error";
type LogMeta = Record<string, unknown> | undefined;

export class AppLogger {
  private readonly logFilePath: string;

  constructor(logDir: string) {
    fs.mkdirSync(logDir, { recursive: true });
    this.logFilePath = path.join(logDir, "app.log");
  }

  info(message: string, meta?: LogMeta): void {
    this.write("info", message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.write("warn", message, meta);
  }

  error(message: string, meta?: LogMeta): void {
    this.write("error", message, meta);
  }

  private write(level: LogLevel, message: string, meta?: LogMeta): void {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      meta: meta ?? {},
    });
    const consoleFn = level === "error" ? console.error : console.log;
    consoleFn(line);
    fs.appendFileSync(this.logFilePath, `${line}\n`, "utf-8");
  }
}

export const logger = new AppLogger(env.LOGS_DIR);
