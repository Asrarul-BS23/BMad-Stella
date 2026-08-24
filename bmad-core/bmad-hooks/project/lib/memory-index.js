'use strict';

// Maintains bmad-docs/memory/MEMORY.md — live index of all files in the memory system.
// Called after any write to episodes/, lessons/, semantic/, constraints/, or patterns.md.
// Planner reads this index at plan start to discover which module files exist.
//
// The planner reads semantic and episodic files on demand rather than receiving
// them by hook injection, so this file has to be a retrieval MAP: which domain
// covers which areas, which area rolls up into which domain, and whether a
// domain's distilled body is actually current. It is never a retrieval
// DECISION — no ranking, no scoring, no "read this one".

const path = require('node:path');
const fs = require('node:fs');
const { log, readState } = require('./state');
const {
  splitFrontmatter,
  hasRealContent,
  firstContentLine,
  hashSources,
} = require('./semantic-body');

const MEMORY_MD = 'MEMORY.md';
const SUMMARY_CHARS = 120;

// `_`-prefixed files are never real memory entries: `_template.md` is the blank
// form, and `episodes/_untagged.md` is a holding bin for entries whose module
// tag could not be resolved (already excluded from semantic partitioning).
function listFiles(dir, ext = '.md') {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(ext) && !f.startsWith('_'))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function relPath(cwd, absPath) {
  return absPath.replace(cwd + path.sep, '').replaceAll(path.sep, '/');
}

// area -> domain, written by semantic-consolidator's partition step. Read here
// rather than threaded through updateMemoryIndex's signature, which would mean
// touching both of its callers (pattern-scanner.js and daily-job.js) for a
// display concern. updateMemoryIndex already runs after consolidation, so the
// annotations are fresh either way.
function readAreaToDomain(memoryDir) {
  const raw = readState(path.join(memoryDir, '.state', 'semantic-domain-map.json'), {});
  return raw.areas || {};
}

function readConsolidationState(memoryDir) {
  return readState(path.join(memoryDir, '.state', 'semantic-consolidation.json'), {});
}

function invert(areaToDomain) {
  const byDomain = {};
  for (const [area, domain] of Object.entries(areaToDomain)) {
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(area);
  }
  for (const areas of Object.values(byDomain)) areas.sort();
  return byDomain;
}

function truncate(text, limit) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

// Two states, two signals. Both are "read something else as well", never "trust
// this instead".
//
// Never-consolidated is gated on hasRealContent, NOT on `last-updated === ''`:
// legacy files carry a real date on a body whose placeholders are all still
// intact, so keying on the date reports them as fresh — a false FRESH, which is
// the dangerous direction.
function freshnessNote(memoryDir, domain, fm, body, consolidationState) {
  if (!hasRealContent(body)) return 'never consolidated — read the episodes';

  const stored = consolidationState[domain]?.sources;
  if (!stored) return null;

  const current = hashSources(memoryDir, fm['episode-sources'] || []);
  const behind = Object.keys(current).filter((s) => stored[s] !== current[s]);
  if (behind.length > 0) return 'behind its episodes — read both';

  return null;
}

function semanticEntry(memoryDir, cwd, file, byDomain, consolidationState) {
  const rel = relPath(cwd, file);
  let fm = {};
  let body = '';
  try {
    ({ fm, body } = splitFrontmatter(fs.readFileSync(file, 'utf8')));
  } catch {
    return `- \`${rel}\``;
  }

  const domain = fm.domain || path.basename(file, '.md');
  const parts = [`- \`${rel}\``];

  const summary = firstContentLine(body);
  if (summary) parts.push(truncate(summary.replace(/^[-*]\s*/, ''), SUMMARY_CHARS));

  const areas = byDomain[domain] || [];
  if (areas.length > 0) parts.push(`covers: ${areas.join(', ')}`);

  const freshness = freshnessNote(memoryDir, domain, fm, body, consolidationState);
  if (freshness) parts.push(freshness);

  return parts.join(' — ');
}

