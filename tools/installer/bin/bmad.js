#!/usr/bin/env node
'use strict';

// BMad-Stella v6 installer CLI. `install` and `uninstall` run in the current
// directory (no install-dir question). The steps live in ../lib/installer.js.

const { program } = require('commander');
const chalk = require('chalk').default || require('chalk');
const inquirer = require('inquirer').default || require('inquirer');

const { version } = require('../../../package.json');
const constants = require('../lib/constants');
const installer = require('../lib/installer');

const prompt = (questions) => inquirer.prompt(questions);
const fail = (error) => {
  console.log(chalk.red(`✗ ${error.message}`));
  process.exit(1);
};

program.name('bmad-stella').version(version).description('BMad-Stella installer (v6)');

program
  .command('install')
  .description(
    `install BMad ${constants.BMAD_VERSION} with the Stella layer into the current directory`,
  )
  .action(async () => {
    const root = process.cwd();
    console.log(chalk.cyan(`BMad-Stella ${version} → BMad ${constants.BMAD_VERSION}`));
    console.log(chalk.dim(`Project folder: ${root}\n`));
    try {
      const summary = await installer.install(root, { prompt });
      console.log('\n' + chalk.green(installer.formatSummary(summary)));
    } catch (error) {
      fail(error);
    }
  });

program
  .command('uninstall')
  .description('remove BMad-Stella from the current directory (keeps _bmad-output)')
  .option('-y, --yes', 'do not ask for confirmation')
  .action(async (opts) => {
    const root = process.cwd();
    if (!opts.yes && !process.stdin.isTTY) {
      fail(new Error('No interactive terminal. Run `uninstall --yes` to skip the confirmation.'));
    }
    try {
      const r = await installer.uninstall(root, { prompt, yes: Boolean(opts.yes) });
      if (r.aborted) {
        console.log(chalk.dim('Nothing removed.'));
        return;
      }
      console.log(chalk.green(`✓ BMad-Stella removed (${constants.OUTPUT_DIR}/ kept).`));
      for (const item of r.removed) console.log(chalk.dim(`  - ${item}`));
    } catch (error) {
      fail(error);
    }
  });

program.parse(process.argv);
