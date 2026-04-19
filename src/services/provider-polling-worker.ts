import { JsonJobQueue } from "../queue/json-job-queue.js";
import { VideoJobRunnerService } from "./video-job-runner-service.js";
import { logger } from "../utils/logger.js";

export class ProviderPollingWorker {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly queue: JsonJobQueue,
    private readonly runner: VideoJobRunnerService,
    private readonly intervalMs = 10_000,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(async () => {
      try {
        const jobs = await this.queue.listJobs();
        const inFlight = jobs.filter((job) =>
          (job.providerJobIds ?? []).some((record) => {
            const normalized = record.status.toLowerCase();
            return normalized !== "completed" && normalized !== "failed";
          }),
        );
        for (const job of inFlight) {
          await this.runner.pollInFlightForJob(job.videoId);
        }
      } catch (error) {
        logger.warn("provider polling worker iteration failed", {
          error: String(error),
        });
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
