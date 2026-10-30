'use strict';

const os = require('node:os');
const path = require('node:path');

// Single source of truth for where the friction logger reads and writes in a
// BMad v6 project. Every other module imports from here — no hardcoded paths.

const ROOT_MARKER = ['_bmad', 'config.toml']; // present in every v6 install
const CONFIG_FILE = ['_bmad', 'custom', 'stella', 'friction.json']; // written by the installer
const LOGS_DIR = ['_bmad-output', 'stella', 'bmad-logs'];
const SPECS_DIR = ['_bmad-output', 'implementation-artifacts'];
// Atlassian credentials: one file per machine, written by the installer.
const CREDENTIALS_FILE = ['.claude', 'stella', 'credentials.env'];

const rootMarker = (cwd) => path.join(cwd, ...ROOT_MARKER);
const configFile = (cwd) => path.join(cwd, ...CONFIG_FILE);
const logsDir = (cwd) => path.join(cwd, ...LOGS_DIR);
const specsDir = (cwd) => path.join(cwd, ...SPECS_DIR);
const credentialsEnv = (home = os.homedir()) => path.join(home, ...CREDENTIALS_FILE);

// Relative spec path as stored in the tracker (always forward slashes).
const specRel = (fileName) => [...SPECS_DIR, fileName].join('/');

module.exports = {
  rootMarker,
  configFile,
  logsDir,
  specsDir,
  credentialsEnv,
  specRel,
  LOGS_DIR_LABEL: LOGS_DIR.join('/'),
  CREDENTIALS_FILE_LABEL: '~/.claude/stella/credentials.env',
};
