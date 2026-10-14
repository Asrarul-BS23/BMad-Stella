'use strict';

// Step 14 — domain docs. Every descendant page of the project's Confluence page
// (the `P-<PROJECT>` page picked at install, id in project.json) becomes one
// markdown file under _bmad-output/stella/domain-knowledge/. Skipped when the
// folder already has files (refresh = delete the folder and re-run) or when the
// project is "Other" (no page id). `fetch` is injectable for tests.

const fs = require('node:fs');
const path = require('node:path');
const confluence = require('./confluence-client');
const { JIRA_BASE_URL, STELLA_OUTPUT_DIR } = require('./constants');

// eslint-disable-next-line n/no-unsupported-features/node-builtins
const defaultFetch = (...args) => globalThis.fetch(...args);
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PAGES = 200;

const targetDir = (root) => path.join(root, ...STELLA_OUTPUT_DIR.split('/'), 'domain-knowledge');

function dirHasFiles(dir) {
  try {
    return fs.readdirSync(dir).some((e) => !e.startsWith('.'));
  } catch {
    return false;
  }
}

/** `RISK MONITOR` → `risk-monitor`, used to strip the `-<project>` tail from page titles. */
const projectSuffix = (name) =>
  String(name || '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

async function listDescendants(pageId, { email, token }, fetch) {
  const auth = `Basic ${Buffer.from(`${email}:${token}`, 'utf8').toString('base64')}`;
  const out = [];
  let next = `${JIRA_BASE_URL}/wiki/rest/api/content/${encodeURIComponent(pageId)}/descendant/page?limit=50&expand=body.view,space`;
  while (next && out.length < MAX_PAGES) {
    const res = await fetch(next, {
      headers: { Authorization: auth, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Confluence API ${res.status} listing descendants`);
    const data = await res.json();
    out.push(...(data.results || []));
    next = data._links && data._links.next ? `${JIRA_BASE_URL}/wiki${data._links.next}` : null;
  }
  return out.slice(0, MAX_PAGES);
}

/**
 * @returns {Promise<{status:'fetched'|'skipped'|'failed', reason:string|null, files:string[], dir:string}>}
 */
async function fetchDomainDocs(
  root,
  { project, creds, fetch = defaultFetch, log = () => {} } = {},
) {
  const dir = targetDir(root);
  const result = { status: 'skipped', reason: null, files: [], dir };
  if (!project || !project.pageId) {
    result.reason = 'no Confluence page for this project (Other)';
    return result;
  }
  if (dirHasFiles(dir)) {
    result.reason = 'domain-knowledge already has files (delete the folder and re-run to refresh)';
    return result;
  }
  if (!creds || !creds.email || !creds.token) {
    result.reason = 'no JIRA credentials';
    return result;
  }
  try {
    const pages = await listDescendants(project.pageId, creds, fetch);
    fs.mkdirSync(dir, { recursive: true });
    const used = new Set();
    const suffix = projectSuffix(project.name);
    for (const page of pages) {
      const content = confluence.pageToMarkdown(page, JIRA_BASE_URL);
      if (!content) {
        log(`skipped empty page: ${page.title}`);
        continue;
      }
      const slug = confluence.uniqueSlug(confluence.slugify(page.title, suffix), used);
      const written = await confluence.writePageFile(dir, slug, content);
      if (written) result.files.push(written);
    }
    result.status = 'fetched';
    if (result.files.length === 0) result.reason = 'no pages with content under the project page';
    return result;
  } catch (error) {
    result.status = 'failed';
    result.reason = error.message;
    return result;
  }
}

module.exports = { fetchDomainDocs, listDescendants, projectSuffix, targetDir, dirHasFiles };
