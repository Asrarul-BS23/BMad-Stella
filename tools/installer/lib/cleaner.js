'use strict';

// Step 6 — clean. v4 leftovers are removed on every install (user decision: no
// guard, just delete). On a re-run `_bmad/` goes too, so BMad installs fresh.
// `_bmad-output/` is never touched here.

const fs = require('node:fs');
const path = require('node:path');
const { V4_LEFTOVERS, BMAD_DIR } = require('./constants');

function removeIfPresent(root, rel) {
  const target = path.join(root, ...rel.split('/'));
  if (!fs.existsSync(target)) return false;
  fs.rmSync(target, { recursive: true, force: true });
  return true;
}

/**
 * @returns {{removed:string[]}}
 */
function clean(root, { rerun = false } = {}) {
  const removed = [];
  const targets = rerun ? [...V4_LEFTOVERS, BMAD_DIR] : V4_LEFTOVERS;
  for (const rel of targets) {
    if (removeIfPresent(root, rel)) removed.push(rel);
  }
  return { removed };
}

const isRerun = (root) => fs.existsSync(path.join(root, BMAD_DIR));

module.exports = { clean, isRerun };
