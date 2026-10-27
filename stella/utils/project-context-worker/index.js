'use strict';

// project-context-worker — generates the per-machine project context in the background.
// Started detached by the installer when _bmad-output/stella/project-context/context.md is
// missing. Runs the stella-project-context skill headless:
//   claude -p "/stella-project-context setup" --permission-mode dontAsk ...
// with edits allowed only under the context folder, read-only git, and the skill's own
// check script. Then runs that check script once more itself and logs everything to
//   _bmad-output/stella/project-context/.state/worker.log
// Zero dependencies. Usage: node index.js <project-root>
//
// Exit codes: 0 ok, 1 claude failed or timed out or the check failed, 10 usage,
// 20 another worker is running, 30 claude command not found.

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const EXIT_CODES = Object.freeze({ OK: 0, FAILED: 1, USAGE: 10, RUNNING: 20, NO_CLAUDE: 30 });
const CONTEXT_DIR = ['_bmad-output', 'stella', 'project-context'];
const STATE_DIR = [...CONTEXT_DIR, '.state'];
const LOG_FILE = 'worker.log';
const LOCK_FILE = 'worker.lock';
const CHECK_SCRIPT = '.claude/skills/stella-project-context/scripts/check-context.js';
const PROMPT = '/stella-project-context setup';
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes, then the claude process is killed
const MAX_TURNS = 400;
// Shell commands the skill may run. Each is allowed in both shell tools: on Windows
// Claude Code may pick PowerShell, and under dontAsk an unlisted call is refused.
const SHELL_COMMANDS = Object.freeze([
  'git log *',
  'git rev-parse *',
  'git ls-files *',
  'git status *',
  `node ${CHECK_SCRIPT}`,
  `node ${CHECK_SCRIPT} *`,
]);
const ALLOWED_TOOLS = Object.freeze([
  'Edit(_bmad-output/stella/project-context/**)',
  ...SHELL_COMMANDS.map((c) => `Bash(${c})`),
  ...SHELL_COMMANDS.map((c) => `PowerShell(${c})`),
]);
const DISALLOWED_TOOLS = Object.freeze(['WebFetch', 'WebSearch', 'NotebookEdit']);

const contextDir = (root) => path.join(root, ...CONTEXT_DIR);
const stateDir = (root) => path.join(root, ...STATE_DIR);
const logFile = (root) => path.join(stateDir(root), LOG_FILE);
const lockFile = (root) => path.join(stateDir(root), LOCK_FILE);
const LOG_LABEL = [...STATE_DIR, LOG_FILE].join('/');

/** The exact command line. Fixed literals only, so a shell string is safe. */
function command() {
  const quoted = (s) => `"${s}"`;
  return [
    'claude',
    '-p',
    quoted(PROMPT),
    '--permission-mode',
    'dontAsk',
    '--output-format',
    'json',
    '--max-turns',
    String(MAX_TURNS),
    '--allowedTools',
    ...ALLOWED_TOOLS.map(quoted),
    '--disallowedTools',
    ...DISALLOWED_TOOLS,
  ].join(' ');
}

function makeLogger(root) {
  fs.mkdirSync(stateDir(root), { recursive: true });
  const file = logFile(root);
  return (message) => {
    try {
      fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
    } catch {
      // never fail the worker over logging
    }
  };
}

