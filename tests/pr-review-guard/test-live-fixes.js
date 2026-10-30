'use strict';

// Migration Task 4 — regressions from the v4 live runs, replayed on the v6 layout.
// Ported from tests/legacy-scratch/pr-review-guard/test-live-fixes.js. Sections that
// belonged to the installer rules, the helper's marker logic and the friction logger
// moved to their own suites (Tasks 5 and 11; Task 3).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const G = path.join(REPO, 'stella', 'hooks', 'project', 'pr-review-guard');
const HOOK = path.join(G, 'pre-tool-use.js');
const { classifyLine } = require(path.join(G, 'lib', 'review-state.js'));
const { decide, checkBash, isFindingsFile } = require(path.join(G, 'lib', 'policy.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

const SHA = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const REV = '_bmad-output/stella/reviewer';
const HELPER = '_bmad/custom/stella/utils/pr-comments';
const line = (o) => JSON.stringify(o);
const user = (t) => line({ type: 'user', message: { content: t } });
const userArr = (t) => line({ type: 'user', message: { content: [{ type: 'text', text: t }] } });
const tool = (name, input) =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });

// ---- 1. the live-run shape that fooled v4: task loaded via Bash cat. In v6 the only
//         signals are the typed command and the Skill call; shell reads of the skill
//         file are NOT a start (dropped marker, user decision).
ok(
  classifyLine(
    tool('Bash', {
      command: 'cd "C:/Users/x/SpendLog" && cat .claude/skills/stella-pr-review/SKILL.md',
    }),
  ) === null,
  'not start: Bash cat of the skill file',
);
ok(
  classifyLine(
    tool('Bash', { command: 'sed -n 1,200p .claude/skills/stella-pr-review/SKILL.md' }),
  ) === null,
  'not start: sed of the skill file',
);
ok(
  classifyLine(
    tool('PowerShell', { command: 'Get-Content .claude\\skills\\stella-pr-review\\SKILL.md' }),
  ) === null,
  'not start: PowerShell Get-Content of the skill file',
);
ok(
  classifyLine(userArr('/stella-pr-review https://github.com/o/r/pull/1')) === 'start',
  'start: typed command as array content',
);
ok(classifyLine(user('  /stella-pr-review 12')) === 'start', 'start: leading spaces');
ok(
  classifyLine(user('please run /stella-pr-review later')) === null,
  'not start: command mid-sentence',
);
ok(
  classifyLine(
    line({
      type: 'user',
      isMeta: true,
      message: { content: [{ type: 'text', text: '/stella-pr-review injected' }] },
    }),
  ) === null,
  'not start: isMeta ignored',
);
ok(classifyLine(userArr('*exit')) === 'end', 'end: *exit as array content');

// ---- 2. cd prefix ----
ok(
  checkBash('cd "C:/Users/x/SpendLog" && gh pr diff https://github.com/o/r/pull/1').allow,
  'cd: quoted path + allowed',
);
ok(checkBash("cd '/home/x' && git show " + SHA + ':src/a.js').allow, 'cd: single-quoted path');
ok(
  checkBash(`cd /home/x && node ${HELPER} ${REV}/r-pr1/findings.json --post`).allow,
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

// ---- 4. e2e replay of the live-run shape (v6 signals) ----
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-t4-live-'));
fs.mkdirSync(path.join(ROOT, '_bmad'), { recursive: true });
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
    env: { ...process.env, STELLA_GUARD_OFF: '' },
  }).status;
fs.writeFileSync(
  T,
  [
    line({
      type: 'user',
      isMeta: true,
      message: { content: [{ type: 'text', text: '# stella-pr-review skill body injected' }] },
    }),
    user(
      '<command-name>/stella-pr-review</command-name>\n<command-args>https://github.com/o/r/pull/1</command-args>',
    ),
    tool('Skill', { skill: 'stella-pr-review' }),
    tool('Bash', { command: `cd "${ROOT}" && cat .claude/skills/stella-pr-review/SKILL.md` }),
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
  run('Bash', { command: `cd "${ROOT}" && node ${HELPER} ${REV}/r-pr1/findings.json` }) === 0,
  'e2e: cd && helper preview allowed',
);
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.js') }) === 2,
  'e2e: Edit blocked (review detected via command + Skill call)',
);
ok(run('PowerShell', { command: 'git push' }) === 2, 'e2e: PowerShell git push blocked');
fs.appendFileSync(
  T,
  '\n' +
    tool('Write', {
      file_path: path.join(ROOT, '_bmad-output', 'stella', 'reviewer', 'r-pr1', 'review.md'),
    }),
);
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.js') }) === 0,
  'e2e: after review.md written, Edit allowed',
);

// ---- 5. git diff fallback (two SHAs mandatory) ----
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

// ---- 6. per-review folder layout ----
ok(
  decide('Write', {
    file_path: `C:\\p\\${REV.replaceAll('/', '\\')}\\r-pr1\\reproduce.md`,
    content: '# x',
  }).allow,
  'layout: reproduce.md write allowed',
);
ok(
  decide('Write', { file_path: `/p/${REV}/r-pr1/findings.json`, content: '{}' }).allow,
  'layout: findings.json write allowed',
);
ok(
  !decide('Write', { file_path: `/p/${REV}/r-pr1-review.md`, content: '' }).allow,
  'layout: old flat .md path blocked',
);
ok(
  !decide('Write', { file_path: `/p/${REV}/r-pr1/notes.md`, content: '' }).allow,
  'layout: other file in review folder blocked',
);
ok(
  !isFindingsFile(`/p/${REV}/.scratch/review.md`),
  'layout: review.md inside .scratch is not a findings file',
);
ok(
  classifyLine(
    tool('Write', { file_path: `C:\\p\\${REV.replaceAll('/', '\\')}\\r-pr1\\review.md` }),
  ) === 'end',
  'layout: review.md write ends the review',
);
ok(
  classifyLine(
    tool('Write', { file_path: `C:\\p\\${REV.replaceAll('/', '\\')}\\r-pr1\\findings.json` }),
  ) === null,
  'layout: findings.json write does not end the review',
);
ok(
  classifyLine(
    tool('Write', { file_path: `C:\\p\\${REV.replaceAll('/', '\\')}\\r-pr1\\reproduce.md` }),
  ) === null,
  'layout: reproduce.md write does not end the review',
);
ok(
  checkBash(`node ${HELPER} ${REV}/r-pr1/findings.json --post`).allow,
  'layout: helper accepts folder path',
);
ok(!checkBash(`node ${HELPER} ${REV}/r-pr1.json`).allow, 'layout: helper rejects flat path');

console.log(
  `pr-review-guard live-fixes: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
