'use strict';

// Terminal look of the installer, rebuilt 2026-10-15 to the user's design:
//
//   ✦ BMad·Stella  v2.0.0                     powered by BMad 6.12.2
//     C:\proj
//
//   ◆ Checks                                                    1/5
//   │ ✓ node 24.12.0   uv 0.12.23   gh 2.98.0   git 2.51.0
//   │
//   ◆ JIRA                                                      2/5
//   │ ◇ Use saved credentials dev@x.com? Yes        (inquirer line)
//   │ ✓ Signed in as Ash
//   └ Ready.  SLS is set up in proj
//
// chalk + ora only. `silentUi()` is the no-op twin used by tests.

const chalk = require('chalk').default || require('chalk');
const ora = require('ora');

const STEP_LABELS = ['Checks', 'JIRA', 'Project', 'BMad', 'Stella layer'];
const TOTAL = STEP_LABELS.length;
const MIN_WIDTH = 64;
const MAX_WIDTH = 96;

const NEXT_TITLE = 'Next: connect Atlassian';
const NEXT_TEXT = [
  'Check your Claude account connectors. Atlassian must be',
  'connected before agents can read or update JIRA.',
];

const MARK = {
  ok: chalk.green('✓'),
  warn: chalk.yellow('▲'),
  info: chalk.cyan('↻'),
  fail: chalk.red('✗'),
  note: ' ',
};

const visibleLength = (s) => String(s).replaceAll(/\u001B\[[\d;]*m/g, '').length; // eslint-disable-line no-control-regex

function stepTitle(n, bmadVersion) {
  return n === 4 ? `BMad ${bmadVersion}` : STEP_LABELS[n - 1];
}

/** `left` padded so `right` ends at the line width. */
function justify(left, right, width) {
  const gap = Math.max(2, width - visibleLength(left) - visibleLength(right));
  return `${left}${' '.repeat(gap)}${right}`;
}

/** Framed panel: ┌ title / text lines ┐ */
function panel(title, lines, width) {
  const inner = Math.max(width, ...[title, ...lines].map((l) => visibleLength(l) + 6));
  const row = (content) =>
    `│ ${content}${' '.repeat(Math.max(0, inner - visibleLength(content) - 2))}│`;
  return [
    `┌${'─'.repeat(inner - 1)}┐`,
    row(`${chalk.yellow('◆')} ${chalk.bold(title)}`),
    ...lines.map((l) => row(`  ${l}`)),
    `└${'─'.repeat(inner - 1)}┘`,
  ];
}

function createUi({ version, bmadVersion, stream = process.stdout } = {}) {
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, (stream.columns || 80) - 2));
  const write = (s) => stream.write(s + '\n');
  const bar = chalk.dim('│');

  return {
    width,
    header(root) {
      write('');
      write(
        justify(
          `${chalk.magenta('✦')} ${chalk.bold('BMad·Stella')}  ${chalk.magenta(`v${version}`)}`,
          chalk.dim('powered by BMad ') + chalk.blue(bmadVersion),
          width,
        ),
      );
      write(`  ${chalk.dim(root)}`);
      write('');
    },
    /** `◆ Label ........ n/5` */
    step(n) {
      write(
        justify(
          `${chalk.green('◆')} ${chalk.bold(stepTitle(n, bmadVersion))}`,
          chalk.dim(`${n}/${TOTAL}`),
          width,
        ),
      );
    },
    /** `│ ✓ text` (kind: ok | warn | info | fail | note); `right` is right-aligned. */
    line(kind, text, right = '') {
      const body = `${bar} ${MARK[kind] || MARK.note} ${kind === 'warn' ? chalk.yellow(text) : text}`;
      write(right ? justify(body, chalk.dim(right), width) : body);
    },
    /** Continuation under a line, indented past the mark. */
    cont(text) {
      write(`${bar}   ${chalk.dim(text)}`);
    },
    gap() {
      write(bar);
    },
    /** Spinner under the current step; settles to a ✓ or ✗ line. */
    spin(text) {
      const spinner = ora({
        prefixText: bar,
        text,
        stream,
        isSilent: !stream.isTTY,
      }).start();
      return {
        update(t) {
          spinner.text = t;
        },
        succeed(detail, right = '') {
          spinner.stop();
          this.stopped = true;
          const body = `${bar} ${MARK.ok} ${detail}`;
          write(right ? justify(body, chalk.dim(right), width) : body);
        },
        fail(detail) {
          spinner.stop();
          write(`${bar} ${MARK.fail} ${chalk.red(detail)}`);
        },
      };
    },
    /** `└ Ready.  text` */
    end(text) {
      write(`${chalk.dim('└')} ${chalk.green.bold('Ready.')}  ${text}`);
      write('');
    },
    failed(message) {
      write(`${chalk.dim('└')} ${chalk.red.bold('Failed.')}  ${chalk.red(message)}`);
      write('');
    },
    next() {
      for (const l of panel(NEXT_TITLE, NEXT_TEXT, width)) write(chalk.yellow(l));
      write('');
    },
  };
}

function silentUi() {
  const noop = () => {};
  const handle = { update: noop, succeed: noop, fail: noop };
  return {
    width: 80,
    header: noop,
    step: noop,
    line: noop,
    cont: noop,
    gap: noop,
    spin: () => handle,
    end: noop,
    failed: noop,
    next: noop,
  };
}

/** inquirer questions rendered as `│ ◇ message` lines inside the step tree. */
function styleQuestions(questions) {
  return questions.map((q) => ({
    ...q,
    prefix: `${chalk.dim('│')} ${chalk.magenta('◇')}`,
    message: chalk.bold(q.message),
  }));
}

module.exports = {
  createUi,
  silentUi,
  styleQuestions,
  justify,
  panel,
  stepTitle,
  NEXT_TITLE,
  NEXT_TEXT,
  STEP_LABELS,
};
