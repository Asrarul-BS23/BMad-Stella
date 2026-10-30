'use strict';

const path = require('node:path');

// Single source of truth for where the memory hooks read and write in a
// BMad v6 / stella-build project. Every other module imports from here —
// no hardcoded `bmad-docs`/`.bmad-core` paths, which are v4 and removed by
// the installer on every install (see tools/installer/lib/constants.js
// V4_LEFTOVERS). Mirrors the pattern already used by friction-logger and
// pr-review-guard's own lib/paths.js.

const ROOT_MARKER = ['_bmad', 'config.toml']; // present in every v6 install
const MEMORY_DIR = ['_bmad-output', 'stella', 'memory'];
const SPECS_DIR = ['_bmad-output', 'implementation-artifacts']; // stella-build spec-*.md files

const rootMarker = (cwd) => path.join(cwd, ...ROOT_MARKER);
const memoryDir = (cwd) => path.join(cwd, ...MEMORY_DIR);
const specsDir = (cwd) => path.join(cwd, ...SPECS_DIR);
const statePath = (cwd, filename) => path.join(memoryDir(cwd), '.state', filename);

module.exports = {
  rootMarker,
  memoryDir,
  specsDir,
  statePath,
  MEMORY_DIR,
  SPECS_DIR,
};
