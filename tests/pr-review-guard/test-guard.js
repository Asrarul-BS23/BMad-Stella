'use strict';

// Migration Task 4 — PR review guard on the BMad v6 layout (base suite).
// Ported from the v4-era scratch suite (tests/legacy-scratch/pr-review-guard/test.js):
// policy allowlist, file-tool policy, transcript line classification with the two
// v6 start markers, end-to-end hook runs, kill switch, fail-open, performance.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const G = path.join(REPO, 'stella', 'hooks', 'project', 'pr-review-guard');
const HOOK = path.join(G, 'pre-tool-use.js');
const { decide, checkBash } = require(path.join(G, 'lib', 'policy.js'));
const { classifyLine, cachePath } = require(path.join(G, 'lib', 'review-state.js'));
const paths = require(path.join(G, 'lib', 'paths.js'));

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

// ================= 1. policy: Bash allowlist =================
const ALLOW = [
  'gh auth status',
  'gh pr view https://github.com/o/r/pull/12 --json number,title,headRefOid',
  'gh pr view 12 --json title -q .title',
  'gh pr diff https://github.com/o/r/pull/12',
  'gh pr diff 12 --name-only',
  'gh pr checks https://github.com/o/r/pull/12',
  'git fetch origin pull/12/head',
  `git cat-file -t ${SHA}`,
  `git show ${SHA}:src/Services/WarrantService.cs`,
  `git show ${SHA}:"src/My Folder/File.cs"`,
  `git grep -n -e "GeneratePdf" ${SHA}`,
  `git grep -n -e "List<User>" ${SHA}`,
  `git grep -n -e "-Ocalc" ${SHA}`,
  `git grep -n -e Slugify ${SHA} -- src/`,
  `git log --oneline ${SHA.slice(0, 7)}..${SHA}`,
  'git log -n 20 --oneline',
  `node ${HELPER} ${REV}/r-pr12/findings.json`,
  `node ${HELPER} ${REV}/r-pr12/findings.json --post`,
  `node ${HELPER}/index.js ${REV}/r-pr12/findings.json --post --allow-long`,
];
const BLOCK = [
  ['gh api repos/o/r/pulls/1', 'gh api'],
  ['gh pr comment 12 --body hi', 'gh pr comment'],
  ['gh pr review 12 --approve', 'gh pr review'],
  ['gh pr merge 12', 'gh pr merge'],
  ['gh pr checkout 12', 'gh pr checkout'],
  ['gh pr view 12 --web', 'gh pr view --web'],
  ['gh pr diff 12 -w', 'gh pr diff -w'],
  ['gh pr checks 12 --watch', 'gh pr checks --watch'],
  ['git checkout feature/x', 'git checkout'],
  ['git switch -c x', 'git switch'],
  ['git add .', 'git add'],
  ['git commit -m x', 'git commit'],
  ['git push origin dev', 'git push'],
  ['git stash', 'git stash'],
  ['git reset --hard', 'git reset'],
  ['git fetch origin dev', 'git fetch non-pull ref'],
  ['git fetch origin pull/12/head:local-branch', 'git fetch creating a branch'],
  [`git grep -n -O calc GeneratePdf ${SHA}`, 'git grep -O (option injection)'],
  [`git grep -n -e x ${SHA} --open-files-in-pager=calc`, 'git grep --open-files-in-pager'],
  ['git log --output=/tmp/x', 'git log --output'],
  ['git show HEAD', 'git show without sha:path'],
  ['git show abc123:file.cs && rm -rf /', 'compound &&'],
  ['gh pr diff 12 | tee out.txt', 'pipe'],
  ['gh pr diff 12 > diff.txt', 'redirect'],
  ['gh pr view 12; git push', 'semicolon'],
  ['gh pr view $(cat x)', 'subshell'],
  ['gh pr view `cat x`', 'backtick'],
  ['cat src/File.cs', 'cat'],
  ['rm -rf _bmad-output', 'rm'],
  ['npm test', 'npm'],
  ['', 'empty'],
  [`node .bmad-core/utils/pr-comments ${REV}/r-pr12/findings.json`, 'old v4 helper path'],
  [`node ${HELPER} bmad-docs/reviewer/r-pr12/findings.json`, 'helper with old v4 findings path'],
  [`node ${HELPER} ${REV}/r-pr12/findings.json --force`, 'helper with unknown flag'],
];
for (const c of ALLOW) ok(checkBash(c).allow === true, `allow: ${c}`);
for (const [c, label] of BLOCK) ok(checkBash(c).allow === false, `block: ${label}`);

