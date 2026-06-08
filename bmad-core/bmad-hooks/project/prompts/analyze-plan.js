'use strict';

/**
 * Prompt for batched plan analysis — episodic entry + lessons + patterns in one call.
 * Edit this file to tune prompt behavior without touching daily-job.js logic.
 */
function buildAnalyzePlanPrompt({ planId, today, status, moduleTag, description, sectionsBlock }) {
  return `You are analyzing a completed software development plan to extract structured memory entries.

PLAN ID: ${planId}
DATE: ${today}
STATUS: ${status}
MODULE: ${moduleTag}
DESCRIPTION: ${description}

${sectionsBlock}

Return a single JSON object with exactly these three keys:

{
  "episodic": "<30-60 word memory entry. Format: Plan-ID | date | what-was-built | key outcome. Dense and factual.>",
  "lessons": [
    {
      "title": "short-slug-what-went-wrong",
      "whatWentWrong": "one sentence — what the agent did wrong",
      "rootCause": "why — wrong assumption, missing context, or wrong pattern applied",
      "rule": "don't X / do Y instead — concise actionable rule",
      "howToApply": "the situation to recognize that triggers this rule"
    }
  ],
  "patterns": [
    {
      "name": "short-slug-pattern-name",
      "whenToUse": "situation where this pattern applies",
      "referenceFile": "path/to/file if mentioned in the plan, else empty string",
      "whatNotToDo": "the common mistake or anti-pattern this replaces"
    }
  ]
}

Rules:
- "lessons" = agent failures only: agent had sufficient info but chose wrong approach, violated a known constraint, or missed something QA/Security caught. NOT failures = ambiguous requirements, external dependency failures, constraints introduced after work started.
- "patterns" = reusable implementation approaches specific to this module that future work should inherit. NOT general best practices or framework conventions.
- Return empty arrays [] for lessons or patterns if none found.
- Return ONLY valid JSON, no other text.`;
}

module.exports = { buildAnalyzePlanPrompt };
