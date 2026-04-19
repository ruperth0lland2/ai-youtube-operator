import type { Scene, ScenePlan } from "../models/scene.js";
import type { ChannelIdentity } from "../models/channel-profile.js";
import { z } from "zod";
import { AnthropicConnector } from "../connectors/anthropic-connector.js";
import { parseJsonArray } from "../utils/json-schema.js";
import { AppError } from "../utils/app-error.js";
import { ErrorCategory } from "../models/error-category.js";

const sceneSchema = z.object({
  scene_id: z.string().min(1),
  duration_target: z.number().int().min(3).max(20),
  visual_goal: z.string().min(10),
  shot_type: z.enum(["wide", "medium", "closeup", "hero", "overlay", "broll", "tracking"]),
  motion_type: z.enum(["static", "pan", "tilt", "dolly", "tracking", "zoom"]),
  generator_provider: z.enum(["runway", "veo"]),
  prompt: z.string().min(10),
  fallback_prompt: z.string().min(10),
  premium: z.boolean(),
  narration: z.string().min(5),
});

const sceneArraySchema = z.array(sceneSchema).min(12).max(20);

export class ScenePlannerService {
  constructor(private readonly anthropicConnector: AnthropicConnector) {}

  async generate(videoId: string, script: string, identity: ChannelIdentity): Promise<ScenePlan> {
    return this.plan(videoId, script, identity);
  }

  async plan(videoId: string, script: string, identity: ChannelIdentity): Promise<ScenePlan> {
    const responseText = await this.anthropicConnector.generateJson({
      operation: "scene_planner.generate",
      system: [
        "You are a documentary scene planner for an AI business channel.",
        "Return only a JSON array, no prose.",
        "Create 12-20 scenes in chronological order.",
        `Channel positioning: ${identity.positioning}`,
        `Visual style rules: ${identity.visualStyle.join("; ")}`,
      ].join("\n"),
      user: [
        "Source script:",
        script,
        "",
        "Return JSON array where each item has exactly:",
        "scene_id, duration_target, visual_goal, shot_type, motion_type, generator_provider, prompt, fallback_prompt, premium, narration",
      ].join("\n"),
      maxTokens: 4096,
      temperature: 0.2,
    });

    const parsed = parseJsonArray<unknown>(responseText, "scene_planner.generate");
    const validated = sceneArraySchema.safeParse(parsed);
    if (!validated.success) {
      throw new AppError(
        ErrorCategory.PROVIDER_ERROR,
        `Malformed scene JSON from Claude: ${validated.error.message}`,
      );
    }

    const scenes: Scene[] = validated.data;
    return {
      videoId,
      scenes,
      summary: scenes.map((scene) => `${scene.scene_id}: ${scene.visual_goal}`).join("\n"),
    };
  }
}
