#!/usr/bin/env node
'use strict';

// npx entry point (package.json "bin"). It only hands over to the installer CLI.
// It must never change the working directory: the installer installs into the
// folder the developer ran `npx` from, not into the npx cache where this package
// lives. (The v4 wrapper re-spawned the CLI with cwd set to the package folder,
// which installed BMad into the npm cache — fixed in the v6 migration.)

require('./installer/bin/bmad.js');
