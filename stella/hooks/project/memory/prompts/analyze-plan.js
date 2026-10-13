'use strict';

/**
 * Prompt for batched plan analysis — episodic entry + at most one lesson in one call.
 * Patterns are handled separately via codebase scan (pattern-scanner.js), not plan analysis.
 * Edit this file to tune prompt behavior without touching daily-job.js logic.
 */

// Renders the stored lessons so the extractor can match against them instead of
// re-titling a mistake it has already recorded.
function buildExistingLessonsBlock(existingLessons) {
  if (!existingLessons || existingLessons.length === 0) {
    return 'ALREADY-RECORDED LESSONS: none yet.';
  }
  const rows = existingLessons.map((l) => `- ${l.slug}${l.rule ? ` — ${l.rule}` : ''}`).join('\n');
  return `ALREADY-RECORDED LESSONS (${existingLessons.length}) — slug — rule:\n${rows}`;
}

function buildAnalyzePlanPrompt({
  planId,
  today,
  status,
  moduleTag,
  description,
  sectionsBlock,
  existingLessons,
}) {
  return `You are memory extraction agent. Output injected into future AI agent sessions — prevent repeated mistakes. Precision mandatory. Vague entries waste context and mislead agents.

Default answer for lessons is NONE. A well-executed plan yields no lesson. Extracting nothing is the correct and expected outcome — it is not a failure.

PLAN ID: ${planId}
DATE: ${today}
STATUS: ${status}
MODULE: ${moduleTag}
DESCRIPTION: ${description}

${sectionsBlock}

${buildExistingLessonsBlock(existingLessons)}

Return single JSON object with exactly two keys:

{
  "episodic": "30-60 words. No filler. No 'the agent'. Format: Plan-ID | what-was-built | key outcome. Omit implementation details.",
  "lessons": []
}

LESSONS — the array holds ZERO entries, or ONE. Never two. There is no second slot: if two candidate mistakes exist, they are either the same mistake reworded (emit one) or one is weaker than the other (emit only the stronger). An array of length 2 is an invalid response.

STEP 1 — MATCH AGAINST ALREADY-RECORDED LESSONS FIRST.
Before writing anything new, check the list above. If your candidate is the same underlying mistake as a recorded one — even if the wording, the module, the file, or the surface symptom differ — do NOT invent a new title. Emit:
  { "matchesExistingSlug": "<exact slug from the list>", "title": "<that same slug>", "rule": "<that lesson's rule>" }
Same rule = same lesson. Judge by the rule, not by the phrasing. Recurrence is the valuable signal; a duplicate under a new name destroys it.

STEP 2 — only if nothing in the list matches, emit a new lesson:
{
  "matchesExistingSlug": null,
  "title": "short-slug-what-went-wrong",
  "whatWentWrong": "specific decision/action agent took that was wrong — not the symptom, the choice",
  "rootCause": "wrong assumption made, or known constraint ignored — not external factors",
  "rule": "cross-module actionable rule: 'always X when Y' or 'never X, use Z instead'",
  "howToApply": "code pattern, error symptom, or architectural condition that triggers this rule — must not name specific files or functions from this plan",
  "recurrenceReason": "one sentence: why will an agent on a DIFFERENT, UNRELATED future feature face this same choice and make this same mistake?"
}

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
- A single incorrect line, inverted condition, or typo — a bug is not a pattern

Empty array [] if no lesson passes all three checks. Prefer [] over a weak entry.
Return ONLY valid JSON, no other text.`;
}

module.exports = { buildAnalyzePlanPrompt, buildExistingLessonsBlock };
