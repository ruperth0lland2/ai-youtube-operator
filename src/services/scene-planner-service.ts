import type { Scene, ScenePlan } from "../models/scene.js";

export class ScenePlannerService {
  generate(videoId: string, script: string): ScenePlan {
    return this.plan(videoId, script);
  }

  plan(videoId: string, script: string): ScenePlan {
    const lines = script
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const selected = lines.slice(0, 6);
    const fallback = selected.length > 0 ? selected : ["Introduce the topic with a strong visual hook."];

    const scenes: Scene[] = fallback.map((line, idx) => ({
      index: idx + 1,
      narration: line,
      visualPrompt: `Cinematic 16:9 shot for: ${line}`,
      durationSeconds: 6,
    }));

    return {
      videoId,
      scenes,
      summary: scenes.map((scene) => `Scene ${scene.index}: ${scene.visualPrompt}`).join("\n"),
    };
  }
}
