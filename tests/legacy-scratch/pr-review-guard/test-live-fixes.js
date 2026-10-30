'use strict';
// Regression tests for the gaps found in the first live run (SpendLog#1).
const fs = require('node:fs'),
  path = require('node:path');
const { spawnSync } = require('node:child_process');
const G = 'C:/Users/BS01602/Desktop/JEMS/BMad-Stella/bmad-core/bmad-hooks/project/pr-review-guard';
const H = 'C:/Users/BS01602/Desktop/JEMS/BMad-Stella/bmad-core/utils/pr-comments';
const HOOK = path.join(G, 'pre-tool-use.js');
const { classifyLine } = require(path.join(G, 'lib', 'review-state.js'));
const { decide, checkBash, isFindingsFile } = require(path.join(G, 'lib', 'policy.js'));
const B = require(path.join(H, 'lib', 'build.js'));
let fails = 0,
  total = 0;
const ok = (c, m) => {
  total++;
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};
const SHA = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const line = (o) => JSON.stringify(o);
const user = (t) => line({ type: 'user', message: { content: t } });
const userArr = (t) => line({ type: 'user', message: { content: [{ type: 'text', text: t }] } });
const tool = (name, input) =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });

// ---- 1. start / end markers ----
ok(
  classifyLine(
    tool('Bash', { command: 'cd "C:/Users/x/SpendLog" && cat .bmad-core/tasks/review-pr.md' }),
  ) === 'start',
  'start: Bash cat of task (live-run shape)',
);
ok(
  classifyLine(tool('Bash', { command: 'sed -n 1,200p .bmad-core/tasks/review-pr.md' })) ===
    'start',
  'start: sed of task',
);
ok(
  classifyLine(tool('PowerShell', { command: 'Get-Content .bmad-core\\tasks\\review-pr.md' })) ===
    'start',
  'start: PowerShell Get-Content of task',
);
ok(
  classifyLine(user('*pr-review https://github.com/o/r/pull/1')) === 'start',
  'start: user types *pr-review',
);
ok(
  classifyLine(userArr('*pr-review https://github.com/o/r/pull/1')) === 'start',
  'start: *pr-review as array content',
);
ok(classifyLine(user('  *pr-review 12')) === 'start', 'start: leading spaces');
ok(
  classifyLine(user('please run *pr-review later')) === null,
  'not start: *pr-review mid-sentence',
);
ok(
  classifyLine(tool('Bash', { command: 'grep -n x .bmad-core/tasks/review-pr-old.md' })) === null,
  'not start: different file',
);
ok(
  classifyLine(
    line({
      type: 'user',
      isMeta: true,
      message: { content: [{ type: 'text', text: '*pr-review injected' }] },
    }),
  ) === null,
  'not start: isMeta ignored',
);
ok(classifyLine(userArr('*exit')) === 'end', 'end: *exit as array content');
ok(
  classifyLine(user('<command-name>/BMad:agents:reviewer</command-name>')) === 'end',
  'reviewer activation alone is not a start',
);

// ---- 2. cd prefix ----
ok(
  checkBash('cd "C:/Users/x/SpendLog" && gh pr diff https://github.com/o/r/pull/1').allow,
  'cd: quoted path + allowed',
);
ok(checkBash("cd '/home/x' && git show " + SHA + ':src/a.js').allow, 'cd: single-quoted path');
ok(
  checkBash(
    'cd /home/x && node .bmad-core/utils/pr-comments bmad-docs/reviewer/r-pr1-2026-10-06/findings.json --post',
  ).allow,
  'cd: bare path + helper',
);
ok(!checkBash('cd /x && git push').allow, 'cd: + forbidden still blocked');
ok(!checkBash('cd /x && gh pr diff 1 && git push').allow, 'cd: second && blocked');
ok(!checkBash('cd /x && gh pr diff 1 | cat').allow, 'cd: pipe after blocked');
ok(!checkBash('cd /x; git push').allow, 'cd: semicolon form blocked');
ok(!checkBash('cd /x && cd /y && gh pr diff 1').allow, 'cd: double cd blocked');
ok(!checkBash('cd /x').allow, 'cd: alone is not a review command');

// ---- 3. PowerShell tool ----
ok(
  decide('PowerShell', { command: 'gh pr diff https://github.com/o/r/pull/1' }).allow,
  'ps: allowed command',
);
ok(!decide('PowerShell', { command: 'git push' }).allow, 'ps: forbidden command');
ok(!decide('PowerShell', { command: 'gh pr diff 1 | Out-File x.txt' }).allow, 'ps: pipe blocked');

// ---- 4. e2e replay of the live-run shape ----
const ROOT = path.join(__dirname, 'proj-live');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, '.bmad-core'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.bmad-core', 'core-config.yaml'), 'x: 1\n');
const T = path.join(ROOT, 't.jsonl');
const run = (toolName, toolInput, sid = 'live-1') =>
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({
      session_id: sid,
      transcript_path: T,
      cwd: ROOT,
      tool_name: toolName,
      tool_input: toolInput,
    }),
    encoding: 'utf8',
  }).status;
