'use strict';

// Kicks off domain-map.md/patterns.md collection right after install if they
// don't exist yet (e.g. a legacy migration didn't carry them over, or this is
// a true fresh install), instead of waiting for daily-job.js's first weekly
// run. Must run after the Stella layer (copyHooks + ensureOutputFolders) so
// both the collector scripts and the memory folder exist.
//
// Detached and fire-and-forget, same shape as daily-job.js's own background
// LLM calls (lib/llm.js spawns `claude` with BMAD_HOOK_SUBPROCESS=1 set, which
// is also what the notification hook checks to skip sending one for a
// background job nobody is present to see) — no extra notification handling
// needed here.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { STELLA_HOOKS_DIR, STELLA_OUTPUT_DIR } = require('./constants');

const rel = (root, p) => path.join(root, ...p.split('/'));

function spawnDetached(scriptPath, args) {
  const proc = spawn(process.execPath, [scriptPath, ...args], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  proc.unref();
}

/**
 * @returns {{domainMap: boolean, patterns: boolean}} which collectors were started
 */
function bootstrapIfMissing(root) {
  const started = { domainMap: false, patterns: false };
  const memoryDir = rel(root, `${STELLA_OUTPUT_DIR}/memory`);
  const memoryHooksDir = rel(root, `${STELLA_HOOKS_DIR}/memory`);

  if (!fs.existsSync(path.join(memoryDir, 'domain-map.md'))) {
    const script = path.join(memoryHooksDir, 'lib', 'domain-map-distiller.js');
    if (fs.existsSync(script)) {
      spawnDetached(script, [root, '--from-code']);
      started.domainMap = true;
    }
  }

  if (!fs.existsSync(path.join(memoryDir, 'patterns.md'))) {
    const script = path.join(memoryHooksDir, 'pattern-scanner.js');
    if (fs.existsSync(script)) {
      spawnDetached(script, [root]);
      started.patterns = true;
    }
  }

  return started;
}

module.exports = { bootstrapIfMissing };
