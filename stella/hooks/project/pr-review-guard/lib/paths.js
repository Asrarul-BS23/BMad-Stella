'use strict';

const path = require('node:path');

// Single source of truth for every folder the PR review guard touches in a
// BMad v6 project. No other guard file hardcodes a path.

const ROOT_MARKER = ['_bmad']; // present in every v6 install
const CONFIG_FILE = ['_bmad', 'custom', 'stella', 'guard.json']; // kill switch, written by installer
const REVIEWER_DIR = ['_bmad-output', 'stella', 'reviewer']; // review folders live here
const SCRATCH_DIR = [...REVIEWER_DIR, '.scratch']; // pure-computation scripts
const STATE_DIR = [...REVIEWER_DIR, '.state']; // per-session cache + guard debug log
const HELPER_PATH = ['_bmad', 'custom', 'stella', 'utils', 'pr-comments']; // the one runnable helper

// Path-regex building blocks (forward or back slashes, used on normalized paths).
const SEP = String.raw`[\\/]`;
const seg = (parts) => parts.map((p) => p.replaceAll('.', String.raw`\.`)).join(SEP);

const REVIEWER_RE_PART = seg(REVIEWER_DIR); // _bmad-output[\/]stella[\/]reviewer
const HELPER_RE_PART = seg(HELPER_PATH); // _bmad[\/]custom[\/]stella[\/]utils[\/]pr-comments

const rootMarker = (dir) => path.join(dir, ...ROOT_MARKER);
const configFile = (root) => path.join(root, ...CONFIG_FILE);
const reviewerDir = (root) => path.join(root, ...REVIEWER_DIR);
const scratchDir = (root) => path.join(root, ...SCRATCH_DIR);
const stateDir = (root) => path.join(root, ...STATE_DIR);

module.exports = {
  rootMarker,
  configFile,
  reviewerDir,
  scratchDir,
  stateDir,
  SEP,
  REVIEWER_RE_PART,
  HELPER_RE_PART,
  REVIEWER_LABEL: REVIEWER_DIR.join('/'),
  SCRATCH_LABEL: SCRATCH_DIR.join('/'),
  HELPER_LABEL: HELPER_PATH.join('/'),
  CONFIG_LABEL: CONFIG_FILE.join('/'),
};
