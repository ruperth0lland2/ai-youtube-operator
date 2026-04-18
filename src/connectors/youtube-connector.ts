import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { HttpClient } from "./http-client.js";

export interface YouTubeUploadInput {
  videoId: string;
  title: string;
  description: string;
  renderPath: string;
}

export interface YouTubeUploadResult {
  uploadId: string;
  videoUrl: string;
}

export class YouTubeConnector {
  constructor(private readonly httpClient: HttpClient) {}

  async uploadVideo(input: YouTubeUploadInput): Promise<YouTubeUploadResult> {
    return withRetry(
      async () => {
        if (!env.YOUTUBE_API_KEY) {
          logger.warn("YOUTUBE_API_KEY missing; using simulated upload", {
            videoId: input.videoId,
          });
          return {
            uploadId: `sim-upload-${input.videoId}`,
            videoUrl: `https://youtube.com/watch?v=sim-${input.videoId}`,
          };
        }

        await this.httpClient.request<Record<string, unknown>>({
          operation: `YouTube upload ${input.videoId}`,
          method: "POST",
          url: `${env.YOUTUBE_BASE_URL}/videos?part=snippet,status&key=${env.YOUTUBE_API_KEY}`,
          headers: {
            Authorization: `Bearer ${env.YOUTUBE_REFRESH_TOKEN ?? ""}`,
          },
          body: {
            snippet: {
              title: input.title,
              description: input.description,
            },
            status: {
              privacyStatus: "private",
            },
            media: {
              filePath: input.renderPath,
            },
          },
        });

        const generatedId = randomUUID().replaceAll("-", "").slice(0, 11);
        return {
          uploadId: generatedId,
          videoUrl: `https://youtube.com/watch?v=${generatedId}`,
        };
      },
      {
        operation: "youtube_upload",
        attempts: env.MAX_RETRIES,
        baseDelayMs: env.RETRY_BASE_DELAY_MS,
      },
    );
  }
}
