'use strict';

// Migration Task 4 — scratch sandbox (pure-computation verification scripts) on the v6 layout.
// Ported from tests/legacy-scratch/pr-review-guard/test-scratch.js.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const G = path.join(REPO, 'stella', 'hooks', 'project', 'pr-review-guard');
const HOOK = path.join(G, 'pre-tool-use.js');
const { decide, checkBash, isScratchFile, unsafeScriptReason } = require(
  path.join(G, 'lib', 'policy.js'),
);

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

const REV = '_bmad-output/stella/reviewer';
const SCR = `${REV}/.scratch/`;
const files = {}; // fake filesystem for readScript
const readScript = (p) =>
  p.replaceAll('\\', '/') in files ? files[p.replaceAll('\\', '/')] : null;

// ================= 1. scratch path rules =================
ok(isScratchFile(SCR + 'check.js'), 'scratch: file in .scratch');
ok(
  isScratchFile('C:\\p\\_bmad-output\\stella\\reviewer\\.scratch\\check.py'),
  'scratch: windows abs path',
);
ok(!isScratchFile(SCR + 'sub/check.js'), 'scratch: no subfolders');
ok(!isScratchFile(SCR + '../x.js'), 'scratch: no traversal');
ok(!isScratchFile(`${REV}/check.js`), 'scratch: reviewer root is not scratch');
ok(!isScratchFile('_bmad-output/stella/.scratch/check.js'), 'scratch: wrong parent');
ok(!isScratchFile('bmad-docs/reviewer/.scratch/check.js'), 'scratch: old v4 path rejected');

// ================= 2. Write policy =================
ok(
  decide('Write', { file_path: SCR + 'check.js', content: 'console.log((0.1+0.2).toFixed(2))' })
    .allow,
  'write: pure js to scratch',
);
ok(
  decide('Write', {
    file_path: SCR + 'check.py',
    content: 'from decimal import Decimal\nprint(Decimal("0.1")+Decimal("0.2"))',
  }).allow,
  'write: pure py (decimal) to scratch',
);
ok(
  decide('Write', {
    file_path: SCR + 'check.js',
    content:
      'const c=require("crypto");console.log(c.createHash("sha256").update("x").digest("hex"))',
  }).allow,
  'write: crypto allowed',
);
ok(
  !decide('Write', {
    file_path: SCR + 'check.js',
    content: 'const fs=require("fs");fs.readFileSync(".env")',
  }).allow,
  'write: blocks require(fs)',
);
ok(
  !decide('Write', {
    file_path: SCR + 'check.js',
    content: 'const {execSync}=require("node:child_process")',
  }).allow,
  'write: blocks node:child_process',
);
ok(
  !decide('Write', { file_path: SCR + 'check.mjs', content: 'import fs from "fs"' }).allow,
  'write: blocks ESM import fs',
);
ok(
  !decide('Write', { file_path: SCR + 'check.js', content: 'fetch("http://evil")' }).allow,
  'write: blocks fetch',
);
ok(
  !decide('Write', { file_path: SCR + 'check.js', content: 'eval("1+1")' }).allow,
  'write: blocks eval',
);
ok(
  !decide('Write', {
    file_path: SCR + 'check.js',
    content: 'console.log(process.env.JIRA_API_TOKEN)',
  }).allow,
  'write: blocks process.env',
);
ok(
  !decide('Write', { file_path: SCR + 'check.js', content: 'await import("fs")' }).allow,
  'write: blocks dynamic import',
);
ok(
  !decide('Write', { file_path: SCR + 'check.py', content: 'import os\nos.system("rm -rf /")' })
    .allow,
  'write: blocks python import os',
);
ok(
  !decide('Write', { file_path: SCR + 'check.py', content: 'import subprocess' }).allow,
  'write: blocks subprocess',
);
ok(
  !decide('Write', { file_path: SCR + 'check.py', content: 'open(".env").read()' }).allow,
  'write: blocks open()',
);
ok(
  !decide('Write', { file_path: SCR + 'check.py', content: '__import__("os")' }).allow,
  'write: blocks __import__',
);
ok(
  !decide('Write', { file_path: SCR + 'check.py', content: 'from urllib import request' }).allow,
  'write: blocks urllib',
);
ok(
  decide('Write', {
    file_path: SCR + 'check.py',
    content: 'import re, json, math\nfrom datetime import datetime',
  }).allow,
  'write: re/json/math/datetime allowed',
);
ok(
  !decide('Write', { file_path: SCR + 'sub/x.js', content: '1' }).allow,
  'write: scratch subfolder blocked',
);
ok(!decide('Write', { file_path: 'src/x.js', content: '1' }).allow, 'write: source still blocked');
ok(
  decide('Write', { file_path: `${REV}/r-pr1/review.md`, content: '# x' }).allow,
  'write: findings still allowed',
);