fs.writeFileSync(
  T,
  [
    line({
      type: 'user',
      isMeta: true,
      message: {
        content: [{ type: 'text', text: '# /reviewer Command\n\nid: reviewer\nname: Morgan' }],
      },
    }),
    user('<command-name>/BMad:agents:reviewer</command-name>'),
    userArr('*pr-review https://github.com/o/r/pull/1'),
    tool('Bash', { command: `cd "${ROOT}" && cat .bmad-core/tasks/review-pr.md` }),
  ].join('\n'),
);
ok(
  run('Bash', { command: `cd "${ROOT}" && gh pr diff https://github.com/o/r/pull/1` }) === 0,
  'e2e: cd && gh pr diff allowed while active',
);
ok(
  run('Bash', { command: `cd "${ROOT}" && git commit -m x` }) === 2,
  'e2e: cd && git commit blocked while active',
);
ok(
  run('Bash', {
    command: `cd "${ROOT}" && node .bmad-core/utils/pr-comments bmad-docs/reviewer/r-pr1-2026-10-06/findings.json`,
  }) === 0,
  'e2e: cd && helper preview allowed',
);
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.js') }) === 2,
  'e2e: Edit blocked (review detected via *pr-review + Bash cat)',
);
ok(run('PowerShell', { command: 'git push' }) === 2, 'e2e: PowerShell git push blocked');
fs.appendFileSync(
  T,
  '\n' +
    tool('Write', {
      file_path: path.join(ROOT, 'bmad-docs', 'reviewer', 'r-pr1-2026-10-06', 'review.md'),
    }),
);
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.js') }) === 0,
  'e2e: after findings written, Edit allowed',
);

// ---- 5. installer rules ----
const pm = require('C:/Users/BS01602/Desktop/JEMS/BMad-Stella/tools/installer/lib/claude-permissions-manager.js');
const allow = pm.getAllPermissions(),
  deny = pm.getAllDenyPermissions();
