'use strict';

// Migration Task 1 — repo layout guard.
// Asserts the v6 skeleton exists, the v4 folders are gone, and no JS file
// requires a relative path that no longer exists.

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');

const MUST_EXIST = [
  'stella/hooks/project/friction-logger/session-end.js',
  'stella/hooks/project/friction-logger/session-start.js',
  'stella/hooks/project/pr-review-guard/pre-tool-use.js',
  'stella/hooks/project/pr-review-guard/lib/policy.js',
  'stella/hooks/project/pr-review-guard/lib/review-state.js',
  'stella/hooks/project/memory/daily-job.js',
  'stella/hooks/project/personalization-inject/user-prompt-expansion.js',
  'stella/hooks/user/notification/index.js',
  'stella/hooks/user/personalization/index.js',
  'stella/utils/jira-attachments/index.js',
  'stella/utils/pr-comments/index.js',
  'stella/utils/pr-comments/lib/build.js',
  'stella/checklists/backend-security.md',
  'stella/checklists/frontend-security.md',
  'stella/skills/caveman/SKILL.md',
  'stella/skills/stella-security/SKILL.md',
  'stella/skills/stella-pr-review/SKILL.md',
  'stella/skills/stella-pr-review/checklist.md',
  'stella/skills/stella-domain-expert/SKILL.md',
  'stella/skills/stella-domain-expert/onboard.md',
  'stella/skills/stella-build/SKILL.md',
  'stella/skills/stella-build/CHANGES.md',
  'tests/fixtures/bmad-build-6.12.2/SKILL.md',
  'tests/fixtures/bmad-build-6.12.2/SOURCE.md',
  'tools/bmad-npx-wrapper.js',
  'tools/installer/bin/bmad.js',
  'tools/installer/lib/constants.js',
  'tools/installer/lib/preflight.js',
  'tools/installer/lib/project-picker.js',
  'tools/installer/lib/cleaner.js',
  'tools/installer/lib/bmad-runner.js',
  'tools/installer/lib/gitignore.js',
  'tools/installer/lib/stella-layer.js',
  'tools/installer/lib/installer.js',
  'tools/installer/lib/ui.js',
  'tools/installer/lib/confluence-client.js',
  'tools/installer/lib/domain-knowledge-fetcher.js',
  'tools/installer/lib/jira-credentials-manager.js',
  'tools/installer/lib/claude-permissions-manager.js',
  'tools/installer/lib/hooks-manager.js',
  'tests/run.js',
];

const MUST_NOT_EXIST = [
  'bmad-core',
  'expansion-packs',
  'dist',
  'common',
  'tools/cli.js',
  'tools/builders',
  'tools/flattener',
  'tools/upgraders',
  'tools/lib',
  'tools/installer/config',
  'tools/installer/lib/ide-setup.js',
  'tools/installer/lib/dependency-manager.js',
  'tools/installer/lib/architecture-docs-fetcher.js',
  'tools/installer/lib/memory-setup.js',
  'tools/installer/lib/resource-locator.js',
];

let failures = 0;
function check(ok, message) {
  if (ok) return;
  failures++;
  console.log(`FAIL ${message}`);
}

for (const rel of MUST_EXIST) check(fs.existsSync(path.join(ROOT, rel)), `missing: ${rel}`);
for (const rel of MUST_NOT_EXIST)
  check(!fs.existsSync(path.join(ROOT, rel)), `should be gone: ${rel}`);

// Every tracked JS file (outside the verbatim legacy copies) must only require paths that exist.
const tracked = execSync('git ls-files -c -o --exclude-standard', { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.endsWith('.js') && !f.startsWith('tests/legacy-scratch/'));

for (const file of tracked) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const match of source.matchAll(/require\((['"])(\.[^'"]+)\1\)/g)) {
    const target = path.resolve(ROOT, path.dirname(file), match[2]);
    const resolves = ['', '.js', '.json', '/index.js', '/package.json'].some((ext) =>
      fs.existsSync(target + ext),
    );
    check(resolves, `dangling require in ${file}: ${match[2]}`);
  }
}

if (failures > 0) {
  console.log(`\n${failures} layout check(s) failed`);
  process.exit(1);
}
console.log(
  `layout OK (${MUST_EXIST.length} present, ${MUST_NOT_EXIST.length} removed, ${tracked.length} JS files resolve)`,
);
