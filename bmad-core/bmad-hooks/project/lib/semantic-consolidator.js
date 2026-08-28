'use strict';

const path = require('node:path');
const fs = require('node:fs');
const yaml = require('js-yaml');
const { log, readState, writeState } = require('./state');
const {
  BODY_SECTIONS,
  BODY_SCHEMA_VERSION,
  parseFrontmatter,
  splitFrontmatter,
  hasRealContent,
  countBodyWords,
  hashSources,
  changedSources,
} = require('./semantic-body');
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

// Deltas are surgical, so drift accumulates slowly rather than never. A
// re-verification rebuild every Nth delta catches what the surgical path
// missed. Counted in DELTAS, not days: consolidation runs weekly, so a
// ten-DAY window would fire on roughly every second run and rebuild would
// become the normal path, defeating delta entirely.
const DELTA_REBUILD_INTERVAL = 10;

// A returned body is rejected if it falls below this fraction of the existing
// one. Retiring every gotcha cannot trip it: `Known Gotchas` measures ~23% of a
// body, so deleting the whole section lands at 77%.
const MIN_BODY_RATIO = 0.6;

// Split trigger. 3000 words is set by decision, not measurement. The area gate
// is the arithmetic floor: a split partitions AREAS, so a one-area domain has
// nothing to divide — a single area distilling to 3000 words means the module
// tag is too broad, which is fixed in tagging, not here.
const SPLIT_BODY_WORDS = 3000;
const SPLIT_WARN_BODY_WORDS = 2000;
const SPLIT_MIN_AREAS = 2;

// Consecutive rejected rebuilds after which the sticky rebuild triggers are
// blocked and the domain falls back to delta. See isRebuildBlocked.
const MAX_REBUILD_REJECTIONS = 2;

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
  // Only reached when the installed template is missing, but if the two
  // disagree a project without the template silently gets the old contract.
  return [`# ${domain} — Current State`, '', ...BODY_SECTIONS.flatMap((h) => [`## ${h}`, ''])]
    .join('\n')
    .trimEnd();
}

// ---------------------------------------------------------------------------
// Staleness: per-source content hashes
// ---------------------------------------------------------------------------

// Staleness is tracked per SOURCE, not per domain, so a run can feed only the
// episode files that actually changed. See lib/semantic-body.js for the hash.
//
// The gate before this compared the semantic file's last-updated against each
// episode's last-updated and required the episode to be STRICTLY newer. A
// freshly seeded file was stamped with today's date, so it could never pass on
// the day it was created — and since it never consolidated, its date never
// advanced. Content hashes have no dependency on the file's own timestamp.
//
// The single per-domain signature that replaced it was `last-updated + file
// size`, which is blind to a same-day edit preserving byte count, and could
// only say "something changed" — not what.

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

