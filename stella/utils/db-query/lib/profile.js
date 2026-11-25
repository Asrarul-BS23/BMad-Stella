'use strict';

const fs = require('node:fs');
const path = require('node:path');
const toml = require('./toml-lite');

// BMad v6 layout (Stella): a project is the folder holding `_bmad/`.
const ROOT_MARKER = '_bmad';
const CUSTOM_DIR = ['_bmad', 'custom'];
// The personal stella-investigate file. `.profile.toml` wins when both exist.
const PROFILE_FILES = ['stella-investigate.profile.toml', 'stella-investigate.user.toml'];
const SECRETS_FILE = 'stella-investigate.secrets.env';

const DEFAULTS = Object.freeze({ rowLimit: 100, timeoutSeconds: 30 });
const LIMITS = Object.freeze({ maxRows: 5000, maxTimeoutSeconds: 300 });
const TOOLS = Object.freeze(['sqlcmd', 'psql', 'mysql']);
const TOOL_DIALECT = Object.freeze({ sqlcmd: 'tsql', psql: 'postgresql', mysql: 'mysql' });

const FORBIDDEN_ENV_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    try {
      if (fs.statSync(path.join(dir, ROOT_MARKER)).isDirectory()) return dir;
    } catch {
      /* not here */
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function profilePath(root) {
  for (const name of PROFILE_FILES) {
    const file = path.join(root, ...CUSTOM_DIR, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function parseDotenv(contents) {
  const result = Object.create(null);
  for (const rawLine of String(contents).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key || FORBIDDEN_ENV_KEYS.has(key)) continue;
    result[key] = value;
  }
  return result;
}

// Secret order, the same as stella-tea-live-testing: the secrets file, then the
// OS environment. The value is returned to the caller only, never printed.
function resolveSecret(root, name, env = process.env) {
  if (!name) return null;
  try {
    const file = path.join(root, ...CUSTOM_DIR, SECRETS_FILE);
    const fromFile = parseDotenv(fs.readFileSync(file, 'utf8'))[name];
    if (fromFile) return fromFile;
  } catch {
    /* no secrets file */
  }
  return env[name] || null;
}

// An environment called prod, production, prd or live (alone or as one part of the
// name, like "prod-eu") is production unless the profile says `production = false`.
// The same rule is in the guard hook (investigate-policy.js); keep the two in step.
const PRODUCTION_NAME_RE = /(^|[^a-z0-9])(?:prod|production|prd|live)([^a-z0-9]|$)/i;

function isProduction(envName, flag) {
  if (flag === true || flag === false) return flag;
  return PRODUCTION_NAME_RE.test(String(envName || ''));
}

function clampInt(value, fallback, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

/**
 * Reads the profile and returns what one query run needs.
 * @returns {{ok: true, env: object} | {ok: false, code: string, reason: string}}
 */
function loadEnvironment(root, envName) {
  const file = profilePath(root);
  if (!file) {
    return {
      ok: false,
      code: 'NO_PROFILE',
      reason: `no profile found at ${CUSTOM_DIR.join('/')}/${PROFILE_FILES[1]}`,
    };
  }
  let data;
  try {
    data = toml.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { ok: false, code: 'NO_PROFILE', reason: `cannot read ${file}: ${error.message}` };
  }
  const workflow = (data && data.workflow) || {};
  const environments = workflow.environments || {};
  const known = Object.keys(environments);
  if (!Object.hasOwn(environments, envName)) {
    return {
      ok: false,
      code: 'NO_ENV',
      reason: `environment "${envName}" is not in the profile (known: ${known.join(', ') || 'none'})`,
    };
  }
  const entry = environments[envName] || {};
  const db = entry.db && typeof entry.db === 'object' ? entry.db : null;
  const shared = workflow.db && typeof workflow.db === 'object' ? workflow.db : {};
  const defaults = workflow.defaults || {};
  const tool = db ? String(db.tool || '').toLowerCase() : '';

  return {
    ok: true,
    env: {
      name: envName,
      production: isProduction(envName, entry.production),
      db,
      tool,
      dialect: String(defaults.sql_dialect || TOOL_DIALECT[tool] || 'tsql'),
      rowLimit: clampInt(shared.row_limit, DEFAULTS.rowLimit, LIMITS.maxRows),
      timeoutSeconds: clampInt(
        shared.timeout_seconds,
        DEFAULTS.timeoutSeconds,
        LIMITS.maxTimeoutSeconds,
      ),
      piiColumns: Array.isArray(shared.pii_columns) ? shared.pii_columns.map(String) : [],
    },
  };
}

module.exports = {
  findProjectRoot,
  profilePath,
  loadEnvironment,
  resolveSecret,
  parseDotenv,
  isProduction,
  TOOLS,
  TOOL_DIALECT,
  DEFAULTS,
  PROFILE_FILES,
  SECRETS_FILE,
  CUSTOM_LABEL: CUSTOM_DIR.join('/'),
};
