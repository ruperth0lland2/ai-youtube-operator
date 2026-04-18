import type { ResearchBrief } from "../models/research.js";
import { logger } from "../utils/logger.js";

export class ResearchBriefService {
  generate(videoId: string, topicTitle: string, topicDescription: string): ResearchBrief {
    logger.info("research_brief: generating", { videoId, topicTitle });
    return {
      videoId,
      topicTitle,
      summary: `${topicTitle} is presented for a creator-focused audience with practical and current context.`,
      keyPoints: [
        `Define ${topicTitle} in plain language`,
        "Highlight common mistakes and misconceptions",
        "Provide an actionable workflow viewers can try this week",
      ],
      audience: "YouTube viewers interested in actionable AI creator workflows",
      sources: [
        "Internal editorial synthesis",
        topicDescription || "Topic proposal",
      ],
    };
  }
}