// ================= 2. policy: file tools =================
const W = (p) => `C:\\p\\${p.replaceAll('/', '\\')}`;
ok(decide('Edit', { file_path: 'C:\\p\\src\\a.cs' }).allow === false, 'block Edit source');
ok(
  decide('Edit', { file_path: W(`${REV}/r-pr12/review.md`) }).allow === false,
  'block Edit even on findings file',
);
ok(decide('MultiEdit', { file_path: 'C:\\p\\src\\a.cs' }).allow === false, 'block MultiEdit');
ok(
  decide('NotebookEdit', { notebook_path: 'C:\\p\\a.ipynb' }).allow === false,
  'block NotebookEdit',
);
ok(
  decide('Write', { file_path: W(`${REV}/repo-pr12/review.md`) }).allow === true,
  'allow Write review.md (win path)',
);
ok(
  decide('Write', { file_path: `/p/${REV}/repo-pr12/review.md` }).allow === true,
  'allow Write review.md (posix path)',
);
ok(
  decide('Write', { file_path: `/p/${REV}/repo-pr12/findings.json` }).allow === true,
  'allow Write findings.json',
);
ok(
  decide('Write', { file_path: `/p/${REV}/repo-pr12/reproduce.md` }).allow === true,
  'allow Write reproduce.md',
);
ok(decide('Write', { file_path: 'C:\\p\\src\\a.cs' }).allow === false, 'block Write source');
ok(
  decide('Write', { file_path: 'C:\\p\\bmad-docs\\reviewer\\repo-pr12\\review.md' }).allow ===
    false,
  'block Write to old v4 reviewer path',
);
ok(
  decide('Write', { file_path: W('_bmad-output/implementation-artifacts/spec-x.md') }).allow ===
    false,
  'block Write to a spec file',
);
ok(
  decide('Write', { file_path: W(`${REV}/sub/x.md`) }).allow === false,
  'block Write to a non-review file in a review folder',
);
ok(
  decide('Write', { file_path: W(`${REV}/x.cs`) }).allow === false,
  'block Write non-review file at reviewer root',
);
ok(
  decide('Write', { file_path: `/p/${REV}/r-pr1-review.md` }).allow === false,
  'block old flat .md layout',
);
ok(decide('Read', { file_path: 'C:\\p\\src\\a.cs' }).allow === true, 'allow Read');
ok(decide('Grep', { pattern: 'x' }).allow === true, 'allow Grep');

// ================= 3. review-state: line classification =================
const line = (o) => JSON.stringify(o);
const user = (t, extra = {}) => line({ type: 'user', message: { content: t }, ...extra });
const userArr = (t) => line({ type: 'user', message: { content: [{ type: 'text', text: t }] } });
const tool = (name, input) =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });

// start marker 1: typed command (Claude Code tag form and raw form)
ok(
  classifyLine(
    user(
      '<command-message>x</command-message>\n<command-name>/stella-pr-review</command-name>\n<command-args>https://github.com/o/r/pull/1</command-args>',
    ),
  ) === 'start',
  'start: typed command (tag form)',
);
ok(
  classifyLine(user('/stella-pr-review https://github.com/o/r/pull/1')) === 'start',
  'start: typed command (raw form)',
);
ok(
  classifyLine(userArr('  /stella-pr-review 12')) === 'start',
  'start: raw form as array content, leading spaces',
);
ok(classifyLine(user('/STELLA-PR-REVIEW x')) === 'start', 'start: case-insensitive');
// start marker 2: Skill tool call
ok(
  classifyLine(tool('Skill', { skill: 'stella-pr-review' })) === 'start',
  'start: Skill tool call',
);
ok(
  classifyLine(tool('Skill', { skill: 'stella-pr-review', args: 'https://x' })) === 'start',
  'start: Skill tool call with args',
);
// NOT start
ok(
  classifyLine(
    tool('Read', { file_path: 'C:\\p\\.claude\\skills\\stella-pr-review\\SKILL.md' }),
  ) === null,
  'not start: Read of the skill file (dropped marker)',
);
ok(
  classifyLine(tool('Bash', { command: 'cat .claude/skills/stella-pr-review/SKILL.md' })) === null,
  'not start: Bash cat of the skill file',
);
ok(classifyLine(user('what does stella-pr-review do?')) === null, 'not start: name in prose');
ok(
  classifyLine(user('please run /stella-pr-review later')) === null,
  'not start: command mid-sentence',
);
ok(
  classifyLine(user('/stella-pr-reviewer x')) === 'end',
  'longer command name is just another stella command (end)',
);
ok(classifyLine(user('/stella-pr-review', { isMeta: true })) === null, 'not start: isMeta line');
ok(
  classifyLine(user('*pr-review https://github.com/o/r/pull/1')) === null,
  'not start: old v4 *pr-review',
);
ok(
  classifyLine(user('<command-name>/BMad:tasks:review-pr</command-name>')) === null,
  'not start: old v4 task command',
);
ok(
  classifyLine(tool('Skill', { skill: 'stella-pr-review-extra' })) === 'end',
  'different stella skill launched = end, never start',
);
// end markers
ok(classifyLine(user('*exit')) === 'end', 'end: *exit');
ok(classifyLine(userArr('*exit')) === 'end', 'end: *exit as array content');
ok(
  classifyLine(user('<command-name>/bmad-build</command-name>')) === 'end',
  'end: other bmad skill command (tag)',
);
ok(
  classifyLine(user('/stella-security spec-x.md')) === 'end',
  'end: other stella skill command (raw)',
);
ok(classifyLine(user('/bmad-help')) === 'end', 'end: /bmad-help');
ok(
  classifyLine(tool('Skill', { skill: 'bmad-build' })) === 'end',
  'end: other skill launched (Skill tool)',
);
ok(
  classifyLine(tool('Write', { file_path: W(`${REV}/r-pr1/review.md`) })) === 'end',
  'end: review.md written',
);
ok(
  classifyLine(tool('Write', { file_path: W(`${REV}/r-pr1/findings.json`) })) === null,
  'not end: findings.json written',
);
ok(
  classifyLine(tool('Write', { file_path: W(`${REV}/r-pr1/reproduce.md`) })) === null,
  'not end: reproduce.md written',
);
ok(
  classifyLine(tool('Write', { file_path: W(`${REV}/.scratch/review.md`) })) === null,
  'not end: review.md inside .scratch',
);
ok(
  classifyLine(user('please fix the exit code')) === null,
  'plain text with "exit" inside is not an end',
);
ok(classifyLine(user('/caveman full')) === null, 'not end: non-bmad/stella command');
ok(classifyLine('not json') === null, 'garbage line ignored');

// ================= 4. end-to-end: hook process =================
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-t4-'));
fs.mkdirSync(path.join(ROOT, '_bmad', 'custom', 'stella'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'src'), { recursive: true });
const T = path.join(ROOT, 'transcript.jsonl');
function run(toolName, toolInput, sessionId = 'sess-1', extra = {}) {
  const payload = {
    session_id: sessionId,
    transcript_path: T,
    cwd: path.join(ROOT, 'src'),
    tool_name: toolName,
    tool_input: toolInput,
    hook_event_name: 'PreToolUse',
    ...extra,
  };
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, STELLA_GUARD_OFF: '' },
  });
  return { code: r.status, err: r.stderr };
}
const reviewFile = (name) => path.join(ROOT, REV.replaceAll('/', path.sep), 'r-pr12', name);

// 4a. no review in session -> everything allowed, nothing written to disk
fs.writeFileSync(T, [user('hello'), tool('Edit', { file_path: 'x' })].join('\n'));
ok(run('Edit', { file_path: 'C:\\p\\src\\a.cs' }).code === 0, 'e2e: no review -> Edit allowed');
ok(run('Bash', { command: 'git commit -m x' }).code === 0, 'e2e: no review -> git commit allowed');
ok(fs.existsSync(cachePath(ROOT, 'sess-1')), 'e2e: cache file lives under reviewer/.state');
ok(
  !fs.existsSync(path.join(ROOT, '_bmad-output', 'stella', 'bmad-logs')),
  'e2e: guard never touches the friction logger folder',
);

