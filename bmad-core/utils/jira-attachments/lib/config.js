'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ENV_KEYS = Object.freeze({
  baseUrl: 'JIRA_BASE_URL',
  email: 'JIRA_EMAIL',
  token: 'JIRA_API_TOKEN',
  cacheDir: 'BMAD_JIRA_CACHE_DIR',
});

const DEFAULTS = Object.freeze({
  cacheSubdir: path.join('bmad-docs', 'cache', 'jira'),
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

function loadDotenvIfPresent(projectRoot) {
  const envPath = path.join(projectRoot, '.env');
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
  if (parsed.protocol !== 'https:') {
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return { url: parsed.origin, warning: 'using http on localhost (test only)' };
    }
    return {
      url: null,
      warning: `refused: JIRA_BASE_URL must use https (got ${parsed.protocol}). Credentials would be sent in plaintext.`,
    };
  }
  return { url: parsed.origin, warning: null };
}

function resolveConfig({ projectRoot, cwd = process.cwd() } = {}) {
  const root = projectRoot || cwd;
  const fileEnv = loadDotenvIfPresent(root);
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
  resolveConfig,
  validateConfig,
  parseDotenv,
};
