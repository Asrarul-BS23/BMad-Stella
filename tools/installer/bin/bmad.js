#!/usr/bin/env node
'use strict';

// BMad-Stella v6 installer. `install` runs in the current directory (no install-dir
// question). Steps 1-8 (Task 10): preflight → re-run detection → JIRA credentials →
// project picker → clean → BMad 6.12.2 install → .gitignore → summary.
// Steps 9-16 (Stella layer) and `uninstall` arrive in Task 11.

const path = require('node:path');
const { program } = require('commander');
const chalk = require('chalk').default || require('chalk');
const inquirer = require('inquirer').default || require('inquirer');

const { version } = require('../../../package.json');
const constants = require('../lib/constants');
const preflight = require('../lib/preflight');
const jira = require('../lib/jira-credentials-manager');
const picker = require('../lib/project-picker');
const cleaner = require('../lib/cleaner');
const runner = require('../lib/bmad-runner');
const gitignore = require('../lib/gitignore');

const prompt = (questions) => inquirer.prompt(questions);

async function install() {
  const root = process.cwd();
  console.log(chalk.cyan(`BMad-Stella ${version} → BMad ${constants.BMAD_VERSION}`));
  console.log(chalk.dim(`Project folder: ${root}\n`));

  // No terminal (CI, piped stdin): everything must come from the environment.
  if (!process.stdin.isTTY) {
    const missing = ['JIRA_EMAIL', 'JIRA_API_TOKEN', 'STELLA_PROJECT'].filter(
      (k) => !process.env[k],
    );
    if (missing.length > 0) {
      console.log(
        chalk.red(
          `✗ No interactive terminal. Set ${missing.join(', ')} in the environment to install non-interactively.`,
        ),
      );
      process.exit(1);
    }
  }

  // 1. preflight
  const pf = preflight.check();
  for (const w of pf.warnings) console.log(chalk.yellow(`! ${w}`));
  if (!pf.ok) {
    for (const e of pf.errors) console.log(chalk.red(`✗ ${e}`));
    process.exit(1);
  }

  // 2. re-run detection
  const rerun = cleaner.isRerun(root);
  if (rerun)
    console.log(
      chalk.dim('Existing BMad install found: re-installing (your _bmad-output is kept).\n'),
    );

  // 3 + 4. JIRA credentials (verified)
  const creds = await jira.run(root, { prompt });

  // 5. project picker
  const project = await picker.run(root, creds, { prompt });
  console.log(chalk.dim(`Project: ${project.name}\n`));

  // 6. clean
  const { removed } = cleaner.clean(root, { rerun });
  if (removed.length > 0) console.log(chalk.dim(`Removed: ${removed.join(', ')}`));

  // 7. BMad
  const status = runner.install(root, {
    projectName: project.name,
    userName: runner.gitUserName({ cwd: root }),
  });
  if (status !== 0) {
    console.log(
      chalk.red(`\n✗ BMad install exited with code ${status}. Nothing else was changed.`),
    );
    process.exit(status);
  }

  // 8. gitignore
  const gi = gitignore.ensure(root);

  // summary
  console.log(chalk.green('\n✓ BMad installed.'));
  console.log(`  _bmad/ and .claude/skills/bmad-* are in place.`);
  console.log(`  JIRA credentials: ${path.relative(root, jira.tokenFilePath(root))}`);
  console.log(`  Project: ${project.name} (${path.relative(root, picker.projectJsonPath(root))})`);
  console.log(
    `  .gitignore: ${gi.added.length > 0 ? `added ${gi.added.join(', ')}` : 'already complete'}`,
  );
  console.log(
    chalk.dim(
      '\nStella skills, hooks and permissions are installed by the next installer step (Task 11).',
    ),
  );
}

program.name('bmad-stella').version(version).description('BMad-Stella installer (v6)');

program
  .command('install')
  .description('install BMad 6.12.2 with the Stella layer into the current directory')
  .action(() =>
    install().catch((error) => {
      console.log(chalk.red(`✗ ${error.message}`));
      process.exit(1);
    }),
  );

program
  .command('uninstall')
  .description('remove BMad-Stella from the current directory (keeps _bmad-output)')
  .action(() => {
    console.error('uninstall arrives with installer part 2 (migration Task 11).');
    process.exit(1);
  });

program.parse(process.argv);
