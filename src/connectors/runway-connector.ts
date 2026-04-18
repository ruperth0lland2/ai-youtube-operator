import { env } from "../config/env.js";
import type { Scene } from "../models/scene.js";
import { withRetry } from "../utils/retry.js";
import { HttpClient } from "./http-client.js";

export interface RenderResult {
  provider: "runway";
  renderId: string;
  status: "queued" | "completed";
  outputUrl?: string;
}

export class RunwayConnector {
  constructor(private readonly httpClient: HttpClient) {}

  async renderVideo(videoId: string, scenes: Scene[]): Promise<RenderResult> {
    return withRetry(
      async () => {
        if (!env.RUNWAY_API_KEY) {
          return {
            provider: "runway",
            renderId: `mock-runway-${videoId}-${Date.now()}`,
            status: "completed",
            outputUrl: `https://example.local/runway/${videoId}`,
          };
        }

        const promptText = scenes.map((scene) => `${scene.index}. ${scene.visualPrompt}`).join("\n");
        const response = await this.httpClient.request<{ id: string; outputUrl?: string }>({
          operation: `runway-render-${videoId}`,
          method: "POST",
          url: `${env.RUNWAY_BASE_URL}/generations`,
          headers: {
            Authorization: `Bearer ${env.RUNWAY_API_KEY}`,
          },
          body: {
            promptText,
            ratio: "16:9",
          },
        });

        return {
          provider: "runway",
          renderId: response.id,
          status: "queued",
          outputUrl: response.outputUrl,
        };
      },
      {
        operation: `runway connector ${videoId}`,
        attempts: env.MAX_RETRIES,
        baseDelayMs: env.RETRY_BASE_DELAY_MS,
      },
    );
  }
}
