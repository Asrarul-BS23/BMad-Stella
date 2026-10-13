'use strict';

// Shared shape of a semantic memory body: its frontmatter, its section
// contract, and the per-source content hashes that decide staleness.
//
// This lives on its own because two callers must agree exactly:
// semantic-consolidator.js WRITES the per-source hashes, and memory-index.js
// READS them to flag a domain as behind its episodes. A second copy of the
// hash function would make the freshness flag silently wrong the moment the
// two drifted.

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const yaml = require('js-yaml');

// The four sections a semantic body must carry, in order. `Established
// Patterns` was removed: it restated bmad-docs/architecture/coding-standards.md,
// which the planner already reads directly.
const BODY_SECTIONS = ['Current State', 'Invariants', 'Known Gotchas', 'Reference Implementation'];

// Bumped when the section contract changes in a way that invalidates existing
// bodies. A mismatch forces a full rebuild of that domain. v1 is the four-section
// contract above.
const BODY_SCHEMA_VERSION = 1;

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

// Lines that carry no distilled knowledge: blanks, headings, HTML comments and
// unreplaced `[bracketed placeholders]` from the template.
function contentLines(body) {
  return body.split('\n').filter((line) => {
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith('#')) return false;
    if (t.startsWith('<!--')) return false;
    if (/^\[.*]$/.test(t)) return false;
    return true;
  });
}

// True when a semantic body carries real distilled knowledge, as opposed to
// being the unfilled template (headings plus [bracketed placeholders]).
function hasRealContent(body) {
  return contentLines(body).length > 0;
}

function firstContentLine(body) {
  const lines = contentLines(body);
  return lines.length > 0 ? lines[0].trim() : '';
}

function countBodyWords(body) {
  return body.split(/\s+/).filter(Boolean).length;
}

// A sha1 of the source's CONTENT. The previous stamp was `last-updated + file
// size`, which is blind to a same-day edit that preserves byte count. Episode
// files are capped at 800 words, so hashing them is microseconds.
function hashSource(memoryDir, source) {
  try {
    return crypto
      .createHash('sha1')
      .update(fs.readFileSync(path.join(memoryDir, source), 'utf8'))
      .digest('hex');
  } catch {
    // A source disappearing is itself a change, and must not collide with a
    // real hash.
    return 'missing';
  }
}

function hashSources(memoryDir, episodeSources) {
  const hashes = {};
  for (const source of [...episodeSources].sort()) {
    hashes[source] = hashSource(memoryDir, source);
  }
  return hashes;
}

// Sources whose content differs from what was stored, plus any source with no
// stored hash at all (which counts as changed).
function changedSources(storedSources, currentHashes) {
  return Object.keys(currentHashes).filter((s) => (storedSources || {})[s] !== currentHashes[s]);
}

module.exports = {
  BODY_SECTIONS,
  BODY_SCHEMA_VERSION,
  parseFrontmatter,
  splitFrontmatter,
  hasRealContent,
  firstContentLine,
  countBodyWords,
  hashSources,
  changedSources,
};
