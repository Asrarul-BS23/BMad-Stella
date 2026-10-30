'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { spawnSync } = require('node:child_process');
const G = 'C:/Users/BS01602/Desktop/JEMS/BMad-Stella/bmad-core/bmad-hooks/project/pr-review-guard';
const HOOK = path.join(G, 'pre-tool-use.js');
const { decide, checkBash } = require(path.join(G, 'lib', 'policy.js'));
const { classifyLine } = require(path.join(G, 'lib', 'review-state.js'));
let fails = 0,
  total = 0;
const ok = (c, m) => {
  total++;
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};

const SHA = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';

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
  `git grep -n -e "-Ocalc" ${SHA}`, // -e makes it a pattern, safe
  `git grep -n -e Slugify ${SHA} -- src/`,
  `git log --oneline ${SHA.slice(0, 7)}..${SHA}`,
  'git log -n 20 --oneline',
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
  ['rm -rf bmad-docs', 'rm'],
  ['npm test', 'npm'],
  ['', 'empty'],
];
for (const c of ALLOW) ok(checkBash(c).allow === true, `allow: ${c}`);
for (const [c, label] of BLOCK) ok(checkBash(c).allow === false, `block: ${label}`);

// ================= 2. policy: file tools =================
ok(decide('Edit', { file_path: 'C:\\p\\src\\a.cs' }).allow === false, 'block Edit source');
ok(
  decide('Edit', { file_path: 'C:\\p\\bmad-docs\\reviewer\\x.md' }).allow === false,
  'block Edit even on findings file',
);
ok(decide('MultiEdit', { file_path: 'C:\\p\\src\\a.cs' }).allow === false, 'block MultiEdit');
ok(
  decide('Write', { file_path: 'C:\\p\\bmad-docs\\reviewer\\repo-pr12-2026-10-05\\review.md' })
    .allow === true,
  'allow Write findings file (win path)',
);
ok(
  decide('Write', { file_path: '/p/bmad-docs/reviewer/repo-pr12-2026-10-05/review.md' }).allow ===
    true,
  'allow Write findings file (posix path)',
);
ok(decide('Write', { file_path: 'C:\\p\\src\\a.cs' }).allow === false, 'block Write source');
ok(
  decide('Write', { file_path: 'C:\\p\\bmad-docs\\impl-plan\\x.md' }).allow === false,
  'block Write to impl-plan',
);
ok(
  decide('Write', { file_path: 'C:\\p\\bmad-docs\\reviewer\\sub\\x.md' }).allow === false,
  'block Write to a non-review file in a review folder (x.md)',
);
ok(
  decide('Write', { file_path: 'C:\\p\\bmad-docs\\reviewer\\x.cs' }).allow === false,
  'block Write non-review file (x.cs) in a review folder',
);
ok(decide('Read', { file_path: 'C:\\p\\src\\a.cs' }).allow === true, 'allow Read');
ok(decide('Grep', { pattern: 'x' }).allow === true, 'allow Grep');

// ================= 3. review-state: line classification =================
const line = (o) => JSON.stringify(o);
const user = (t) => line({ type: 'user', message: { content: t } });
const tool = (name, input) =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
ok(
  classifyLine(
    user(
      '<command-message>x</command-message>\n<command-name>/BMad:tasks:review-pr</command-name>',
    ),
  ) === 'start',
  'start: direct task command',
);
ok(
  classifyLine(tool('Read', { file_path: 'C:\\p\\.bmad-core\\tasks\\review-pr.md' })) === 'start',
  'start: agent reads task file',
);
ok(classifyLine(user('*exit')) === 'end', 'end: *exit');
ok(
  classifyLine(user('<command-name>/BMad:agents:dev</command-name>')) === 'end',
  'end: other agent activated',
);
ok(
  classifyLine(user('<command-name>/BMad:tasks:create-doc</command-name>')) === 'end',
  'end: other task activated',
);
ok(
  classifyLine(
    tool('Write', { file_path: 'C:\\p\\bmad-docs\\reviewer\\r-pr1-2026-10-05\\review.md' }),
  ) === 'end',
  'end: findings written',
);
ok(
  classifyLine(user('<command-name>/BMad:agents:reviewer</command-name>')) === 'end',
  'reviewer activation alone is not a start',
);
ok(
  classifyLine(user('please fix the exit code')) === null,
  'plain text with "exit" inside is not an end',
);
ok(
  classifyLine(tool('Read', { file_path: 'C:\\p\\src\\review-pr.md' })) === null,
  'reading a non-task review-pr.md is not a start',
);
ok(classifyLine('not json') === null, 'garbage line ignored');

// ================= 4. end-to-end: hook process =================
const ROOT = path.join(__dirname, 'proj');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, '.bmad-core'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.bmad-core', 'core-config.yaml'), 'x: 1\n');
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
  });
  return { code: r.status, err: r.stderr };
}
fs.mkdirSync(path.join(ROOT, 'src'), { recursive: true });

// 4a. no review in session -> everything allowed
fs.writeFileSync(T, [user('hello'), tool('Edit', { file_path: 'x' })].join('\n'));
ok(run('Edit', { file_path: 'C:\\p\\src\\a.cs' }).code === 0, 'e2e: no review -> Edit allowed');
ok(run('Bash', { command: 'git commit -m x' }).code === 0, 'e2e: no review -> git commit allowed');

