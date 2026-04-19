import type { ResearchBrief } from "../models/research.js";
import type { ScriptDraft } from "../models/script.js";
import type { ChannelIdentity } from "../models/channel-profile.js";
import { AnthropicConnector } from "../connectors/anthropic-connector.js";
import { logger } from "../utils/logger.js";
import { parseJsonObject } from "../utils/json-schema.js";

const SCRIPT_RESPONSE_PROMPT = `
Return ONLY valid JSON matching this exact shape:
{
  "hookHardClaim": "string",
  "failingSystem": "string",
  "hiddenMechanism": "string",
  "aiRedesign": "string",
  "lesson": "string",
  "memorableLine": "string",
  "concreteExample": "string",
  "surprisingDetail": "string",
  "counterpoint": "string",
  "closingTakeaway": "string",
  "fullText": "string"
}`.trim();

function buildScriptSystemPrompt(channelBible: string, identity: ChannelIdentity): string {
  return [
    "You write scripts for a documentary-style AI business channel.",
    "",
    "CHANNEL BIBLE:",
    channelBible,
    "",
    "Identity constraints:",
    `- Positioning: ${identity.positioning}`,
    `- Narrator tone: ${identity.narratorTone.join(", ")}`,
    `- Banned language: ${identity.bannedLanguage.join(" | ")}`,
    `- Script structure: ${identity.scriptStructure.join(" -> ")}`,
    `- Visual style: ${identity.visualStyle.join(", ")}`,
    "- The script must have strong point of view and operator skepticism.",
    "- Do not include markdown code fences.",
    "- Do not include any text outside the JSON object.",
  ].join("\n");
}

export class ScriptGeneratorService {
  constructor(private readonly anthropicConnector: AnthropicConnector) {}

  private requireString(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`script generation response missing string field: ${key}`);
    }
    return value.trim();
  }

  async generate(videoId: string, brief: ResearchBrief, identity: ChannelIdentity): Promise<ScriptDraft> {
    logger.info("script_generator: generating script", { videoId });
    const channelBible = await this.anthropicConnector.getChannelBible();
    const systemPrompt = buildScriptSystemPrompt(channelBible, identity);
    const userPrompt = [
      `Topic: ${brief.topicTitle}`,
      `Research summary: ${brief.summary}`,
      `Audience: ${brief.audience}`,
      `Topic angles: ${brief.angles.join("; ")}`,
      `Key points: ${brief.keyPoints.join("; ")}`,
      SCRIPT_RESPONSE_PROMPT,
    ].join("\n\n");

    const output = await this.anthropicConnector.sendJsonPrompt(systemPrompt, userPrompt);
    const parsed = parseJsonObject<Record<string, unknown>>(output, {}, "script generation response");
    const title = `${brief.topicTitle}: documentary breakdown`;
    const structure = {
      hookHardClaim: this.requireString(parsed, "hookHardClaim"),
      failingSystem: this.requireString(parsed, "failingSystem"),
      hiddenMechanism: this.requireString(parsed, "hiddenMechanism"),
      aiRedesign: this.requireString(parsed, "aiRedesign"),
      lesson: this.requireString(parsed, "lesson"),
    };
    const sections = [
      `Concrete example: ${this.requireString(parsed, "concreteExample")}`,
      `Surprising detail: ${this.requireString(parsed, "surprisingDetail")}`,
      `Counterpoint: ${this.requireString(parsed, "counterpoint")}`,
      `Memorable line: ${this.requireString(parsed, "memorableLine")}`,
    ];

    return {
      videoId,
      channelIdentity: identity.positioning,
      title,
      sections,
      structure,
      memorableLine: this.requireString(parsed, "memorableLine"),
      concreteExample: this.requireString(parsed, "concreteExample"),
      surprisingDetail: this.requireString(parsed, "surprisingDetail"),
      counterpoint: this.requireString(parsed, "counterpoint"),
      closingTakeaway: this.requireString(parsed, "closingTakeaway"),
      callToAction: this.requireString(parsed, "closingTakeaway"),
      fullText: this.requireString(parsed, "fullText"),
      references: brief.sources,
    };
  }
}
