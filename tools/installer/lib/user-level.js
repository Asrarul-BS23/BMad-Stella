'use strict';

// User-level install, shared pieces: where things live under ~/.claude/, how a
// project root is found (here, in a parent, or one level down), how the _bmad/
// master copy is applied to a project, and the session-start check. Used by
// `install` (machine-setup.js), `init` (project-init.js) and the init-check hook,
// which loads this file from the app copy in ~/.claude/stella/app/.
// Design: tea-module/rnd-docs/user-level-install-design.md.

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  BMAD_DIR,
  BMAD_VERSION,
  TEA_SKILL_VERSION,
  STELLA_CUSTOM_DIR,
  CLAUDE_SKILLS_DIR,
  APP_DIR_PARTS,
  TEMPLATE_DIR_PARTS,
  MACHINE_STATE_PARTS,
  USER_SKILLS_PARTS,
  USER_SETTINGS_PARTS,
  PROJECT_NAME_FILES,
  TEMPLATE_MARKER,
} = require('./constants');

const { version: STELLA_VERSION } = require('../../../package.json');

// Loaded on demand: the init-check hook requires this file at every session start, and
// its usual path (nothing to do) must not pay for the installer's heavier modules.
const lazy = {
  get layer() {
    return require('./stella-layer');
  },
  get picker() {
    return require('./project-picker');
  },
};

const NEW_SUFFIX = '.stella-new'; // staging name for the incoming _bmad/ copy
const OLD_SUFFIX = '.stella-old'; // the replaced folder, until it is removed
const LOCK_SUFFIX = '.stella-lock';
const LOCK_STALE_MS = 5 * 60 * 1000;
const rm = (target) => fs.rmSync(target, { recursive: true, force: true });
const SKIPPED_CHILD_DIRS = new Set(['node_modules']);
// Kept across a refresh: the project's own switches, not the shipped defaults.
const KEPT_STELLA_FILES = ['friction.json', 'guard.json'];
// The project-context skill and its background worker run the check script from this
// fixed project path (and the permission rules name it). With the skill at user level
// the script alone is placed there; without a SKILL.md the folder is not a skill.
const CHECK_SCRIPT = ['stella-project-context', 'scripts', 'check-context.js'];

const underHome = (parts, home = os.homedir()) => path.join(home, ...parts);
const appDir = (home) => underHome(APP_DIR_PARTS, home);
const templateDir = (home) => underHome(TEMPLATE_DIR_PARTS, home);
const templateBmadDir = (home) => path.join(templateDir(home), BMAD_DIR);
const machineStateFile = (home) => underHome(MACHINE_STATE_PARTS, home);
const userSkillsDir = (home) => underHome(USER_SKILLS_PARTS, home);
const userSettingsFile = (home) => underHome(USER_SETTINGS_PARTS, home);

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** Content hash of what `init` copies from this package into a project. */
function layerHash() {
  const hash = crypto.createHash('sha256');
  const add = (file, label) => {
    hash.update(label);
    hash.update(fs.readFileSync(file));
  };
  const walk = (dir, label) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries.sort((x, y) => (x.name < y.name ? -1 : 1))) {
      const next = `${label}/${e.name}`;
      if (e.isDirectory()) walk(path.join(dir, e.name), next);
      else add(path.join(dir, e.name), next);
    }
  };
  walk(lazy.layer.SRC.checklists, 'checklists');
  walk(lazy.layer.SRC.utils, 'utils');
  add(path.join(lazy.layer.SRC.skills, ...CHECK_SCRIPT), 'check');
  return hash.digest('hex').slice(0, 8);
}

/**
 * The id every project copy is compared against. The layer hash makes a helper or
 * checklist change reach projects even when no version number moved (an install
 * from a git branch keeps the same package version across commits).
 */
const templateId = () =>
  `${STELLA_VERSION}+bmad.${BMAD_VERSION}+tea.${TEA_SKILL_VERSION}+${layerHash()}`;

/**
 * Puts `staged` in place of `final` by renaming, never by deleting first: when the
 * old folder is in use (Windows) the first rename fails and nothing has changed.
 * @returns {string|null} where the old folder now is (the caller removes it), or null
 */
function swapDir(staged, final) {
  const old = final + OLD_SUFFIX;
  rm(old);
  const had = isDir(final);
  if (had) fs.renameSync(final, old);
  try {
    fs.renameSync(staged, final);
  } catch (error) {
    if (had) fs.renameSync(old, final);
    throw error;
  }
  return had ? old : null;
}

/** Best effort: a leftover folder is removed by the next run. */
function discard(dir) {
  try {
    if (dir) rm(dir);
  } catch {
    // in use; harmless
  }
}

/**
 * One writer per project: two sessions starting together must not both replace
 * _bmad/. A lock older than LOCK_STALE_MS belongs to a run that died.
 * @returns {() => void} release
 */
