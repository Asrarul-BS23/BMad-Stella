'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ENV_KEYS = Object.freeze({
  baseUrl: 'JIRA_BASE_URL',
  email: 'JIRA_EMAIL',
  token: 'JIRA_API_TOKEN',
  cacheDir: 'BMAD_JIRA_CACHE_DIR',
});

// BMad v6 layout (Stella): a project is the folder holding `_bmad/`; everything Stella
// writes lives under `_bmad-output/stella/`.
const ROOT_MARKER = '_bmad';
// Credentials: one file per machine, written by the installer (user decision 2026-10-26).
const CREDENTIALS_FILE_PARTS = ['.claude', 'stella', 'credentials.env'];
const CREDENTIALS_FILE_LABEL = '~/.claude/stella/credentials.env';

const DEFAULTS = Object.freeze({
  cacheSubdir: path.join('_bmad-output', 'stella', 'cache', 'jira'),
  concurrency: 5,
  requestTimeoutMs: 30_000,
  maxAttachmentBytes: 50 * 1024 * 1024,
  allowedMimePrefixes: ['image/', 'application/pdf', 'text/', 'application/json'],
});

const FORBIDDEN_ENV_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function parseDotenv(contents) {
  const result = Object.create(null);
  const lines = contents.split(/\r?\n/);
  for (const rawLine of lines) {
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

// Walk up from `startDir` to the folder that holds `_bmad/`. Returns null outside a project.
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

function credentialsPath(home = os.homedir()) {
  return path.join(home, ...CREDENTIALS_FILE_PARTS);
}

function loadDotenvIfPresent() {
  // Credentials live in ~/.claude/stella/credentials.env (written by the installer).
  const envPath = credentialsPath();
  try {
    const stat = fs.statSync(envPath);
    if (!stat.isFile()) return {};
    const contents = fs.readFileSync(envPath, 'utf8');
    return parseDotenv(contents);
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function normalizeBaseUrl(raw) {
  if (!raw) return { url: null, warning: null };
  let input = raw.trim();
  if (!input) return { url: null, warning: null };
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return { url: null, warning: null };
  }
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:') {
    if (local) return { url: parsed.origin, warning: 'using http on localhost (test only)' };
    return {
      url: null,
      warning: `refused: JIRA_BASE_URL must use https (got ${parsed.protocol}). Credentials would be sent in plaintext.`,
    };
  }
  // Credentials go to Atlassian Cloud only (localhost kept for tests).
  if (!local && !parsed.hostname.endsWith('.atlassian.net')) {
    return {
      url: null,
      warning: `refused: JIRA_BASE_URL must be an *.atlassian.net site (got ${parsed.hostname}).`,
    };
  }
  return { url: parsed.origin, warning: null };
}

function resolveConfig({ projectRoot, cwd = process.cwd() } = {}) {
  // Explicit --project-root wins; otherwise the nearest ancestor with `_bmad/`; else cwd.
  const root = projectRoot || findProjectRoot(cwd) || cwd;
  const fileEnv = loadDotenvIfPresent();
  const merged = Object.assign(Object.create(null), fileEnv);
  for (const key of Object.keys(process.env)) {
    if (FORBIDDEN_ENV_KEYS.has(key)) continue;
    merged[key] = process.env[key];
  }

  const { url: baseUrl, warning: baseUrlWarning } = normalizeBaseUrl(merged[ENV_KEYS.baseUrl]);
  const email = (merged[ENV_KEYS.email] || '').trim();
  const token = (merged[ENV_KEYS.token] || '').trim();

  const cacheOverride = (merged[ENV_KEYS.cacheDir] || '').trim();
  const cacheRoot = cacheOverride
    ? path.resolve(root, cacheOverride)
    : path.join(root, DEFAULTS.cacheSubdir);

  return {
    projectRoot: root,
    baseUrl,
    baseUrlWarning,
    email,
    token,
    cacheRoot,
    concurrency: DEFAULTS.concurrency,
    requestTimeoutMs: DEFAULTS.requestTimeoutMs,
    maxAttachmentBytes: DEFAULTS.maxAttachmentBytes,
    allowedMimePrefixes: [...DEFAULTS.allowedMimePrefixes],
  };
}

function validateConfig(config) {
  const missing = [];
  if (!config.baseUrl) missing.push(ENV_KEYS.baseUrl);
  if (!config.email) missing.push(ENV_KEYS.email);
  if (!config.token) missing.push(ENV_KEYS.token);
  return {
    ok: missing.length === 0,
    missing,
  };
}

module.exports = {
  ENV_KEYS,
  DEFAULTS,
  ROOT_MARKER,
  CREDENTIALS_FILE_LABEL,
  resolveConfig,
  validateConfig,
  parseDotenv,
  findProjectRoot,
  credentialsPath,
};
