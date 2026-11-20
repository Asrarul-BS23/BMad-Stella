'use strict';

// TEA skill install, right after the BMad step (plan: tea-module/integration-steps.md).
// Pinned via `owner/repo@tag` (a git ref — confirmed from the `skills` CLI's own
// `Source: ...git @<tag>` output). Fail-hard: a non-zero exit here aborts the whole
// install, same mechanism as the BMad step itself (the caller decides that, not this
// module). `spawn`, `log` and `write` are injectable for tests.

const { spawnSync } = require('node:child_process');
const { TEA_SKILL_PACKAGE, TEA_SKILL_INSTALL_FLAGS } = require('./constants');
const { quoteArg } = require('./bmad-runner');

const TAIL_LINES = 40;

/** The exact argument list after `npx`. */
function buildArgs({ copy = false } = {}) {
  const f = TEA_SKILL_INSTALL_FLAGS;
  const args = ['-y', 'skills', 'add', TEA_SKILL_PACKAGE, '--agent', f.agent, '--skill', f.skill];
  // `copy`: real folders instead of links, so the skills can be copied on to
  // ~/.claude/skills/ (the user-level template build in machine-setup.js).
  if (copy) args.push('--copy');
  return [...args, '-y'];
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
 * Runs the TEA skill install in `root`. Returns the exit status; the caller
 * (installer.js) decides how to treat a non-zero one.
 * @param {object} opts verbose, copy, spawn, log, write, now
 */
function install(
  root,
  {
    verbose = false,
    copy = false,
    spawn = spawnSync,
    log = console.log,
    write = (s) => process.stdout.write(s),
    now = Date.now,
  } = {},
) {
  const args = buildArgs({ copy });
  const cmd = commandLine(args);

  if (verbose) {
    log(`Running: ${cmd}`);
    const r = spawn(cmd, { cwd: root, stdio: 'inherit', shell: true });
    if (r.error) throw r.error;
    return r.status ?? 1;
  }

  write('Installing TEA skills ... ');
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
    log('--- last lines of TEA skill install output ---');
    for (const l of lines) log(`  ${l}`);
    log('---');
  }
  return status;
}

module.exports = { install, buildArgs, commandLine, tail };
