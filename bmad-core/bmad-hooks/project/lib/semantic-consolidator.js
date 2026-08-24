'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { log, readState, writeState } = require('./state');
const { normalizeModuleTag } = require('./slug');
const { callClaude } = require('./llm');
const { buildConsolidateSemanticPrompt } = require('../prompts/consolidate-semantic');
const { buildResolveSemanticDomainsPrompt } = require('../prompts/resolve-semantic-domain');

const TEMPLATE_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.bmad-core',
  'templates',
  'memories',
  'semantic',
  '_template.md',
);

const EXCERPT_CHARS = 800;
const AREA_EXCERPT_CHARS = 600;
const EPISODE_BUDGET_CHARS = 6000;

// Bumped when the partitioning algorithm changes in a way that invalidates
// previously-stored mappings. v1 was one-domain-per-area with no map; v2 was
// sequential per-area resolution (order-dependent, produced lifecycle-phase
// domains); v3 is a single batched partition seeded with business vocabulary.
const PARTITION_VERSION = 3;

// Slugs that describe a delivery stage or a code-layout bucket rather than a
// functional area of the product. These are never valid semantic domains.
const BANNED_DOMAIN_SLUGS = new Set([
  'project-scaffold',
  'scaffold',
  'scaffolding',
  'setup',
  'bootstrap',
  'infrastructure',
  'infra',
  'misc',
  'miscellaneous',
  'core',
  'shared',
  'common',
  'utils',
  'utilities',
  'general',
  'other',
]);

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return yaml.load(match[1]) || {};
  } catch {
    return {};
  }
}

function splitFrontmatter(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n?/);
  if (!match) return { fm: {}, body: content.trim() };
  return { fm: parseFrontmatter(content), body: content.slice(match[0].length).trim() };
}

function buildFrontmatter({ domain, lastUpdated, episodeSources, supersededBy }) {
  const sourcesYaml =
    episodeSources.length > 0 ? episodeSources.map((p) => `  - ${p}`).join('\n') : '  []';
  return [
    '---',
    'type: semantic',
    `domain: '${domain}'`,
    `last-updated: ${lastUpdated || "''"}`,
    'episode-sources:',
    sourcesYaml,
    `superseded-by: '${supersededBy || ''}'`,
    '---',
  ].join('\n');
}

function templateBody(domain) {
  try {
    if (fs.existsSync(TEMPLATE_PATH)) {
      const { body } = splitFrontmatter(fs.readFileSync(TEMPLATE_PATH, 'utf8'));
      if (body) return body.replace('[Domain Area]', domain);
    }
  } catch {
    // fall through to inline default
  }
  return [
    `# ${domain} — Current State`,
    '',
    '## Current State',
    '',
    '## Established Patterns',
    '',
    '## Known Gotchas',
    '',
    '## Invariants',
    '',
    '## Reference Implementation',
  ].join('\n');
}

// True when a semantic body carries real distilled knowledge, as opposed to
// being the unfilled template (headings plus [bracketed placeholders]).
function hasRealContent(body) {
  const stripped = body
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (t.startsWith('#')) return false;
      if (t.startsWith('<!--')) return false;
      if (/^\[.*]$/.test(t)) return false;
      return true;
    })
    .join('');
  return stripped.length > 0;
}

// ---------------------------------------------------------------------------
// Staleness: content signature
// ---------------------------------------------------------------------------

// The old gate compared the semantic file's last-updated against each episode's
// last-updated and required the episode to be STRICTLY newer. Because a freshly
// seeded file was stamped with today's date, it could never pass that check on
// the day it was created — and since it never consolidated, its date never
// advanced, so it stayed an empty template forever unless an episode happened to
// be touched on a strictly later day. A content signature has no such
// dependency on the file's own timestamp and also catches two episode updates
// landing on the same day.
function computeSignature(memoryDir, episodeSources) {
  const hash = crypto.createHash('sha1');
  for (const source of [...episodeSources].sort()) {
    let stamp = 'missing';
    try {
      const fullPath = path.join(memoryDir, source);
      const stat = fs.statSync(fullPath);
      const fm = parseFrontmatter(fs.readFileSync(fullPath, 'utf8'));
      stamp = `${fm['last-updated'] || '?'}:${stat.size}`;
    } catch {
      // keep 'missing' — a source disappearing is itself a change
    }
    hash.update(`${source}|${stamp}\n`);
  }
  return hash.digest('hex');
}

