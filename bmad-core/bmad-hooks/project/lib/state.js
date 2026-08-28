'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const LOG_FILE = path.join(os.homedir(), '.claude', 'bmad-hooks', 'bmad_hooks_debug.log');

function log(msg, extra) {
  try {
    const entry = JSON.stringify({ ts: new Date().toISOString(), msg, ...extra }) + '\n';
    fs.appendFileSync(LOG_FILE, entry, 'utf8');
  } catch {
    // ignore
  }
}

function readState(filePath, defaults) {
  try {
    if (!fs.existsSync(filePath)) return { ...defaults };
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch (error) {
    log('state.readState: corrupt JSON, using defaults', { file: filePath, error: error.message });
    return { ...defaults };
  }
}

function writeState(filePath, data) {
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (error) {
    log('state.writeState: failed', { file: filePath, error: error.message });
  }
}

function getStatePath(cwd, filename) {
  return path.join(cwd, 'bmad-docs', 'memory', '.state', filename);
}

module.exports = { readState, writeState, getStatePath, log };