// ================= 3. Bash: script runs =================
files[SCR + 'pure.js'] = 'console.log(new Date("2026-02-28").getTime())';
files[SCR + 'bad.js'] = 'require("fs")';
files[SCR + 'pure.py'] = 'print(round(2.675, 2))';
files[SCR + 'bad.py'] = 'import socket';
const bash = (c) => checkBash(c, readScript);
ok(bash(`node ${SCR}pure.js`).allow, 'run: node pure scratch file');
ok(bash(`python ${SCR}pure.py`).allow, 'run: python pure scratch file');
ok(bash(`python3 ${SCR}pure.py`).allow, 'run: python3 pure scratch file');
ok(bash(`node "${SCR}pure.js"`).allow, 'run: quoted path');
ok(!bash(`node ${SCR}bad.js`).allow, 'run: node file with require(fs) blocked');
ok(!bash(`python ${SCR}bad.py`).allow, 'run: python file with import socket blocked');
ok(!bash(`node ${SCR}missing.js`).allow, 'run: missing file blocked');
ok(!bash('node src/index.js').allow, 'run: file outside scratch blocked');
ok(!bash(`node ${REV}/x.js`).allow, 'run: reviewer root (not scratch) blocked');
ok(!bash(`node ${SCR}pure.js --flag`).allow, 'run: extra arg blocked');
ok(!bash(`node -r fs ${SCR}pure.js`).allow, 'run: -r preload blocked');
ok(!bash(`node --require fs ${SCR}pure.js`).allow, 'run: --require blocked');
ok(!bash('node').allow, 'run: bare node (REPL) blocked');
ok(!bash('python').allow, 'run: bare python blocked');
ok(!bash(`node ${SCR}pure.js && git push`).allow, 'run: compound still blocked');

// ================= 4. Bash: inline =================
ok(bash('node -e "console.log((0.1+0.2).toFixed(2))"').allow, 'inline: node -e math');
ok(bash('node -p "new Date(2026,1,29).toISOString()"').allow, 'inline: node -p date');
ok(bash(`node -e "console.log(/^[A-Z]+-\\d+$/.test('AIL-518'))"`).allow, 'inline: regex test');
ok(
  bash(`node -e "const a=[3,1,2];a.sort((x,y)=>x-y);console.log(a)"`).allow,
  'inline: sort with ; inside quotes',
);
ok(
  bash(`node -e "console.log(JSON.parse('{\\"a\\":1}').a)"`).allow,
  'inline: JSON with escaped quotes',
);
ok(bash('python -c "print(round(2.675,2))"').allow, 'inline: python -c');
ok(
  bash("python3 -c \"from decimal import Decimal; print(Decimal('0.1')+Decimal('0.2'))\"").allow,
  'inline: python3 decimal',
);
ok(
  !bash("node -e \"require('child_process').execSync('git push')\"").allow,
  'inline: child_process blocked',
);
ok(!bash('node -e "fetch(\'http://x\')"').allow, 'inline: fetch blocked');
ok(!bash('node -e "console.log(process.env)"').allow, 'inline: process.env blocked');
ok(!bash('python -c "import os; os.system(\'ls\')"').allow, 'inline: python os blocked');
ok(!bash('python -c "print(open(\'.env\').read())"').allow, 'inline: open() blocked');
ok(!bash('node -e "1" extra').allow, 'inline: extra arg blocked');
ok(!bash('node --input-type=module -e "1"').allow, 'inline: extra flag blocked');
ok(!bash('node -e "1" | cat').allow, 'inline: pipe blocked');

// ================= 5. unsafeScriptReason sanity =================
ok(unsafeScriptReason('const x = 1 + 1') === null, 'pure: plain math');
ok(unsafeScriptReason('const fsx = 1') === null, 'pure: identifier containing fs is fine');
ok(unsafeScriptReason('// uses fs? no') === null, 'pure: word fs in comment is fine');
ok(unsafeScriptReason('const opened = true') === null, 'pure: "opened" is not open(');
ok(/fs, child_process/.test(unsafeScriptReason('require("fs")')), 'reason names the module family');

