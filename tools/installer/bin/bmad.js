#!/usr/bin/env node
'use strict';

// BMad-Stella v6 installer CLI. `install` and `uninstall` run in the current
// directory (no install-dir question). The steps live in ../lib/installer.js,
// the terminal look in ../lib/ui.js.

const { program } = require('commander');
const chalk = require('chalk').default || require('chalk');
const inquirer = require('inquirer').default || require('inquirer');

const { version } = require('../../../package.json');
const constants = require('../lib/constants');
const installer = require('../lib/installer');
const { createUi } = require('../lib/ui');

const prompt = (questions) => inquirer.prompt(questions);

program.name('bmad-stella').version(version).description('BMad-Stella installer (v6)');

program
  .command('install')
  .description(
    `install BMad ${constants.BMAD_VERSION} with the Stella layer into the current directory`,
  )
  .option('-v, --verbose', 'show the full BMad installer output')
  .action(async (opts) => {
    const ui = createUi({ version, bmadVersion: constants.BMAD_VERSION });
    try {
      await installer.install(process.cwd(), { prompt, ui, verbose: Boolean(opts.verbose) });
    } catch (error) {
      ui.error(error.message);
      process.exit(1);
    }
  });

program
  .command('uninstall')
  .description('remove BMad-Stella from the current directory (keeps _bmad-output)')
  .option('-y, --yes', 'do not ask for confirmation')
  .action(async (opts) => {
    const root = process.cwd();
    if (!opts.yes && !process.stdin.isTTY) {
      console.log(
        chalk.red('✖ No interactive terminal. Run `uninstall --yes` to skip the confirmation.'),
      );
      process.exit(1);
    }
    try {
      const r = await installer.uninstall(root, { prompt, yes: Boolean(opts.yes) });
      if (r.aborted) {
        console.log(chalk.dim('Nothing removed.'));
        return;
      }
      console.log(chalk.green(`✔ BMad-Stella removed (${constants.OUTPUT_DIR}/ kept).`));
      for (const item of r.removed) console.log(chalk.dim(`  - ${item}`));
    } catch (error) {
      console.log(chalk.red(`✖ ${error.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
