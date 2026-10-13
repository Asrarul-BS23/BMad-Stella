'use strict';

// Friction logger — HOOK 2 (SessionStart): detect + fire.
// Cheap, fast, never blocks session startup: acquires the fire-lock, does a
// quick "is anything possibly fireable?" check, then spawns the detached
// WORKER which runs the expensive analysis and releases the lock.
//
// Self-contained by design: no imports from the memory feature's hook files.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { makeLogger, findBmadRoot } = require('./lib/state');
const { readTracker } = require('./lib/tracker');

const STALE_LOCK_MS = 30 * 60 * 1000; // 30 min — crashed worker recovery

function main(rawStdin) {
  // Recursion guard (shared convention, commit a6831d7): a claude --print
  // subprocess fires SessionStart too — bail out immediately.
  if (process.env.BMAD_HOOK_SUBPROCESS === '1') return;

  let payload = {};
  try {
    payload = JSON.parse(rawStdin || '{}');
  } catch {
    return;
  }
  // Resolve the install root — payload.cwd may have drifted into a subfolder
  // (Bash cwd persists across `cd`). Outside a BMad project: exit, create nothing.
  const cwd = findBmadRoot(payload.cwd || process.cwd());
  if (!cwd) return;
  const log = makeLogger(cwd);

  const logsDir = path.join(cwd, 'bmad-docs', 'bmad-logs');
  const lockFile = path.join(logsDir, '.fire-lock');

  // Quick pre-check: anything in the tracker at all? (avoids lock churn in
  // projects that never used the planner/dev agents)
  const tracker = readTracker(cwd);
  if (Object.keys(tracker.plans).length === 0) return;

  // ---- fire-lock: elect exactly one firer (atomic exclusive create) ----
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(
      lockFile,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      {
        flag: 'wx',
      },
    );
  } catch {
    // lock exists — someone else is firing. Stale-lock recovery:
    try {
      const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      const age = Date.now() - Date.parse(lock.startedAt || 0);
      if (age > STALE_LOCK_MS) {
        log('session-start: stale fire-lock, reclaiming', { ageMs: age });
        fs.unlinkSync(lockFile);
        fs.writeFileSync(
          lockFile,
          JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
          {
            flag: 'wx',
          },
        );
      } else {
        return; // healthy lock — leader handles all pending plans; we skip silently
      }
    } catch {
      return; // unreadable/contended lock — skip; next start retries
    }
  }

  // ---- spawn the detached worker (does gates + analysis + lock release) ----
  try {
    const worker = path.join(__dirname, 'worker.js');
    const child = spawn(process.execPath, [worker, cwd], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref(); // session startup proceeds immediately
    log('session-start: worker spawned', { plans: Object.keys(tracker.plans).length });
  } catch (error) {
    log('session-start: worker spawn failed', { error: error.message });
    try {
      fs.unlinkSync(lockFile); // don't leave a dead lock behind
    } catch {
      /* ignore */
    }
  }
}

let buffer = '';
process.stdin.on('data', (chunk) => (buffer += chunk));
process.stdin.on('end', () => {
  try {
    main(buffer);
  } catch {
    // hooks never throw
  }
});
