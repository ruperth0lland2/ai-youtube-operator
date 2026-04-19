import type { ResearchBrief } from "../models/research.js";
import type { ScriptDraft } from "../models/script.js";
import { logger } from "../utils/logger.js";
import type { ChannelIdentity } from "../models/channel-profile.js";

export class ScriptGeneratorService {
  generate(videoId: string, brief: ResearchBrief, identity: ChannelIdentity): ScriptDraft {
    logger.info("script_generator: generating script", { videoId });
    const title = `${brief.topicTitle}: the system is broken by design`;
    const memorableLine =
      "Bad systems are not broken by accident. They are maintained by people who benefit from the drag.";

    const structure = {
      hookHardClaim: `The current ${brief.topicTitle} workflow is optimized for internal comfort, not outcomes.`,
      failingSystem:
        "Teams add meetings, approvals, and dashboards, then wonder why latency and rework keep rising.",
      hiddenMechanism:
        "Incentives reward visible activity, so owners protect process complexity even when margins decay.",
      aiRedesign:
        "Map the decision chain, automate low-ambiguity steps, and keep human judgment at irreversible checkpoints.",
      lesson:
        "If a system cannot prove value per step, AI will expose the waste faster than any audit.",
    };

    const sections = [
      `Strong opinion: most transformation programs are governance theater until operator incentives change.`,
      `Concrete business example: a logistics broker cut quote turnaround from 9 hours to 38 minutes by moving triage, pricing bounds, and follow-up drafting into a constrained AI workflow; win-rate lifted 14%.`,
      `Surprising detail: the biggest gain came from deleting internal status handoffs, not from a larger model.`,
      `Counterpoint: AI redesign can fail when teams automate unstable policies and lock in bad assumptions at scale.`,
      `Memorable line: ${memorableLine}`,
    ];

    const callToAction =
      "Closing takeaway: redesign one failing workflow this week, instrument the result, and cut anything that cannot defend itself.";

    const fullText = [
      title,
      "",
      "Hook:",
      structure.hookHardClaim,
      "",
      "Failing system:",
      structure.failingSystem,
      "",
      "Hidden mechanism:",
      structure.hiddenMechanism,
      "",
      "AI redesign:",
      structure.aiRedesign,
      "",
      "Lesson:",
      structure.lesson,
      "",
      ...sections,
      "",
      `Audience: ${brief.audience}`,
      `Channel stance: ${identity.positioning}`,
      callToAction,
    ].join("\n");

    return {
      videoId,
      channelIdentity: identity.positioning,
      title,
      sections,
      structure,
      memorableLine,
      callToAction,
      fullText,
      references: brief.sources,
    };
  }
}
