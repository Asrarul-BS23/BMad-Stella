'use strict';

// Step 2 — JIRA credentials. One file per machine: ~/.claude/stella/credentials.env,
// read by the Jira helpers and the friction logger. The base URL is a constant
// (never asked). Flow (user decision 2026-10-26): find credentials in the home
// file, else the old project file, else the v4 file; verify silently with one
// REST call (/myself). Valid → nothing asked, home file written, old project folder
// removed. Rejected or nothing found → ask email + token. Unreachable → keep, warn.
//
// `prompt` (inquirer-compatible), `fetch` and `home` are injectable for tests.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  JIRA_BASE_URL,
  CREDENTIALS_FILE_PARTS,
  CREDENTIALS_FILE_LABEL,
  PROJECT_TOKEN_DIR,
  PROJECT_TOKEN_ENV_FILE,
  LEGACY_TOKEN_ENV_FILE,
  TOKEN_HELP_URL,
} = require('./constants');

// eslint-disable-next-line n/no-unsupported-features/node-builtins
const defaultFetch = (...args) => globalThis.fetch(...args);
const VERIFY_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const EXPIRY_TIP = "Set the token's expiry to 1 year, the longest Atlassian allows.";

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

const credentialsFile = (home = os.homedir()) => path.join(home, ...CREDENTIALS_FILE_PARTS);
const projectTokenDir = (root) => path.join(root, ...PROJECT_TOKEN_DIR.split('/'));
const projectTokenFilePath = (root) => path.join(root, ...PROJECT_TOKEN_ENV_FILE.split('/'));
const legacyTokenFilePath = (root) => path.join(root, ...LEGACY_TOKEN_ENV_FILE.split('/'));

function readDotenvFile(file) {
  try {
    return parseDotenv(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** A complete pair from one file, or null. */
function readPair(file) {
  const env = readDotenvFile(file);
  if (!env || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) return null;
  return { email: env.JIRA_EMAIL.trim(), token: env.JIRA_API_TOKEN.trim() };
}

/** @returns {{email:string, token:string}|null} the home file */
function readCredentialsFile({ home } = {}) {
  return readPair(credentialsFile(home));
}

/** @returns {{email:string, token:string}|null} the pre-2026-10-26 project file */
function readProjectTokenFile(root) {
  return readPair(projectTokenFilePath(root));
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

/**
 * First credentials found, in order: home file, project file, v4 file.
 * @returns {{email:string|null, token:string|null, source:'home'|'project'|'legacy'}|null}
 */
function findCredentials(root, { home } = {}) {
  const fromHome = readCredentialsFile({ home });
  if (fromHome) return { ...fromHome, source: 'home' };
  const fromProject = readProjectTokenFile(root);
  if (fromProject) return { ...fromProject, source: 'project' };
  const legacy = readLegacyTokenFile(root);
  if (legacy) return { ...legacy, source: 'legacy' };
  return null;
}

function quote(value) {
  const s = String(value ?? '');
  return /[\s#"'=]/.test(s) ? `"${s.replaceAll('"', String.raw`\"`)}"` : s;
}

function writeCredentialsFile({ email, token }, { home } = {}) {
  const file = credentialsFile(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = [
    '# BMad-Stella Atlassian credentials (written by the installer). One file per machine.',
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

/** Removes the old project token folder. Returns true when something was removed. */
function removeProjectTokenDir(root) {
  const dir = projectTokenDir(root);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
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

/** Writes the home file and drops the old project folder. */
function settle(root, creds, { home }) {
  writeCredentialsFile(creds, { home });
  const removed = removeProjectTokenDir(root);
  return { written: true, removedProjectFile: removed };
}

/**
 * Full step. Returns the credentials in use, where they came from and whether the
 * home file was written.
 * @returns {Promise<{email:string, token:string, verified:boolean, displayName:string|null,
 *   written:boolean, removedProjectFile:boolean, source:'home'|'project'|'legacy'|'env'|'prompt'}>}
 */
async function run(
  root,
  { prompt, fetch = defaultFetch, log = console.log, env = process.env, home } = {},
) {
  // Non-interactive override (CI): env vars win and nothing is asked.
  if (env.JIRA_EMAIL && env.JIRA_API_TOKEN) {
    const creds = { email: env.JIRA_EMAIL.trim(), token: env.JIRA_API_TOKEN.trim() };
    const v = await verify(creds, { fetch });
    if (v.status === 'auth')
      throw new Error(`JIRA credentials from the environment were rejected (${v.detail}).`);
    return {
      ...creds,
      verified: v.status === 'ok',
      displayName: v.displayName,
      ...settle(root, creds, { home }),
      source: 'env',
    };
  }

  // Silent check of whatever is already on this machine or in this project.
  const found = findCredentials(root, { home });
  let presetEmail = null;
  if (found) {
    presetEmail = found.email;
    if (found.email && found.token) {
      const pair = { email: found.email, token: found.token };
      const v = await verify(pair, { fetch });
      if (v.status === 'ok') {
        return {
          ...pair,
          verified: true,
          displayName: v.displayName,
          ...settle(root, pair, { home }),
          source: found.source,
        };
      }
      if (v.status === 'network') {
        log(`Could not reach JIRA to verify (${v.detail}). Keeping the saved credentials.`);
        const written =
          found.source === 'home' ? false : Boolean(writeCredentialsFile(pair, { home }));
        return {
          ...pair,
          verified: false,
          displayName: null,
          written,
          removedProjectFile: false,
          source: found.source,
        };
      }
      log(`Saved credentials no longer work (${v.detail}). Enter new ones.`);
    }
  }

  log(EXPIRY_TIP);
  let last = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const answers = await prompt([
      emailQuestion((last && last.email) || presetEmail || undefined),
      tokenQuestion(),
    ]);
    const creds = { email: answers.email, token: answers.token };
    const v = await verify(creds, { fetch });
    if (v.status === 'ok' || v.status === 'network') {
      if (v.status === 'network')
        log(`Could not reach JIRA to verify (${v.detail}). Saving anyway.`);
      return {
        ...creds,
        verified: v.status === 'ok',
        displayName: v.displayName,
        ...settle(root, creds, { home }),
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
  findCredentials,
  readCredentialsFile,
  readProjectTokenFile,
  readLegacyTokenFile,
  writeCredentialsFile,
  removeProjectTokenDir,
  credentialsFile,
  projectTokenDir,
  projectTokenFilePath,
  legacyTokenFilePath,
  parseDotenv,
  CREDENTIALS_FILE_LABEL,
  EXPIRY_TIP,
};
