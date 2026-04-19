import { env } from "../config/env.js";
import { withRetry } from "../utils/retry.js";
import { AppError } from "../utils/app-error.js";
import { ErrorCategory } from "../models/error-category.js";
import { HttpClient } from "./http-client.js";
import { providerConcurrencyLimiter } from "../utils/concurrency-limiter.js";

export interface RunwayCreateVideoJobInput {
  prompt: string;
  imageRefs?: string[];
  videoRefs?: string[];
  ratio?: string;
}

export interface RunwayVideoJob {
  jobId: string;
  responseId: string;
  status: "queued" | "processing" | "completed" | "failed";
  outputUri?: string;
  error?: string;
}

export interface RunwayDownloadResult {
  jobId: string;
  outputUri: string;
}

export class RunwayService {
  constructor(private readonly httpClient: HttpClient) {}

  private runwayHeaders(): Record<string, string> {
    if (!env.RUNWAY_API_KEY) {
      throw new AppError(ErrorCategory.AUTH_ERROR, "RUNWAY_API_KEY is required");
    }
    return {
      Authorization: `Bearer ${env.RUNWAY_API_KEY}`,
      "X-Runway-Version": "2024-11-06",
    };
  }

  async createVideoJob(prompt: string, imageRefs?: string[], videoRefs?: string[]): Promise<RunwayVideoJob> {
    return providerConcurrencyLimiter.run(async () =>
      withRetry(
        async () => {
          const endpoint = imageRefs && imageRefs.length > 0 ? "/image_to_video" : "/text_to_video";

          const response = await this.httpClient.request<{
            id: string;
            status?: string;
            output?: { url?: string }[];
          }>({
            operation: "runway.createVideoJob",
            method: "POST",
            url: `${env.RUNWAY_BASE_URL}${endpoint}`,
            headers: this.runwayHeaders(),
            body: {
              prompt,
              ...(imageRefs && imageRefs.length > 0 ? { image_url: imageRefs[0] } : {}),
              ...(videoRefs && videoRefs.length > 0 ? { video_url: videoRefs[0] } : {}),
            },
          });

          return {
            jobId: response.id,
            responseId: response.id,
            status: (response.status as RunwayVideoJob["status"]) ?? "queued",
            outputUri: response.output?.[0]?.url,
          };
        },
        {
          operation: "runway.createVideoJob",
          attempts: env.MAX_RETRIES,
          baseDelayMs: env.RETRY_BASE_DELAY_MS,
        },
      ),
    );
  }

  async getVideoJob(jobId: string): Promise<RunwayVideoJob> {
    for (let attempt = 1; attempt <= env.VEO_POLL_MAX_ATTEMPTS; attempt += 1) {
      const response = await this.httpClient.request<{
        id?: string;
        status?: string;
        output?: { url?: string }[];
        failure?: string;
      }>({
        operation: "runway.getVideoJob",
        method: "GET",
        url: `${env.RUNWAY_BASE_URL}/tasks/${jobId}`,
        headers: this.runwayHeaders(),
      });

      const mappedStatus = this.mapTaskStatus(response.status);
      if (mappedStatus === "completed") {
        return {
          jobId: response.id ?? jobId,
          responseId: response.id ?? jobId,
          status: mappedStatus,
          outputUri: response.output?.[0]?.url,
        };
      }
      if (mappedStatus === "failed") {
        throw new AppError(
          ErrorCategory.PROVIDER_ERROR,
          `Runway task failed: ${response.failure ?? response.status ?? "unknown failure"}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, env.VEO_POLL_INTERVAL_MS));
    }
    throw new AppError(ErrorCategory.PROVIDER_ERROR, `Runway task ${jobId} timed out`);
  }

  async downloadVideo(jobId: string): Promise<RunwayDownloadResult> {
    const job = await this.getVideoJob(jobId);
    if (!job.outputUri) {
      throw new Error(`Runway job ${jobId} has no output URI`);
    }
    return {
      jobId,
      outputUri: job.outputUri,
    };
  }

  private mapTaskStatus(status?: string): RunwayVideoJob["status"] {
    const upper = (status ?? "").toUpperCase();
    if (upper === "SUCCEEDED") {
      return "completed";
    }
    if (upper === "FAILED") {
      return "failed";
    }
    if (upper === "PENDING" || upper === "RUNNING" || upper === "PROCESSING") {
      return "processing";
    }
    return "queued";
  }
}
