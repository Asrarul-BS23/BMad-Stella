'use strict';

// Playwright MCP servers (browser automation + the Playwright test runner),
// registered once per machine (`-s user`, not per project) through the `claude`
// CLI. Silent: no question, nothing written into the repo — same precedent as
// the Atlassian MCP in mcp-registrar.js. Never removed by uninstall: user scope
// is shared across every project on the machine, not owned by this one.
// `run(command, opts) → { status, stdout, stderr }` is injectable for tests.

const { spawnSync } = require('node:child_process');
const { PLAYWRIGHT_MCP_SERVERS } = require('./constants');

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

/** `claude mcp get <name>` exits 0 when something is already registered under that name. */
function isRegistered(run, cwd, name) {
  try {
    const r = run(`claude mcp get ${name}`, { cwd });
    return Boolean(r && r.status === 0);
  } catch {
    return false;
  }
}

/**
 * @returns {{name:string, status:'registered'|'present'|'no-cli'|'failed', detail:string|null}}
 */
function registerOne(server, run, cwd) {
  const { name, command, args } = server;
  if (!cliPresent(run, cwd)) return { name, status: 'no-cli', detail: 'claude command not found' };
  if (isRegistered(run, cwd, name)) return { name, status: 'present', detail: null };
  const r = run(
    `claude mcp add -s user --transport stdio ${name} -- ${command} ${args.join(' ')}`,
    { cwd },
  );
  if (!r || r.status !== 0) {
    return {
      name,
      status: 'failed',
      detail: firstLine(r && (r.stderr || r.stdout)) || `exit ${r && r.status}`,
    };
  }
  return { name, status: 'registered', detail: null };
}

/**
 * Registers every Playwright MCP server. Never throws — one server failing is
 * reported in its own entry, the others still run.
 * @returns {{name:string, status:string, detail:string|null}[]}
 */
function register(root, { run = defaultRun } = {}) {
  return PLAYWRIGHT_MCP_SERVERS.map((server) => registerOne(server, run, root));
}

module.exports = { register, registerOne, cliPresent, isRegistered };
