'use strict';

// One `npx skills add <owner/repo@tag>` step, shared by the skill packages the
// installer adds after the BMad step (TEA, BMad Builder). Pinned via
// `owner/repo@tag` (a git ref — confirmed from the `skills` CLI's own
// `Source: ...git @<tag>` output). The caller decides how to treat a non-zero
// exit. `spawn`, `log` and `write` are injectable for tests.

const { spawnSync } = require('node:child_process');
const { quoteArg } = require('./bmad-runner');

const TAIL_LINES = 40;

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
 * @param {object} spec pkg (`owner/repo@tag`), flags ({agent, skill}: `skill` is one
 *   name, `*`, or a list of names — each gets its own `--skill`), label (shown in
 *   the progress and failure lines, e.g. `TEA`)
 * @returns {{install:Function, buildArgs:Function, commandLine:Function, tail:Function}}
 */
function create({ pkg, flags, label }) {
  /** The exact argument list after `npx`. */
  function buildArgs({ copy = false } = {}) {
    const args = ['-y', 'skills', 'add', pkg, '--agent', flags.agent];
    for (const name of [flags.skill].flat()) args.push('--skill', name);
    // `copy`: real folders instead of links, so the skills can be copied on to
    // ~/.claude/skills/ (the user-level template build in machine-setup.js).
    if (copy) args.push('--copy');
    return [...args, '-y'];
  }

  /**
   * Runs the skill install in `root`. Returns the exit status.
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
    const cmd = commandLine(buildArgs({ copy }));

    if (verbose) {
      log(`Running: ${cmd}`);
      const r = spawn(cmd, { cwd: root, stdio: 'inherit', shell: true });
      if (r.error) throw r.error;
      return r.status ?? 1;
    }

    write(`Installing ${label} skills ... `);
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
      log(`--- last lines of ${label} skill install output ---`);
      for (const l of lines) log(`  ${l}`);
      log('---');
    }
    return status;
  }

  return { install, buildArgs, commandLine, tail };
}

module.exports = { create, commandLine, tail };
