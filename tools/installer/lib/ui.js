'use strict';

// Terminal look of the installer ("stepper", user pick 2026-10-15): boxed header,
// five numbered steps that settle to ✔ (spinner while a non-interactive step runs),
// dim detail lines, and a boxed Next panel with one sentence. chalk + ora only.
// `silentUi()` is the no-op twin used by tests and by callers that print nothing.

const chalk = require('chalk').default || require('chalk');
const ora = require('ora');

const STEP_LABELS = ['Checks', 'JIRA', 'Project', 'BMad', 'Stella layer'];
const LABEL_WIDTH = 14;
const INDENT = '  ';
const MIN_BOX_WIDTH = 46;

const NEXT_TEXT = ['Check your Claude account connectors:', 'Atlassian must be connected.'];

function stepLabel(n, bmadVersion) {
  const label = n === 4 ? `BMad ${bmadVersion}` : STEP_LABELS[n - 1];
  return `[${n}/${STEP_LABELS.length}] ${label.padEnd(LABEL_WIDTH)}`;
}

/** Rounded box around `lines`; width = longest line (min MIN_BOX_WIDTH). */
function box(lines, { title = '' } = {}) {
  const inner = Math.max(MIN_BOX_WIDTH, ...lines.map((l) => l.length + 4));
  const top = title
    ? `╭─ ${title} ${'─'.repeat(Math.max(0, inner - title.length - 3))}╮`
    : `╭${'─'.repeat(inner)}╮`;
  const body = lines.map((l) => `│  ${l.padEnd(inner - 2)}│`);
  return [top, ...body, `╰${'─'.repeat(inner)}╯`];
}

function createUi({ version, bmadVersion, stream = process.stdout } = {}) {
  const write = (s) => stream.write(s + '\n');
  const line = (n, mark, detail) => `${INDENT}${stepLabel(n, bmadVersion)}${mark} ${detail}`;

  return {
    header(root) {
      write('');
      for (const l of box([`BMad-Stella ${version}  ·  BMad ${bmadVersion}`, root]))
        write(INDENT + chalk.cyan(l));
      write('');
    },
    /** Interactive step: prompts come first, then this one settled line. */
    done(n, detail) {
      write(line(n, chalk.green('✔'), detail));
    },
    fail(n, detail) {
      write(line(n, chalk.red('✖'), detail));
    },
    /** Non-interactive step: spinner that settles to ✔ or ✖. */
    spin(n, text) {
      // Without a TTY ora would print a "- text" line that never settles; stay silent
      // there and let the ✔/✖ line be the only output for the step.
      const spinner = ora({
        text: `${stepLabel(n, bmadVersion)}  ${text}`,
        indent: 2,
        stream,
        isSilent: !stream.isTTY,
      }).start();
      return {
        update(t) {
          spinner.text = `${stepLabel(n, bmadVersion)}  ${t}`;
        },
        succeed(detail) {
          spinner.stop();
          write(line(n, chalk.green('✔'), detail));
        },
        fail(detail) {
          spinner.stop();
          write(line(n, chalk.red('✖'), detail));
        },
      };
    },
    dim(text) {
      write(chalk.dim(`${INDENT}${' '.repeat(stepLabel(1, bmadVersion).length)}  ${text}`));
    },
    warn(text) {
      write(chalk.yellow(`${INDENT}! ${text}`));
    },
    next() {
      write('');
      for (const l of box(NEXT_TEXT, { title: 'Next' })) write(INDENT + chalk.green(l));
      write('');
    },
    error(message) {
      write(chalk.red(`${INDENT}✖ ${message}`));
    },
  };
}

function silentUi() {
  const noop = () => {};
  const handle = { update: noop, succeed: noop, fail: noop };
  return {
    header: noop,
    done: noop,
    fail: noop,
    spin: () => handle,
    dim: noop,
    warn: noop,
    next: noop,
    error: noop,
  };
}

module.exports = { createUi, silentUi, box, stepLabel, NEXT_TEXT, STEP_LABELS };
