'use strict';

// project-context-bootstrap — the installer's fire-and-forget start of the worker.
// Checks: context present → nothing; worker not copied → no-worker; claude missing →
// no-claude; otherwise the detached spawn gets the worker script and the root, and the
// result carries the log path the installer prints.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const LIB = path.join(REPO, 'tools', 'installer', 'lib');
const { startIfMissing, WORKER } = require(path.join(LIB, 'project-context-bootstrap.js'));
const C = require(path.join(LIB, 'constants.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-boot-'));
const touch = (root, rel) => {
  const f = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '');
};

ok(C.PROJECT_CONTEXT_DIR === '_bmad-output/stella/project-context', 'constants: context dir');
ok(
  C.PROJECT_CONTEXT_LOG === '_bmad-output/stella/project-context/.state/worker.log',
  'constants: log path',
);
ok(
  WORKER === '_bmad/custom/stella/utils/project-context-worker/index.js',
  'worker path under utils',
);

// present → nothing started
{
  const root = tmp();
  touch(root, `${C.PROJECT_CONTEXT_DIR}/context.md`);
  touch(root, WORKER);
  let spawned = 0;
  const r = startIfMissing(root, { cliPresent: () => true, spawnDetached: () => spawned++ });
  ok(r.status === 'present' && spawned === 0, 'present: nothing started');
}

// worker not copied
{
  const root = tmp();
  let spawned = 0;
  const r = startIfMissing(root, { cliPresent: () => true, spawnDetached: () => spawned++ });
  ok(r.status === 'no-worker' && spawned === 0, 'no worker file → no-worker');
}

// claude missing
{
  const root = tmp();
  touch(root, WORKER);
  let spawned = 0;
  const r = startIfMissing(root, { cliPresent: () => false, spawnDetached: () => spawned++ });
  ok(r.status === 'no-claude' && spawned === 0, 'no claude → no-claude, nothing started');
}

// started
{
  const root = tmp();
  touch(root, WORKER);
  let seen = null;
  const r = startIfMissing(root, {
    cliPresent: () => true,
    spawnDetached: (script, args) => {
      seen = { script, args };
    },
  });
  ok(r.status === 'started' && r.log === C.PROJECT_CONTEXT_LOG, 'started: status and log path');
  ok(
    seen && seen.script === path.join(root, ...WORKER.split('/')) && seen.args[0] === root,
    'started: worker script and root passed to the detached spawn',
  );
}

// installer note wiring
{
  const installer = require(path.join(LIB, 'installer.js'));
  const base = {
    root: 'r',
    gitignoreAdded: [],
    domainDocs: { status: 'skipped', reason: 'Other' },
    mcp: { status: 'registered' },
    removedBmadSkills: [],
    created: [],
  };
  const texts = (pc) => installer.layerNotes({ ...base, projectContext: pc }).map((n) => n.text);
  ok(
    !texts({ status: 'present' }).some((t) => /Project context/.test(t)),
    'note: none when present',
  );
  ok(
    !texts({ status: 'started', log: C.PROJECT_CONTEXT_LOG }).some((t) =>
      /Project context/.test(t),
    ),
    'note: none when started (silent background)',
  );
  ok(
    !texts({ status: 'no-claude' }).some((t) => /Project context/.test(t)) &&
      !texts({ status: 'no-worker' }).some((t) => /Project context/.test(t)),
    'note: silent when claude or the worker is missing',
  );
}

console.log(
  `project-context bootstrap: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
