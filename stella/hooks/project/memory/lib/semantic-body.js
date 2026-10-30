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

// The four sections a semantic body must carry, in order. `Established
// Patterns` was removed: it restated the project's own coding-standards docs,
// which the planner already reads directly.
const BODY_SECTIONS = ['Current State', 'Invariants', 'Known Gotchas', 'Reference Implementation'];

// Bumped when the section contract changes in a way that invalidates existing
// bodies. A mismatch forces a full rebuild of that domain. v1 is the four-section
// contract above.
const BODY_SCHEMA_VERSION = 1;

// Both frontmatter functions anchor on a bare `\n` after `---`. A CRLF-checked-out
// file (`core.autocrlf=true`, no .gitattributes forcing LF on these templates)
// never matches that, so the match silently fails and the whole raw file —
// frontmatter included — leaks through as "body" (seen in the wild: a seeded
// semantic file whose body was the unfilled template's own frontmatter
// duplicated underneath the real one). Normalizing once up front, and slicing
// the same normalized string throughout, removes the failure mode entirely.
function normalizeNewlines(content) {
  return content.replaceAll('\r\n', '\n');
}

// Quoted stays a string verbatim; a bare integer becomes a Number (matches
// js-yaml's implicit int typing — lib/constraint-promoter.js's frequency
// check requires `typeof fm.frequency === 'number'`); anything else
// (including a bare date like `2026-10-07`, which js-yaml would otherwise
// implicitly type as a Date) stays a plain string — every caller of a date
// field here only ever compares or stringifies it, never does date math.
function coerceScalar(raw) {
  const trimmed = raw.trim();
  const quoted =
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'));
  if (quoted) return trimmed.slice(1, -1);
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

// Hand-rolled parser for the one frontmatter shape this framework writes:
// scalar `key: value` lines (quoted, bare integer, or bare string) and one
// block-list key (`episode-sources:` followed by indented `- ` lines, or
// inline `[]`). Not a general YAML parser — deliberately so, to keep this
// hook zero-dependency when copied standalone into a project (no npm install
// runs on install; see tools/installer/lib/stella-layer.js's copyHooks()).
function parseFrontmatter(content) {
  const normalized = normalizeNewlines(content);
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result = {};
  let listKey = null;
  for (const line of match[1].split('\n')) {
    const listItem = line.match(/^\s+-\s*(.*)$/);
    if (listItem && listKey) {
      result[listKey].push(coerceScalar(listItem[1]));
      continue;
    }
    listKey = null;

    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    if (value === '') {
      result[key] = [];
      listKey = key; // a block list may follow on the next lines
    } else if (value === '[]') {
      result[key] = [];
    } else {
      result[key] = coerceScalar(value);
    }
  }
  return result;
}

function splitFrontmatter(content) {
  const normalized = normalizeNewlines(content);
  const match = normalized.match(/^---\n[\s\S]*?\n---\n?/);
  if (!match) return { fm: {}, body: normalized.trim() };
  return { fm: parseFrontmatter(normalized), body: normalized.slice(match[0].length).trim() };
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
