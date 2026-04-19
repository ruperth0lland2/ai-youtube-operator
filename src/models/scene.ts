export type ShotType =
  | "wide"
  | "medium"
  | "closeup"
  | "hero"
  | "overlay"
  | "broll"
  | "tracking";

export type MotionType =
  | "static"
  | "pan"
  | "tilt"
  | "dolly"
  | "tracking"
  | "zoom";

export type GeneratorProvider = "runway" | "veo";

export interface Scene {
  scene_id: string;
  duration_target: number;
  visual_goal: string;
  shot_type: ShotType;
  motion_type: MotionType;
  generator_provider: GeneratorProvider;
  premium: boolean;
  prompt: string;
  fallback_prompt: string;
  narration: string;
}

export type SceneJobStatus = "queued" | "processing" | "completed" | "failed";

export interface ScenePlan {
  videoId: string;
  scenes: Scene[];
  summary: string;
}
