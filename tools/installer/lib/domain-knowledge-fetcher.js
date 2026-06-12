const path = require('node:path');
const fsp = require('node:fs/promises');
const chalk = require('chalk').default || require('chalk');

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

class DomainKnowledgeFetcher {
  // Fetch the Domain-Knowledge subtree from Confluence and persist as markdown.
  // Returns { fetched, skipped, error } — never throws.
  // Construct Error messages without including the auth token or any value
  // derived from it. result.error is printed to the user.
  async fetchAndPersist({
    installDir,
    architectureFolderUrl,
    domainKnowledgePageName = 'Domain-Knowledge',
  }) {
    const result = { fetched: 0, skipped: false, error: null };

    try {
      const targetDir = path.join(installDir, 'bmad-docs', 'domain-knowledge');

      if (await this._dirHasFiles(targetDir)) {
        result.skipped = true;
        return result;
      }

      const creds = await this._readCreds(installDir);
      if (!creds) {
        result.error = 'no Atlassian credentials in .env';
        return result;
      }

      let archUrl;
      try {
        archUrl = new URL(architectureFolderUrl);
      } catch {
        result.error = 'architectureFolderUrl is not a valid URL';
        return result;
      }

      if (archUrl.protocol !== 'https:') {
        result.error = 'architectureFolderUrl is not HTTPS — refusing to send credentials';
        return result;
      }

      if (creds.baseUrl) {
        let credsOrigin;
        try {
          credsOrigin = new URL(creds.baseUrl).origin;
        } catch {
          result.error = 'JIRA_BASE_URL in .env is not a valid URL';
          return result;
        }
        if (credsOrigin !== archUrl.origin) {
          result.error = `architectureFolderUrl host (${archUrl.origin}) != JIRA_BASE_URL host (${credsOrigin})`;
          return result;
        }
      }

      const rootPageId = this._extractPageId(architectureFolderUrl);
      if (!rootPageId) {
        result.error = `could not parse page ID from ${architectureFolderUrl}`;
        return result;
      }

      const baseUrl = archUrl.origin;
      const auth = this._authHeader(creds.email, creds.token);

      const domainPage = await this._findChild(baseUrl, rootPageId, domainKnowledgePageName, auth);
      if (!domainPage) {
        result.error = `no '${domainKnowledgePageName}' child page found under project root`;
        return result;
      }

      const descendants = await this._listDescendants(baseUrl, domainPage.id, auth);
      if (descendants.length === 0) {
        result.error = `'${domainKnowledgePageName}' page has no descendants`;
        return result;
      }

      const projectSuffix = this._deriveProjectSuffix(architectureFolderUrl);
      await fsp.mkdir(targetDir, { recursive: true });
      const td = getTurndown();
      const usedSlugs = new Set();

      for (const page of descendants) {
        const html = page.body?.view?.value || '';
        if (html.length > MAX_PAGE_BYTES) {
          continue;
        }
        const md = td.turndown(html);
        const slug = this._uniqueSlug(this._slugify(page.title, projectSuffix), usedSlugs);
        const filePath = path.join(targetDir, `${slug}.md`);

        const resolvedTarget = path.resolve(targetDir) + path.sep;
        const resolvedFile = path.resolve(filePath);
        if (!resolvedFile.startsWith(resolvedTarget)) {
          continue;
        }

        const sourceUrl = `${baseUrl}/wiki/spaces/${page.space?.key || ''}/pages/${page.id}`;
        const content = `> Source: ${sourceUrl}\n\n# ${page.title}\n\n${md}\n`;
        await fsp.writeFile(filePath, content, 'utf8');
        result.fetched++;
      }

      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }

  showSummary(result) {
    if (result.skipped) return;
    if (result.error) {
      console.log(chalk.yellow(`⚠ Domain knowledge prefetch skipped: ${result.error}`));
      console.log(chalk.dim('   Sage will fetch on first activation.'));
      return;
    }
    if (result.fetched > 0) {
      console.log(chalk.green(`✓ Fetched ${result.fetched} domain knowledge page(s)`));
    }
  }

  async _dirHasFiles(dir) {
    try {
      const entries = await fsp.readdir(dir);
      return entries.some((e) => !e.startsWith('.'));
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async _readCreds(installDir) {
    // Tokens live in <project>/bmad-docs/.bmad-tokens/.env (git-ignored via bmad-docs/).
    const envPath = path.join(installDir, 'bmad-docs', '.bmad-tokens', '.env');
    let contents;
    try {
      contents = await fsp.readFile(envPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    const env = this._parseDotenv(contents);
    if (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN) return null;
    return {
      email: env.JIRA_EMAIL,
      token: env.JIRA_API_TOKEN,
      baseUrl: env.JIRA_BASE_URL || null,
    };
  }

  _parseDotenv(contents) {
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

  _extractPageId(url) {
    const match = url.match(/\/pages\/(\d+)/);
    return match ? match[1] : null;
  }

  _authHeader(email, token) {
    return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
  }

  async _findChild(baseUrl, parentId, name, auth) {
    const url = `${baseUrl}/wiki/rest/api/content/${encodeURIComponent(parentId)}/child/page?limit=100`;
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const res = await fetch(url, {
      headers: { Authorization: auth, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Confluence API ${res.status} listing children`);
    const data = await res.json();
    const lower = name.toLowerCase();
    let match = data.results.find((p) => p.title.toLowerCase() === lower);
    if (!match) match = data.results.find((p) => p.title.toLowerCase().startsWith(lower));
    return match || null;
  }

  async _listDescendants(baseUrl, parentId, auth) {
    const out = [];
    let next = `${baseUrl}/wiki/rest/api/content/${encodeURIComponent(parentId)}/descendant/page?limit=50&expand=body.view,space`;
    while (next) {
      if (new URL(next).origin !== baseUrl) {
        throw new Error('Confluence returned cross-origin pagination link');
      }
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const res = await fetch(next, {
        headers: { Authorization: auth, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Confluence API ${res.status} listing descendants`);
      const data = await res.json();
      out.push(...data.results);
      if (out.length >= MAX_PAGES) {
        break;
      }
      next = data._links?.next ? `${baseUrl}${data._links.next}` : null;
    }
    return out.slice(0, MAX_PAGES);
  }

  _deriveProjectSuffix(architectureFolderUrl) {
    const slug = architectureFolderUrl.split('/').findLast(Boolean) || '';
    return slug.toLowerCase();
  }

  _slugify(title, projectSuffix) {
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

  _uniqueSlug(base, used) {
    let slug = base;
    let n = 2;
    while (used.has(slug)) {
      slug = `${base}-${n}`;
      n++;
    }
    used.add(slug);
    return slug;
  }
}

module.exports = new DomainKnowledgeFetcher();
