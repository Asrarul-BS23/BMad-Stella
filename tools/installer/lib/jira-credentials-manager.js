'use strict';

// Step 3 + 4 — JIRA credentials. The base URL is a constant (never asked). The
// token file is _bmad-output/stella/.bmad-tokens/.env, read by the jira-attachments
// helper. Flow (user decision): file found → "use as is? y/n"; otherwise ask email
// + API token; verify with one REST call (/myself); write the file.
//
// `prompt` (inquirer-compatible) and `fetch` are injectable for tests.

const fs = require('node:fs');
const path = require('node:path');
const {
  JIRA_BASE_URL,
  TOKEN_ENV_FILE,
  LEGACY_TOKEN_ENV_FILE,
  TOKEN_HELP_URL,
} = require('./constants');

// eslint-disable-next-line n/no-unsupported-features/node-builtins
const defaultFetch = (...args) => globalThis.fetch(...args);
const VERIFY_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

function parseDotenv(contents) {
  const out = {};
  for (const raw of String(contents).split(/\r?\n/)) {
    const line = raw.trim();
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
    if (key) out[key] = value;
  }
  return out;
}

const tokenFilePath = (root) => path.join(root, ...TOKEN_ENV_FILE.split('/'));
const legacyTokenFilePath = (root) => path.join(root, ...LEGACY_TOKEN_ENV_FILE.split('/'));

