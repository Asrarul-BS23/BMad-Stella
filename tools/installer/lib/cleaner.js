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

const customDir = (root) => path.join(root, BMAD_DIR, 'custom');

/**
 * Stages the loose files directly under `_bmad/custom/` (team/personal override
 * files such as `*.toml`, `*.user.toml`, `*.secrets.env`) outside `_bmad/` before
 * a re-run wipe, so they survive the official BMad reinstall. Any subfolder
 * (including `_bmad/custom/stella/`, which the Stella layer always recreates
 * fresh) is deliberately left alone — only loose files are staged.
 * Staged next to `_bmad/` (inside `root`), not the OS temp dir: `fs.renameSync`
 * only works within one filesystem, and the project root may be on a different
 * drive/mount than the system temp folder.
 * @returns {{staging:string, files:string[]}|null}
 */
function preserveCustomFiles(root) {
  const dir = customDir(root);
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
  if (files.length === 0) return null;
  const staging = fs.mkdtempSync(path.join(root, '.stella-custom-preserve-'));
  for (const name of files) {
    fs.renameSync(path.join(dir, name), path.join(staging, name));
  }
  return { staging, files };
}

/**
 * Puts files staged by preserveCustomFiles() back into `_bmad/custom/` (created
 * if missing) and removes the staging folder. No-op when nothing was preserved.
 */
function restoreCustomFiles(root, preserved) {
  if (!preserved) return;
  const dir = customDir(root);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of preserved.files) {
    fs.renameSync(path.join(preserved.staging, name), path.join(dir, name));
  }
  fs.rmSync(preserved.staging, { recursive: true, force: true });
}

module.exports = { clean, isRerun, preserveCustomFiles, restoreCustomFiles };
