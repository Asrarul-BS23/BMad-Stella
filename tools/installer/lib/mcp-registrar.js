'use strict';

// Atlassian MCP — the official remote server, registered for this project in
// Claude Code's local scope (~/.claude.json, keyed by the project path) through
// the `claude` CLI. Silent: no question, nothing written into the repo. The one
// browser login happens later inside Claude Code (/mcp → atlassian), as in v4.
// `run(command, opts) → { status, stdout, stderr }` is injectable for tests.

const { spawnSync } = require('node:child_process');
const { ATLASSIAN_MCP, STALE_ATLASSIAN_MCP_URLS } = require('./constants');

// One command string with shell:true on purpose: on Windows `claude` is a .cmd
// shim that spawnSync cannot start directly, and a string avoids DEP0190.
const defaultRun = (command, opts = {}) =>
  spawnSync(command, { shell: true, encoding: 'utf8', timeout: 60_000, ...opts });

const firstLine = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean) || '';

function cliPresent(run, cwd) {
  try {
    const r = run('claude --version', { cwd });
    return Boolean(r && r.status === 0);
  } catch {
    return false;
  }
}

/** `claude mcp get atlassian` → { url } or null when not registered. */
function getServer(run, cwd) {
  try {
    const r = run(`claude mcp get ${ATLASSIAN_MCP.name}`, { cwd });
    if (!r || r.status !== 0) return null;
    const m = /https?:\/\/\S+/.exec(String(r.stdout || ''));
    return { url: m ? m[0].replace(/[),.]+$/, '') : null };
  } catch {
    return null;
  }
}

/**
 * @returns {{status:'registered'|'replaced'|'present'|'no-cli'|'failed', url:string, detail:string|null}}
 */
function register(root, { run = defaultRun } = {}) {
  const { name, transport, url } = ATLASSIAN_MCP;
  if (!cliPresent(run, root)) {
    return { status: 'no-cli', url, detail: 'claude command not found' };
  }
  const existing = getServer(run, root);
  if (existing && existing.url === url) return { status: 'present', url, detail: null };
  if (existing) {
    // Retired SSE endpoint from an old install, or anything else under our name.
    const stale = STALE_ATLASSIAN_MCP_URLS.includes(existing.url)
      ? 'retired endpoint'
      : 'other url';
    const rm = run(`claude mcp remove ${name}`, { cwd: root });
    if (!rm || rm.status !== 0) {
      return {
        status: 'failed',
        url,
        detail: `could not replace the existing entry (${stale}): ${firstLine(rm && (rm.stderr || rm.stdout)) || 'exit ' + (rm && rm.status)}`,
      };
    }
  }
  const r = run(`claude mcp add --transport ${transport} --scope local ${name} ${url}`, {
    cwd: root,
  });
  if (!r || r.status !== 0) {
    return {
      status: 'failed',
      url,
      detail: firstLine(r && (r.stderr || r.stdout)) || `exit ${r && r.status}`,
    };
  }
  return { status: existing ? 'replaced' : 'registered', url, detail: null };
}

/**
 * @returns {{status:'removed'|'absent'|'no-cli'|'failed', detail:string|null}}
 */
function unregister(root, { run = defaultRun } = {}) {
  if (!cliPresent(run, root)) return { status: 'no-cli', detail: 'claude command not found' };
  if (!getServer(run, root)) return { status: 'absent', detail: null };
  const r = run(`claude mcp remove ${ATLASSIAN_MCP.name}`, { cwd: root });
  if (!r || r.status !== 0) {
    return {
      status: 'failed',
      detail: firstLine(r && (r.stderr || r.stdout)) || `exit ${r && r.status}`,
    };
  }
  return { status: 'removed', detail: null };
}

module.exports = { register, unregister, getServer, cliPresent, ATLASSIAN_MCP };
