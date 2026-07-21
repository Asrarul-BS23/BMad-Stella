'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Walk up from startDir to the BMad install root — the folder holding
// .bmad-core/core-config.yaml. The hook payload cwd is the session's CURRENT
// directory, not the launch directory: `cd frontend && npm test` moves it and
// Bash cwd persists, so trusting it verbatim scattered stray
// bmad-docs/bmad-logs/ folders into subdirectories and dropped their sessions
// from the tracker. Returns null when not inside a BMad project.
function findBmadRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.bmad-core', 'core-config.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Debug logger for the friction-logger hooks. Hooks must never throw or print
// to the session — every failure is silent and lands here instead.
function makeLogger(cwd) {
  const logsDir = path.join(cwd, 'bmad-docs', 'bmad-logs');
  const logFile = path.join(logsDir, '.hook-debug.log');

  return function log(message, data) {
    try {
      fs.mkdirSync(logsDir, { recursive: true });
      const suffix = data === undefined ? '' : ' ' + JSON.stringify(data);
      fs.appendFileSync(logFile, `${new Date().toISOString()} [friction] ${message}${suffix}\n`);
    } catch {
      // even logging must never throw
    }
  };
}

module.exports = { makeLogger, findBmadRoot };
