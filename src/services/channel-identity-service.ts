import path from "node:path";
import { env } from "../config/env.js";
import type { ChannelIdentity, NarratorProfile, NarratorVoiceGender } from "../models/channel-profile.js";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";

const CHANNEL_IDENTITY: ChannelIdentity = {
  positioning:
    "We make documentary-style breakdowns of broken business systems and how AI would redesign them.",
  narratorTone: [
    "sounds like an operator, not a presenter",
    "slightly dry",
    "intelligent",
    "skeptical",
    "never excited without reason",
  ],
  bannedLanguage: [
    "In today's video",
    "Welcome back",
    "game-changer",
    "revolutionary",
    "let's dive in",
    "smash the like button",
    "AI is taking over",
  ],
  scriptStructure: [
    "hook_with_hard_claim",
    "explain_failing_system",
    "show_hidden_mechanism",
    "rebuild_with_ai",
    "end_with_lesson",
  ],
  visualStyle: [
    "dark neutral UI",
    "cinematic but restrained",
    "diagrams, overlays, mock dashboards, maps, short generated inserts",
    "no endless stock footage",
    "no random flashy transitions",
  ],
  qualityBar: {
    memorableLineRequired: true,
    scenesMustTeach: true,
    povRequired: true,
  },
};

function chooseVoice(seed: string): NarratorVoiceGender {
  const score = Array.from(seed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return score % 2 === 0 ? "male" : "female";
}

function defaultNarratorProfile(seed: string): NarratorProfile {
  const gender = chooseVoice(seed || "ai-youtube-operator");
  return {
    fixedVoiceId: `${gender}-operator-default`,
    gender,
    elevenLabsVoiceId: gender === "male" ? "EXAVITQu4vr4xnSDxMaL" : "MF3mGyEYCl7XYWbV9V6O",
    selectedAt: new Date().toISOString(),
  };
}

export class ChannelIdentityService {
  private readonly narratorProfilePath: string;

  constructor(narratorProfilePath = path.join(env.DATA_DIR, "narrator-profile.json")) {
    this.narratorProfilePath = narratorProfilePath;
  }

  getIdentity(): ChannelIdentity {
    return CHANNEL_IDENTITY;
  }

  async loadOrCreateNarratorProfile(seed = ""): Promise<NarratorProfile> {
    const fallback = defaultNarratorProfile(seed);
    const profile = await readJsonFile<NarratorProfile>(this.narratorProfilePath, fallback);
    await writeJsonFile(this.narratorProfilePath, profile);
    return profile;
  }
}