function lockProject(root) {
  const lock = path.join(root, BMAD_DIR + LOCK_SUFFIX);
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let age = Infinity;
    try {
      age = Date.now() - fs.statSync(lock).mtimeMs;
    } catch {
      age = Infinity;
    }
    if (age < LOCK_STALE_MS) {
      throw Object.assign(new Error('another BMad-Stella run is changing this project'), {
        code: 'LOCKED',
      });
    }
    fs.utimesSync(lock, new Date(), new Date());
  }
  return () => discard(lock);
}

const readMarker = (bmadDir) => {
  const marker = readJson(path.join(bmadDir, TEMPLATE_MARKER));
  return marker && typeof marker.id === 'string' ? marker : null;
};

function writeMarker(bmadDir, { now = () => new Date() } = {}) {
  const marker = {
    id: templateId(),
    stellaVersion: STELLA_VERSION,
    bmadVersion: BMAD_VERSION,
    teaVersion: TEA_SKILL_VERSION,
    builtAt: now().toISOString(),
  };
  fs.writeFileSync(path.join(bmadDir, TEMPLATE_MARKER), JSON.stringify(marker, null, 2) + '\n');
  return marker;
}

/** The template's marker, or null when `install` has not built a template on this machine. */
const templateMarker = (home) => readMarker(templateBmadDir(home));

const readMachineState = (home) => readJson(machineStateFile(home));

function writeMachineState(state, home) {
  const file = machineStateFile(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  return file;
}

/**
 * Where the BMad project root is, seen from `cwd`. Never more than one level
 * down, any number of levels up (same walk the hooks and helpers already do).
 * @returns {{kind:'here'|'parent'|'child'|'children'|'none', root:string|null, roots:string[]}}
 */
function findRoot(cwd) {
  const start = path.resolve(cwd);
  for (let dir = start; ; ) {
    if (isDir(path.join(dir, BMAD_DIR))) {
      return { kind: dir === start ? 'here' : 'parent', root: dir, roots: [dir] };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  let children = [];
  try {
    children = fs
      .readdirSync(start, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIPPED_CHILD_DIRS.has(e.name))
      .map((e) => path.join(start, e.name))
      .filter((dir) => isDir(path.join(dir, BMAD_DIR)));
  } catch {
    children = [];
  }
  if (children.length === 1) return { kind: 'child', root: children[0], roots: children };
  if (children.length > 1) return { kind: 'children', root: null, roots: children };
  return { kind: 'none', root: null, roots: [] };
}

const yamlString = (value) => JSON.stringify(String(value)); // a JSON string is valid YAML
const tomlString = (value) => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** `project_name` from _bmad/config.toml, or null. */
function readProjectName(root) {
  try {
    const text = fs.readFileSync(path.join(root, BMAD_DIR, 'config.toml'), 'utf8');
    const m = /^project_name\s*=\s*"((?:[^"\\]|\\.)*)"/m.exec(text);
    return m ? m[1].replaceAll(/\\(.)/g, '$1') : null;
  } catch {
    return null;
  }
}

/** Writes the project name into every _bmad/ file that carries it. */
function setProjectName(root, name) {
  for (const rel of PROJECT_NAME_FILES) {
    const file = path.join(root, BMAD_DIR, ...rel.split('/'));
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const next = rel.endsWith('.toml')
      ? text.replace(/^project_name\s*=.*$/m, () => `project_name = ${tomlString(name)}`)
      : text.replace(/^project_name:.*$/m, () => `project_name: ${yamlString(name)}`);
    if (next !== text) fs.writeFileSync(file, next);
  }
}

const readKeptStellaFiles = (root) =>
  KEPT_STELLA_FILES.map((name) => {
    const file = path.join(root, ...STELLA_CUSTOM_DIR.split('/'), name);
    try {
      return { file, text: fs.readFileSync(file, 'utf8') };
    } catch {
      return null;
    }
  }).filter(Boolean);

/**
 * Puts the machine's _bmad/ master copy into `root`, new project or existing one.
 * The incoming copy is staged and swapped in by rename; a failure after the swap
 * puts the old _bmad/ back. Kept from an existing _bmad/: everything under
 * _bmad/custom/ (team and personal overrides, secrets, the project's friction.json
 * and guard.json) and the render cache a running session may be reading. The
 * Stella helpers and checklists are always the current ones.
 * @returns {{marker:object, replaced:boolean}}
 */
