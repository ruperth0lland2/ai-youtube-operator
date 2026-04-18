import { env } from "../config/env.js";
import { withRetry } from "../utils/retry.js";
import { HttpClient } from "./http-client.js";

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

  async createVideoJob(prompt: string, imageRefs?: string[], videoRefs?: string[]): Promise<RunwayVideoJob> {
    return withRetry(
      async () => {
        if (!env.RUNWAY_API_KEY) {
          const jobId = `mock-runway-${Date.now()}`;
          return {
            jobId,
            responseId: jobId,
            status: "completed",
            outputUri: `https://example.local/runway/${jobId}.mp4`,
          };
        }

        const response = await this.httpClient.request<{ id: string; status?: string; outputUri?: string }>({
          operation: "runway.createVideoJob",
          method: "POST",
          url: `${env.RUNWAY_BASE_URL}/generations`,
          headers: {
            Authorization: `Bearer ${env.RUNWAY_API_KEY}`,
          },
          body: {
            prompt,
            imageRefs: imageRefs ?? [],
            videoRefs: videoRefs ?? [],
            ratio: "16:9",
          } satisfies RunwayCreateVideoJobInput,
        });

        return {
          jobId: response.id,
          responseId: response.id,
          status: (response.status as RunwayVideoJob["status"]) ?? "queued",
          outputUri: response.outputUri,
        };
      },
      {
        operation: "runway.createVideoJob",
        attempts: env.MAX_RETRIES,
        baseDelayMs: env.RETRY_BASE_DELAY_MS,
      },
    );
  }

  async getVideoJob(jobId: string): Promise<RunwayVideoJob> {
    return withRetry(
      async () => {
        if (!env.RUNWAY_API_KEY) {
          return {
            jobId,
            responseId: jobId,
            status: "completed",
            outputUri: `https://example.local/runway/${jobId}.mp4`,
          };
        }

        const response = await this.httpClient.request<{ id?: string; status?: string; outputUri?: string }>({
          operation: "runway.getVideoJob",
          method: "GET",
          url: `${env.RUNWAY_BASE_URL}/generations/${jobId}`,
          headers: {
            Authorization: `Bearer ${env.RUNWAY_API_KEY}`,
          },
        });

        return {
          jobId: response.id ?? jobId,
          responseId: response.id ?? jobId,
          status: (response.status as RunwayVideoJob["status"]) ?? "processing",
          outputUri: response.outputUri,
        };
      },
      {
        operation: "runway.getVideoJob",
        attempts: env.MAX_RETRIES,
        baseDelayMs: env.RETRY_BASE_DELAY_MS,
      },
    );
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
}
