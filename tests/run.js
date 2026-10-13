'use strict';

// Test entry point for the v6 migration. Suites are added per task:
//   Task 3  tests/friction-logger
//   Task 4  tests/pr-review-guard
//   Task 5  tests/utils
// tests/legacy-scratch holds the v4-era suites verbatim until those tasks land.

const { readdirSync, statSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const suites = readdirSync(root)
  .filter((name) => name !== 'legacy-scratch' && statSync(path.join(root, name)).isDirectory())
  .flatMap((dir) =>
    readdirSync(path.join(root, dir))
      .filter((file) => file.startsWith('test') && file.endsWith('.js'))
      .map((file) => path.join(root, dir, file)),
  );

if (suites.length === 0) {
  console.log('No active test suites yet (migration Task 1).');
  process.exit(0);
}

let failed = 0;
for (const suite of suites) {
  console.log(`\n== ${path.relative(root, suite)}`);
  const result = spawnSync(process.execPath, [suite], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}
process.exit(failed === 0 ? 0 : 1);
