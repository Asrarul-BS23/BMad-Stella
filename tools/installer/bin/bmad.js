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
const { createUi, styleQuestions } = require('../lib/ui');

const prompt = (questions) => inquirer.prompt(styleQuestions(questions));

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
      ui.failed(error.message);
      process.exit(1);
    }
  });

program
  .command('setup')
  .description(
    'set this machine up once (user-level install): credentials, skills, hooks and the BMad master copy under ~/.claude/',
  )
  .option('-v, --verbose', 'show the full BMad installer output')
  .action(async (opts) => {
    const ui = createUi({ version, bmadVersion: constants.BMAD_VERSION });
    try {
      await require('../lib/machine-setup').setup({ prompt, ui, verbose: Boolean(opts.verbose) });
    } catch (error) {
      ui.failed(error.message);
      process.exit(1);
    }
  });

program
  .command('init')
  .description(
    'set up the current project from the machine install (what the /stella-init skill runs)',
  )
  .option('--project <name>', 'project name, as shown by --list-projects')
  .option('--root <dir>', 'project folder, when several folders here hold _bmad/')
  .option('--list-projects', 'print the project names and exit')
  .option('--status', 'print where this project stands and exit')
  .action(async (opts) => {
    const projectInit = require('../lib/project-init');
    const cwd = process.cwd();
    if (opts.status) {
      const s = projectInit.status(cwd, { rootOverride: opts.root });
      if (!s.root) {
        console.log(
          s.roots.length > 1
            ? `Several folders here hold _bmad/: ${s.roots.join(', ')}. Pass --root <folder>.`
            : 'BMad-Stella is not set up here. Run /stella-init.',
        );
        return;
      }
      console.log(`root: ${s.root}`);
      for (const item of s.items) console.log(`${item.name}: ${item.state}`);
      if (s.setUp && !s.upToDate && s.template)
        console.log(`update pending: ${s.template.id} (applied at the next session start)`);
      return;
    }
    if (opts.listProjects) {
      const creds = require('../lib/jira-credentials-manager').readCredentialsFile();
      if (!creds) {
        console.log(chalk.red(`✖ No saved Atlassian credentials. ${projectInit.SETUP_HINT}`));
        process.exit(1);
      }
      try {
        const projects = await require('../lib/project-picker').listProjects(creds);
        for (const p of projects) console.log(p.name);
        console.log(constants.OTHER_PROJECT);
      } catch (error) {
        console.log(chalk.red(`✖ ${error.message}`));
        process.exit(1);
      }
      return;
    }
    const ui = createUi({ version, bmadVersion: constants.BMAD_VERSION });
    try {
      await projectInit.init(cwd, {
        prompt,
        ui,
        projectName: opts.project || null,
        rootOverride: opts.root || null,
      });
    } catch (error) {
      ui.failed(error.message);
      if (Array.isArray(error.projects)) for (const name of error.projects) console.log(name);
      process.exit(error.code === 'NEED_PROJECT' ? 2 : 1);
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
