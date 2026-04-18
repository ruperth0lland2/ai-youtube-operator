export interface Scene {
  index: number;
  visualPrompt: string;
  narration: string;
  durationSeconds: number;
}

export interface ScenePlan {
  videoId: string;
  scenes: Scene[];
  summary: string;
}
