import { env } from "../config/env.js";
import type { Scene } from "../models/scene.js";
import { withRetry } from "../utils/retry.js";
import { HttpClient } from "./http-client.js";

export interface VeoRenderResponse {
  provider: "veo";
  renderId: string;
  status: "queued" | "completed";
  outputUrl?: string;
}

export class VeoConnector {
  constructor(private readonly httpClient: HttpClient) {}

  async renderVideo(videoId: string, scenes: Scene[]): Promise<VeoRenderResponse> {
    return withRetry(
      async () => {
        if (!env.GOOGLE_VEO_API_KEY) {
          return {
            provider: "veo",
            renderId: `mock-veo-${videoId}-${Date.now()}`,
            status: "completed",
            outputUrl: `https://example.local/veo/${videoId}`,
          };
        }

        const prompt = scenes.map((scene) => `${scene.index}. ${scene.visualPrompt}`).join("\n");
        const response = await this.httpClient.request<{ id?: string; name?: string; outputUrl?: string }>({
          operation: `Google Veo render ${videoId}`,
          method: "POST",
          url: `${env.GOOGLE_VEO_BASE_URL}/models/veo:generateVideo?key=${env.GOOGLE_VEO_API_KEY}`,
          body: {
            prompt,
          },
        });

        return {
          provider: "veo",
          renderId: response.id ?? response.name ?? `veo-${videoId}`,
          status: "queued",
          outputUrl: response.outputUrl,
        };
      },
      {
        attempts: env.MAX_RETRIES,
        baseDelayMs: env.RETRY_BASE_DELAY_MS,
        operation: `veo connector ${videoId}`,
      },
    );
  }
}
