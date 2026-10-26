'use strict';

// Only exercises the two side-effect-free skip paths — never lets a real
// `node ... --from-code` spawn happen in a test run (that would shell out to
// the `claude` CLI for real). The spawn path itself is exactly the one
// `daily-job.js` already uses and isn't re-tested here.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LIB = path.join(__dirname, '..', '..', 'tools', 'installer', 'lib');
const { bootstrapIfMissing } = require(path.join(LIB, 'memory-bootstrap.js'));
const { STELLA_HOOKS_DIR, STELLA_OUTPUT_DIR } = require(path.join(LIB, 'constants.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `stella-mem-bootstrap-${name}-`));
const rel = (root, p) => path.join(root, ...p.split('/'));

// ================= already-populated memory: nothing spawned =================
{
  const root = tmp('present');
  const memoryDir = rel(root, `${STELLA_OUTPUT_DIR}/memory`);
  fs.mkdirSync(memoryDir, { recursive: true });
  fs.writeFileSync(path.join(memoryDir, 'domain-map.md'), '# Domain Map\n');
  fs.writeFileSync(path.join(memoryDir, 'patterns.md'), '# Patterns\n');
  // Scripts present too, so a bug here would be caught by an actual spawn attempt.
  const hooksLib = rel(root, `${STELLA_HOOKS_DIR}/memory/lib`);
  fs.mkdirSync(hooksLib, { recursive: true });
  fs.writeFileSync(path.join(hooksLib, 'domain-map-distiller.js'), '');
  fs.writeFileSync(rel(root, `${STELLA_HOOKS_DIR}/memory/pattern-scanner.js`), '');

  const result = bootstrapIfMissing(root);
  ok(
    result.domainMap === false && result.patterns === false,
    'both files already present: neither collector started',
  );
}

// ================= missing memory, but hook scripts not installed: no throw, no spawn =================
{
  const root = tmp('nohooks');
  // No _bmad-output and no .claude/stella/hooks/memory at all.
  const result = bootstrapIfMissing(root);
  ok(
    result.domainMap === false && result.patterns === false,
    'collector scripts absent: skipped cleanly, no throw',
  );
}

console.log(`\nmemory-bootstrap: ${total - fails}/${total} passed`);
process.exit(fails === 0 ? 0 : 1);
