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
      "howToApply": "code pattern, error symptom, or architectural condition that triggers this rule — must not name specific files or functions from this plan",
      "recurrenceReason": "one sentence: why will an agent on a DIFFERENT, UNRELATED future feature face this same choice and make this same mistake?"
    }
  ]
}

LESSONS — max 2. Only the strongest. Stop repeated agent mistakes across modules.

INCLUDE only if ALL three pass:
1. Agent had sufficient information but chose the wrong approach — the mistake was avoidable with what was known
2. The wrong choice is a pattern, not a one-time discovery (e.g. learning an existing system's behavior for the first time does NOT qualify)
3. recurrenceReason can be written confidently without referencing this plan — if you hedge or say "might", exclude it

EXCLUDE — any of these disqualifies immediately:
- Brownfield discovery: agent didn't know how an existing system worked and had to find out — that knowledge is now fixed, won't recur
- Location-specific: howToApply names a specific file, function, or variable from this plan — too narrow
- External failure: API downtime, missing credentials, infra not ready
- Ambiguous requirements that were clarified mid-task
- One-off setup or migration steps that are now complete and won't repeat

Most well-executed plans should return []. Zero lessons means the agent made correct choices — it is not a failure to extract.
Empty array [] if no lessons pass all three checks. Prefer [] over a weak entry. Two weak lessons are worse than zero.
Return ONLY valid JSON, no other text.`;
}

module.exports = { buildAnalyzePlanPrompt };