function episodeEntry(cwd, file, areaToDomain) {
  const rel = relPath(cwd, file);
  const area = path.basename(file, '.md');
  const domain = areaToDomain[area];
  return domain ? `- \`${rel}\` — rolls up into: ${domain}` : `- \`${rel}\``;
}

function updateMemoryIndex(memoryDir, cwd) {
  try {
    const areaToDomain = readAreaToDomain(memoryDir);
    const byDomain = invert(areaToDomain);
    const consolidationState = readConsolidationState(memoryDir);

    const lines = [];
    lines.push(
      '# Project Memory Index',
      '',
      '> Auto-managed by BMad memory system. Do not edit manually.',
      '',
      '## Always Injected at Agent Activation',
    );
    const domainMap = path.join(memoryDir, 'domain-map.md');
    if (fs.existsSync(domainMap)) {
      lines.push(`- \`${relPath(cwd, domainMap)}\` — business context, core entities, invariants`);
    }
    const patterns = path.join(memoryDir, 'patterns.md');
    if (fs.existsSync(patterns)) {
      lines.push(
        `- \`${relPath(cwd, patterns)}\` — reusable code index (shared folders and file trees)`,
      );
    }
    lines.push('');

    // Constraints — always read, listed individually
    const constraintFiles = listFiles(path.join(memoryDir, 'constraints'));
    lines.push('## Active Constraints');
    if (constraintFiles.length > 0) {
      for (const f of constraintFiles) {
        lines.push(`- \`${relPath(cwd, f)}\``);
      }
    } else {
      lines.push('- (none)');
    }
    lines.push('');

    // Episodes — annotated with the domain each area rolls up into, so routing
    // works in both directions from this one file.
    const episodeFiles = listFiles(path.join(memoryDir, 'episodes'));
    lines.push('## Episodes', '_Read by Planner for the relevant module area._');
    if (episodeFiles.length > 0) {
      for (const f of episodeFiles) {
        lines.push(episodeEntry(cwd, f, areaToDomain));
      }
    } else {
      lines.push('- (none yet)');
    }
    lines.push('');

    // Semantic — `-prev.md` files are superseded snapshots kept for reference
    // only; indexing them invites agents to read stale current-state knowledge.
    const semanticFiles = listFiles(path.join(memoryDir, 'semantic')).filter(
      (f) => !f.endsWith('-prev.md'),
    );
    lines.push(
      '## Semantic',
      '_Distilled current-state knowledge. Read by Planner for the relevant domain._',
    );
    if (semanticFiles.length > 0) {
      for (const f of semanticFiles) {
        lines.push(semanticEntry(memoryDir, cwd, f, byDomain, consolidationState));
      }
    } else {
      lines.push('- (none yet)');
    }
    lines.push('');

    // Lessons
    const lessonFiles = listFiles(path.join(memoryDir, 'lessons'));
    lines.push(
      '## Lessons',
      '_Agent failure rules per module. Read by Planner for the relevant module._',
    );
    if (lessonFiles.length > 0) {
      for (const f of lessonFiles) {
        lines.push(`- \`${relPath(cwd, f)}\``);
      }
    } else {
      lines.push('- (none yet)');
    }
    lines.push(
      '',
      '## Notes',
      '- `bmad-docs/memory/` is gitignored — each developer has independent local memory.',
      '- PC migration: copy `~/.claude/personalization.md` + `bmad-docs/memory/` to same paths on new machine.',
      '',
    );

    const content = lines.join('\n');
    const indexPath = path.join(memoryDir, MEMORY_MD);
    fs.writeFileSync(indexPath, content, 'utf8');
    log('memory-index: MEMORY.md updated', { memoryDir });
  } catch (error) {
    log('memory-index: update failed', { error: error.message });
  }
}

module.exports = { updateMemoryIndex };
