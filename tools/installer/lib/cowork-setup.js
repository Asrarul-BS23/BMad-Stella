'use strict';

// Helpers for `/stella-init` on a machine where `bmad-stella install` never ran
// (Cowork, or the plugin added by hand): the skill has no app, no master copy and
// no saved credentials there, and runs this package through npx instead.
// Decisions L8-L10, tea-module/rnd-docs/user-level-install-design.md.
//   credentialsStatus()  are Atlassian credentials saved, and do they still work?
//   saveCredentials()    verify what the user typed in the chat, write the one file
//   credentialsHelp()    what to print when the user would rather save it by hand
//   suggestProject()     the Confluence project the folder most likely belongs to
// The skill runs these through hidden `init` options; none is a step for the user.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jira = require('./jira-credentials-manager');
const picker = require('./project-picker');
const { CREDENTIALS_FILE_LABEL, TOKEN_HELP_URL } = require('./constants');

const MIN_SCORE = 0.75; // below this a name is not offered at all
const MIN_LEAD = 0.05; // the best match must beat the next project by this much
const MIN_PART = 3; // shortest name that may count as "inside" another

/**
 * @returns {Promise<{state:'saved'|'missing'|'rejected', file:string, email:string|null,
 *   verified:boolean, detail:string|null}>}
 */
async function credentialsStatus({ home = os.homedir(), fetch } = {}) {
  const file = jira.credentialsFile(home);
  const found = jira.readCredentialsFile({ home });
  if (!found) return { state: 'missing', file, email: null, verified: false, detail: null };
  const v = await jira.verify(found, { fetch });
  if (v.status === 'auth') {
    return { state: 'rejected', file, email: found.email, verified: false, detail: v.detail };
  }
  // Unreachable JIRA is not a reason to ask again: keep what is saved.
  return {
    state: 'saved',
    file,
    email: found.email,
    verified: v.status === 'ok',
    detail: v.detail,
  };
}

/**
 * Verifies the pair and writes ~/.claude/stella/credentials.env. A rejected pair
 * is not saved; an unreachable JIRA does not block the save.
 * @returns {Promise<{state:'saved'|'rejected'|'invalid', file:string, verified:boolean, detail:string|null}>}
 */
async function saveCredentials({ email, token, home = os.homedir(), fetch } = {}) {
  const file = jira.credentialsFile(home);
  const pair = { email: String(email || '').trim(), token: String(token || '').trim() };
  if (!pair.email || !pair.token) {
    return { state: 'invalid', file, verified: false, detail: 'email and token are both required' };
  }
  const v = await jira.verify(pair, { fetch });
  if (v.status === 'auth') return { state: 'rejected', file, verified: false, detail: v.detail };
  jira.writeCredentialsFile(pair, { home });
  return { state: 'saved', file, verified: v.status === 'ok', detail: v.detail };
}

/** The lines shown when the user skips the question: where the file goes and what is in it. */
function credentialsHelp({ home = os.homedir() } = {}) {
  return [
    `No Atlassian credentials saved. To add them later, create this file (${CREDENTIALS_FILE_LABEL}):`,
    `  ${jira.credentialsFile(home)}`,
    'with these two lines:',
    '  JIRA_EMAIL=you@stellainternational.com',
    '  JIRA_API_TOKEN=<your API token>',
    `Create a token at ${TOKEN_HELP_URL}`,
    'Then run /stella-init again to pick the project from the list and fetch the domain docs.',
  ];
}

const normalise = (text) =>
  String(text || '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, '');

/** Words of a name: split on separators and on camelCase humps, lower-cased. */
const words = (text) =>
  String(text || '')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * How well a name found in the project fits a Confluence project name, 0..1.
 * Same name → 1. A word of the name equals the project → 0.9. One inside the
 * other → 0.6-1 by length share. Otherwise spelling similarity.
 */
function matchScore(candidate, projectName) {
  const a = normalise(candidate);
  const b = normalise(projectName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  let best = 1 - editDistance(a, b) / Math.max(a.length, b.length);
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= MIN_PART && long.includes(short)) {
    best = Math.max(best, 0.6 + (0.4 * short.length) / long.length);
  }
  if (b.length >= MIN_PART && words(candidate).includes(b)) best = Math.max(best, 0.9);
  return best;
}

/** `git@host:org/repo.git` or `https://host/org/repo` → `repo`; null when there is none. */
function remoteRepoName(root) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, '.git', 'config'), 'utf8');
  } catch {
    return null;
  }
  const m = /^\s*url\s*=\s*(\S+)\s*$/m.exec(text);
  if (!m) return null;
  const name = m[1]
    .replace(/[\\/]+$/, '')
    .split(/[/:\\]/)
    .pop()
    .replace(/\.git$/i, '');
  return name || null;
}

/** Names the project gives itself: its folder, its git remote, its solution file(s). */
function candidateNames(root) {
  const names = [path.basename(path.resolve(root)), remoteRepoName(root)];
  try {
    for (const entry of fs.readdirSync(root)) {
      const m = /^(.+)\.slnx?$/i.exec(entry);
      if (m) names.push(m[1]);
    }
  } catch {
    // unreadable folder: the folder name alone
  }
  return [...new Set(names.filter(Boolean))];
}

/**
 * Pure: the one project that clearly fits, or null when none fits or two fit
 * about equally. Never a pick — the caller asks the user to confirm it.
 * @returns {{name:string, from:string, score:number}|null}
 */
function bestMatch(candidates, projectNames) {
  const ranked = projectNames
    .map((name) => {
      let top = { name, from: null, score: 0 };
      for (const from of candidates) {
        const score = matchScore(from, name);
        if (score > top.score) top = { name, from, score };
      }
      return top;
    })
    .sort((x, y) => y.score - x.score);
  const [first, second] = ranked;
  if (!first || first.score < MIN_SCORE) return null;
  if (second && first.score - second.score < MIN_LEAD) return null;
  return first;
}

/**
 * @returns {Promise<{suggestion:string|null, from:string|null, projects:string[],
 *   candidates:string[], reason:string|null}>}
 */
async function suggestProject(root, { home = os.homedir(), fetch } = {}) {
  const candidates = candidateNames(root);
  const none = (reason, projects = []) => ({
    suggestion: null,
    from: null,
    projects,
    candidates,
    reason,
  });
  const creds = jira.readCredentialsFile({ home });
  if (!creds) return none('no saved credentials');
  let projects;
  try {
    projects = (await picker.listProjects(creds, { fetch })).map((p) => p.name);
  } catch (error) {
    return none(`project list not available (${error.message})`);
  }
  const match = bestMatch(candidates, projects);
  if (!match) return none('no clear match', projects);
  return { suggestion: match.name, from: match.from, projects, candidates, reason: null };
}

module.exports = {
  credentialsStatus,
  saveCredentials,
  credentialsHelp,
  suggestProject,
  bestMatch,
  matchScore,
  candidateNames,
  remoteRepoName,
};
