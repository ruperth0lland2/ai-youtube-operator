export interface QaRuleResult {
  rule: string;
  passed: boolean;
  reason: string;
}

export interface QaReport {
  videoId: string;
  passed: boolean;
  checkedAt: string;
  failures: string[];
  results: QaRuleResult[];
}

const BANNED_INTRO_PATTERNS = [
  /^\s*in\s+today'?s\s+video\b/i,
  /^\s*welcome\s+back\b/i,
  /^\s*ai\s+is\s+changing\s+everything\b/i,
];

const HYPE_WORDS = [
  "revolutionary",
  "game-changing",
  "groundbreaking",
  "disruptive",
  "mind-blowing",
  "amazing",
  "incredible",
  "unstoppable",
  "next-level",
];

const ROBOTIC_TRANSITIONS = [
  "firstly",
  "secondly",
  "thirdly",
  "in conclusion",
  "to summarize",
  "in summary",
];

const SUMMARY_MARKERS = [
  "overview",
  "summary of",
  "headlines",
  "latest updates",
  "quick recap",
  "news roundup",
];

const CHANNEL_BANNED_LANGUAGE = [
  "in today's video",
  "welcome back",
  "game-changer",
  "revolutionary",
  "let's dive in",
  "smash the like button",
  "ai is taking over",
];

function hasStrongOpinion(text: string): boolean {
  return /\b(i think|i believe|my take|my view|i'm convinced|this is a mistake|this is wrong|this is overrated)\b/i.test(
    text,
  );
}

function hasConcreteBusinessExample(text: string): boolean {
  const hasCompanyOrRole = /\b(company|founder|operator|agency|saas|e-?commerce|client|revenue|margin|pipeline)\b/i.test(
    text,
  );
  const hasConcreteMetric = /\b\d+(\.\d+)?\s*(%|k|m|million|thousand|hours?|days?|weeks?)\b/i.test(text);
  return hasCompanyOrRole && hasConcreteMetric;
}

function hasSurprisingDetail(text: string): boolean {
  return /\b(surprisingly|counterintuitively|most people miss|the weird part|unexpectedly|what shocked me)\b/i.test(
    text,
  );
}

function hasCounterpoint(text: string): boolean {
  return /\b(however|but here's the catch|to be fair|on the other hand|the counterpoint)\b/i.test(text);
}

function hasHardClaimHook(text: string): boolean {
  const first = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?.toLowerCase();
  if (!first) {
    return false;
  }
  return /(\bis\b.+\b(broken|wrong|failing|wasteful|fragile|dead)\b)|(\bthis\b.+\bwill\b.+\b(break|fail)\b)/i.test(
    first,
  );
}

function hasSection(text: string, sectionHeading: string): boolean {
  const pattern = new RegExp(`^\\s*${sectionHeading}\\s*:?\\s*$`, "im");
  return pattern.test(text);
}

function hasScriptStructure(text: string): boolean {
  return (
    hasSection(text, "hook") &&
    hasSection(text, "failing system") &&
    hasSection(text, "hidden mechanism") &&
    hasSection(text, "ai redesign") &&
    hasSection(text, "lesson")
  );
}

function hasMemorableLine(text: string): boolean {
  return /(^|\n)\s*(\*\*memorable line:\*\*|memorable line:)\s*.+/i.test(text);
}

function hasAnyBannedLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  return CHANNEL_BANNED_LANGUAGE.some((term) => lower.includes(term));
}

function hasClosingTakeaway(text: string): boolean {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const tail = lines.slice(-3).join(" ").toLowerCase();
  return /\b(takeaway|bottom line|if you do one thing|here's the move|next step)\b/.test(tail);
}

function hasHeadlineSummaryTone(text: string): boolean {
  return SUMMARY_MARKERS.some((marker) => text.toLowerCase().includes(marker));
}

function hasBannedIntro(text: string): boolean {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return false;
  }
  return BANNED_INTRO_PATTERNS.some((pattern) => pattern.test(firstLine));
}

function hasHypeWords(text: string): boolean {
  const lower = text.toLowerCase();
  return HYPE_WORDS.some((word) => lower.includes(word));
}

function hasEmoji(text: string): boolean {
  return /[\u{1F300}-\u{1FAFF}]/u.test(text);
}