function readDotenvFile(file) {
  try {
    return parseDotenv(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** @returns {{email:string, token:string}|null} */
function readTokenFile(root) {
  const env = readDotenvFile(tokenFilePath(root));
  if (!env || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) return null;
  return { email: env.JIRA_EMAIL, token: env.JIRA_API_TOKEN };
}

/**
 * The v4 file (bmad-docs/.bmad-tokens/.env). Either value may be missing.
 * @returns {{email:string|null, token:string|null}|null}
 */
function readLegacyTokenFile(root) {
  const env = readDotenvFile(legacyTokenFilePath(root));
  if (!env) return null;
  const email = (env.JIRA_EMAIL || '').trim() || null;
  const token = (env.JIRA_API_TOKEN || '').trim() || null;
  return email || token ? { email, token } : null;
}

function quote(value) {
  const s = String(value ?? '');
  return /[\s#"'=]/.test(s) ? `"${s.replaceAll('"', String.raw`\"`)}"` : s;
}

function writeTokenFile(root, { email, token }) {
  const file = tokenFilePath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = [
    '# BMad-Stella JIRA credentials (written by the installer, git-ignored).',
    `# Create an API token at ${TOKEN_HELP_URL}`,
    `JIRA_BASE_URL=${JIRA_BASE_URL}`,
    `JIRA_EMAIL=${quote(email)}`,
    `JIRA_API_TOKEN=${quote(token)}`,
    '',
  ].join('\n');
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // best effort on Windows
  }
  return file;
}

/**
 * One GET /rest/api/3/myself. Never throws.
 * @returns {Promise<{status:'ok'|'auth'|'network', displayName:string|null, detail:string|null}>}
 */
async function verify({ email, token }, { fetch = defaultFetch } = {}) {
  const flag = String(process.env.BMAD_SKIP_JIRA_VERIFY || '').toLowerCase();
  if (flag === '1' || flag === 'true' || flag === 'yes') {
    return { status: 'ok', displayName: null, detail: 'verification skipped' };
  }
  const auth = `Basic ${Buffer.from(`${email}:${token}`, 'utf8').toString('base64')}`;
  try {
    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/myself`, {
      method: 'GET',
      headers: { Authorization: auth, Accept: 'application/json' },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (res.ok) {
      let displayName = null;
      try {
        const me = await res.json();
        displayName = me.displayName || me.emailAddress || null;
      } catch {
        // body is optional
      }
      return { status: 'ok', displayName, detail: null };
    }
    if (res.status === 401 || res.status === 403) {
      return { status: 'auth', displayName: null, detail: `HTTP ${res.status}` };
    }
    return { status: 'network', displayName: null, detail: `HTTP ${res.status}` };
  } catch (error) {
    return { status: 'network', displayName: null, detail: error.message || String(error) };
  }
}

const emailQuestion = (def) => ({
  type: 'input',
  name: 'email',
  message: 'Atlassian account email:',
  default: def,
  validate: (v) => (/.+@.+\..+/.test(String(v || '').trim()) ? true : 'Enter a valid email'),
  filter: (v) => String(v || '').trim(),
});
const tokenQuestion = () => ({
  type: 'password',
  name: 'token',
  mask: '*',
  message: `Atlassian API token (${TOKEN_HELP_URL}):`,
  validate: (v) =>
    String(v || '').trim().length >= 16
      ? true
      : 'That token looks too short — paste the full token',
  filter: (v) => String(v || '').trim(),
});

/**
 * Full step. Returns the credentials in use and whether the file was (re)written.
 * @returns {Promise<{email:string, token:string, verified:boolean, written:boolean, source:'file'|'env'|'prompt'}>}
 */
async function run(
  root,
  { prompt, fetch = defaultFetch, log = console.log, env = process.env } = {},
) {
  // Non-interactive override (CI): env vars win and nothing is asked.
  if (env.JIRA_EMAIL && env.JIRA_API_TOKEN) {
    const creds = { email: env.JIRA_EMAIL.trim(), token: env.JIRA_API_TOKEN.trim() };
    const v = await verify(creds, { fetch });
    if (v.status === 'auth')
      throw new Error(`JIRA credentials from the environment were rejected (${v.detail}).`);
    writeTokenFile(root, creds);
    return {
      ...creds,
      verified: v.status === 'ok',
      displayName: v.displayName,
      written: true,
      source: 'env',
    };
  }

  const existing = readTokenFile(root);
  if (existing) {
    const { reuse } = await prompt([
      { type: 'confirm', name: 'reuse', message: 'Use them as is?', default: true },
    ]);
    if (reuse) {
      const v = await verify(existing, { fetch });
      if (v.status === 'ok') {
        writeTokenFile(root, existing); // normalises the file (base URL, header)
        return {
          ...existing,
          verified: true,
          displayName: v.displayName,
          written: true,
          source: 'file',
        };
      }
      if (v.status === 'network') {
        log(`Could not reach JIRA to verify (${v.detail}). Keeping the saved credentials.`);
        return { ...existing, verified: false, displayName: null, written: false, source: 'file' };
      }
      log(`Saved credentials no longer work (${v.detail}). Enter new ones.`);
    }
  }

  // Upgrade from v4: bmad-docs/.bmad-tokens/.env carries the same keys. A pair that
  // still verifies is carried over silently; otherwise only the token is asked and
  // the old email is kept. A network error counts as "not verified" here, so nothing
  // unverified is carried over.
  let legacyEmail = null;
  if (!existing) {
    const legacy = readLegacyTokenFile(root);
    if (legacy) {
      legacyEmail = legacy.email;
      if (legacy.email && legacy.token) {
        const pair = { email: legacy.email, token: legacy.token };
        const v = await verify(pair, { fetch });
        if (v.status === 'ok') {
          writeTokenFile(root, pair);
          return {
            ...pair,
            verified: true,
            displayName: v.displayName,
            written: true,
            source: 'legacy',
          };
        }
      }
    }
  }

  let last = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const keepLegacyEmail = Boolean(legacyEmail && !last);
    const answers = await prompt(
      keepLegacyEmail
        ? [tokenQuestion()]
        : [
            emailQuestion(
              (last && last.email) || (existing && existing.email) || legacyEmail || undefined,
            ),
            tokenQuestion(),
          ],
    );
    const creds = { email: keepLegacyEmail ? legacyEmail : answers.email, token: answers.token };
    const v = await verify(creds, { fetch });
    if (v.status === 'ok' || v.status === 'network') {
      if (v.status === 'network')
        log(`Could not reach JIRA to verify (${v.detail}). Saving anyway.`);
      writeTokenFile(root, creds);
      return {
        ...creds,
        verified: v.status === 'ok',
        displayName: v.displayName,
        written: true,
        source: 'prompt',
      };
    }
    last = creds;
    log(`Authentication failed (${v.detail}). Attempt ${attempt}/${MAX_ATTEMPTS}.`);
  }
  throw new Error(`JIRA credentials could not be verified after ${MAX_ATTEMPTS} attempts.`);
}

module.exports = {
  run,
  verify,
  readTokenFile,
  readLegacyTokenFile,
  writeTokenFile,
  tokenFilePath,
  legacyTokenFilePath,
  parseDotenv,
};
