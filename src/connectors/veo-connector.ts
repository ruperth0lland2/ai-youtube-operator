import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { withRetry } from "../utils/retry.js";
import { HttpClient } from "./http-client.js";

export interface VeoOperation {
  name: string;
  done: boolean;
  metadata?: {
    state?: string;
  };
  response?: {
    outputUri?: string;
    videoUri?: string;
    uri?: string;
  };
}

export interface VeoSubmittedJob {
  provider: "veo";
  jobId: string;
  operationName: string;
  status: "queued" | "running" | "completed" | "failed";
}

export interface VeoDownloadedVideo {
  provider: "veo";
  jobId: string;
  outputUri: string;
}

export class VeoService {
  constructor(private readonly httpClient: HttpClient) {}

  async submitGeneration(prompt: string): Promise<VeoSubmittedJob> {
    return withRetry(
      async () => {
        if (!env.GOOGLE_VEO_API_KEY) {
          const opName = `operations/mock-veo-${randomUUID()}`;
          return {
            provider: "veo",
            jobId: opName,
            operationName: opName,
            status: "running",
          };
        }

        const response = await this.httpClient.request<{ name?: string }>({
          operation: "veo.submit_generation",
          method: "POST",
          url: `${env.GOOGLE_VEO_BASE_URL}/models/veo:generateVideo?key=${env.GOOGLE_VEO_API_KEY}`,
          body: {
            prompt,
          },
        });
        const operationName = response.name ?? `operations/veo-${randomUUID()}`;
        return {
          provider: "veo",
          jobId: operationName,
          operationName,
          status: "running",
        };
      },
      {
        operation: "veo.submit_generation",
        attempts: env.MAX_RETRIES,
        baseDelayMs: env.RETRY_BASE_DELAY_MS,
      },
    );
  }

  async getVideoJob(jobId: string): Promise<VeoOperation> {
    return withRetry(
      async () => {
        if (!env.GOOGLE_VEO_API_KEY) {
          return {
            name: jobId,
            done: true,
            response: {
              outputUri: `https://example.local/veo/${encodeURIComponent(jobId)}.mp4`,
            },
          };
        }
        return this.httpClient.request<VeoOperation>({
          operation: `veo.get_video_job:${jobId}`,
          method: "GET",
          url: `${env.GOOGLE_VEO_BASE_URL}/${jobId}?key=${env.GOOGLE_VEO_API_KEY}`,
        });
      },
      {
        operation: `veo.get_video_job:${jobId}`,
        attempts: env.MAX_RETRIES,
        baseDelayMs: env.RETRY_BASE_DELAY_MS,
      },
    );
  }

  async pollUntilDone(jobId: string): Promise<VeoOperation> {
    for (let attempt = 1; attempt <= env.VEO_POLL_MAX_ATTEMPTS; attempt += 1) {
      const operation = await this.getVideoJob(jobId);
      if (operation.done) {
        return operation;
      }
      await new Promise((resolve) => setTimeout(resolve, env.VEO_POLL_INTERVAL_MS));
    }
    throw new Error(`Veo job ${jobId} did not complete within polling limits`);
  }

  async downloadVideo(jobId: string): Promise<VeoDownloadedVideo> {
    const operation = await this.pollUntilDone(jobId);
    const uri =
      operation.response?.outputUri ?? operation.response?.videoUri ?? operation.response?.uri;
    if (!uri) {
      throw new Error(`Veo job ${jobId} completed without output URI`);
    }
    return {
      provider: "veo",
      jobId,
      outputUri: uri,
    };
  }
}
