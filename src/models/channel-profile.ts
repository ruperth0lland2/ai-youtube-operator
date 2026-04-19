export type NarratorVoiceGender = "male" | "female";

export interface ChannelIdentity {
  positioning: string;
  narratorTone: string[];
  bannedLanguage: string[];
  scriptStructure: [
    "hook_with_hard_claim",
    "explain_failing_system",
    "show_hidden_mechanism",
    "rebuild_with_ai",
    "end_with_lesson",
  ];
  visualStyle: string[];
  qualityBar: {
    memorableLineRequired: true;
    scenesMustTeach: true;
    povRequired: true;
  };
}

export interface NarratorProfile {
  fixedVoiceId: string;
  gender: NarratorVoiceGender;
  selectedAt: string;
  elevenLabsVoiceId: string;
}

