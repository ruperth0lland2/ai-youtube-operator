import type { ResearchBrief } from "../models/research.js";
import type { ScriptDraft } from "../models/script.js";
import { logger } from "../utils/logger.js";

export class ScriptGeneratorService {
  generate(videoId: string, brief: ResearchBrief): ScriptDraft {
    logger.info("script_generator: generating script", { videoId });
    const title = `${brief.topicTitle}: What actually moves revenue`;
    const sections = [
      `Most teams treat ${brief.topicTitle} like a content toy. That is expensive.`,
      `Strong opinion: if your process cannot tie ${brief.topicTitle} to margin or cycle time, you are doing theater.`,
      `Concrete business example: a mid-market SaaS support org cut first-response time by 31% after routing repetitive tickets through a narrowly scoped assistant playbook.`,
      `Surprising detail: the biggest gain came from deleting three handoff steps, not from model quality improvements.`,
      `Counterpoint: this fails fast when operators skip guardrails and dump ambiguous tasks into one giant prompt.`,
      `Closing takeaway: start with one workflow where delay costs real money, instrument it, and kill what does not move the metric.`,
    ];
    const callToAction = "Run one operator-grade experiment this week. Keep receipts. Ignore hype.";
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
