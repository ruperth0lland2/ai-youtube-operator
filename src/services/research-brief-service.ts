import type { ResearchBrief } from "../models/research.js";
import { AnthropicConnector } from "../connectors/anthropic-connector.js";
import { logger } from "../utils/logger.js";
import { parseJsonObject } from "../utils/json-schema.js";

const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "keyPoints", "audience", "angles"],
  properties: {
    summary: { type: "string" },
    keyPoints: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: { type: "string" },
    },
    audience: { type: "string" },
    angles: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string" },
    },
  },
};

interface ResearchPayload {
  summary: string;
  keyPoints: string[];
  audience: string;
  angles: string[];
}

export class ResearchBriefService {
  constructor(private readonly anthropicConnector: AnthropicConnector) {}

  async generate(videoId: string, topicTitle: string, topicDescription: string): Promise<ResearchBrief> {
    logger.info("research_brief: generating with Claude", { videoId, topicTitle });

    const raw = await this.anthropicConnector.sendJsonPrompt(
      "You are a research strategist for a documentary-style business channel. Output strict JSON only with no markdown.",
      [
        `Topic title: ${topicTitle}`,
        `Topic description: ${topicDescription || "No additional description provided."}`,
        "",
        "Return JSON with exactly these fields:",
        "{",
        '  "summary": "single paragraph",',
        '  "keyPoints": ["5 key research points"],',
        '  "audience": "likely audience",',
        '  "angles": ["3 narrative angles"]',
        "}",
      ].join("\n"),
    );

    const payload = parseJsonObject<ResearchPayload>(raw, RESEARCH_SCHEMA, "research brief");
    return {
      videoId,
      topicTitle,
      summary: payload.summary,
      keyPoints: payload.keyPoints,
      audience: payload.audience,
      angles: payload.angles,
      sources: [
        "Claude research synthesis",
        topicDescription || "Topic proposal",
      ],
    };
  }
}
