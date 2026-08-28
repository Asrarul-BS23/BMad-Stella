'use strict';

const { BODY_SECTIONS } = require('../lib/semantic-body');

/**
 * Prompt for semantic consolidation — synthesises episodic sources into current-state knowledge.
 *
 * The model is asked for the BODY ONLY. Frontmatter (domain, last-updated,
 * episode-sources) is re-stamped programmatically by semantic-consolidator.js,
 * because episode-sources is load-bearing for staleness detection and asking a
 * model to "preserve it exactly" is not a guarantee.
 *
 * Two modes share one section contract:
 *
 *   delta   — the default. Only the episode sources whose content changed are
 *             fed. The instruction is SURGICAL: untouched text comes back
 *             byte-identical, and only the lines the new episodes make false are
 *             replaced. This is what stops a body being re-derived from a
 *             partial view of its sources.
 *   rebuild — every source is fed, fair-share allocated. The instruction is
 *             RE-VERIFICATION, not re-summarisation: a body is never shortened
 *             for size reasons. The only mechanism that reduces a body is a
 *             domain split.
 *
 * Edit this file to tune prompt behavior without touching semantic-consolidator.js logic.
 */

const SECTION_LIST = BODY_SECTIONS.join(', ');

// Project-wide conventions are read directly by the planner from the
// architecture docs. Restating them here is what filled `Invariants` with
// linter and logging boilerplate that held for every module in the codebase.
const EXCLUSION_TEST = `Project-wide conventions live in bmad-docs/architecture/coding-standards.md
and tech-stack.md. The planner reads those directly.

EXCLUSION TEST — before writing any line, ask: does this depend on what THIS
domain does? If it holds for every module in this codebase, it is a project
convention — omit it. Keep only what is specific to THIS domain: its business
rules, its ordering constraints, its boundaries, its traps.`;

// Semantic memory is current-state only, so a fixed gotcha is not history to be
// annotated — it is a line that is no longer true. Applies in BOTH modes.
const GOTCHA_SECTION = 'Known Gotchas';
const GOTCHA_RETIREMENT =
  'If the episodes show a gotcha is now fixed, DELETE it. Do not mark it resolved.';

const SHARED_RULES = `- No chronology, no history — current state only. "What is true now", never "what changed when".
- Do NOT output YAML frontmatter and do NOT output \`---\` fences.
- Use exactly these four sections, in this order: ${SECTION_LIST}. Do not add, rename, drop or reorder a section.
- Replace every \`[bracketed placeholder]\` from the template with real content. Never leave a placeholder in place, and never leave a section empty — if you genuinely have nothing for a section, write a single line stating so.
- Only state things the episode sources actually support. Do not infer or invent.
- Keep it reference knowledge an agent reads before planning, not a history log.`;

function buildConsolidateSemanticPrompt({
  domain,
  currentBody,
  episodeContents,
  carryoverBody,
  mode = 'rebuild',
}) {
  const carryoverBlock = carryoverBody
    ? `\nPRIOR KNOWLEDGE FROM A RETIRED SEMANTIC FILE (was a separate domain, now folded into this one — merge anything still true, drop anything superseded):\n${carryoverBody}\n`
    : '';

  const sourcesLabel =
    mode === 'delta'
      ? 'CHANGED EPISODE SOURCES (only these changed since the last consolidation — every other source is already reflected in the body above and is NOT shown)'
      : 'EPISODE SOURCES (all sources for this domain)';

  const modeRules =
    mode === 'delta'
      ? `TASK: Return the BODY above, surgically updated by the changed episodes.

- Every line the changed episodes do NOT bear on must come back BYTE-IDENTICAL. Do not reword it, do not reorder it, do not tighten it.
- Replace only the specific lines these episodes make false. Semantic memory is current-state only, so a superseded line is REPLACED by the new truth — never kept alongside its own contradiction.
- Add what is genuinely new.
- Delete gotchas the episodes show fixed.
- Do NOT re-summarise the body and do NOT shorten it. You are editing, not rewriting.`
      : `TASK: Return the BODY above, re-verified line by line against all the sources.

- Re-verify every existing line against the sources. Delete what is now false.
- Keep what is still true, worded exactly as it stands.
- Add what is missing.
- Do NOT re-summarise and do NOT shorten. This is a re-verification pass, not a compaction pass.`;

  return `You are consolidating episodic memory into semantic (current-state) knowledge for a software project.

SEMANTIC DOMAIN: ${domain}
MODE: ${mode}

CURRENT SEMANTIC BODY (may be an unfilled template):
${currentBody}
${carryoverBlock}
${sourcesLabel}:
${episodeContents}

${modeRules}

RULES:
${SHARED_RULES}
- Output ONLY the body content, starting directly at the \`# ${domain} — Current State\` heading.

${EXCLUSION_TEST}

SECTION-SPECIFIC RULE — ${GOTCHA_SECTION}:
${GOTCHA_RETIREMENT}`;
}

module.exports = { buildConsolidateSemanticPrompt };
