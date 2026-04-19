import { env } from "../config/env.js";
import { withRetry } from "../utils/retry.js";
import { logger } from "../utils/logger.js";
import { HttpClient } from "./http-client.js";

export interface ElevenLabsRequest {
  videoId: string;
  text: string;
  voiceId?: string;
}

export class ElevenLabsConnector {
  constructor(private readonly httpClient: HttpClient) {}

  async synthesizeVoiceover(req: ElevenLabsRequest): Promise<string> {
    return withRetry(
      async () => {
        if (!env.ELEVENLABS_API_KEY) {
          logger.warn("ELEVENLABS_API_KEY missing; using mocked TTS output", { videoId: req.videoId });
          return `MOCK_TTS(${req.videoId}): ${req.text}`;
        }

        const voiceId = req.voiceId ?? env.ELEVENLABS_VOICE_ID;
        const endpoint = `${env.ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`;
        const response = await this.httpClient.request<{ audio_base64?: string; rawText?: string }>({
          operation: `ElevenLabs TTS ${req.videoId}`,
          method: "POST",
          url: endpoint,
          headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
          body: {
            text: req.text,
            model_id: "eleven_multilingual_v2",
          },
          retries: env.MAX_RETRIES,
        });

        return response.audio_base64 ?? response.rawText ?? `TTS_OK(${req.videoId})`;
      },
      {
        attempts: env.MAX_RETRIES,
        baseDelayMs: env.RETRY_BASE_DELAY_MS,
        operation: `elevenlabs connector ${req.videoId}`,
      },
    );
  }
}