// 4b. review via agent -> blocks
fs.appendFileSync(
  T,
  '\n' +
    [
      user('<command-name>/BMad:agents:reviewer</command-name>'),
      user('*pr-review https://github.com/o/r/pull/12'),
      tool('Read', { file_path: path.join(ROOT, '.bmad-core', 'tasks', 'review-pr.md') }),
    ].join('\n'),
);
let r = run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') });
ok(r.code === 2 && /READ-ONLY/.test(r.err), 'e2e: review active -> Edit blocked with reason');
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
  run('Write', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 2,
  'e2e: review active -> Write source blocked',
);
ok(
  run('Write', {
    file_path: path.join(ROOT, 'bmad-docs', 'reviewer', 'r-pr12-2026-10-05', 'review.md'),
  }).code === 0,
  'e2e: review active -> Write findings allowed',
);
ok(
  run('Read', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 0,
  'e2e: review active -> Read allowed',
);
const cacheDir = path.join(ROOT, 'bmad-docs', 'bmad-logs', '.pr-review-guard');
ok(fs.existsSync(path.join(cacheDir, 'sess-1.json')), 'e2e: per-session cache written');
ok(
  /blocked Edit/.test(
    fs.readFileSync(path.join(ROOT, 'bmad-docs', 'bmad-logs', '.hook-debug.log'), 'utf8'),
  ),
  'e2e: block logged',
);

// 4c. findings written -> review over -> allowed again
fs.appendFileSync(
  T,
  '\n' +
    tool('Write', {
      file_path: path.join(ROOT, 'bmad-docs', 'reviewer', 'r-pr12-2026-10-05', 'review.md'),
    }),
);
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 0,
  'e2e: after findings written -> Edit allowed',
);

// 4d. second review starts, then *exit -> allowed
fs.appendFileSync(
  T,
  '\n' + tool('Read', { file_path: path.join(ROOT, '.bmad-core', 'tasks', 'review-pr.md') }),
);
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 2,
  'e2e: second review -> blocked',
);
fs.appendFileSync(T, '\n' + user('*exit'));
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 0,
  'e2e: after *exit -> allowed',
);

// 4e. direct task command, then switch to dev agent
fs.appendFileSync(T, '\n' + user('<command-name>/BMad:tasks:review-pr</command-name>'));
ok(run('Bash', { command: 'npm test' }).code === 2, 'e2e: direct task -> npm test blocked');
fs.appendFileSync(T, '\n' + user('<command-name>/BMad:agents:dev</command-name>'));
ok(run('Bash', { command: 'npm test' }).code === 0, 'e2e: dev agent activated -> allowed');

// 4f. different session id, same transcript dir -> independent cache, fresh scan
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }, 'sess-2').code === 0,
  'e2e: other session unaffected (ends in dev agent)',
);

// 4g. transcript truncated/replaced -> rescan from zero, no stale "active"
fs.appendFileSync(
  T,
  '\n' + tool('Read', { file_path: path.join(ROOT, '.bmad-core', 'tasks', 'review-pr.md') }),
);
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 2,
  'e2e: review active again',
);
fs.writeFileSync(T, user('fresh'));
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 0,
  'e2e: transcript replaced -> cache reset -> allowed',
);

// 4h. fail-open: missing transcript, bad json, outside bmad project, subprocess guard
ok(
  run('Edit', { file_path: 'x' }, 'sess-3', { transcript_path: path.join(ROOT, 'nope.jsonl') })
    .code === 0,
  'fail-open: missing transcript',
);
ok(
  spawnSync(process.execPath, [HOOK], { input: '{not json', encoding: 'utf8' }).status === 0,
  'fail-open: bad JSON payload',
);
const outside = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'nobmad-'));
ok(
  run('Edit', { file_path: 'x' }, 'sess-4', { cwd: outside }).code === 0,
  'fail-open: outside BMad project',
);
fs.appendFileSync(
  T,
  '\n' + tool('Read', { file_path: path.join(ROOT, '.bmad-core', 'tasks', 'review-pr.md') }),
);
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
fs.cpSync(G, broken, { recursive: true });
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

// 4i. performance: 20k-line transcript, cold then warm
const bigT = path.join(ROOT, 'big.jsonl');
const bigLines = [];
for (let i = 0; i < 20000; i++) bigLines.push(user('msg ' + i + ' ' + 'x'.repeat(200)));
bigLines.push(tool('Read', { file_path: path.join(ROOT, '.bmad-core', 'tasks', 'review-pr.md') }));
fs.writeFileSync(bigT, bigLines.join('\n'));
const t0 = Date.now();
const cold = spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({
    session_id: 'big',
    transcript_path: bigT,
    cwd: ROOT,
    tool_name: 'Edit',
    tool_input: { file_path: 'x' },
  }),
  encoding: 'utf8',
});
const coldMs = Date.now() - t0;
const t1 = Date.now();
const warm = spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify({
    session_id: 'big',
    transcript_path: bigT,
    cwd: ROOT,
    tool_name: 'Edit',
    tool_input: { file_path: 'x' },
  }),
  encoding: 'utf8',
});
const warmMs = Date.now() - t1;
ok(
  cold.status === 2 && warm.status === 2,
  'perf: 20k-line transcript, review detected cold + warm',
);
ok(coldMs < 1500 && warmMs < 1500, `perf: cold ${coldMs}ms, warm ${warmMs}ms (both < 1.5s)`);
console.log(`   timing: cold ${coldMs}ms, warm ${warmMs}ms`);

console.log(`\n${total - fails}/${total} passed` + (fails ? ` — ${fails} FAILED` : ' — ALL PASS'));
process.exit(fails ? 1 : 0);
