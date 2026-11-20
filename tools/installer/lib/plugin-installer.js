'use strict';

// The `bmad-stella` plugin step of `install` (decision L3), through the `claude` CLI.
//   isInstalled() — is the plugin on this machine already?
//   ensure()      — not installed: add the marketplace, install the plugin.
//                   installed (`reinstall`): uninstall it, refresh the marketplace,
//                   install it again. An update alone keeps the cached copy while
//                   the plugin's version string is unchanged; a reinstall always
//                   fetches what the marketplace has now.
// One install serves the CLI, the VS Code extension and the Claude Desktop Code
// tab. Never throws: the caller prints a warning and falls back to plain user-level
// copies. `run(command, opts) → {status, stdout, stderr}` is injectable for tests.

const { spawnSync } = require('node:child_process');
const { PLUGIN } = require('./constants');

const ID = `${PLUGIN.name}@${PLUGIN.marketplace}`;

// One command string with shell:true: on Windows `claude` is a .cmd shim.
const defaultRun = (command, opts = {}) =>
  spawnSync(command, { shell: true, encoding: 'utf8', timeout: 180_000, ...opts });

const firstLine = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean) || '';

const ok = (r) => Boolean(r && r.status === 0);
const detailOf = (r) => firstLine(r && (r.stderr || r.stdout)) || `exit ${r && r.status}`;

function attempt(run, command) {
  try {
    return run(command);
  } catch (error) {
    return { status: 1, stdout: '', stderr: error.message };
  }
}

/**
 * @returns {{cli:boolean, installed:boolean}} `cli` false = no `claude` command
 */
function isInstalled({ run = defaultRun } = {}) {
  if (!ok(attempt(run, 'claude --version'))) return { cli: false, installed: false };
  const listed = attempt(run, 'claude plugin list');
  return { cli: true, installed: ok(listed) && String(listed.stdout || '').includes(ID) };
}

/** The marketplace, present and current: `first` is tried, `second` when it fails. */
function marketplace(run, first, second) {
  const commands = {
    add: `claude plugin marketplace add ${PLUGIN.source}`,
    update: `claude plugin marketplace update ${PLUGIN.marketplace}`,
  };
  const a = attempt(run, commands[first]);
  if (ok(a)) return null;
  return ok(attempt(run, commands[second])) ? null : `marketplace: ${detailOf(a)}`;
}

/**
 * @param {object} opts reinstall: the plugin is installed — remove it and install it again
 * @returns {{status:'installed'|'reinstalled'|'no-cli'|'failed', detail:string|null}}
 */
function ensure({ run = defaultRun, reinstall = false } = {}) {
  if (!ok(attempt(run, 'claude --version'))) {
    return { status: 'no-cli', detail: 'claude command not found' };
  }
  if (reinstall) {
    const removed = attempt(run, `claude plugin uninstall ${ID}`);
    if (!ok(removed)) return { status: 'failed', detail: `uninstall: ${detailOf(removed)}` };
  }
  // Already there on a reinstall, so refresh it first; new on a first install, so add it first.
  const problem = reinstall ? marketplace(run, 'update', 'add') : marketplace(run, 'add', 'update');
  if (problem) return { status: 'failed', detail: problem };

  const r = attempt(run, `claude plugin install ${ID}`);
  if (!ok(r)) return { status: 'failed', detail: `plugin: ${detailOf(r)}` };
  return { status: reinstall ? 'reinstalled' : 'installed', detail: null };
}

module.exports = { ensure, isInstalled, ID };
