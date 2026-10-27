'use strict';

// Starts the project-context worker in the background right after the Stella layer is
// in place, when this machine has no context.md for the project yet. Detached and
// fire-and-forget: the installer prints one note with the log path and returns.
// Nothing is started when the context exists, when the `claude` command is not on
// PATH, or when the worker was not copied.

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { STELLA_CUSTOM_DIR, PROJECT_CONTEXT_DIR, PROJECT_CONTEXT_LOG } = require('./constants');

const rel = (root, p) => path.join(root, ...p.split('/'));
const WORKER = `${STELLA_CUSTOM_DIR}/utils/project-context-worker/index.js`;

function defaultCliPresent() {
  try {
    const r = spawnSync('claude --version', { shell: true, windowsHide: true, encoding: 'utf8' });
    return r.status === 0;
  } catch {
    return false;
  }
}

function defaultSpawnDetached(scriptPath, args) {
  const proc = spawn(process.execPath, [scriptPath, ...args], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  proc.unref();
}

/**
 * @returns {{status:'present'|'started'|'no-claude'|'no-worker', log?: string}}
 */
function startIfMissing(
  root,
  { cliPresent = defaultCliPresent, spawnDetached = defaultSpawnDetached } = {},
) {
  if (fs.existsSync(rel(root, `${PROJECT_CONTEXT_DIR}/context.md`))) return { status: 'present' };
  const worker = rel(root, WORKER);
  if (!fs.existsSync(worker)) return { status: 'no-worker' };
  if (!cliPresent()) return { status: 'no-claude' };
  spawnDetached(worker, [root]);
  return { status: 'started', log: PROJECT_CONTEXT_LOG };
}

module.exports = { startIfMissing, WORKER };