function getDomainMapStatePath(memoryDir) {
  return path.join(memoryDir, '.state', 'semantic-domain-map.json');
}

function getConsolidationStatePath(memoryDir) {
  return path.join(memoryDir, '.state', 'semantic-consolidation.json');
}

// ---------------------------------------------------------------------------
// Inputs to domain resolution
// ---------------------------------------------------------------------------

function readEpisodeExcerpt(episodesDir, file, limit = EXCERPT_CHARS) {
  try {
    const content = fs.readFileSync(path.join(episodesDir, file), 'utf8');
    const { body } = splitFrontmatter(content);
    return body.slice(0, limit);
  } catch {
    return '';
  }
}

function readArchLocation(cwd) {
  try {
    const configPath = path.join(cwd, '.bmad-core', 'core-config.yaml');
    if (!fs.existsSync(configPath)) return 'bmad-docs/architecture';
    const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    return config?.architecture?.architectureShardedLocation || 'bmad-docs/architecture';
  } catch {
    return 'bmad-docs/architecture';
  }
}

function readProjectStructureExcerpt(cwd) {
  if (!cwd) return null;
  try {
    const structurePath = path.join(cwd, readArchLocation(cwd), 'project-structure.md');
    if (!fs.existsSync(structurePath)) return null;
    return fs.readFileSync(structurePath, 'utf8').slice(0, EXCERPT_CHARS);
  } catch {
    return null;
  }
}

// domain-map.md holds the project's business vocabulary — purpose, core
// entities, business rules. This is the input that keeps domain slugs in
// business terms; without it the resolver only saw project-structure.md and
// reached for code-layout words.
function readDomainMapExcerpt(memoryDir) {
  try {
    const mapPath = path.join(memoryDir, 'domain-map.md');
    if (!fs.existsSync(mapPath)) return null;
    const { body } = splitFrontmatter(fs.readFileSync(mapPath, 'utf8'));

    // Prefer the entity/rule sections — they name the domains directly — and
    // fall back to a plain head excerpt if the headings aren't present.
    const sections = [];
    for (const heading of ['Business Purpose', 'Core Domain Entities', 'Business Rules']) {
      const match = body.match(
        new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|\\s*$)`, 'i'),
      );
      if (match && match[1].trim()) {
        sections.push(`## ${heading}\n${match[1].trim().slice(0, 1800)}`);
      }
    }
    return sections.length > 0 ? sections.join('\n\n') : body.slice(0, 2500);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batched domain partitioning
// ---------------------------------------------------------------------------

function parseDomainsJson(raw) {
  try {
    const trimmed = raw
      .trim()
      .replace(/^```json\s*/, '')
      .replace(/```\s*$/, '');
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed?.domains)) return null;
    return parsed.domains;
  } catch {
    return null;
  }
}

// Turns the model's domain list into an area -> domain map, reporting any rule
// violations so the caller can retry once before falling back to repair.
function validatePartition(domains, areaNames) {
  const areaToDomain = {};
  const problems = [];
  const seen = new Set();

  for (const entry of domains) {
    const domain = normalizeModuleTag(entry?.domain);
    if (!domain) {
      problems.push(`a domain entry had a missing or unusable slug`);
      continue;
    }
    if (BANNED_DOMAIN_SLUGS.has(domain)) {
      problems.push(`"${domain}" is a lifecycle/scaffolding bucket, not a functional domain`);
      continue;
    }
    for (const rawArea of Array.isArray(entry.areas) ? entry.areas : []) {
      const area = normalizeModuleTag(rawArea);
      if (!area || !areaNames.includes(area)) {
        problems.push(`"${rawArea}" is not one of the areas to partition`);
        continue;
      }
      if (seen.has(area)) {
        problems.push(`area "${area}" was assigned to more than one domain`);
        continue;
      }
      seen.add(area);
      areaToDomain[area] = domain;
    }
  }

  const missing = areaNames.filter((a) => !seen.has(a));
  if (missing.length > 0) problems.push(`these areas were not assigned: ${missing.join(', ')}`);

  return { areaToDomain, problems, missing };
}