ok(
  allow.includes('Bash(cd *)') && allow.includes('PowerShell(cd *)'),
  'rules: cd allowed in both shells',
);
const bashTwins = allow
  .filter((r) => /^Bash\((gh|git|node \.bmad-core)/.test(r))
  .map((r) => r.replace(/^Bash/, 'PowerShell'));
ok(
  bashTwins.every((r) => allow.includes(r)),
  'rules: every Bash gh/git/helper allow has a PowerShell twin',
);
ok(
  deny
    .filter((r) => r.startsWith('Bash('))
    .every((r) => deny.includes(r.replace(/^Bash/, 'PowerShell'))),
  'rules: every Bash deny has a PowerShell twin',
);
const src = fs.readFileSync(
  'C:/Users/BS01602/Desktop/JEMS/BMad-Stella/tools/installer/lib/installer.js',
  'utf8',
);
ok(
  /matcher: 'Edit\|MultiEdit\|Write\|Bash\|PowerShell'/.test(src),
  'installer: hook matcher includes PowerShell',
);

// ---- 6. SHA-scoped markers ----
ok(B.marker(SHA, 3) === '<!-- bmad:a1b2c3d:3 -->', 'marker: sha7:id');
ok(
  B.extractMarkers(['x <!-- bmad:a1b2c3d:1 -->', '<!-- bmad:A1B2C3D:2 -->'], SHA).size === 2,
  'marker: same sha extracted (case-insensitive)',
);
ok(
  B.extractMarkers(['<!-- bmad:ffffff0:1 -->', '<!-- bmad:1 -->'], SHA).size === 0,
  'marker: other sha and legacy markers ignored',
);
const DIFF = ['+++ b/src/A.cs', '@@ -1,2 +1,5 @@', '+a', '+b', '+c', '+d', '+e'].join('\n');
const doc = B.validateFindings({
  pr: 'https://github.com/o/r/pull/1',
  owner: 'o',
  repo: 'r',
  number: 1,
  headSha: SHA,
  summary: 's',
  findings: [{ id: 1, path: 'src/A.cs', line: 2, what: 'w', why: 'y', fix: '' }],
});
const round2 = B.buildReview(
  doc,
  B.parseDiffRanges(DIFF),
  B.extractMarkers(['<!-- bmad:0000000:1 -->'], SHA),
  {},
);
ok(
  round2.payload.comments.length === 1 && /bmad:a1b2c3d:1/.test(round2.payload.comments[0].body),
  'round 2: round-1 sticker with same id does not shadow new finding',
);
const same = B.buildReview(
  doc,
  B.parseDiffRanges(DIFF),
  B.extractMarkers(['<!-- bmad:a1b2c3d:1 -->'], SHA),
  {},
);
ok(same.nothingToPost, 'same round re-run: skipped as already posted');

// ---- 6b. git diff fallback (two SHAs mandatory) ----
const BASE = '4e6ef929042f10096b666380093956607a6f9e7b';
ok(checkBash(`git diff ${BASE} ${SHA}`).allow, 'diff: base head allowed');
ok(checkBash(`git diff ${BASE} ${SHA} --name-only`).allow, 'diff: --name-only allowed');
ok(checkBash(`git diff ${BASE} ${SHA} -- src/budget.js`).allow, 'diff: single file allowed');
ok(
  checkBash(`git diff ${BASE.slice(0, 7)} ${SHA.slice(0, 7)} --stat`).allow,
  'diff: short shas allowed',
);
ok(checkBash(`cd /x && git diff ${BASE} ${SHA} -- src/a.js`).allow, 'diff: with cd prefix allowed');
ok(!checkBash('git diff').allow, 'diff: bare (working tree) blocked');
ok(!checkBash('git diff HEAD').allow, 'diff: HEAD blocked');
ok(!checkBash('git diff main').allow, 'diff: branch name blocked');
ok(!checkBash(`git diff ${SHA}`).allow, 'diff: one sha (vs working tree) blocked');
ok(!checkBash(`git diff ${BASE} ${SHA} --output=/tmp/x`).allow, 'diff: --output blocked');
ok(!checkBash(`git diff ${BASE} ${SHA} --ext-diff`).allow, 'diff: --ext-diff blocked');
ok(
  !checkBash(`git diff ${BASE}..${SHA}`).allow,
  'diff: range syntax blocked (two separate shas required)',
);
ok(
  allow.includes('Bash(git diff *)') && allow.includes('PowerShell(git diff *)'),
  'rules: git diff allowed in both shells',
);
const taskText = fs.readFileSync(
  'C:/Users/BS01602/Desktop/JEMS/BMad-Stella/bmad-core/tasks/review-pr.md',
  'utf8',
);
ok(
  /5b\. Large-PR fallback/.test(taskText) && /Over 1000 files → HALT/.test(taskText),
  'task: 5b fallback + 1000 cap present',
);

// ---- 7. friction logger sees PowerShell plan writes ----
const se = fs.readFileSync(
  'C:/Users/BS01602/Desktop/JEMS/BMad-Stella/bmad-core/bmad-hooks/project/friction-logger/session-end.js',
  'utf8',
);
ok(/block\.name === 'PowerShell'/.test(se), 'friction logger: PowerShell commands scanned');

// ---- 7b. per-review folder layout ----
ok(
  decide('Write', {
    file_path: 'C:\\p\\bmad-docs\\reviewer\\r-pr1-2026-10-06\\reproduce.md',
    content: '# x',
  }).allow,
  'layout: reproduce.md write allowed',
);
ok(
  decide('Write', {
    file_path: '/p/bmad-docs/reviewer/r-pr1-2026-10-06/findings.json',
    content: '{}',
  }).allow,
  'layout: findings.json write allowed',
);
ok(
  !decide('Write', { file_path: '/p/bmad-docs/reviewer/r-pr1-review-2026-10-06.md', content: '' })
    .allow,
  'layout: old flat .md path now blocked',
);
ok(
  !decide('Write', { file_path: '/p/bmad-docs/reviewer/r-pr1-2026-10-06/notes.md', content: '' })
    .allow,
  'layout: other file in review folder blocked',
);
ok(
  !isFindingsFile('/p/bmad-docs/reviewer/.scratch/review.md'),
  'layout: review.md inside .scratch is not a findings file',
);
ok(
  classifyLine(
    tool('Write', { file_path: 'C:\\p\\bmad-docs\\reviewer\\r-pr1-2026-10-06\\review.md' }),
  ) === 'end',
  'layout: review.md write ends the review',
);
ok(
  classifyLine(
    tool('Write', { file_path: 'C:\\p\\bmad-docs\\reviewer\\r-pr1-2026-10-06\\findings.json' }),
  ) === null,
  'layout: findings.json write does not end the review',
);
ok(
  classifyLine(
    tool('Write', { file_path: 'C:\\p\\bmad-docs\\reviewer\\r-pr1-2026-10-06\\reproduce.md' }),
  ) === null,
  'layout: reproduce.md write does not end the review',
);
ok(
  checkBash(
    'node .bmad-core/utils/pr-comments bmad-docs/reviewer/r-pr1-2026-10-06/findings.json --post',
  ).allow,
  'layout: helper accepts folder path',
);
ok(
  !checkBash('node .bmad-core/utils/pr-comments bmad-docs/reviewer/r-pr1.json').allow,
  'layout: helper rejects old flat path',
);

// ---- 8. regressions ----
for (const f of ['test.js', 'test-scratch.js', 'test-comments.js']) {
  const b = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  ok(b.status === 0, `regression: ${f} — ${(b.stdout.match(/\d+\/\d+ passed.*/) || [''])[0]}`);
}
console.log(`\n${total - fails}/${total} passed` + (fails ? ` — ${fails} FAILED` : ' — ALL PASS'));
process.exit(fails ? 1 : 0);
