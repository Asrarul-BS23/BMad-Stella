'use strict';

// project-context-worker — runs the stella-project-context skill headless after install.
// Checks: the fixed command line (prompt, dontAsk, allow list limited to the context
// folder, read-only git and the check script), the lock, and the whole run against a
// fake `claude` on PATH: success with valid files → 0 and a log with the result; claude
// failure → 1; check failure → 1; timeout → 1 and the process killed; missing claude → 30;
// bad root → 10; second worker while locked → 20.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const WORKER = path.join(REPO, 'stella', 'utils', 'project-context-worker', 'index.js');
const CHECK = path.join(
  REPO,
  'stella',
  'skills',
  'stella-project-context',
  'scripts',
  'check-context.js',
);
const worker = require(WORKER);

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const win = process.platform === 'win32';
const CTX = ['_bmad-output', 'stella', 'project-context'];
const PROV =
  '<!-- Verified 2026-10-27 against abc1234. Managed by stella-project-context; refresh re-verifies every line. -->';

// ---- command line ----
{
  const cmd = worker.command();
  ok(cmd.startsWith('claude -p "/stella-project-context setup"'), 'command: prompt is the skill');
  ok(/--permission-mode dontAsk/.test(cmd), 'command: dontAsk, never prompts');
  ok(/--output-format json/.test(cmd), 'command: json envelope');
  ok(/--max-turns 400/.test(cmd), 'command: turn cap');
  ok(
    /"Edit\(_bmad-output\/stella\/project-context\/\*\*\)"/.test(cmd) &&
      !/Edit\(\*\*\)|Write\(/.test(cmd),
    'command: edits only under the context folder',
  );
  ok(
    /"Bash\(git log \*\)"/.test(cmd) &&
      /"Bash\(git rev-parse \*\)"/.test(cmd) &&
      /"Bash\(git ls-files \*\)"/.test(cmd),
    'command: read-only git allowed',
  );
  ok(!/Bash\(git (add|commit|push)/.test(cmd), 'command: no git writes');
  ok(
    worker.ALLOWED_TOOLS.filter((t) => t.startsWith('Bash(')).every((t) =>
      worker.ALLOWED_TOOLS.includes(t.replace(/^Bash/, 'PowerShell')),
    ) && worker.ALLOWED_TOOLS.some((t) => t.startsWith('PowerShell(node ')),
    'command: every shell rule has a PowerShell twin',
  );
  ok(!/PowerShell\(git (add|commit|push)/.test(cmd), 'command: no git writes in PowerShell either');
  ok(
    /"Bash\(node \.claude\/skills\/stella-project-context\/scripts\/check-context\.js \*\)"/.test(
      cmd,
    ),
    'command: check script allowed',
  );
  ok(
    /--disallowedTools WebFetch WebSearch NotebookEdit/.test(cmd),
    'command: web and notebook tools denied',
  );
  ok(!/--bare/.test(cmd), 'command: never --bare (skills would not load)');
  ok(worker.TIMEOUT_MS === 30 * 60 * 1000, 'constants: 30-minute ceiling');
  ok(
    worker.LOG_LABEL === '_bmad-output/stella/project-context/.state/worker.log',
    'constants: log path',
  );
}

// ---- fixture root with a fake claude on PATH ----
function makeRoot({ withContext = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-worker-'));
  fs.mkdirSync(path.join(root, '_bmad'));
  fs.mkdirSync(path.join(root, '.claude', 'skills', 'stella-project-context', 'scripts'), {
    recursive: true,
  });
  fs.copyFileSync(
    CHECK,
    path.join(root, '.claude', 'skills', 'stella-project-context', 'scripts', 'check-context.js'),
  );
  fs.mkdirSync(path.join(root, ...CTX), { recursive: true });
  if (withContext) {
    fs.writeFileSync(path.join(root, ...CTX, 'context.md'), `${PROV}\n\n# demo\n`);
  }
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  return { root, bin };
}
const fakeClaude = (bin, body) =>
  fs.writeFileSync(path.join(bin, win ? 'claude.cmd' : 'claude'), body, { mode: 0o755 });
const envelope = (result) =>
  JSON.stringify({ is_error: false, result, num_turns: 7, total_cost_usd: 0.42 });
// every fake answers `claude --version` with exit 0 first, as the real CLI does
const VERSION_OK = win
  ? '@echo off\r\nif "%1"=="--version" (echo 1.0.0 & exit /b 0)\r\n'
  : '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1.0.0; exit 0; fi\n';
const scriptOk = (result) =>
  win ? `${VERSION_OK}echo ${envelope(result)}\r\n` : `${VERSION_OK}echo '${envelope(result)}'\n`;
const scriptFail = win ? `${VERSION_OK}exit /b 2\r\n` : `${VERSION_OK}exit 2\n`;
const scriptSleep = win ? `${VERSION_OK}ping -n 4 127.0.0.1 >nul\r\n` : `${VERSION_OK}sleep 3\n`;
const runCli = (root, bin, extraEnv = {}) =>
  spawnSync(process.execPath, [WORKER, root], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: bin + path.delimiter + process.env.PATH,
      Path: bin + path.delimiter + (process.env.Path || ''),
      ...extraEnv,
    },
  });
const readLog = (root) => fs.readFileSync(path.join(root, ...CTX, '.state', 'worker.log'), 'utf8');

// ---- success ----
{
  const { root, bin } = makeRoot();
  fakeClaude(bin, scriptOk('Both files written. ok'));
  const r = runCli(root, bin);
  ok(r.status === 0, `run: success → 0 (${r.status} ${r.stderr})`);
  const log = readLog(root);
  ok(/^\[\d{4}-\d{2}-\d{2}T[^\]]+\] start: /m.test(log), 'log: start line with timestamp');
  ok(/command: claude -p "\/stella-project-context setup"/.test(log), 'log: command recorded');
  ok(/claude: exit 0 after \d+s/.test(log), 'log: claude exit and duration');
  ok(/turns 7, cost \$0\.42/.test(log), 'log: turns and cost from the envelope');
  ok(/claude: result\nBoth files written\. ok/.test(log), 'log: the skill report');
  ok(/check: exit 0\nok/.test(log), 'log: check script ran and passed');
  ok(/done: context written and verified/.test(log), 'log: done line');
  ok(!fs.existsSync(path.join(root, ...CTX, '.state', 'worker.lock')), 'lock: released');
}

// ---- claude fails ----
{
  const { root, bin } = makeRoot();
  fakeClaude(bin, scriptFail);
  const r = runCli(root, bin);
  ok(r.status === 1, `run: claude non-zero → 1 (${r.status})`);
  ok(
    /claude: exit 2/.test(readLog(root)) && /done: claude failed/.test(readLog(root)),
    'log: failure recorded',
  );
}

// ---- check fails (claude "succeeds" but files are missing) ----
{
  const { root, bin } = makeRoot({ withContext: false });
  fakeClaude(bin, scriptOk('said done but wrote nothing'));
  const r = runCli(root, bin);
  ok(r.status === 1, `run: check failure → 1 (${r.status})`);
  ok(
    /check: exit 1\nFAIL: /.test(readLog(root)) && /done: context unverified/.test(readLog(root)),
    'log: unverified',
  );
}

// ---- timeout (in-process, short ceiling) ----
await_timeout();
async function await_timeout() {
  const { root, bin } = makeRoot();
  fakeClaude(bin, scriptSleep);
  const saved = { PATH: process.env.PATH, Path: process.env.Path };
  process.env.PATH = bin + path.delimiter + process.env.PATH;
  process.env.Path = bin + path.delimiter + (process.env.Path || '');
  const code = await worker.run(root, { timeoutMs: 500 });
  process.env.PATH = saved.PATH;
  process.env.Path = saved.Path;
  ok(code === 1, `run: timeout → 1 (${code})`);
  ok(
    /timed out after 0 minutes, process killed/.test(readLog(root)) &&
      /done: timed out/.test(readLog(root)),
    'log: timeout recorded',
  );
  afterTimeout();
}

function afterTimeout() {
  // ---- claude missing ----
  {
    const { root, bin } = makeRoot();
    const r = runCli(root, bin, { PATH: bin, Path: bin });
    ok(r.status === 30, `run: no claude → 30 (${r.status})`);
    ok(/claude command not found/.test(readLog(root)), 'log: names the fix');
  }

  // ---- bad root / usage ----
  {
    const r = spawnSync(process.execPath, [WORKER], { encoding: 'utf8' });
    ok(r.status === 10 && /Usage/.test(r.stderr), 'run: no argument → 10');
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-plain-'));
    const r2 = spawnSync(process.execPath, [WORKER, plain], { encoding: 'utf8' });
    ok(r2.status === 10, 'run: folder without _bmad → 10');
  }

  // ---- lock ----
  {
    const { root } = makeRoot();
    fs.mkdirSync(path.join(root, ...CTX, '.state'), { recursive: true });
    ok(worker.takeLock(root, Date.now()), 'lock: taken when absent');
    ok(!worker.takeLock(root, Date.now()), 'lock: refused while fresh');
    ok(worker.takeLock(root, Date.now() + worker.TIMEOUT_MS + 1), 'lock: stale lock taken over');
    worker.releaseLock(root);
    ok(!fs.existsSync(worker.lockFile(root)), 'lock: released');
  }
  {
    const { root, bin } = makeRoot();
    fakeClaude(bin, scriptOk('x'));
    fs.mkdirSync(path.join(root, ...CTX, '.state'), { recursive: true });
    worker.takeLock(root, Date.now());
    const r = runCli(root, bin);
    ok(r.status === 20, `run: locked → 20 (${r.status})`);
  }

  console.log(
    `project-context worker: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
  );
  process.exit(fails ? 1 : 0);
}
