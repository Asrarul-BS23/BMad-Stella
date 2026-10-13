'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');

// Publishes a friction report to the project's pre-created "BMAD Friction Logs"
// Confluence page (config.confluence.logsPageUrl, set by the installer).
// Zero-dep (node:https only), same discipline as the jira-attachments helper.
//
// One page per plan, upserted by title — regeneration and multi-machine
// publishing update the same page, never duplicate it.
//
// Auth: reuses the Atlassian credentials the installer already persists for the
// jira-attachments helper (bmad-docs/.bmad-tokens/.env — JIRA_EMAIL +
// JIRA_API_TOKEN; the same API token authorizes Confluence REST on the site).
// Never throws — returns { ok, reason, pageId }.

const REQUEST_TIMEOUT_MS = 15_000;

function parseDotenv(contents) {
  const result = {};
  for (const rawLine of contents.split(/\r?\n/)) {
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
    if (key) result[key] = value;
  }
  return result;
}

function resolveCredentials(cwd) {
  let fileEnv = {};
  try {
    fileEnv = parseDotenv(
      fs.readFileSync(path.join(cwd, 'bmad-docs', '.bmad-tokens', '.env'), 'utf8'),
    );
  } catch {
    // missing file is fine — process env may still carry the values
  }
  const email = process.env.JIRA_EMAIL || fileEnv.JIRA_EMAIL || '';
  const token = process.env.JIRA_API_TOKEN || fileEnv.JIRA_API_TOKEN || '';
  if (!email || !token) return null;
  return { email, token };
}

// Page ID from a Confluence Cloud URL: .../wiki/spaces/KEY/pages/123456/Title
function extractPageId(pageUrl) {
  const m = String(pageUrl || '').match(/\/pages\/(\d+)(\/|$)/);
  return m ? m[1] : null;
}