// 4b. review via typed command -> blocks, with the agreed refusal text
fs.appendFileSync(
  T,
  '\n' +
    user(
      '<command-name>/stella-pr-review</command-name>\n<command-args>https://github.com/o/r/pull/12</command-args>',
    ),
);
let r = run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') });
ok(
  r.code === 2 && /PR review active/.test(r.err) && /\*exit/.test(r.err),
  'e2e: review active -> Edit blocked, message names cause and *exit',
);
r = run('Bash', { command: 'git commit -m x' });
ok(r.code === 2 && /git commit/.test(r.err), 'e2e: review active -> git commit blocked');
ok(
  run('Bash', { command: 'gh pr diff https://github.com/o/r/pull/12' }).code === 0,
  'e2e: review active -> gh pr diff allowed',
);
ok(
  run('Bash', { command: `git show ${SHA}:src/a.cs` }).code === 0,
  'e2e: review active -> git show allowed',
);
ok(
  run('PowerShell', { command: 'git push' }).code === 2,
  'e2e: review active -> PowerShell git push blocked',
);
ok(
  run('Write', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 2,
  'e2e: review active -> Write source blocked',
);
ok(
  run('Write', { file_path: reviewFile('findings.json') }).code === 0,
  'e2e: review active -> Write findings.json allowed',
);
ok(
  run('Write', { file_path: reviewFile('review.md') }).code === 0,
  'e2e: review active -> Write review.md allowed',
);
ok(
  run('Read', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 0,
  'e2e: review active -> Read allowed',
);
const debugLog = path.join(paths.stateDir(ROOT), 'guard-debug.log');
ok(
  fs.existsSync(debugLog) && /blocked Edit/.test(fs.readFileSync(debugLog, 'utf8')),
  'e2e: block logged under reviewer/.state/guard-debug.log',
);

// 4c. findings written -> review over -> allowed again
fs.appendFileSync(T, '\n' + tool('Write', { file_path: reviewFile('review.md') }));
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 0,
  'e2e: after review.md written -> Edit allowed',
);

// 4d. second review via Skill tool call, then *exit -> allowed
fs.appendFileSync(T, '\n' + tool('Skill', { skill: 'stella-pr-review' }));
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 2,
  'e2e: second review (Skill call) -> blocked',
);
fs.appendFileSync(T, '\n' + user('*exit'));
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 0,
  'e2e: after *exit -> allowed',
);

// 4e. review, then another skill starts -> allowed
fs.appendFileSync(T, '\n' + user('/stella-pr-review 12'));
ok(run('Bash', { command: 'npm test' }).code === 2, 'e2e: raw command -> npm test blocked');
fs.appendFileSync(T, '\n' + user('<command-name>/bmad-build</command-name>'));
ok(run('Bash', { command: 'npm test' }).code === 0, 'e2e: bmad-build started -> allowed');

// 4f. different session id, same transcript -> independent cache, fresh scan
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }, 'sess-2').code === 0,
  'e2e: other session unaffected (ends in bmad-build)',
);

// 4g. a Read of the skill file in a normal session never blocks
fs.appendFileSync(
  T,
  '\n' +
    tool('Read', {
      file_path: path.join(ROOT, '.claude', 'skills', 'stella-pr-review', 'SKILL.md'),
    }),
);
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 0,
  'e2e: reading the skill file does not start a review',
);

// 4h. transcript truncated/replaced -> rescan from zero, no stale "active"
fs.appendFileSync(T, '\n' + tool('Skill', { skill: 'stella-pr-review' }));
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 2,
  'e2e: review active again',
);
fs.writeFileSync(T, user('fresh'));
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 0,
  'e2e: transcript replaced -> cache reset -> allowed',
);

