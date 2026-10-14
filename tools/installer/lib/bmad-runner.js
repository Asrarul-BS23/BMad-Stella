'use strict';

// Step 7 — the official BMad install, pinned. By default BMad's own output is
// captured and the terminal shows one line ("Installing BMad 6.12.2 ... done (48s)");
// on failure the tail of that output is printed. `--verbose` streams everything.
// `spawn`, `run`, `log` and `write` are injectable for tests.

const { spawnSync } = require('node:child_process');
const {
  BMAD_VERSION,
  BMAD_PACKAGE,
  BMAD_INSTALL_FLAGS,
  USER_NAME_FALLBACK,
} = require('./constants');

const TAIL_LINES = 40;

const defaultRun = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });

/** `git config user.name`, trimmed; fallback is a constant (never the OS user name). */
function gitUserName({ run = defaultRun, cwd = process.cwd() } = {}) {
  try {
    const r = run('git', ['config', 'user.name'], { cwd });
    const name = r && r.status === 0 ? String(r.stdout || '').trim() : '';
    return name || USER_NAME_FALLBACK;
  } catch {
    return USER_NAME_FALLBACK;
  }
}

/** The exact argument list after `npx`. */
function buildArgs({ projectName, userName }) {
  const f = BMAD_INSTALL_FLAGS;
  return [
    '-y',
    BMAD_PACKAGE,
    'install',
    '--yes',
    '--tools',
    f.tools,
    '--modules',
    f.modules,
    '--no-shims',
    '--user-name',
    userName,
    '--communication-language',
    f.communicationLanguage,
    '--document-output-language',
    f.documentOutputLanguage,
    '--output-folder',
    f.outputFolder,
    '--set',
    `core.project_name=${projectName}`,
    '--set',
    `bmm.user_skill_level=${f.userSkillLevel}`,
    '--set',
    `bmm.project_knowledge=${f.projectKnowledge}`,
  ];
}

/** Quote one argument for a shell command line (needed on Windows where npx is a .cmd). */
function quoteArg(arg) {
  const s = String(arg);
  if (s === '') return '""';
  if (!/[\s"&|<>^()]/.test(s)) return s;
  return process.platform === 'win32'
    ? `"${s.replaceAll('"', '""')}"`
    : `'${s.replaceAll("'", String.raw`'\''`)}'`;
}

function commandLine(args) {
  return ['npx', ...args.map(quoteArg)].join(' ');
}

/** Last TAIL_LINES non-empty lines of the captured output, ANSI colours stripped. */
function tail(text) {
  return (
    String(text || '')
      // eslint-disable-next-line no-control-regex
      .replaceAll(/\u001B\[[\d;]*m/g, '')
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .slice(-TAIL_LINES)
  );
}

/**
 * Runs the install in `root`. Returns the exit status.
 * @param {object} opts projectName, userName, verbose, spawn, log, write, now
 */
function install(
  root,
  {
    projectName,
    userName,
    verbose = false,
    spawn = spawnSync,
    log = console.log,
    write = (s) => process.stdout.write(s),
    now = Date.now,
  } = {},
) {
  const args = buildArgs({ projectName, userName });
  const cmd = commandLine(args);

  if (verbose) {
    log(`Running: ${cmd}`);
    const r = spawn(cmd, { cwd: root, stdio: 'inherit', shell: true });
    if (r.error) throw r.error;
    return r.status ?? 1;
  }

  write(`Installing BMad ${BMAD_VERSION} ... `);
  const started = now();
  const r = spawn(cmd, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = Math.max(1, Math.round((now() - started) / 1000));
  if (r.error) {
    write(`failed (${r.error.message})\n`);
    throw r.error;
  }
  const status = r.status ?? 1;
  if (status === 0) {
    write(`done (${seconds}s)\n`);
    return 0;
  }
  write(`failed (exit ${status})\n`);
  const lines = tail(`${r.stdout || ''}\n${r.stderr || ''}`);
  if (lines.length > 0) {
    log('--- last lines of BMad output ---');
    for (const l of lines) log(`  ${l}`);
    log('---');
  }
  return status;
}

module.exports = { install, buildArgs, commandLine, quoteArg, gitUserName, tail };