// Minimal JSON request helper. https only, except localhost (test stubs) —
// Basic auth must never travel over plaintext to a real host.
function request(method, urlString, creds, body) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(urlString);
    } catch {
      resolve({ status: 0, json: null, error: 'invalid URL' });
      return;
    }
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
      resolve({ status: 0, json: null, error: 'refusing non-HTTPS URL' });
      return;
    }
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body === undefined ? null : JSON.stringify(body);
    const auth = Buffer.from(`${creds.email}:${creds.token}`, 'utf8').toString('base64');

    const req = lib.request(
      url,
      {
        method,
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          'User-Agent': 'bmad-stella-friction-logger/1.0',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let out = '';
        res.on('data', (chunk) => (out += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(out);
          } catch {
            // non-JSON body (e.g. empty 204) is fine
          }
          resolve({ status: res.statusCode, json, error: null });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (error) => resolve({ status: 0, json: null, error: error.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderCounts(obj) {
  if (!obj || Object.keys(obj).length === 0) return '—';
  return Object.entries(obj)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ');
}

// friction JSON -> Confluence storage format (XHTML). Mirrors render.js layout.
function renderStorageFormat(friction) {
  const st = friction.stats || {};
  const sessions = (friction.sessions_analyzed || [])
    .map((s) => `${String(s.sessionId).slice(0, 8)} (${(s.agents || []).join(', ')})`)
    .join(', ');

  const parts = [
    `<p><em>Generated: ${escapeHtml((friction.generated_at || '').slice(0, 10))} · generation ${escapeHtml(friction.generation)} · sessions: ${escapeHtml(sessions)}</em></p>`,
    '<h2>Summary</h2>',
    `<p>${escapeHtml(friction.summary || '(none)')}</p>`,
    '<h2>Stats</h2>',
    '<table><tbody>',
    `<tr><th>Total</th><td>${escapeHtml(st.total ?? 0)}</td></tr>`,
    `<tr><th>By failure mode</th><td>${escapeHtml(renderCounts(st.by_failure_mode))}</td></tr>`,
    `<tr><th>By attribution</th><td>${escapeHtml(renderCounts(st.by_attribution))}</td></tr>`,
    `<tr><th>By detection</th><td>${escapeHtml(renderCounts(st.by_detection))}</td></tr>`,
    '</tbody></table>',
    '<h2>Entries</h2>',
  ];

  const entries = friction.entries || [];
  if (entries.length === 0) {
    parts.push('<p><em>No friction found — sessions ran smoothly.</em></p>');
  }
  for (const e of entries) {
    parts.push(
      `<h3>${escapeHtml(`${e.id} · ${e.failure_mode} · ${e.attribution} · ${e.detection}`)}</h3>`,
      '<ul>',
      `<li><strong>agent:</strong> ${escapeHtml(e.agent)}</li>`,
      `<li><strong>task:</strong> ${escapeHtml(e.ref && e.ref.task ? e.ref.task : '—')}</li>`,
      `<li><strong>trigger:</strong> ${escapeHtml(e.trigger)}</li>`,
      `<li><strong>attempting:</strong> ${escapeHtml(e.attempting)}</li>`,
      `<li><strong>resolution:</strong> ${escapeHtml(e.resolution)} · <strong>outcome:</strong> ${escapeHtml(e.outcome)} · <strong>confidence:</strong> ${escapeHtml(e.confidence)}</li>`,
      ...(e.human_input
        ? [`<li><strong>human input:</strong> ${escapeHtml(e.human_input)}</li>`]
        : []),
      '</ul>',
      ...(e.evidence && e.evidence.quote
        ? [
            `<blockquote><p>evidence: "${escapeHtml(e.evidence.quote)}" — ${escapeHtml(e.evidence.speaker)}, session ${escapeHtml(e.evidence.session)}</p></blockquote>`,
          ]
        : []),
    );
  }
  return parts.join('\n');
}

// Find a child page of parentId with the exact title. Paginates defensively.
async function findChildByTitle(apiBase, creds, parentId, title) {
  for (let start = 0; start < 1000; start += 100) {
    const res = await request(
      'GET',
      `${apiBase}/rest/api/content/${parentId}/child/page?limit=100&start=${start}&expand=version`,
      creds,
    );
    if (res.status !== 200 || !res.json) return { error: res.error || `HTTP ${res.status}` };
    const results = res.json.results || [];
    const hit = results.find((p) => p.title === title);
    if (hit) return { page: hit };
    if (results.length < 100) return { page: null };
  }
  return { page: null };
}

// Upsert the plan page. Returns { ok, reason, pageId }. Never throws.
async function publishReport(cwd, confluenceConfig, friction, log) {
  const logsPageUrl = confluenceConfig.logsPageUrl;
  const creds = resolveCredentials(cwd);
  if (!creds) {
    log('publish: no Atlassian credentials (bmad-docs/.bmad-tokens/.env) — skipping');
    return { ok: false, reason: 'no-credentials' };
  }

  const parentId = extractPageId(logsPageUrl);
  if (!parentId) {
    log('publish: cannot parse page ID from logsPageUrl', { logsPageUrl });
    return { ok: false, reason: 'bad-logs-url' };
  }
  let origin;
  try {
    origin = new URL(logsPageUrl).origin;
  } catch {
    return { ok: false, reason: 'bad-logs-url' };
  }
  const apiBase = `${origin}/wiki`;

  // Parent page must exist (pre-created by the team); we also need its space key.
  const parent = await request(
    'GET',
    `${apiBase}/rest/api/content/${parentId}?expand=space`,
    creds,
  );
  if (parent.status === 404) {
    log('publish: logs page not found — fix logging.confluence.logsPageUrl in core-config.yaml');
    return { ok: false, reason: 'logs-page-missing' };
  }
  if (parent.status !== 200 || !parent.json) {
    log('publish: cannot reach Confluence', { status: parent.status, error: parent.error });
    return { ok: false, reason: 'unreachable' };
  }
  const spaceKey = parent.json.space && parent.json.space.key;

  const title = `${friction.plan_id} — ${friction.plan_title || 'Friction Report'}`.slice(0, 255);
  const storage = renderStorageFormat(friction);
  const bodyBlock = { storage: { value: storage, representation: 'storage' } };

  const found = await findChildByTitle(apiBase, creds, parentId, title);
  if (found.error) {
    log('publish: child lookup failed', { error: found.error });
    return { ok: false, reason: 'unreachable' };
  }

  if (!found.page) {
    const created = await request('POST', `${apiBase}/rest/api/content`, creds, {
      type: 'page',
      title,
      space: { key: spaceKey },
      ancestors: [{ id: parentId }],
      body: bodyBlock,
    });
    if (created.status === 200 && created.json) {
      log('publish: page created', { pageId: created.json.id, title });
      return { ok: true, pageId: created.json.id };
    }
    log('publish: create failed', { status: created.status, error: created.error });
    return { ok: false, reason: `create-failed-${created.status}` };
  }

  // Update path — version bump; one retry on a 409 version conflict.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let version = found.page.version && found.page.version.number;
    if (attempt === 2 || typeof version !== 'number') {
      const fresh = await request(
        'GET',
        `${apiBase}/rest/api/content/${found.page.id}?expand=version`,
        creds,
      );
      if (fresh.status !== 200 || !fresh.json) {
        return { ok: false, reason: 'unreachable' };
      }
      version = fresh.json.version.number;
    }
    const updated = await request('PUT', `${apiBase}/rest/api/content/${found.page.id}`, creds, {
      id: found.page.id,
      type: 'page',
      title,
      version: { number: version + 1 },
      body: bodyBlock,
    });
    if (updated.status === 200) {
      log('publish: page updated', { pageId: found.page.id, version: version + 1 });
      return { ok: true, pageId: found.page.id };
    }
    if (updated.status !== 409) {
      log('publish: update failed', { status: updated.status, error: updated.error });
      return { ok: false, reason: `update-failed-${updated.status}` };
    }
    log('publish: version conflict, retrying once');
  }
  return { ok: false, reason: 'version-conflict' };
}

module.exports = { publishReport, extractPageId, renderStorageFormat };
