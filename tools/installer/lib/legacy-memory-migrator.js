'use strict';

// Carries a v4 project's accumulated memory forward before cleaner.clean()
// deletes bmad-docs/. Must run before that step.
//
// Memory file FORMATS (episodes/*.md, semantic/*.md, lessons/*.md,
// domain-map.md, patterns.md, MEMORY.md, .state/*) are unchanged between v4
// and v6 — only the root path moved from bmad-docs/memory to
// _bmad-output/stella/memory — so this is a verbatim directory copy, not a
// re-parse or reformat.
//
// Old impl-plan/*.md files are a different story: their format shares nothing
// with a stella-build spec-*.md (no frontmatter status, no `## Intent`
// section), so they are preserved untouched in their own folder rather than
// merged into the live specs directory, where daily-job.js's scanPlanFiles()
// would otherwise try (and fail) to read them as specs. Kept out of that scan
// on purpose: scanPlanFiles() only looks at flat `spec-*.md` files directly
// under implementation-artifacts/, so a legacy-plans/ subfolder is invisible
// to it without any extra filtering needed.

const fs = require('node:fs');
const path = require('node:path');
const { OUTPUT_DIR, STELLA_OUTPUT_DIR } = require('./constants');

const LEGACY_MEMORY_DIR = ['bmad-docs', 'memory'];
const LEGACY_PLAN_DIR = ['bmad-docs', 'impl-plan'];
const NEW_MEMORY_DIR = [...STELLA_OUTPUT_DIR.split('/'), 'memory'];
const NEW_LEGACY_PLANS_DIR = [OUTPUT_DIR, 'implementation-artifacts', 'legacy-plans'];

const rel = (root, parts) => path.join(root, ...parts);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * @returns {{memoryMigrated: boolean, plansMigrated: number}}
 */
function migrateLegacy(root) {
  const result = { memoryMigrated: false, plansMigrated: 0 };

  const legacyMemory = rel(root, LEGACY_MEMORY_DIR);
  if (fs.existsSync(legacyMemory)) {
    copyDir(legacyMemory, rel(root, NEW_MEMORY_DIR));
    result.memoryMigrated = true;
  }

  const legacyPlans = rel(root, LEGACY_PLAN_DIR);
  if (fs.existsSync(legacyPlans)) {
    const dest = rel(root, NEW_LEGACY_PLANS_DIR);
    for (const file of fs.readdirSync(legacyPlans)) {
      if (!file.endsWith('.md')) continue;
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(path.join(legacyPlans, file), path.join(dest, file));
      result.plansMigrated++;
    }
  }

  return result;
}

module.exports = {
  migrateLegacy,
  LEGACY_MEMORY_DIR,
  LEGACY_PLAN_DIR,
  NEW_MEMORY_DIR,
  NEW_LEGACY_PLANS_DIR,
};
