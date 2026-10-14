'use strict';

// Step 7 — the official BMad install, pinned. Output streams to the terminal.
// `spawn` and `run` are injectable for tests.

const { spawnSync } = require('node:child_process');
const { BMAD_PACKAGE, BMAD_INSTALL_FLAGS, USER_NAME_FALLBACK } = require('./constants');

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

/**
 * Runs the install in `root`. Returns the exit status.
 */
function install(root, { projectName, userName, spawn = spawnSync, log = console.log } = {}) {
  const args = buildArgs({ projectName, userName });
  const cmd = commandLine(args);
  log(`Running: ${cmd}`);
  const r = spawn(cmd, { cwd: root, stdio: 'inherit', shell: true });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

module.exports = { install, buildArgs, commandLine, quoteArg, gitUserName };
