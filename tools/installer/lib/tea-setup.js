'use strict';

// Writes the `[modules.tea]` table that `bmad setup tea` would write, so a
// fresh install passes every TEA skill's config gate without the manual chat
// step (plan: tea-module/tea-setup-automation-plan.md). The answers go into
// _bmad/config.toml — the file BMad regenerates on every install and the one
// BMad core's own setup writes team answers to — and only when no modules.tea
// table exists anywhere in the merged config (base, custom, custom user), the
// same never-overwrite rule the official setup follows. Defaults come from the
// installed bmod.toml question list; the constants hold a fallback copy.

const nodeFs = require('node:fs');
const path = require('node:path');
const { TEA_CONFIG_FALLBACK_DEFAULTS, TEA_CONFIG_OVERRIDES, BMAD_DIR } = require('./constants');

// All three files resolve_config.py merges — a modules.tea table in any of them
// satisfies the TEA skills' activation gate.
const CONFIG_FILES = [
  `${BMAD_DIR}/config.toml`,
  `${BMAD_DIR}/custom/config.toml`,
  `${BMAD_DIR}/custom/config.user.toml`,
];

// The `skills` CLI lays TEA out as plain copies under .claude/skills/ or as a
// shared tree under .agents/skills/ — both observed in real installs.
const BMOD_TOML_LOCATIONS = [
  '.claude/skills/bmod-tea/bmod.toml',
  '.agents/skills/bmod-tea/bmod.toml',
];

const hasModulesTea = (text) => /^\s*\[modules\.tea\]\s*(#.*)?$/m.test(text);

const tomlString = (value) => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/**
 * Parse the ordered `[[bmod.config_questions]]` key/default pairs out of a
 * bmod.toml. Returns null when the file holds no questions or any entry lacks
 * a key or default — the format moved on, so the caller falls back.
 * @param {string} text
 * @returns {Array<{key:string, value:string}>|null}
 */
function parseQuestions(text) {
  const entries = [];
  let current = null;
  let inTriple = false;
  for (const line of text.split(/\r?\n/)) {
    if (inTriple) {
      if (line.includes("'''")) inTriple = false;
      continue;
    }
    if ((line.match(/'''/g) || []).length === 1) {
      inTriple = true;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === '[[bmod.config_questions]]') {
      current = {};
      entries.push(current);
      continue;
    }
    if (trimmed.startsWith('[')) {
      current = null;
      continue;
    }
    if (current === null) continue;
    const m = line.match(/^\s*(key|default)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(#.*)?$/);
    if (m) current[m[1]] = m[2].replaceAll(/\\(.)/g, '$1');
  }
  const complete = entries.every(
    (e) => typeof e.key === 'string' && e.key.length > 0 && typeof e.default === 'string',
  );
  if (entries.length === 0 || !complete) return null;
  return entries.map((e) => ({ key: e.key, value: e.default }));
}

/**
 * Append `[modules.tea]` to _bmad/config.toml unless the merged config already
 * has one. Throws when _bmad/config.toml is missing (the BMad step must have
 * run) — the installer treats that as fatal, same as the TEA skill step.
 * @param {string} root project folder
 * @param {object} opts `fs` and `overrides` are injectable for tests
 * @returns {{status:'written', file:string, keys:number, source:string} |
 *           {status:'present', file:string}}
 */
function apply(root, { fs = nodeFs, overrides = TEA_CONFIG_OVERRIDES } = {}) {
  const configPath = path.join(root, BMAD_DIR, 'config.toml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`${BMAD_DIR}/config.toml not found — the BMad install step must run first`);
  }
  for (const rel of CONFIG_FILES) {
    const p = path.join(root, rel);
    if (fs.existsSync(p) && hasModulesTea(fs.readFileSync(p, 'utf8'))) {
      return { status: 'present', file: rel };
    }
  }

  let questions = null;
  let source = 'fallback';
  for (const rel of BMOD_TOML_LOCATIONS) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    questions = parseQuestions(fs.readFileSync(p, 'utf8'));
    if (questions !== null) {
      source = rel;
      break;
    }
  }
  if (questions === null) {
    questions = TEA_CONFIG_FALLBACK_DEFAULTS.map(([key, value]) => ({ key, value }));
  }

  const values = new Map(questions.map((q) => [q.key, q.value]));
  for (const [key, value] of Object.entries(overrides)) values.set(key, value);

  const existing = fs.readFileSync(configPath, 'utf8');
  const block = ['[modules.tea]'];
  for (const [key, value] of values) block.push(`${key} = ${tomlString(value)}`);
  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(configPath, `${existing}${sep}${block.join('\n')}\n`);
  return { status: 'written', file: CONFIG_FILES[0], keys: values.size, source };
}

module.exports = { apply };
