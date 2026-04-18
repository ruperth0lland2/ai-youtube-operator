import type { ResearchBrief } from "../models/research.js";
import type { ScriptDraft } from "../models/script.js";
import { logger } from "../utils/logger.js";

export class ScriptGeneratorService {
  generate(videoId: string, brief: ResearchBrief): ScriptDraft {
    logger.info("script_generator: generating script", { videoId });
    const title = `${brief.topicTitle}: Practical Guide`;
    const sections = [
      `Intro: Why ${brief.topicTitle} matters now.`,
      ...brief.keyPoints.map((point, index) => `Point ${index + 1}: ${point}`),
      "Wrap-up: summarize and give one next action.",
    ];
    const callToAction = "Subscribe for weekly AI-produced creator breakdowns.";
    const fullText = [title, "", ...sections, "", `Audience: ${brief.audience}`, callToAction].join(
      "\n",
    );

    return {
      videoId,
      title,
      sections,
      callToAction,
      fullText,
      references: brief.sources,
    };
  }
}
