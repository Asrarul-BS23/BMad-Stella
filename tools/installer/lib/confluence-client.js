const path = require('node:path');
const fsp = require('node:fs/promises');

// Shared Confluence REST helpers used by the install-time prefetchers
// (domain-knowledge-fetcher, architecture-docs-fetcher).
// All requests use Basic auth built from bmad-docs/.bmad-tokens/.env.
// Never include the token or any value derived from it in thrown messages.

const MAX_PAGES = 200;
const MAX_PAGE_BYTES = 5 * 1024 * 1024;

let turndownSvc = null;
function getTurndown() {
  if (turndownSvc) return turndownSvc;
  const TurndownService = require('turndown');
  turndownSvc = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  turndownSvc.addRule('stripAcMacros', {
    filter: (node) => node.nodeName.startsWith('AC:') || node.nodeName.startsWith('RI:'),
    replacement: () => '',
  });
  return turndownSvc;
}

async function dirHasFiles(dir) {
  try {
    const entries = await fsp.readdir(dir);
    return entries.some((e) => !e.startsWith('.'));
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function parseDotenv(contents) {
  const out = {};
  for (const raw of contents.split(/\r?\n/)) {
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

async function readCreds(installDir) {
  // Tokens live in <project>/bmad-docs/.bmad-tokens/.env (git-ignored via bmad-docs/).
  const envPath = path.join(installDir, 'bmad-docs', '.bmad-tokens', '.env');
  let contents;
  try {
    contents = await fsp.readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const env = parseDotenv(contents);
  if (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN) return null;
  return {
    email: env.JIRA_EMAIL,
    token: env.JIRA_API_TOKEN,
    baseUrl: env.JIRA_BASE_URL || null,
  };
}

/**
 * Validate architectureFolderUrl against creds and return { archUrl, baseUrl, rootPageId, auth }.
 * Returns { error } string on any validation failure (never throws).
 */
function resolveRoot(architectureFolderUrl, creds) {
  let archUrl;
  try {
    archUrl = new URL(architectureFolderUrl);
  } catch {
    return { error: 'architectureFolderUrl is not a valid URL' };
  }

  if (archUrl.protocol !== 'https:') {
    return { error: 'architectureFolderUrl is not HTTPS — refusing to send credentials' };
  }

  if (creds.baseUrl) {
    let credsOrigin;
    try {
      credsOrigin = new URL(creds.baseUrl).origin;
    } catch {
      return { error: 'JIRA_BASE_URL in .env is not a valid URL' };
    }
    if (credsOrigin !== archUrl.origin) {
      return {
        error: `architectureFolderUrl host (${archUrl.origin}) != JIRA_BASE_URL host (${credsOrigin})`,
      };
    }
  }

  const rootPageId = extractPageId(architectureFolderUrl);
  if (!rootPageId) {
    return { error: `could not parse page ID from ${architectureFolderUrl}` };
  }

  return {
    archUrl,
    baseUrl: archUrl.origin,
    rootPageId,
    auth: authHeader(creds.email, creds.token),
  };
}

function extractPageId(url) {
  const match = url.match(/\/pages\/(\d+)/);
  return match ? match[1] : null;
}

function authHeader(email, token) {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

const REQUEST_TIMEOUT_MS = 30_000;

async function getJson(url, auth, what) {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const res = await fetch(url, {
    headers: { Authorization: auth, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Confluence API ${res.status} ${what}`);
  return res.json();
}

/**
 * List direct child pages of parentId. `expand` controls returned fields.
 */
async function listChildren(baseUrl, parentId, auth, expand = '') {
  const expandQs = expand ? `&expand=${encodeURIComponent(expand)}` : '';
  const url = `${baseUrl}/wiki/rest/api/content/${encodeURIComponent(parentId)}/child/page?limit=100${expandQs}`;
  const data = await getJson(url, auth, 'listing children');
  return data.results || [];
}

/**
 * Find a direct child page by title (exact, case-insensitive; fallback starts-with).
 */
async function findChild(baseUrl, parentId, name, auth) {
  const children = await listChildren(baseUrl, parentId, auth);
  return matchByTitle(children, name);
}

function matchByTitle(pages, name) {
  const lower = name.toLowerCase();
  let match = pages.find((p) => p.title.toLowerCase() === lower);
  if (!match) match = pages.find((p) => p.title.toLowerCase().startsWith(lower));
  return match || null;
}

/**
 * List all descendant pages of parentId with body.view + space, paginated, capped at MAX_PAGES.
 */
async function listDescendants(baseUrl, parentId, auth) {
  const out = [];
  let next = `${baseUrl}/wiki/rest/api/content/${encodeURIComponent(parentId)}/descendant/page?limit=50&expand=body.view,space`;
  while (next) {
    if (new URL(next).origin !== baseUrl) {
      throw new Error('Confluence returned cross-origin pagination link');
    }
    const data = await getJson(next, auth, 'listing descendants');
    out.push(...data.results);
    if (out.length >= MAX_PAGES) {
      break;
    }
    next = data._links?.next ? `${baseUrl}${data._links.next}` : null;
  }
  return out.slice(0, MAX_PAGES);
}

function deriveProjectSuffix(architectureFolderUrl) {
  const slug = architectureFolderUrl.split('/').findLast(Boolean) || '';
  return slug.toLowerCase();
}

function slugify(title, projectSuffix) {
  let slug = title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

  const abbrevMap = {
    leadrsc: ['leadrs', 'lc'],
    'risk-monitor': ['rm', 'risk'],
    quarryconnect: ['qc'],
    safv: [],
    dre: [],
  };
  const candidates = [projectSuffix, ...(abbrevMap[projectSuffix] || [])].filter(Boolean);
  for (const s of candidates) {
    const tail = `-${s}`;
    if (slug.endsWith(tail)) {
      slug = slug.slice(0, -tail.length);
      break;
    }
  }
  return slug || 'untitled';
}

function uniqueSlug(base, used) {
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n}`;
    n++;
  }
  used.add(slug);
  return slug;
}

/**
 * Convert a page's HTML body to the markdown file content we persist.
 * Returns null when the body is empty (nothing useful to save — leaving the
 * page out of the manifest lets the agent-side fetch pick it up later) or
 * exceeds MAX_PAGE_BYTES.
 */
function pageToMarkdown(page, baseUrl) {
  const html = page.body?.view?.value || '';
  if (html.length > MAX_PAGE_BYTES) return null;
  const md = getTurndown().turndown(html).trim();
  if (!md) return null;
  const sourceUrl = `${baseUrl}/wiki/spaces/${page.space?.key || ''}/pages/${page.id}`;
  return `> Source: ${sourceUrl}\n\n# ${page.title}\n\n${md}\n`;
}

/**
 * Write content to targetDir/<slug>.md, refusing anything that escapes targetDir.
 * Returns the written file name or null if skipped.
 */
async function writePageFile(targetDir, slug, content) {
  const fileName = `${slug}.md`;
  const filePath = path.join(targetDir, fileName);
  const resolvedTarget = path.resolve(targetDir) + path.sep;
  const resolvedFile = path.resolve(filePath);
  if (!resolvedFile.startsWith(resolvedTarget)) return null;
  await fsp.writeFile(filePath, content, 'utf8');
  return fileName;
}

module.exports = {
  MAX_PAGES,
  MAX_PAGE_BYTES,
  dirHasFiles,
  parseDotenv,
  readCreds,
  resolveRoot,
  extractPageId,
  authHeader,
  listChildren,
  findChild,
  matchByTitle,
  listDescendants,
  deriveProjectSuffix,
  slugify,
  uniqueSlug,
  pageToMarkdown,
  writePageFile,
};