function claudeOnPath(spawnSyncImpl = spawnSync) {
  try {
    const r = spawnSyncImpl('claude --version', {
      shell: true,
      windowsHide: true,
      encoding: 'utf8',
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

function takeLock(root, now = Date.now(), timeoutMs = TIMEOUT_MS) {
  const file = lockFile(root);
  try {
    const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (now - Date.parse(lock.startedAt) < timeoutMs) return false;
  } catch {
    // no lock or unreadable: take it
  }
  fs.writeFileSync(
    file,
    JSON.stringify({ pid: process.pid, startedAt: new Date(now).toISOString() }),
  );
  return true;
}

function releaseLock(root) {
  try {
    fs.unlinkSync(lockFile(root));
  } catch {
    // already gone
  }
}

function runClaude(root, { spawnImpl = spawn, timeoutMs = TIMEOUT_MS, log }) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawnImpl(command(), {
        cwd: root,
        env: { ...process.env, BMAD_HOOK_SUBPROCESS: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: true,
      });
    } catch (error) {
      log(`claude: spawn failed: ${error.message}`);
      resolve({ ok: false, code: null, envelope: null, timedOut: false });
      return;
    }
    let out = '';
    let err = '';
    let timedOut = false;
    const started = Date.now();
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
      log(`claude: timed out after ${Math.round(timeoutMs / 60_000)} minutes, process killed`);
    }, timeoutMs);
    proc.stdout.on('data', (c) => (out += c));
    proc.stderr.on('data', (c) => (err += c));
    proc.on('error', (error) => {
      clearTimeout(timer);
      log(`claude: spawn error: ${error.message}`);
      resolve({ ok: false, code: null, envelope: null, timedOut: false });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const seconds = Math.round((Date.now() - started) / 1000);
      let envelope = null;
      try {
        envelope = JSON.parse(out);
      } catch {
        // not JSON: logged below
      }
      if (timedOut) {
        resolve({ ok: false, code, envelope, timedOut: true });
        return;
      }
      log(`claude: exit ${code} after ${seconds}s`);
      if (envelope) {
        const bits = [];
        if (envelope.num_turns !== undefined) bits.push(`turns ${envelope.num_turns}`);
        if (envelope.total_cost_usd !== undefined) bits.push(`cost $${envelope.total_cost_usd}`);
        if (bits.length > 0) log(`claude: ${bits.join(', ')}`);
        if (typeof envelope.result === 'string' && envelope.result.trim()) {
          log(`claude: result\n${envelope.result.trim()}`);
        }
      } else if (out.trim()) {
        log(`claude: output (not JSON)\n${out.trim().slice(0, 4000)}`);
      }
      if (err.trim()) log(`claude: stderr\n${err.trim().slice(0, 2000)}`);
      resolve({ ok: code === 0 && !(envelope && envelope.is_error), code, envelope, timedOut });
    });
  });
}

function runCheck(root, { spawnSyncImpl = spawnSync, log }) {
  const script = path.join(root, ...CHECK_SCRIPT.split('/'));
  if (!fs.existsSync(script)) {
    log(`check: script missing at ${CHECK_SCRIPT}`);
    return false;
  }
  const r = spawnSyncImpl(process.execPath, [script, root], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const text = `${r.stdout || ''}${r.stderr || ''}`.trim();
  log(`check: exit ${r.status}${text ? `\n${text}` : ''}`);
  return r.status === 0;
}

/**
 * Whole run. Returns an exit code.
 * @param {string} root project root (the folder holding _bmad)
 */
async function run(
  root,
  { spawnImpl, spawnSyncImpl, timeoutMs = TIMEOUT_MS, now = Date.now() } = {},
) {
  if (!root || !fs.existsSync(path.join(root, '_bmad'))) return EXIT_CODES.USAGE;
  const log = makeLogger(root);
  if (!claudeOnPath(spawnSyncImpl)) {
    log('claude command not found; run /stella-project-context once in Claude Code');
    return EXIT_CODES.NO_CLAUDE;
  }
  if (!takeLock(root, now, timeoutMs)) {
    log('another worker is still running; exiting');
    return EXIT_CODES.RUNNING;
  }
  const killTimer = setTimeout(() => {
    log('worker: exceeded max runtime, exiting');
    releaseLock(root);
    process.exit(EXIT_CODES.FAILED);
  }, timeoutMs + 60_000);
  killTimer.unref();
  try {
    log(`start: ${root}`);
    log(`command: ${command()}`);
    const claude = await runClaude(root, { spawnImpl, timeoutMs, log });
    if (!claude.ok) {
      log(claude.timedOut ? 'done: timed out' : 'done: claude failed');
      return EXIT_CODES.FAILED;
    }
    const checked = runCheck(root, { spawnSyncImpl, log });
    log(
      checked
        ? `done: context written and verified in ${CONTEXT_DIR.join('/')}`
        : 'done: context unverified',
    );
    return checked ? EXIT_CODES.OK : EXIT_CODES.FAILED;
  } finally {
    clearTimeout(killTimer);
    releaseLock(root);
  }
}

async function main(argv = process.argv.slice(2)) {
  const root = argv[0] ? path.resolve(argv[0]) : null;
  if (!root) {
    process.stderr.write('Usage: node index.js <project-root>\n');
    return EXIT_CODES.USAGE;
  }
  return run(root);
}

module.exports = {
  main,
  run,
  command,
  claudeOnPath,
  takeLock,
  releaseLock,
  contextDir,
  logFile,
  lockFile,
  EXIT_CODES,
  ALLOWED_TOOLS,
  DISALLOWED_TOOLS,
  PROMPT,
  TIMEOUT_MS,
  MAX_TURNS,
  LOG_LABEL,
};

if (require.main === module) {
  main().then((code) => process.exit(code));
}