async function resolveAllDomains(areas, currentPartition, memoryDir, cwd) {
  const areaNames = areas.map((a) => a.area);
  const basePrompt = buildResolveSemanticDomainsPrompt({
    areas,
    currentPartition,
    domainMapExcerpt: readDomainMapExcerpt(memoryDir),
    projectStructureExcerpt: readProjectStructureExcerpt(cwd),
  });

  let lastProblems = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nYour previous answer was rejected for these reasons — fix them and answer again:\n${lastProblems.map((p) => `- ${p}`).join('\n')}`;

    const raw = await callClaude(prompt);
    if (!raw) {
      log('semantic-consolidator: partition LLM call returned nothing', { attempt });
      continue;
    }

    const domains = parseDomainsJson(raw);
    if (!domains) {
      lastProblems = ['the response was not valid JSON matching the required shape'];
      log('semantic-consolidator: partition JSON parse failed', { attempt });
      continue;
    }

    const { areaToDomain, problems, missing } = validatePartition(domains, areaNames);
    if (problems.length === 0) return areaToDomain;

    lastProblems = problems;
    log('semantic-consolidator: partition rejected', { attempt, problems });

    // Last attempt — keep what validated and give each unplaced area its own
    // domain rather than losing it from semantic memory entirely.
    if (attempt === 1) {
      for (const area of missing) areaToDomain[area] = area;
      return areaToDomain;
    }
  }

  // Total failure: fall back to one domain per area. Not ideal grouping, but
  // every area still reaches semantic memory and the next run can re-partition.
  log('semantic-consolidator: partition failed, falling back to one domain per area', {
    areas: areaNames,
  });
  return Object.fromEntries(areaNames.map((a) => [a, a]));
}

function readDomainMapState(memoryDir) {
  const raw = readState(getDomainMapStatePath(memoryDir), {});
  // Legacy shape was a flat { area: domain } map with no version field.
  if (typeof raw.version !== 'number') return { version: 0, areas: {} };
  return { version: raw.version, areas: raw.areas || {} };
}

function invertPartition(areas) {
  const byDomain = {};
  for (const [area, domain] of Object.entries(areas)) {
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(area);
  }
  return byDomain;
}

// ---------------------------------------------------------------------------
// Reconciling semantic/ against the partition
// ---------------------------------------------------------------------------

function listSemanticFiles(semanticDir) {
  if (!fs.existsSync(semanticDir)) return [];
  return fs
    .readdirSync(semanticDir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && !f.endsWith('-prev.md'));
}

// The domain map is the single source of truth for which episodes belong to
// which domain. This rewrites every semantic file's episode-sources to exactly
// the map-derived set (so a remapped area is REMOVED from its old domain, not
// just added to the new one — additive-only merging is what left the same
// episode listed under several domains) and retires files whose domain no
// longer exists. Retired files carrying real content are handed back so their
// knowledge is folded into whichever domain now owns their episodes.
function reconcileSemanticDir(semanticDir, byDomain, domainMap) {
  const carryover = new Map();
  const domainSourcesOf = (domain) =>
    (byDomain[domain] || []).map((area) => `episodes/${area}.md`).sort();

  for (const file of listSemanticFiles(semanticDir)) {
    const filePath = path.join(semanticDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const { fm, body } = splitFrontmatter(content);
    const domain = normalizeModuleTag(fm.domain) || path.basename(file, '.md');

    if (byDomain[domain]) {
      const desired = domainSourcesOf(domain);
      const current = [...(fm['episode-sources'] || [])].sort();
      const changed = desired.length !== current.length || desired.some((s, i) => s !== current[i]);
      if (changed) {
        fs.writeFileSync(
          filePath,
          `${buildFrontmatter({
            domain,
            lastUpdated: fm['last-updated'] || '',
            episodeSources: desired,
            supersededBy: fm['superseded-by'],
          })}\n\n${body}\n`,
          'utf8',
        );
        log('semantic-consolidator: rewrote episode-sources to match partition', {
          domain,
          sources: desired,
        });
      }
      continue;
    }

    // Orphan: no longer a domain in the current partition.
    if (hasRealContent(body)) {
      // Route its knowledge to whichever domains now own its episodes.
      for (const source of fm['episode-sources'] || []) {
        const area = normalizeModuleTag(path.basename(source, '.md'));
        const target = domainMap[area];
        if (!target || !byDomain[target]) continue;
        const existing = carryover.get(target);
        carryover.set(target, existing ? `${existing}\n\n---\n\n${body}` : body);
        break; // one carry-over per retired file, routed to its first owning domain
      }
      log('semantic-consolidator: retiring orphan domain with content, carrying it forward', {
        file,
        domain,
      });
    } else {
      log('semantic-consolidator: removing orphan domain file (unfilled template)', {
        file,
        domain,
      });
    }

    fs.rmSync(filePath, { force: true });
    fs.rmSync(path.join(semanticDir, `${path.basename(file, '.md')}-prev.md`), { force: true });
  }

  return carryover;
}

// New domain files are seeded with an EMPTY last-updated on purpose: an empty
// value means "never consolidated", which lets the very first consolidation
// pass run. Seeding with today's date is what made every new file skip its own
// first consolidation and stay an unfilled template.
function seedSemanticFile(semanticDir, domain, episodeSourcePaths) {
  const semanticPath = path.join(semanticDir, `${domain}.md`);
  const frontmatter = buildFrontmatter({
    domain,
    lastUpdated: '',
    episodeSources: episodeSourcePaths,
    supersededBy: '',
  });
  fs.writeFileSync(semanticPath, `${frontmatter}\n\n${templateBody(domain)}\n`, 'utf8');
}

async function ensureSemanticFiles(memoryDir, cwd) {
  const episodesDir = path.join(memoryDir, 'episodes');
  const semanticDir = path.join(memoryDir, 'semantic');

  if (!fs.existsSync(episodesDir)) return { byDomain: {}, carryover: new Map() };
  fs.mkdirSync(semanticDir, { recursive: true });

  // `_untagged.md` is a holding bin for entries whose module tag couldn't be
  // resolved, not a real area — letting it into the partition drags unrelated
  // work into whichever domain it lands in. Entries are drained out of it by
  // lib/reconcile-episodic-tags.js, at which point they reach semantic memory
  // under their true area.
  const episodeFiles = fs.readdirSync(episodesDir).filter((f) => f.endsWith('.md') && f[0] !== '_');

  const untaggedPath = path.join(episodesDir, '_untagged.md');
  if (
    fs.existsSync(untaggedPath) &&
    /\n---\n\*\*\d{4}-\d{2}-\d{2}\*\*/.test(fs.readFileSync(untaggedPath, 'utf8'))
  ) {
    log(
      'semantic-consolidator: episodes/_untagged.md has entries excluded from semantic memory — run lib/reconcile-episodic-tags.js to file them under their real areas',
      {},
    );
  }

  if (episodeFiles.length === 0) return { byDomain: {}, carryover: new Map() };

  const areas = episodeFiles.map((file) => ({
    area: normalizeModuleTag(path.basename(file, '.md')) || path.basename(file, '.md'),
    excerpt: readEpisodeExcerpt(episodesDir, file, AREA_EXCERPT_CHARS),
  }));
  const areaNames = areas.map((a) => a.area);

  const mapPath = getDomainMapStatePath(memoryDir);
  const stored = readDomainMapState(memoryDir);

  // Re-partition when the algorithm version changed (stored mappings came from
  // the order-dependent resolver and can't be trusted) or when an area is
  // unmapped. Re-partitioning is a single call and the prompt is asked to keep
  // existing groupings stable, so this corrects the partition without churning
  // domain names on every new area.
  const versionStale = stored.version !== PARTITION_VERSION;
  const hasUnmapped = areaNames.some((a) => !stored.areas[a]);

  let areaMap = stored.areas;
  if (versionStale || hasUnmapped) {
    const currentPartition = versionStale ? {} : invertPartition(stored.areas);
    areaMap = await resolveAllDomains(areas, currentPartition, memoryDir, cwd);
    writeState(mapPath, { version: PARTITION_VERSION, areas: areaMap });
    log('semantic-consolidator: partitioned episodic areas into semantic domains', {
      reason: versionStale ? `version ${stored.version} -> ${PARTITION_VERSION}` : 'new areas',
      partition: invertPartition(areaMap),
    });
  } else {
    // Drop mappings for areas whose episode file no longer exists.
    const pruned = Object.fromEntries(
      Object.entries(areaMap).filter(([area]) => areaNames.includes(area)),
    );
    if (Object.keys(pruned).length !== Object.keys(areaMap).length) {
      areaMap = pruned;
      writeState(mapPath, { version: PARTITION_VERSION, areas: areaMap });
    }
  }

  const byDomain = invertPartition(areaMap);
  const carryover = reconcileSemanticDir(semanticDir, byDomain, areaMap);

  for (const [domain, domainAreas] of Object.entries(byDomain)) {
    const semanticPath = path.join(semanticDir, `${domain}.md`);
    if (fs.existsSync(semanticPath)) continue;
    try {
      seedSemanticFile(semanticDir, domain, domainAreas.map((a) => `episodes/${a}.md`).sort());
      log('semantic-consolidator: seeded new semantic domain file', { domain, areas: domainAreas });
    } catch (error) {
      log('semantic-consolidator: failed to seed semantic file', { domain, error: error.message });
    }
  }

  return { byDomain, carryover };
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

async function consolidateSemantic(memoryDir, semanticFilePath, carryoverBody) {
  const consolidationStatePath = getConsolidationStatePath(memoryDir);
  try {
    const content = fs.readFileSync(semanticFilePath, 'utf8');
    const { fm, body } = splitFrontmatter(content);
    const domain = normalizeModuleTag(fm.domain) || path.basename(semanticFilePath, '.md');
    const episodeSources = fm['episode-sources'] || [];

    if (episodeSources.length === 0) {
      log('semantic-consolidator: no episode sources listed, skipping', { file: semanticFilePath });
      return;
    }

    const signature = computeSignature(memoryDir, episodeSources);
    const state = readState(consolidationStatePath, {});
    if (state[domain]?.signature === signature && !carryoverBody && hasRealContent(body)) {
      log('semantic-consolidator: semantic is up-to-date, skipping', { domain });
      return;
    }

    const episodeContents = [];
    let used = 0;
    for (const source of episodeSources) {
      const fullPath = path.join(memoryDir, source);
      if (!fs.existsSync(fullPath)) continue;
      const remaining = EPISODE_BUDGET_CHARS - used;
      if (remaining <= 0) {
        log('semantic-consolidator: episode budget exhausted, later sources truncated', {
          domain,
          droppedFrom: source,
        });
        break;
      }
      const chunk = `### ${source}\n${fs.readFileSync(fullPath, 'utf8')}`.slice(0, remaining);
      used += chunk.length;
      episodeContents.push(chunk);
    }

    if (episodeContents.length === 0) {
      log('semantic-consolidator: no episode sources found on disk', { file: semanticFilePath });
      return;
    }

    const newBody = await callClaude(
      buildConsolidateSemanticPrompt({
        domain,
        currentBody: body,
        episodeContents: episodeContents.join('\n\n---\n\n'),
        carryoverBody,
      }),
    );

    if (!newBody || !newBody.trim()) {
      log('semantic-consolidator: LLM returned nothing, skipping', { domain });
      return;
    }

    // Strip any frontmatter or fencing the model added despite being told not
    // to — frontmatter is rebuilt here so episode-sources can't be corrupted.
    const cleanBody = splitFrontmatter(
      newBody
        .trim()
        .replace(/^```(?:markdown|md)?\s*\n/, '')
        .replace(/\n```\s*$/, ''),
    ).body;

    if (!hasRealContent(cleanBody)) {
      log('semantic-consolidator: LLM output had no real content, keeping existing file', {
        domain,
      });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const dir = path.dirname(semanticFilePath);
    const base = path.basename(semanticFilePath, '.md');

    // Keep one prior generation, but only once there was something to preserve.
    if (hasRealContent(body)) {
      fs.writeFileSync(
        path.join(dir, `${base}-prev.md`),
        `<!-- superseded-by: ${base}.md on ${today} -->\n\n${content}`,
        'utf8',
      );
    }

    const frontmatter = buildFrontmatter({
      domain,
      lastUpdated: today,
      episodeSources,
      supersededBy: '',
    });
    const tmp = `${semanticFilePath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, `${frontmatter}\n\n${cleanBody}\n`, 'utf8');
    fs.renameSync(tmp, semanticFilePath);

    state[domain] = { signature, consolidatedAt: new Date().toISOString() };
    writeState(consolidationStatePath, state);

    log('semantic-consolidator: consolidated', { domain, sources: episodeSources.length });
  } catch (error) {
    log('semantic-consolidator: failed', { file: semanticFilePath, error: error.message });
  }
}

async function consolidateAll(memoryDir, cwd) {
  const semanticDir = path.join(memoryDir, 'semantic');

  const { carryover } = await ensureSemanticFiles(memoryDir, cwd);

  if (!fs.existsSync(semanticDir)) return;

  for (const file of listSemanticFiles(semanticDir)) {
    const filePath = path.join(semanticDir, file);
    const domain = normalizeModuleTag(parseFrontmatter(fs.readFileSync(filePath, 'utf8')).domain);
    await consolidateSemantic(memoryDir, filePath, carryover.get(domain));
  }
}

module.exports = { consolidateSemantic, consolidateAll };