function applyTemplate(root, { home, projectName, project = null } = {}) {
  const source = templateBmadDir(home);
  const marker = readMarker(source);
  if (!marker)
    throw new Error('No BMad template on this machine. Run `bmad-stella install` first.');

  const target = path.join(root, BMAD_DIR);
  const staged = target + NEW_SUFFIX;
  const stellaDir = path.join(root, ...STELLA_CUSTOM_DIR.split('/'));
  const release = lockProject(root);
  try {
    rm(staged);
    lazy.layer.copyDir(source, staged);
    const replaced = isDir(target);
    const name = projectName || (replaced ? readProjectName(root) : null) || path.basename(root);
    const kept = replaced ? readKeptStellaFiles(root) : [];
    const old = swapDir(staged, target);
    try {
      if (old) {
        const oldCustom = path.join(old, 'custom');
        if (isDir(oldCustom)) lazy.layer.copyDir(oldCustom, path.join(target, 'custom'));
        const oldRender = path.join(old, 'render');
        if (isDir(oldRender)) fs.renameSync(oldRender, path.join(target, 'render'));
      }
      for (const shipped of ['checklists', 'utils']) rm(path.join(stellaDir, shipped));
      setProjectName(root, name);
      lazy.layer.copyStellaFiles(root, { project: project || lazy.picker.readProjectJson(root) });
      placeCheckScript(root);
      // friction.json follows the project pick: kept on a refresh, rewritten when a pick is passed.
      for (const { file, text } of kept) {
        if (project && path.basename(file) === 'friction.json') continue;
        fs.writeFileSync(file, text);
      }
    } catch (error) {
      // Half-applied is worse than old: put the previous _bmad/ back, or remove the
      // copy from a new project so it reads as "not set up" again.
      rm(target);
      if (old) fs.renameSync(old, target);
      throw error;
    }
    discard(old);
    return { marker, replaced };
  } finally {
    discard(staged);
    release();
  }
}

function placeCheckScript(root) {
  const src = path.join(lazy.layer.SRC.skills, ...CHECK_SCRIPT);
  const dest = path.join(root, ...CLAUDE_SKILLS_DIR.split('/'), ...CHECK_SCRIPT);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

const isGitRepo = (dir) => fs.existsSync(path.join(dir, '.git'));

const MESSAGES = {
  notSetUp: 'BMad-Stella is not set up in this folder. Run /stella-init to set it up.',
  perProject:
    'This project uses the per-project BMad-Stella install, and this machine now has the user-level one. Run /stella-init once to switch this project over.',
  openChild: (folder) =>
    `The BMad-Stella project is in the "${folder}" folder. Open Claude Code there to use the Stella skills.`,
  refreshed: (from, to) => `BMad-Stella updated in this project: ${from} → ${to}.`,
  refreshFailed: (reason) =>
    `BMad-Stella could not update this project (${reason}). Run /stella-init to repair it.`,
};

/**
 * What the init-check hook does at session start. Writes only in one case: a
 * project that is already set up from the template and is behind it (L2, L6).
 * Hints are given when a session starts, not again on resume, clear or compact.
 * @param {object} opts home; source = the hook payload's `source`
 * @returns {{message:string, action:'hint'|'refreshed'|'failed'}|null} null = say nothing
 */
function sessionCheck(cwd, { home, source } = {}) {
  const template = templateMarker(home);
  if (!template) return null; // `install` never ran on this machine: stay out of the way
  const hint = (message) => (!source || source === 'startup' ? { message, action: 'hint' } : null);
  const found = findRoot(cwd);
  if (found.kind === 'none') return isGitRepo(path.resolve(cwd)) ? hint(MESSAGES.notSetUp) : null;
  if (!found.root) return null; // several child projects: /stella-init asks which one
  const current = readMarker(path.join(found.root, BMAD_DIR));
  if (!current) {
    // No marker: the per-project installer's _bmad/ (it has the Stella folder), or a
    // plain official BMad install that is none of our business.
    const stella = isDir(path.join(found.root, ...STELLA_CUSTOM_DIR.split('/')));
    return stella ? hint(MESSAGES.perProject) : null;
  }
  if (current.id !== template.id) {
    try {
      applyTemplate(found.root, { home });
      return { message: MESSAGES.refreshed(current.id, template.id), action: 'refreshed' };
    } catch (error) {
      if (error.code === 'LOCKED') return null; // another session is doing it right now
      return { message: MESSAGES.refreshFailed(error.message), action: 'failed' };
    }
  }
  // Skills and hooks look for _bmad/ in the session folder and above it, never below.
  return found.kind === 'child' ? hint(MESSAGES.openChild(path.basename(found.root))) : null;
}

module.exports = {
  STELLA_VERSION,
  appDir,
  templateDir,
  templateBmadDir,
  machineStateFile,
  userSkillsDir,
  userSettingsFile,
  templateId,
  readMarker,
  writeMarker,
  templateMarker,
  readMachineState,
  writeMachineState,
  findRoot,
  readProjectName,
  setProjectName,
  applyTemplate,
  swapDir,
  discard,
  layerHash,
  isGitRepo,
  sessionCheck,
  MESSAGES,
};
