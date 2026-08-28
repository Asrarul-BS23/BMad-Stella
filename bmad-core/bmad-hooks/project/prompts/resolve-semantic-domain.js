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
 * This call is also where MERGING happens. It needs no trigger of its own: it
 * already fires when a new area appears or on a PARTITION_VERSION bump, and it
 * sees every area at once, so it can regroup. The measured shape without the
 * rules below was 1:1 area->domain, which is under-merging — and the cost is
 * not file count. Consolidation runs per domain, so no call ever sees two
 * sibling areas together, and the ordering constraints and boundaries BETWEEN
 * them (exactly what `## Invariants` is for) have nowhere to live. It never
 * self-corrected because the first partition ran when the project had one or
 * two areas, where 1:1 was genuinely right, and the stability clause then
 * froze it.
 *
 * Edit this file to tune prompt behavior without touching semantic-consolidator.js logic.
 */
function buildResolveSemanticDomainsPrompt({
  areas,
  currentPartition,
  domainMapExcerpt,
  projectStructureExcerpt,
  pinnedSeparations,
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

  // The literal "typically 3 to 6" this replaces is wrong at any scale but the
  // one it was written for: at 30 areas it pushes toward exactly the
  // over-merged domains a split would then have to undo.
  const domainFloor = Math.max(2, Math.round(areas.length / 4));
  const domainCeiling = Math.max(domainFloor + 1, Math.round(areas.length / 2));

  // Children of a deliberate split. Merging them back would undo the split on
  // the very next partition call, so the pin is what stops merging and
  // splitting fighting each other.
  const hasPins = Array.isArray(pinnedSeparations) && pinnedSeparations.length > 0;
  const pinnedBlock = hasPins
    ? `\nDELIBERATE SEPARATIONS (these domains were split apart on purpose — do NOT merge them back together):\n${pinnedSeparations
        .map((pin) => `- ${pin.children.join(' | ')} (split from "${pin.parent}")`)
        .join('\n')}\n`
    : '';
  const pinnedRule = hasPins
    ? '\n- Never merge two domains listed under DELIBERATE SEPARATIONS above.'
    : '';

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
${pinnedBlock}
TASK: Assign every area listed above to exactly one semantic domain.

RULES:
- Every area name must appear in exactly one domain's "areas" list. Do not omit any, do not list any twice.
- A domain is a functional/product area of the system, drawn from the business vocabulary above.
- A domain is NOT a lifecycle phase, a delivery stage, or a tooling/scaffolding concept. Names like "project-scaffold", "setup", "bootstrap", "infrastructure", "misc", "core", "shared", "utils" are NEVER valid domains — if an area's episodes are about initial scaffolding, file it under the functional area that scaffolding serves.
- A domain must not be a 1:1 rename of a single area when a sibling area clearly belongs with it (e.g. "triage-nodes" and "triage-pipeline" are the same domain).
- Equally, do not over-merge: two areas belong together only if an engineer would consult one file to understand both. Unrelated areas must stay in separate domains even if that leaves a domain with one area.
- Aim for the natural number of domains for this system. With ${areas.length} areas to partition, that is usually around ${domainFloor} to ${domainCeiling} domains. Treat this as a sanity check on your grouping, not a quota to hit: if the areas genuinely divide differently, say so with your grouping. Do not collapse everything into one or two.
- Domain slugs are short kebab-case, 1-3 words.
- Keep the exact slugs of existing groupings that are still sensible, so the memory files stay stable across runs. Stability applies to NAMING, not to grouping: if the CURRENT PARTITION has two domains an engineer would consult as ONE file, MERGE them and keep the better of the two existing slugs. A domain that exists only because it was created when the project had fewer areas is not a reason to keep it separate.${pinnedRule}

Return ONLY valid JSON, no other text:
{
  "domains": [
    { "domain": "kebab-case-slug", "areas": ["area-name", "area-name"] }
  ]
}`;
}

module.exports = { buildResolveSemanticDomainsPrompt };
