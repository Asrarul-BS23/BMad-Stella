#!/usr/bin/env node
'use strict';

// BMad-Stella v6 installer CLI.
//   install    once per machine, under ~/.claude/ (../lib/machine-setup.js)
//   init       once per project, from the machine install — what /stella-init runs
//              (../lib/project-init.js)
//   uninstall  removes BMad-Stella from the current directory (../lib/installer.js)
// The per-project installer in ../lib/installer.js is no longer a command of its own;
// `init` falls back to it when the machine has no master copy. Terminal look: ../lib/ui.js.

const { program, Option } = require('commander');
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
    `install BMad ${constants.BMAD_VERSION} with the Stella layer once for this machine, under ~/.claude/ (then run /stella-init in each project)`,
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
  // Run by the /stella-init skill on a machine without `install` (Cowork); not user steps.
  .addOption(new Option('--check-credentials').hideHelp())
  .addOption(new Option('--save-credentials').hideHelp())
  .addOption(new Option('--email <email>').hideHelp())
  .addOption(new Option('--token <token>').hideHelp())
  .addOption(new Option('--suggest-project').hideHelp())
  .addOption(new Option('--no-credentials').hideHelp())
  .action(async (opts) => {
    const projectInit = require('../lib/project-init');
    const cwd = process.cwd();
    if (opts.checkCredentials || opts.saveCredentials || opts.suggestProject) {
      const cowork = require('../lib/cowork-setup');
      if (opts.checkCredentials) {
        const s = await cowork.credentialsStatus();
        console.log(
          `credentials: ${s.state}${s.detail && s.state !== 'saved' ? ` (${s.detail})` : ''}`,
        );
        console.log(`file: ${s.file}`);
        if (s.state !== 'saved') for (const line of cowork.credentialsHelp()) console.log(line);
        return;
      }
      if (opts.saveCredentials) {
        const s = await cowork.saveCredentials({
          email: opts.email || process.env.JIRA_EMAIL,
          token: opts.token || process.env.JIRA_API_TOKEN,
        });
        console.log(
          `credentials: ${s.state}${s.state === 'saved' && !s.verified ? ', not verified' : ''}${s.state === 'saved' ? '' : ` (${s.detail})`}`,
        );
        console.log(`file: ${s.file}`);
        if (s.state !== 'saved') process.exit(1);
        return;
      }
      const root = projectInit.resolveRoot(cwd, opts.root || null).root;
      const s = await cowork.suggestProject(root);
      console.log(`suggestion: ${s.suggestion || 'none'}${s.reason ? ` (${s.reason})` : ''}`);
      if (s.from) console.log(`from: ${s.from}`);
      console.log(`projects: ${[...s.projects, constants.OTHER_PROJECT].join(', ')}`);
      return;
    }
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
        console.log(
          `update pending: ${s.template.id} (applied at the next session start, or now by running init again)`,
        );
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
      await projectInit
        .init(cwd, {
          prompt,
          ui,
          projectName: opts.project || null,
          rootOverride: opts.root || null,
          noCredentials: opts.credentials === false,
        })
        .then((summary) => {
          if (summary.noCredentials) {
            for (const line of require('../lib/cowork-setup').credentialsHelp()) console.log(line);
          }
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
