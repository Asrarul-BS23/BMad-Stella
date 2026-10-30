'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LIB = path.join(__dirname, '..', '..', 'tools', 'installer', 'lib');
const { migrateLegacy } = require(path.join(LIB, 'legacy-memory-migrator.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `stella-legacy-mem-${name}-`));
const read = (root, rel) => fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');
const exists = (root, rel) => fs.existsSync(path.join(root, ...rel.split('/')));

// ================= nothing to migrate =================
{
  const root = tmp('empty');
  const result = migrateLegacy(root);
  ok(
    result.memoryMigrated === false && result.plansMigrated === 0,
    'no bmad-docs: nothing migrated, no throw',
  );
  ok(!exists(root, '_bmad-output/stella/memory'), 'no bmad-docs: destination not created');
}

// ================= memory carried over verbatim, nested dirs included =================
{
  const root = tmp('memory');
  fs.mkdirSync(path.join(root, 'bmad-docs', 'memory', 'episodes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bmad-docs', 'memory', '.state'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'bmad-docs', 'memory', 'episodes', 'billing.md'),
    '---\ntype: episodic\narea: "billing"\n---\n',
  );
  fs.writeFileSync(
    path.join(root, 'bmad-docs', 'memory', '.state', '.daily-state.json'),
    '{"last_daily_run":"2026-01-01"}',
  );
  fs.writeFileSync(path.join(root, 'bmad-docs', 'memory', 'domain-map.md'), '# Domain Map\n');

  const result = migrateLegacy(root);
  ok(result.memoryMigrated === true, 'memory: reported migrated');
  ok(
    read(root, '_bmad-output/stella/memory/episodes/billing.md').includes('type: episodic'),
    'memory: nested episode file content preserved verbatim',
  );
  ok(
    read(root, '_bmad-output/stella/memory/.state/.daily-state.json').includes('2026-01-01'),
    'memory: .state carried over so last-run timestamps are not lost',
  );
  ok(
    read(root, '_bmad-output/stella/memory/domain-map.md') === '# Domain Map\n',
    'memory: top-level file carried over',
  );
  ok(
    exists(root, 'bmad-docs/memory/episodes/billing.md'),
    'memory: source left untouched (cleaner.clean() deletes it separately, later)',
  );
}

// ================= old plan files archived, non-.md ignored =================
{
  const root = tmp('plans');
  fs.mkdirSync(path.join(root, 'bmad-docs', 'impl-plan'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'bmad-docs', 'impl-plan', 'AIL-1-old-plan.md'),
    '## Status\nDone\n',
  );
  fs.writeFileSync(
    path.join(root, 'bmad-docs', 'impl-plan', 'AIL-2-old-plan.md'),
    '## Status\nIn Progress\n',
  );
  fs.writeFileSync(path.join(root, 'bmad-docs', 'impl-plan', '.gitkeep'), '');

  const result = migrateLegacy(root);
  ok(
    result.plansMigrated === 2,
    `plans: both .md plans migrated, .gitkeep ignored (got ${result.plansMigrated})`,
  );
  ok(
    read(root, '_bmad-output/implementation-artifacts/legacy-plans/AIL-1-old-plan.md') ===
      '## Status\nDone\n',
    'plans: content preserved verbatim, no reformatting',
  );
  ok(
    !exists(root, '_bmad-output/implementation-artifacts/legacy-plans/.gitkeep'),
    'plans: non-.md files not carried over',
  );
}

console.log(`\nlegacy-memory-migrator: ${total - fails}/${total} passed`);
process.exit(fails === 0 ? 0 : 1);
