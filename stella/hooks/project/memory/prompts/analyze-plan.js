'use strict';

/**
 * Prompt for batched plan analysis — module tag + episodic entry + at most one
 * lesson, in one call. Patterns are handled separately via codebase scan
 * (pattern-scanner.js), not plan analysis.
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

// Renders the known episodic areas so the module-tag classifier can reuse one
// instead of minting a near-duplicate. There is no catalog to maintain — this
// is just the current `episodes/*.md` files, read fresh on every call, each
// with a short real-content excerpt (not just its slug) so the model has
// something to actually compare the new spec's Intent against, rather than
// guessing fit from a bare name.
// When there are none yet (cold start), this call runs as an exploring agent
// instead — see buildAnalyzePlanPrompt's `coldStart` branch.
function buildExistingAreasBlock(existingAreas, coldStart, cwd) {
  if (!coldStart) {
    const rows = existingAreas
      .map((a) => `- ${a.area}${a.excerpt ? ` — ${a.excerpt}` : ''}`)
      .join('\n');
    return `EXISTING MODULE AREAS (${existingAreas.length}):\n${rows}`;
  }
  return `EXISTING MODULE AREAS: none yet — this is the first spec this project has ever processed.

PROJECT ROOT: ${cwd}

You have Glob, Read, and Grep. Before naming the module tag, you may briefly look at how this
codebase is actually organized — its real folders and feature areas, not its architecture layers
(skip generic layer names like "Core", "Infrastructure", "Application", "src"). This is optional
help, not a requirement: if nothing in the structure clearly groups with this spec's Intent, ignore
it and name the tag from Intent alone, exactly as every later spec in this project will. Do not
explore more than a couple of directories deep — this is a quick orientation, not a full audit.`;
}

function buildAnalyzePlanPrompt({
  planId,
  today,
  status,
  title,
  intent,
  existingAreas,
  coldStart,
  cwd,
  sectionsBlock,
  existingLessons,
}) {
  return `You are memory extraction agent. Output injected into future AI agent sessions — prevent repeated mistakes. Precision mandatory. Vague entries waste context and mislead agents.

Default answer for lessons is NONE. A well-executed plan yields no lesson. Extracting nothing is the correct and expected outcome — it is not a failure.

PLAN ID: ${planId}
DATE: ${today}
STATUS: ${status}
TITLE: ${title || 'not provided'}

INTENT:
${intent || '(no Intent section found)'}

${buildExistingAreasBlock(existingAreas, coldStart, cwd)}

${sectionsBlock}

${buildExistingLessonsBlock(existingLessons)}

Return single JSON object with exactly three keys:

{
  "moduleTag": "kebab-case-slug",
  "episodic": "30-60 words. No filler. No 'the agent'. Format: Plan-ID | what-was-built | key outcome. Omit implementation details.",
  "lessons": []
}

MODULE TAG — classify this spec's own INTENT against EXISTING MODULE AREAS above:
- Compare the Intent against each existing area's EXCERPT (its real content), not against the slug name alone.
- Reuse an existing area's exact slug only if the Intent is genuinely about the same functional area — not merely adjacent, not merely because the slug sounds related, and not merely because it is the only area listed. Do not rename a reused slug, even if you would have phrased it differently.
- Having only one (or few) existing areas is NOT a reason to force-fit an unrelated spec into one of them. If the Intent describes a different functional area than every excerpt shown, mint a new short kebab-case slug (1-3 words) directly from the Intent's own subject matter — never a lifecycle/scaffolding word like "setup", "core", "shared", "misc".
- When genuinely unsure between two existing areas, prefer the one the Intent's "Problem" sentence names most directly.

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
${
  coldStart
    ? 'You have NO file-write access — do not use a Write/Edit tool or attempt to save anything yourself. Return ONLY valid JSON as your final text response, no other text.'
    : 'Return ONLY valid JSON, no other text.'
}`;
}

module.exports = { buildAnalyzePlanPrompt, buildExistingLessonsBlock };