async function resolveAllDomains(areas, currentPartition, memoryDir, cwd, pinnedSeparations) {
  const areaNames = areas.map((a) => a.area);
  const basePrompt = buildResolveSemanticDomainsPrompt({
    areas,
    currentPartition,
    domainMapExcerpt: readDomainMapExcerpt(memoryDir),
    projectStructureExcerpt: readProjectStructureExcerpt(cwd),
    pinnedSeparations,
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
  // `splits` records children of a deliberate domain split, so the partition
  // prompt can be told not to merge them back. Nothing writes it yet — the
  // split machinery is designed but not built — so it reads as empty today.
  const splits = Array.isArray(raw.splits) ? raw.splits : [];
  // Legacy shape was a flat { area: domain } map with no version field.
  if (typeof raw.version !== 'number') return { version: 0, areas: {}, splits };
  return { version: raw.version, areas: raw.areas || {}, splits };
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
//
// Membership changes are RETURNED, not just logged: an area joining or leaving
// a domain is a rebuild trigger, and the caller cannot act on a log line.
function reconcileSemanticDir(semanticDir, byDomain, domainMap) {
  const carryover = new Map();
  const membershipChanged = new Set();
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
      const sourcesChanged =
        desired.length !== current.length || desired.some((s, i) => s !== current[i]);

      // A date on a body that is still the unfilled template is a false
      // 'fresh' — the dangerous direction. Normalize it at the source so legacy
      // dated templates stop lying, rather than only papering over it at
      // display time in MEMORY.md.
      const storedLastUpdated = fm['last-updated'] || '';
      const desiredLastUpdated = hasRealContent(body) ? storedLastUpdated : '';
      const dateChanged = desiredLastUpdated !== storedLastUpdated;

      if (sourcesChanged) membershipChanged.add(domain);

      if (sourcesChanged || dateChanged) {
        fs.writeFileSync(
          filePath,
          `${buildFrontmatter({
            domain,
            lastUpdated: desiredLastUpdated,
            episodeSources: desired,
            supersededBy: fm['superseded-by'],
          })}\n\n${body}\n`,
          'utf8',
        );
        log('semantic-consolidator: reconciled semantic frontmatter', {
          domain,
          sources: sourcesChanged ? desired : undefined,
          clearedStaleDate: dateChanged ? storedLastUpdated : undefined,
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

  return { carryover, membershipChanged };
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

  const empty = { byDomain: {}, carryover: new Map(), forceRebuild: new Set() };
  if (!fs.existsSync(episodesDir)) return empty;
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

  if (episodeFiles.length === 0) return empty;

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

  // Deliberate separations survive a re-partition: the pin is what stops
  // merging (which runs inside this call) from undoing a split.
  const writeMap = (map) =>
    writeState(mapPath, { version: PARTITION_VERSION, areas: map, splits: stored.splits });

  let areaMap = stored.areas;
  if (versionStale || hasUnmapped) {
    const currentPartition = versionStale ? {} : invertPartition(stored.areas);
    areaMap = await resolveAllDomains(areas, currentPartition, memoryDir, cwd, stored.splits);
    writeMap(areaMap);
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
      writeMap(areaMap);
    }
  }

  const byDomain = invertPartition(areaMap);
  const { carryover, membershipChanged } = reconcileSemanticDir(semanticDir, byDomain, areaMap);

  // A PARTITION_VERSION bump means every stored grouping came from a different
  // algorithm, so every domain rebuilds even where its membership happens to be
  // unchanged.
  const forceRebuild = versionStale ? new Set(Object.keys(byDomain)) : membershipChanged;

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

  return { byDomain, carryover, forceRebuild };
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

// Chooses rebuild / delta / skip BEFORE any LLM call, so an unchanged domain
// costs nothing at all.
function selectMode({
  stored,
  currentHashes,
  bodyHasRealContent,
  carryoverBody,
  forceRebuild,
  rebuildBlocked,
}) {
  if (forceRebuild) return { mode: 'rebuild', reason: 'partition or membership changed' };
  if (carryoverBody) return { mode: 'rebuild', reason: 'carryover body from a retired domain' };
  if (!stored || Object.keys(stored.sources || {}).length === 0) {
    return { mode: 'rebuild', reason: 'no stored source hashes' };
  }
  if (stored.bodySchema !== BODY_SCHEMA_VERSION && !rebuildBlocked) {
    return {
      mode: 'rebuild',
      reason: `body schema ${stored.bodySchema} -> ${BODY_SCHEMA_VERSION}`,
    };
  }
  // A stored body that is still the unfilled template has nothing for a delta
  // to be surgical about, so this trigger is never blocked — there is no
  // alternative mode to fall back to.
  if (!bodyHasRealContent) return { mode: 'rebuild', reason: 'body is an unfilled template' };
  // Never blocked either: reaching the interval IS the cooldown expiring, which
  // is what gives a previously-rejected rebuild its next attempt.
  if ((stored.deltasSinceRebuild || 0) >= DELTA_REBUILD_INTERVAL) {
    return { mode: 'rebuild', reason: `${stored.deltasSinceRebuild} deltas since last rebuild` };
  }

  const changed = changedSources(stored.sources, currentHashes);
  if (changed.length === 0) return { mode: 'skip', reason: 'no source content changed' };
  return { mode: 'delta', reason: `${changed.length} source(s) changed`, changed };
}

// A rejection used to be a no-op on every piece of state: hashes stayed stale,
// the delta counter stayed put, and nothing recorded that it had happened. So
// the trigger that caused the rebuild was still true next run, identically —
// and while the domain sat in that loop it stopped updating at all, because
// every run picked rebuild and every rebuild was rejected.
//
// Two of the rebuild triggers are STICKY in that way: a body-schema mismatch
// and the every-Nth-delta rebuild. This blocks exactly those two once a rebuild
// has been rejected MAX_REBUILD_REJECTIONS times in a row, so the domain drops
// back to delta and keeps taking new episodes. The block lifts on its own when
// the delta counter climbs back to DELTA_REBUILD_INTERVAL, giving the rebuild
// another attempt roughly every ten runs instead of every single one.
//
// What this deliberately does NOT do is give up and save the body anyway. A
// short or malformed return almost always means the model failed, not that the
// domain genuinely knows less, so accepting it would turn a visible stall into
// silent knowledge loss.
function isRebuildBlocked(stored) {
  if (!stored) return false;
  return (
    (stored.rebuildRejections || 0) >= MAX_REBUILD_REJECTIONS &&
    (stored.deltasSinceRebuild || 0) < DELTA_REBUILD_INTERVAL
  );
}

// Fair-share the character budget across the sources being fed, rather than
// filling first-come. domainSourcesOf and seedSemanticFile both sort, so a
// first-come fill meant an alphabetically-early source always reached the model
// and a late one never did. With few sources each share exceeds the file, so
// the file is fed whole; the cap only bites when many sources are fed at once.
function readEpisodeSources(memoryDir, sources, domain) {
  const share = Math.floor(EPISODE_BUDGET_CHARS / Math.max(1, sources.length));
  const chunks = [];
  for (const source of sources) {
    const fullPath = path.join(memoryDir, source);
    if (!fs.existsSync(fullPath)) continue;
    const raw = `### ${source}\n${fs.readFileSync(fullPath, 'utf8')}`;
    if (raw.length > share) {
      log('semantic-consolidator: source truncated to its fair share of the budget', {
        domain,
        source,
        share,
        length: raw.length,
      });
    }
    chunks.push(raw.slice(0, share));
  }
  return chunks;
}

// Both modes are forbidden from shrinking a body: delta is surgical and rebuild
// is re-verification, so neither has a legitimate reason to return less. The
// only mechanism that reduces a body is a domain split.
function rejectionReason(newBody, existingBody) {
  if (!hasRealContent(newBody)) return 'no real content — placeholders only';
  const missing = BODY_SECTIONS.filter((h) => !new RegExp(`^##\\s+${h}\\s*$`, 'm').test(newBody));
  // This is what catches a three-of-four-sections return, which passes any
  // proportional test while having lost a quarter of the file.
  if (missing.length > 0) return `missing section(s): ${missing.join(', ')}`;
  if (existingBody.length > 0 && newBody.length < existingBody.length * MIN_BODY_RATIO) {
    const pct = Math.round((newBody.length / existingBody.length) * 100);
    return `shrank to ${pct}% of the existing body`;
  }
  return null;
}

async function consolidateSemantic(memoryDir, semanticFilePath, carryoverBody, forceRebuild) {
  const consolidationStatePath = getConsolidationStatePath(memoryDir);
  try {
    const content = fs.readFileSync(semanticFilePath, 'utf8');
    const { fm, body } = splitFrontmatter(content);
    const domain = normalizeModuleTag(fm.domain) || path.basename(semanticFilePath, '.md');

    // The full map-derived set. It stays the frontmatter value even on a delta
    // run that fed only some of them — narrowing it would silently un-map the
    // rest of the domain.
    const episodeSources = fm['episode-sources'] || [];

    if (episodeSources.length === 0) {
      log('semantic-consolidator: no episode sources listed, skipping', { file: semanticFilePath });
      return;
    }

    const currentHashes = hashSources(memoryDir, episodeSources);
    const state = readState(consolidationStatePath, {});
    const stored = state[domain];

    const rebuildBlocked = isRebuildBlocked(stored);
    const { mode, reason, changed } = selectMode({
      stored,
      currentHashes,
      bodyHasRealContent: hasRealContent(body),
      carryoverBody,
      forceRebuild,
      rebuildBlocked,
    });

    if (mode === 'skip') {
      log('semantic-consolidator: semantic is up-to-date, skipping', { domain, reason });
      return;
    }

    const sourcesToFeed = mode === 'delta' ? changed : episodeSources;
    const episodeContents = readEpisodeSources(memoryDir, sourcesToFeed, domain);

    if (episodeContents.length === 0) {
      log('semantic-consolidator: no episode sources found on disk', { file: semanticFilePath });
      return;
    }

    log('semantic-consolidator: consolidating', {
      domain,
      mode,
      reason,
      fed: sourcesToFeed,
      rebuildBlocked: rebuildBlocked || undefined,
    });

    const basePrompt = buildConsolidateSemanticPrompt({
      domain,
      currentBody: body,
      episodeContents: episodeContents.join('\n\n---\n\n'),
      carryoverBody,
      mode,
    });

    // One in-run retry that tells the model what was wrong with its last
    // answer, mirroring how resolveAllDomains handles a rejected partition. A
    // dropped heading is usually just a sloppy return, and naming the missing
    // section fixes it on the spot — far cheaper than waiting a week to find
    // out whether the next run happens to come back valid.
    let cleanBody = null;
    let rejection = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? basePrompt
          : `${basePrompt}\n\nYour previous answer was rejected for this reason — fix it and answer again:\n- ${rejection}`;

      const raw = await callClaude(prompt);
      if (!raw || !raw.trim()) {
        // No body at all is a transport failure, not a bad body: retrying
        // immediately would just double the failed calls.
        log('semantic-consolidator: LLM returned nothing, skipping', { domain, mode, attempt });
        return;
      }

      // Strip any frontmatter or fencing the model added despite being told not
      // to — frontmatter is rebuilt here so episode-sources can't be corrupted.
      const candidate = splitFrontmatter(
        raw
          .trim()
          .replace(/^```(?:markdown|md)?\s*\n/, '')
          .replace(/\n```\s*$/, ''),
      ).body;

      rejection = rejectionReason(candidate, body);
      if (!rejection) {
        cleanBody = candidate;
        break;
      }
      log('semantic-consolidator: rejected LLM body', { domain, mode, attempt, rejection });
    }

    // Both attempts rejected. The per-source hashes are deliberately left
    // UNWRITTEN so the next run still sees these sources as changed, but the
    // rejection itself is now RECORDED — that counter is what stops a sticky
    // rebuild trigger from re-firing every run forever.
    if (!cleanBody) {
      const rejectedAt = new Date().toISOString();
      const rebuildRejections =
        mode === 'rebuild' ? (stored?.rebuildRejections || 0) + 1 : stored?.rebuildRejections || 0;

      state[domain] = {
        ...stored,
        rebuildRejections,
        lastRejection: rejection,
        lastRejectionAt: rejectedAt,
      };

      // Start the cooldown: with the delta counter back at zero the periodic
      // rebuild is pushed out a full interval, and isRebuildBlocked holds until
      // it climbs back.
      if (mode === 'rebuild' && rebuildRejections >= MAX_REBUILD_REJECTIONS) {
        state[domain].deltasSinceRebuild = 0;
        log('semantic-consolidator: rebuild rejected repeatedly, falling back to delta', {
          domain,
          rebuildRejections,
          rejection,
          retryAfterDeltas: DELTA_REBUILD_INTERVAL,
        });
      }

      writeState(consolidationStatePath, state);
      log('semantic-consolidator: keeping existing file', { domain, mode, rejection });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const dir = path.dirname(semanticFilePath);
    const base = path.basename(semanticFilePath, '.md');

    // Keep one prior generation, but only once there was something to preserve.
    // Under surgical updates its diff is small and genuinely reviewable, which
    // makes it the practical way to audit what a consolidation changed.
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

    const now = new Date().toISOString();
    // bodySchema is stamped only HERE, on a successful consolidation — never at
    // seed time. Stamping at seed would mark a freshly seeded template as
    // current, so its first real consolidation would skip its own rebuild.
    //
    // Only a REBUILD may stamp it. A delta running because the schema rebuild
    // was blocked has not migrated anything, so stamping there would mark the
    // migration done while the body is still the old shape — the same false
    // 'current' as the seed-time bug above.
    state[domain] = {
      bodySchema:
        mode === 'rebuild' ? BODY_SCHEMA_VERSION : (stored?.bodySchema ?? BODY_SCHEMA_VERSION),
      sources: currentHashes,
      deltasSinceRebuild: mode === 'rebuild' ? 0 : (stored?.deltasSinceRebuild || 0) + 1,
      lastRebuildAt: mode === 'rebuild' ? now : stored?.lastRebuildAt || now,
      // Consecutive REBUILD rejections. Cleared by a successful rebuild only: a
      // successful delta says nothing about whether rebuild works, and clearing
      // on delta would unblock the sticky trigger immediately, putting the loop
      // straight back.
      rebuildRejections: mode === 'rebuild' ? 0 : stored?.rebuildRejections || 0,
      consolidatedAt: now,
    };
    writeState(consolidationStatePath, state);

    log('semantic-consolidator: consolidated', {
      domain,
      mode,
      fed: sourcesToFeed.length,
      of: episodeSources.length,
    });
  } catch (error) {
    log('semantic-consolidator: failed', { file: semanticFilePath, error: error.message });
  }
}

// The split TRIGGER lands now; the split MACHINERY waits until a real body
// passes the warning threshold, at which point this will have been logging for
// weeks. Bodies only start growing once surgical updates stop re-deriving them
// from their sources, so there is time.
function checkSplitTrigger(semanticFilePath, domain, areas) {
  try {
    const { body } = splitFrontmatter(fs.readFileSync(semanticFilePath, 'utf8'));
    const bodyWords = countBodyWords(body);
    if (bodyWords >= SPLIT_BODY_WORDS && areas >= SPLIT_MIN_AREAS) {
      log('semantic-consolidator: split needed', { domain, bodyWords, areas });
    } else if (bodyWords >= SPLIT_BODY_WORDS) {
      // Not splittable: a split partitions areas, and one area cannot divide. A
      // single area distilling to this much means the module tag is too broad.
      log('semantic-consolidator: over split threshold but only one area, left intact', {
        domain,
        bodyWords,
      });
    } else if (bodyWords >= SPLIT_WARN_BODY_WORDS) {
      log('semantic-consolidator: approaching split threshold', { domain, bodyWords, areas });
    }
  } catch {
    // A body we cannot read is not a split decision.
  }
}

async function consolidateAll(memoryDir, cwd) {
  const semanticDir = path.join(memoryDir, 'semantic');

  const { byDomain, carryover, forceRebuild } = await ensureSemanticFiles(memoryDir, cwd);

  if (!fs.existsSync(semanticDir)) return;

  for (const file of listSemanticFiles(semanticDir)) {
    const filePath = path.join(semanticDir, file);
    const domain = normalizeModuleTag(parseFrontmatter(fs.readFileSync(filePath, 'utf8')).domain);
    await consolidateSemantic(memoryDir, filePath, carryover.get(domain), forceRebuild.has(domain));
    checkSplitTrigger(filePath, domain, (byDomain[domain] || []).length);
  }
}

module.exports = { consolidateSemantic, consolidateAll };