// ================= 5. kill switch =================
fs.appendFileSync(T, '\n' + tool('Skill', { skill: 'stella-pr-review' }));
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 2,
  'kill: review active, guard on',
);
const envOff = spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({
    session_id: 'sess-1',
    transcript_path: T,
    cwd: ROOT,
    tool_name: 'Edit',
    tool_input: { file_path: 'x' },
  }),
  encoding: 'utf8',
  env: { ...process.env, STELLA_GUARD_OFF: '1' },
});
ok(envOff.status === 0, 'kill: STELLA_GUARD_OFF=1 allows during a review');
const cfg = paths.configFile(ROOT);
fs.writeFileSync(cfg, JSON.stringify({ enabled: false }));
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 0,
  'kill: guard.json enabled=false allows',
);
fs.writeFileSync(cfg, JSON.stringify({ enabled: true }));
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 2,
  'kill: guard.json enabled=true blocks again',
);
fs.writeFileSync(cfg, '{ broken');
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 2,
  'kill: corrupt guard.json = enabled',
);
fs.rmSync(cfg);
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 2,
  'kill: missing guard.json = enabled',
);
fs.appendFileSync(T, '\n' + user('*exit'));

// ================= 6. fail-open =================
ok(
  run('Edit', { file_path: 'x' }, 'sess-3', { transcript_path: path.join(ROOT, 'nope.jsonl') })
    .code === 0,
  'fail-open: missing transcript',
);
ok(
  spawnSync(process.execPath, [HOOK], { input: '{not json', encoding: 'utf8' }).status === 0,
  'fail-open: bad JSON payload',
);
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'nobmad-'));
ok(
  run('Edit', { file_path: 'x' }, 'sess-4', { cwd: outside }).code === 0,
  'fail-open: outside a v6 project',
);
fs.appendFileSync(T, '\n' + tool('Skill', { skill: 'stella-pr-review' }));
const sub = spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({
    session_id: 'sess-1',
    transcript_path: T,
    cwd: ROOT,
    tool_name: 'Edit',
    tool_input: { file_path: 'x' },
  }),
  encoding: 'utf8',
  env: { ...process.env, BMAD_HOOK_SUBPROCESS: '1' },
});
ok(sub.status === 0, 'subprocess guard: hook-spawned claude is never blocked');
// broken lib -> fail open
const broken = path.join(ROOT, 'guard-broken');
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}
copyDir(G, broken);
fs.rmSync(path.join(broken, 'lib', 'policy.js'));
const b = spawnSync(process.execPath, [path.join(broken, 'pre-tool-use.js')], {
  input: JSON.stringify({
    session_id: 'sess-1',
    transcript_path: T,
    cwd: ROOT,
    tool_name: 'Edit',
    tool_input: { file_path: 'x' },
  }),
  encoding: 'utf8',
});
ok(b.status === 0, 'fail-open: broken lib allows');

// ================= 7. performance: 20k-line transcript, cold then warm =================
const bigT = path.join(ROOT, 'big.jsonl');
const bigLines = [];
for (let i = 0; i < 20_000; i++) bigLines.push(user('msg ' + i + ' ' + 'x'.repeat(200)));
bigLines.push(tool('Skill', { skill: 'stella-pr-review' }));
fs.writeFileSync(bigT, bigLines.join('\n'));
const big = (sid) =>
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({
      session_id: sid,
      transcript_path: bigT,
      cwd: ROOT,
      tool_name: 'Edit',
      tool_input: { file_path: 'x' },
    }),
    encoding: 'utf8',
  });
const t0 = Date.now();
const cold = big('big');
const coldMs = Date.now() - t0;
const t1 = Date.now();
const warm = big('big');
const warmMs = Date.now() - t1;
ok(
  cold.status === 2 && warm.status === 2,
  'perf: 20k-line transcript, review detected cold + warm',
);
ok(coldMs < 1500 && warmMs < 1500, `perf: cold ${coldMs}ms, warm ${warmMs}ms (both < 1.5s)`);

// ================= 8. source hygiene =================
const srcFiles = ['pre-tool-use.js', 'lib/policy.js', 'lib/review-state.js', 'lib/paths.js'];
const stale = srcFiles.filter((f) =>
  /bmad-docs|\.bmad-core|bmad-logs|review-pr\.md/.test(fs.readFileSync(path.join(G, f), 'utf8')),
);
ok(stale.length === 0, `source: no v4 paths left (${stale.join(', ')})`);

console.log(
  `pr-review-guard: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
