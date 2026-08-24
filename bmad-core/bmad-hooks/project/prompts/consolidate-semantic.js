'use strict';

/**
 * Prompt for semantic consolidation — synthesises episodic sources into current-state knowledge.
 *
 * The model is asked for the BODY ONLY. Frontmatter (domain, last-updated,
 * episode-sources) is re-stamped programmatically by semantic-consolidator.js,
 * because episode-sources is load-bearing for staleness detection and asking a
 * model to "preserve it exactly" is not a guarantee.
 *
 * Edit this file to tune prompt behavior without touching semantic-consolidator.js logic.
 */
function buildConsolidateSemanticPrompt({ domain, currentBody, episodeContents, carryoverBody }) {
  const carryoverBlock = carryoverBody
    ? `\nPRIOR KNOWLEDGE FROM A RETIRED SEMANTIC FILE (was a separate domain, now folded into this one — merge anything still true, drop anything superseded):\n${carryoverBody}\n`
    : '';

  return `You are consolidating episodic memory into semantic (current-state) knowledge for a software project.

SEMANTIC DOMAIN: ${domain}

CURRENT SEMANTIC BODY (may be an unfilled template):
${currentBody}
${carryoverBlock}
EPISODE SOURCES:
${episodeContents}

TASK: Produce the updated BODY of this domain's semantic file — the current state of the domain.
- No chronology, no history — current state only. "What is true now", never "what changed when".
- Do NOT output YAML frontmatter and do NOT output \`---\` fences. Start directly at the \`# ${domain} — Current State\` heading.
- Use exactly these sections, in this order: Current State, Established Patterns, Known Gotchas, Invariants, Reference Implementation.
- Replace every \`[bracketed placeholder]\` from the template with real content. Never leave a placeholder in place, and never leave a section empty — if you genuinely have nothing for a section, write a single line stating so.
- Only state things the episode sources actually support. Do not infer or invent.
- Keep it concise — this is reference knowledge an agent reads before planning, not a history log.
- Output ONLY the body content.`;
}

module.exports = { buildConsolidateSemanticPrompt };
