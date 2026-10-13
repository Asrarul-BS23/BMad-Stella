#!/usr/bin/env node

// BMad-Stella v6 installer entry point.
// The v4 installer was removed in the v6 migration (Task 1). The v6 wrapper
// around `npx bmad-method install` is built in Tasks 10-11 of the migration plan.

const { program } = require('commander');

const { version } = require('../../../package.json');

const NOT_READY =
  'BMad-Stella v6 installer is under construction (migration tasks 10-11). ' +
  'Use the dev branch for the v4 installer in the meantime.';

program.name('bmad-stella').version(version).description('BMad-Stella installer (v6)');

for (const command of ['install', 'uninstall']) {
  program
    .command(command)
    .description(`${command} BMad-Stella (not available yet)`)
    .action(() => {
      console.error(NOT_READY);
      process.exit(1);
    });
}

program.parse(process.argv);
