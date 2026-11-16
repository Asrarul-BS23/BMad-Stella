'use strict';

// One `npm cache clean --force` per install, run right before the BMad step —
// the BMad install and the TEA `npx skills add` both fetch through npx/npm, so
// one clean up front keeps either from resolving a stale cached package. The
// Stella layer copies local files and needs no clean. Never fatal: a failed
// clean is a one-line warning, not an aborted install.

const { spawnSync } = require('node:child_process');

/**
 * @param {object} opts `spawn` and `now` are injectable for tests
 * @returns {{status:'cleaned'|'failed', seconds:number, detail:string|null}}
 */
function clean({ spawn = spawnSync, now = Date.now } = {}) {
  const started = now();
  const r = spawn('npm cache clean --force', {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  const seconds = Math.max(1, Math.round((now() - started) / 1000));
  if (r.error) return { status: 'failed', seconds, detail: r.error.message };
  const status = r.status ?? 1;
  return status === 0
    ? { status: 'cleaned', seconds, detail: null }
    : { status: 'failed', seconds, detail: `exit ${status}` };
}

module.exports = { clean };
