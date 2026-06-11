'use strict';

const fs = require('node:fs');
const path = require('node:path');

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

module.exports = { makeLogger };
