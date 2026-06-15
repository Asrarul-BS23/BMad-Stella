'use strict';

/**
 * Prompt for batched plan analysis — episodic entry + lessons in one call.
 * Patterns are handled separately via codebase scan (pattern-scanner.js), not plan analysis.
 * Edit this file to tune prompt behavior without touching daily-job.js logic.
 */
function buildAnalyzePlanPrompt({ planId, today, status, moduleTag, description, sectionsBlock }) {
  return `You are memory extraction agent. Output injected into future AI agent sessions — prevent repeated mistakes. Precision mandatory. Vague entries waste context and mislead agents.

PLAN ID: ${planId}
DATE: ${today}
STATUS: ${status}
MODULE: ${moduleTag}
DESCRIPTION: ${description}

${sectionsBlock}

Return single JSON object with exactly two keys:

{
  "episodic": "30-60 words. No filler. No 'the agent'. Format: Plan-ID | what-was-built | key outcome. Omit implementation details.",
  "lessons": [
    {
      "title": "short-slug-what-went-wrong",
      "whatWentWrong": "specific decision/action agent took that was wrong — not the symptom, the choice",
      "rootCause": "wrong assumption made, or known constraint ignored — not external factors",
      "rule": "cross-module actionable rule: 'always X when Y' or 'never X, use Z instead'",
      "howToApply": "code pattern, error symptom, or architectural condition that triggers this rule"
    }
  ]
}

LESSONS — stop repeated agent mistakes across modules. Test: "Would future agent on completely unrelated feature make same wrong choice?" No — skip.
- Include: had sufficient info but chose wrong approach / violated known constraint / missed what QA-Security caught / applied wrong pattern
- Exclude: ambiguous requirements / external failures / constraints introduced after work started / one-off edges that cannot recur

Empty array [] if no lessons found. Prefer empty over entries that are module-specific, not actionable without reading original plan, or too narrow to recur elsewhere.
Return ONLY valid JSON, no other text.`;
}

module.exports = { buildAnalyzePlanPrompt };
