import type { Scene, ScenePlan } from "../models/scene.js";

const SHOT_TYPES: Scene["shot_type"][] = ["wide", "medium", "closeup", "hero", "overlay", "broll"];
const MOTION_TYPES: Scene["motion_type"][] = ["static", "pan", "tilt", "dolly", "tracking", "zoom"];

export class ScenePlannerService {
  generate(videoId: string, script: string): ScenePlan {
    return this.plan(videoId, script);
  }

  plan(videoId: string, script: string): ScenePlan {
    const baseLines = script
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const contentLines =
      baseLines.length > 0
        ? baseLines
        : [
            "Open with the core claim.",
            "Explain the underlying operating model.",
            "Show the business tradeoffs.",
            "Counterpoint and risk.",
            "Close with execution takeaway.",
          ];

    const targetCount = Math.max(12, Math.min(20, Math.max(contentLines.length * 2, 12)));
    const scenes: Scene[] = [];

    for (let i = 0; i < targetCount; i += 1) {
      const seed = contentLines[i % contentLines.length];
      const shotType = SHOT_TYPES[i % SHOT_TYPES.length];
      const motionType = MOTION_TYPES[i % MOTION_TYPES.length];
      const premium = shotType === "hero" || i % 5 === 0;
      const generatorProvider: Scene["generator_provider"] = premium ? "veo" : "runway";
      const sceneId = `scene_${String(i + 1).padStart(2, "0")}`;
      const durationTarget = i % 4 === 0 ? 5 : i % 4 === 1 ? 6 : i % 4 === 2 ? 7 : 8;

      scenes.push({
        scene_id: sceneId,
        duration_target: durationTarget,
        visual_goal: `Translate "${seed}" into a high-signal visual beat`,
        shot_type: shotType,
        motion_type: motionType,
        premium,
        generator_provider: generatorProvider,
        narration: seed,
        prompt: [
          "16:9 cinematic scene",
          `goal: ${seed}`,
          `shot_type: ${shotType}`,
          `motion: ${motionType}`,
          "tone: sharp, grounded, operator-focused",
          "high production quality, realistic lighting, no text overlay",
        ].join("; "),
        fallback_prompt: [
          "16:9 clean b-roll",
          `business context: ${seed}`,
          "clear subject, stable framing, neutral grade",
          "no logos, no text, no subtitles",
        ].join("; "),
      });
    }

    return {
      videoId,
      scenes,
      summary: scenes.map((scene) => `${scene.scene_id}: ${scene.visual_goal}`).join("\n"),
    };
  }
}
