import { ElevenLabsConnector } from "../connectors/elevenlabs-connector.js";
import type { ScriptDraft } from "../models/script.js";
import { logger } from "../utils/logger.js";
import type { NarratorProfile } from "../models/channel-profile.js";

export class VoiceoverGeneratorService {
  constructor(private readonly elevenLabsConnector: ElevenLabsConnector) {}

  async generate(script: ScriptDraft, narratorProfile: NarratorProfile): Promise<string> {
    logger.info("voiceover_generator: generating TTS audio", { videoId: script.videoId });
    return this.elevenLabsConnector.synthesizeVoiceover({
      videoId: script.videoId,
      text: script.fullText,
      voiceId: narratorProfile.fixedVoiceId,
    });
  }
}
