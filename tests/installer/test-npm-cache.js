'use strict';

// npm-cache.clean(): one non-fatal `npm cache clean --force` per install
// (plan: tea-module/stella-tea-live-testing-v2-implementation-steps.md, 12.3).
// The spawn is injected — no test ever runs the real npm.

const npmCache = require('../../tools/installer/lib/npm-cache');

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

// success: command, shell option, timing, result shape
{
  const calls = [];
  const now = (() => {
    let t = 0;
    return () => (t += 2500);
  })();
  const r = npmCache.clean({
    spawn: (cmd, opts) => {
      calls.push({ cmd, opts });
      return { status: 0 };
    },
    now,
  });
  ok(calls.length === 1, 'clean: spawns exactly once');
  ok(calls[0].cmd === 'npm cache clean --force', 'clean: exact command');
  ok(calls[0].opts.shell === true, 'clean: shell true (npm is npm.cmd on Windows)');
  ok(
    r.status === 'cleaned' && r.detail === null && r.seconds === 3,
    `clean: success result (${JSON.stringify(r)})`,
  );
}

// non-zero exit: failed, detail names the exit code, never throws
{
  const r = npmCache.clean({ spawn: () => ({ status: 7 }) });
  ok(r.status === 'failed' && r.detail === 'exit 7', 'clean: non-zero exit → failed with code');
}

// null status (killed) counts as failure
{
  const r = npmCache.clean({ spawn: () => ({ status: null }) });
  ok(r.status === 'failed' && r.detail === 'exit 1', 'clean: null status → failed');
}

// spawn error (npm missing): failed with the message, never throws
{
  const r = npmCache.clean({ spawn: () => ({ error: new Error('spawn npm ENOENT') }) });
  ok(
    r.status === 'failed' && r.detail === 'spawn npm ENOENT',
    'clean: spawn error → failed with message',
  );
}

console.log(`npm cache: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
