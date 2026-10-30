'use strict';

// Step 5 — project picker. Lists the child pages of the constant Confluence parent
// page (titles `P-<PROJECT>`), shows them without the prefix plus "Other", and saves
// the pick to _bmad-output/stella/project.json. On a re-run with a saved pick:
// "use X? y/n". `prompt` and `fetch` are injectable for tests.

const fs = require('node:fs');
const path = require('node:path');
const {
  JIRA_BASE_URL,
  CONFLUENCE_PROJECTS_PAGE,
  PROJECT_PAGE_PREFIX,
  OTHER_PROJECT,
  PROJECT_JSON_FILE,
} = require('./constants');

// eslint-disable-next-line n/no-unsupported-features/node-builtins
const defaultFetch = (...args) => globalThis.fetch(...args);
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PAGES = 10; // 100 children per page

const projectJsonPath = (root) => path.join(root, ...PROJECT_JSON_FILE.split('/'));

/** Title `P-LEADRSC` → `LEADRSC`; titles without the prefix → null (ignored). */
function projectNameFromTitle(title) {
  const t = String(title || '').trim();
  if (!t.startsWith(PROJECT_PAGE_PREFIX)) return null;
  const name = t.slice(PROJECT_PAGE_PREFIX.length).trim();
  return name || null;
}

/** Pure: Confluence child-page results → sorted [{name, pageId}]. */
function parseProjects(results) {
  const out = [];
  for (const page of results || []) {
    const name = projectNameFromTitle(page.title);
    if (name) out.push({ name, pageId: String(page.id) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

async function listProjects({ email, token }, { fetch = defaultFetch } = {}) {
  const auth = `Basic ${Buffer.from(`${email}:${token}`, 'utf8').toString('base64')}`;
  const results = [];
  let next = `${JIRA_BASE_URL}/wiki/rest/api/content/${CONFLUENCE_PROJECTS_PAGE.id}/child/page?limit=100`;
  for (let i = 0; next && i < MAX_PAGES; i++) {
    const res = await fetch(next, {
      headers: { Authorization: auth, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Confluence API ${res.status} listing project pages`);
    const data = await res.json();
    results.push(...(data.results || []));
    next = data._links && data._links.next ? `${JIRA_BASE_URL}/wiki${data._links.next}` : null;
  }
  return parseProjects(results);
}

function readProjectJson(root) {
  try {
    const data = JSON.parse(fs.readFileSync(projectJsonPath(root), 'utf8'));
    return data && typeof data.name === 'string' && data.name ? data : null;
  } catch {
    return null;
  }
}

function writeProjectJson(root, project) {
  const file = projectJsonPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = {
    name: project.name,
    pageId: project.pageId || null,
    pageUrl: project.pageId
      ? `${JIRA_BASE_URL}/wiki/pages/viewpage.action?pageId=${project.pageId}`
      : null,
    parentPage: CONFLUENCE_PROJECTS_PAGE.url,
    pickedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  return data;
}

const nameQuestion = {
  type: 'input',
  name: 'name',
  message: 'Project name:',
  validate: (v) => (String(v || '').trim() ? true : 'Required'),
  filter: (v) => String(v || '').trim(),
};

/**
 * Full step. Returns {name, pageId} and writes project.json.
 */
async function run(
  root,
  creds,
  { prompt, fetch = defaultFetch, log = console.log, env = process.env } = {},
) {
  // Non-interactive override (CI): STELLA_PROJECT names the project, nothing is asked.
  if (env.STELLA_PROJECT && env.STELLA_PROJECT.trim()) {
    const name = env.STELLA_PROJECT.trim();
    let pageId = null;
    try {
      const match = (await listProjects(creds, { fetch })).find(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      );
      if (match) pageId = match.pageId;
    } catch {
      // unreachable Confluence: keep the name, no page id
    }
    const picked = { name, pageId };
    writeProjectJson(root, picked);
    return { ...picked, reused: false };
  }

  // The list is shown on every run (user decision: no "use saved project?" question);
  // a previous pick is only the highlighted default.
  const saved = readProjectJson(root);

  let projects = [];
  try {
    projects = await listProjects(creds, { fetch });
  } catch (error) {
    log(`Could not list projects from Confluence (${error.message}). Enter the name by hand.`);
  }

  let picked;
  if (projects.length > 0) {
    const { choice } = await prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Select your project:',
        choices: [...projects.map((p) => p.name), OTHER_PROJECT],
        default: saved && projects.some((p) => p.name === saved.name) ? saved.name : undefined,
        pageSize: 20,
      },
    ]);
    picked = projects.find((p) => p.name === choice) || null;
  }
  if (!picked) {
    const { name } = await prompt([nameQuestion]);
    picked = { name, pageId: null };
  }
  writeProjectJson(root, picked);
  return { ...picked, reused: false };
}

module.exports = {
  run,
  listProjects,
  parseProjects,
  projectNameFromTitle,
  readProjectJson,
  writeProjectJson,
  projectJsonPath,
};
