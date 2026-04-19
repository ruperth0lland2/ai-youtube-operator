import { env } from "../config/env.js";
import { withRetry } from "../utils/retry.js";
import { logger } from "../utils/logger.js";
import { HttpClient } from "./http-client.js";
import { AppError } from "../utils/app-error.js";
import { ErrorCategory } from "../models/error-category.js";
import { ensureDirectory } from "../utils/fs.js";
import path from "node:path";
import { writeFile } from "node:fs/promises";

export interface ElevenLabsRequest {
  videoId: string;
  text: string;
  voiceId?: string;
  outputPath: string;
}

export class ElevenLabsConnector {
  constructor(private readonly httpClient: HttpClient) {}

  async synthesizeVoiceover(req: ElevenLabsRequest): Promise<string> {
    return withRetry(
      async () => {
        if (!env.ELEVENLABS_API_KEY) {
          throw new AppError(
            ErrorCategory.AUTH_ERROR,
            "ELEVENLABS_API_KEY missing; voiceover generation cannot run",
          );
        }

        const voiceId = req.voiceId ?? env.ELEVENLABS_VOICE_ID;
        const endpoint = `${env.ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": env.ELEVENLABS_API_KEY,
          },
          body: JSON.stringify({
            text: req.text,
            model_id: "eleven_multilingual_v2",
            output_format: "mp3_44100_128",
          }),
        });
        if (!response.ok) {
          const body = await response.text();
          throw new AppError(
            ErrorCategory.PROVIDER_ERROR,
            `ElevenLabs TTS failed: ${response.status} ${response.statusText} ${body}`,
          );
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === 0) {
          throw new AppError(ErrorCategory.PROVIDER_ERROR, "ElevenLabs returned empty audio payload");
        }
        await ensureDirectory(path.dirname(req.outputPath));
        await writeFile(req.outputPath, bytes);
        logger.info("elevenlabs: wrote voiceover file", { videoId: req.videoId, outputPath: req.outputPath });
        return req.outputPath;
      },
      {
        attempts: env.MAX_RETRIES,
        baseDelayMs: env.RETRY_BASE_DELAY_MS,
        operation: `elevenlabs connector ${req.videoId}`,
      },
    );
  }
}