function hasRoboticTransitions(text: string): boolean {
  const lower = text.toLowerCase();
  return ROBOTIC_TRANSITIONS.some((phrase) => lower.includes(phrase));
}

function sentenceLengths(text: string): number[] {
  const sentences = text
    .split(/[.!?]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return sentences.map((sentence) => sentence.split(/\s+/).filter(Boolean).length);
}

function isShortMediumSentenceStyle(text: string): boolean {
  const lengths = sentenceLengths(text);
  if (lengths.length === 0) {
    return false;
  }
  const average = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
  return average <= 18;
}

function hasSharpCynicalOperatorTone(text: string): boolean {
  const indicators = [
    "operator",
    "execution",
    "margin",
    "tradeoff",
    "constraint",
    "friction",
    "leverage",
    "waste",
    "inefficient",
  ];
  const lower = text.toLowerCase();
  const hits = indicators.filter((term) => lower.includes(term)).length;
  return hits >= 2;
}

function hasPresenterTone(text: string): boolean {
  return /\b(host|audience|subscribe now|thanks for watching)\b/i.test(text);
}

export class AntiSlopQaService {
  evaluate(videoId: string, scriptText: string): QaReport {
    const checks: QaRuleResult[] = [
      {
        rule: "reject_headline_summarization_tone",
        passed: !hasHeadlineSummaryTone(scriptText),
        reason: "Script must not sound like a recap or headline summary.",
      },
      {
        rule: "reject_generic_intro_phrases",
        passed: !hasBannedIntro(scriptText),
        reason: "Intro must avoid banned generic openings.",
      },
      {
        rule: "reject_channel_banned_language",
        passed: !hasAnyBannedLanguage(scriptText),
        reason: "Script contains channel banned language.",
      },
      {
        rule: "require_hard_claim_hook",
        passed: hasHardClaimHook(scriptText),
        reason: "Hook must open with a hard claim.",
      },
      {
        rule: "require_strong_opinion",
        passed: hasStrongOpinion(scriptText),
        reason: "Script must contain one strong opinion.",
      },
      {
        rule: "require_concrete_business_example",
        passed: hasConcreteBusinessExample(scriptText),
        reason: "Script must contain one concrete business example.",
      },
      {
        rule: "require_surprising_detail",
        passed: hasSurprisingDetail(scriptText),
        reason: "Script must contain one surprising detail.",
      },
      {
        rule: "require_counterpoint",
        passed: hasCounterpoint(scriptText),
        reason: "Script must contain one counterpoint.",
      },
      {
        rule: "require_closing_takeaway",
        passed: hasClosingTakeaway(scriptText),
        reason: "Script must contain one closing takeaway.",
      },
      {
        rule: "require_script_structure",
        passed: hasScriptStructure(scriptText),
        reason:
          "Script must follow the required structure: hook, failing system, hidden mechanism, AI redesign, lesson.",
      },
      {
        rule: "require_memorable_line",
        passed: hasMemorableLine(scriptText),
        reason: "Script must contain one memorable line.",
      },
      {
        rule: "style_sharp_slightly_cynical_competent_operator",
        passed: hasSharpCynicalOperatorTone(scriptText),
        reason: "Narrator voice should sound like a sharp, slightly cynical, competent operator.",
      },
      {
        rule: "style_not_presenter_tone",
        passed: !hasPresenterTone(scriptText),
        reason: "Narrator should sound like an operator, not a presenter.",
      },
      {
        rule: "style_short_to_medium_sentences",
        passed: isShortMediumSentenceStyle(scriptText),
        reason: "Sentences should stay short-to-medium in length.",
      },
      {
        rule: "style_no_hype_words",
        passed: !hasHypeWords(scriptText),
        reason: "Script must avoid hype words.",
      },
      {
        rule: "style_no_emoji",
        passed: !hasEmoji(scriptText),
        reason: "Script must not include emoji.",
      },
      {
        rule: "style_no_robotic_transitions",
        passed: !hasRoboticTransitions(scriptText),
        reason: "Script must avoid robotic transitions.",
      },
    ];

    const failures = checks.filter((check) => !check.passed).map((check) => `${check.rule}: ${check.reason}`);

    return {
      videoId,
      passed: failures.length === 0,
      checkedAt: new Date().toISOString(),
      failures,
      results: checks,
    };
  }
}