// ================= 6. end-to-end: scratch lifecycle =================
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-t4-scratch-'));
fs.mkdirSync(path.join(ROOT, '_bmad'), { recursive: true });
const T = path.join(ROOT, 't.jsonl');
const SCRATCH = path.join(ROOT, '_bmad-output', 'stella', 'reviewer', '.scratch');
const line = (o) => JSON.stringify(o);
const user = (t) => line({ type: 'user', message: { content: t } });
const tool = (name, input) =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
function run(toolName, toolInput, sessionId = 's1') {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({
      session_id: sessionId,
      transcript_path: T,
      cwd: ROOT,
      tool_name: toolName,
      tool_input: toolInput,
    }),
    encoding: 'utf8',
    env: { ...process.env, STELLA_GUARD_OFF: '' },
  });
  return { code: r.status, err: r.stderr };
}

// stale scratch from a previous session exists
fs.mkdirSync(SCRATCH, { recursive: true });
fs.writeFileSync(path.join(SCRATCH, 'old.js'), 'require("fs")');
// review starts (Skill tool call)
fs.writeFileSync(T, [user('hi'), tool('Skill', { skill: 'stella-pr-review' })].join('\n'));
ok(
  run('Bash', { command: 'gh pr view 1 --json title' }).code === 0 &&
    !fs.existsSync(path.join(SCRATCH, 'old.js')),
  'e2e: review start wipes stale scratch',
);

// agent writes a pure script, runs it
const scriptRel = `${SCR}check.js`;
ok(
  run('Write', {
    file_path: path.join(ROOT, scriptRel),
    content: 'console.log((0.1+0.2).toFixed(2))',
  }).code === 0,
  'e2e: write pure scratch script allowed',
);
fs.mkdirSync(SCRATCH, { recursive: true });
fs.writeFileSync(path.join(SCRATCH, 'check.js'), 'console.log((0.1+0.2).toFixed(2))');
ok(
  run('Bash', { command: `node ${scriptRel}` }).code === 0,
  'e2e: run pure scratch script (relative path) allowed',
);
ok(
  run('Bash', { command: `node ${path.join(ROOT, scriptRel)}` }).code === 0,
  'e2e: run pure scratch script (absolute path) allowed',
);
ok(run('Bash', { command: 'node -e "console.log(1+1)"' }).code === 0, 'e2e: inline allowed');

// file is swapped for an unsafe one after write -> run-time check catches it
fs.writeFileSync(path.join(SCRATCH, 'check.js'), 'require("child_process").execSync("git push")');
let r = run('Bash', { command: `node ${scriptRel}` });
ok(r.code === 2 && /child_process/.test(r.err), 'e2e: unsafe file content blocked at run time');
r = run('Write', { file_path: path.join(ROOT, scriptRel), content: 'require("fs")' });
ok(r.code === 2 && /not pure/.test(r.err), 'e2e: unsafe write blocked with reason');
ok(run('Bash', { command: 'node src/app.js' }).code === 2, 'e2e: running project code blocked');
ok(run('Bash', { command: 'npm test' }).code === 2, 'e2e: npm test still blocked');

// review ends -> scratch wiped on next hook call
fs.appendFileSync(
  T,
  '\n' +
    tool('Write', {
      file_path: path.join(ROOT, '_bmad-output', 'stella', 'reviewer', 'r-pr1', 'review.md'),
    }),
);
ok(
  run('Edit', { file_path: path.join(ROOT, 'src', 'a.cs') }).code === 0,
  'e2e: after review.md written -> Edit allowed',
);
ok(!fs.existsSync(SCRATCH), 'e2e: scratch wiped after review end');

// second review via *exit path also wipes
fs.appendFileSync(T, '\n' + user('/stella-pr-review 1'));
run('Bash', { command: 'gh pr view 1 --json title' });
fs.mkdirSync(SCRATCH, { recursive: true });
fs.writeFileSync(path.join(SCRATCH, 'x.js'), '1');
fs.appendFileSync(T, '\n' + user('*exit'));
run('Bash', { command: 'npm test' });
ok(!fs.existsSync(SCRATCH), 'e2e: scratch wiped after *exit');

console.log(
  `pr-review-guard scratch: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
