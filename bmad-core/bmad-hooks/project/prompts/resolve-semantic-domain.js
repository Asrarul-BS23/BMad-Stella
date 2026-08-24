'use strict';

/**
 * Prompt for partitioning ALL episodic areas into semantic domains in a single
 * call (e.g. "payment" + "invoicing" + "subscription" -> "billing").
 *
 * This is deliberately batched rather than one-call-per-area: resolving areas
 * one at a time made the result order-dependent, because each call was told to
 * reuse an already-existing domain if it plausibly fit. The first domain
 * resolved therefore became an attractor that swallowed later areas (that's how
 * "intake", "event-bus" and "address-book-resolver" all ended up filed under
 * "project-scaffold"). Seeing every area at once produces one coherent,
 * order-independent partition instead.
 *
 * Edit this file to tune prompt behavior without touching semantic-consolidator.js logic.
 */
function buildResolveSemanticDomainsPrompt({
  areas,
  currentPartition,
  domainMapExcerpt,
  projectStructureExcerpt,
}) {
  const areasBlock = areas
    .map((a) => `### area: ${a.area}\n${a.excerpt || '(no excerpt available)'}`)
    .join('\n\n');

  const currentBlock =
    currentPartition && Object.keys(currentPartition).length > 0
      ? Object.entries(currentPartition)
          .map(([domain, list]) => `- ${domain}: ${list.join(', ')}`)
          .join('\n')
      : '(none yet — this is the first partition)';

  // domain-map.md is the project's business-vocabulary document (core entities,
  // taxonomy, business rules). It is the input that keeps domain names in
  // business terms; project-structure.md alone is a code-layout document, and
  // feeding only that is what produced code-layout names like "project-scaffold".
  const domainBlock = domainMapExcerpt
    ? `PROJECT BUSINESS DOMAIN (authoritative vocabulary — prefer these terms):\n${domainMapExcerpt}`
    : 'PROJECT BUSINESS DOMAIN: not available';

  const structureBlock = projectStructureExcerpt
    ? `PROJECT CODE STRUCTURE (secondary hint only — do NOT take domain names from folder or tooling names):\n${projectStructureExcerpt}`
    : 'PROJECT CODE STRUCTURE: not available';

  return `You are partitioning ALL episodic memory areas of a software project into broader semantic domains.

EPISODIC AREAS TO PARTITION (${areas.length} total):
${areasBlock}

CURRENT PARTITION (from the previous run — keep it unless it is clearly wrong):
${currentBlock}

${domainBlock}

${structureBlock}

TASK: Assign every area listed above to exactly one semantic domain.

RULES:
- Every area name must appear in exactly one domain's "areas" list. Do not omit any, do not list any twice.
- A domain is a functional/product area of the system, drawn from the business vocabulary above.
- A domain is NOT a lifecycle phase, a delivery stage, or a tooling/scaffolding concept. Names like "project-scaffold", "setup", "bootstrap", "infrastructure", "misc", "core", "shared", "utils" are NEVER valid domains — if an area's episodes are about initial scaffolding, file it under the functional area that scaffolding serves.
- A domain must not be a 1:1 rename of a single area when a sibling area clearly belongs with it (e.g. "triage-nodes" and "triage-pipeline" are the same domain).
- Equally, do not over-merge: two areas belong together only if an engineer would consult one file to understand both. Unrelated areas must stay in separate domains even if that leaves a domain with one area.
- Aim for the natural number of domains for this system — typically 3 to 6 for a codebase of this size. Do not collapse everything into one or two.
- Domain slugs are short kebab-case, 1-3 words.
- If the CURRENT PARTITION already groups some areas sensibly, keep those groupings and their exact slugs so the memory files stay stable across runs.

Return ONLY valid JSON, no other text:
{
  "domains": [
    { "domain": "kebab-case-slug", "areas": ["area-name", "area-name"] }
  ]
}`;
}

module.exports = { buildResolveSemanticDomainsPrompt };
