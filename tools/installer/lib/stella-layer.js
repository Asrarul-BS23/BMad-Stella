'use strict';

// Steps 9-13 — the Stella layer on top of a vanilla BMad install, plus the
// reverse operations used by re-run cleaning and uninstall. Everything is
// synchronous and silent; the orchestrator prints the summary.

const fs = require('node:fs');
const path = require('node:path');
const cjson = require('comment-json');
const permissions = require('./claude-permissions-manager');
const {
  STELLA_CUSTOM_DIR,
  CLAUDE_SKILLS_DIR,
  STELLA_CLAUDE_DIR,
  STELLA_HOOKS_DIR,
  LEGACY_BMAD_HOOKS_DIR,
  SETTINGS_LOCAL,
  STELLA_SKILLS,
  BMAD_SKILLS_REMOVED,
  PROJECT_HOOKS,
  STELLA_OUTPUT_DIR,
  OUTPUT_FOLDERS,
  FRICTION_DEFAULTS,
  GUARD_DEFAULTS,
  COMMONJS_PACKAGE_JSON,
} = require('./constants');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = {
  checklists: path.join(REPO_ROOT, 'stella', 'checklists'),
  utils: path.join(REPO_ROOT, 'stella', 'utils'),
  skills: path.join(REPO_ROOT, 'stella', 'skills'),
  hooks: path.join(REPO_ROOT, 'stella', 'hooks', 'project'),
};

const rel = (root, p) => path.join(root, ...p.split('/'));

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rmIfPresent(target) {
  if (!fs.existsSync(target)) return false;
  fs.rmSync(target, { recursive: true, force: true });
  return true;
}

// ---- step 9: _bmad/custom/stella/ ----
function copyStellaFiles(root) {
  const dest = rel(root, STELLA_CUSTOM_DIR);
  copyDir(SRC.checklists, path.join(dest, 'checklists'));
  for (const util of [
    'jira-attachments',
    'jira-comment',
    'pr-comments',
    'project-context-worker',
  ]) {
    copyDir(path.join(SRC.utils, util), path.join(dest, 'utils', util));
  }
  fs.writeFileSync(
    path.join(dest, 'friction.json'),
    JSON.stringify(FRICTION_DEFAULTS, null, 2) + '\n',
  );
  fs.writeFileSync(path.join(dest, 'guard.json'), JSON.stringify(GUARD_DEFAULTS, null, 2) + '\n');
  fs.writeFileSync(path.join(dest, 'package.json'), COMMONJS_PACKAGE_JSON); // helpers are CommonJS
  return dest;
}

// ---- step 10: skills ----
function copySkills(root) {
  for (const name of STELLA_SKILLS) {
    copyDir(path.join(SRC.skills, name), rel(root, `${CLAUDE_SKILLS_DIR}/${name}`));
  }
  return STELLA_SKILLS;
}

// ---- step 11: project hooks ----
function copyHooks(root) {
  // Pre-v6 project-hook location — best-effort cleanup, not an error if already absent.
  rmIfPresent(rel(root, LEGACY_BMAD_HOOKS_DIR));
  for (const hook of PROJECT_HOOKS) {
    copyDir(path.join(SRC.hooks, hook.name), rel(root, `${STELLA_HOOKS_DIR}/${hook.name}`));
  }
  fs.writeFileSync(rel(root, `${STELLA_CLAUDE_DIR}/package.json`), COMMONJS_PACKAGE_JSON); // hooks are CommonJS
  return PROJECT_HOOKS.map((h) => h.name);
}

// Hook commands are anchored to ${CLAUDE_PROJECT_DIR} (the folder Claude Code was
// started in). Hooks run in the session's *current* directory, which follows every
// `cd` the Bash tool makes, so a relative path fails with MODULE_NOT_FOUND from any
// subfolder and the guard is silently skipped. The variable keeps the file portable.
const hookCommand = (hook, file) =>
  `node "\${CLAUDE_PROJECT_DIR}/${STELLA_HOOKS_DIR}/${hook.name}/${file}"`;
// Legacy commands predate ${CLAUDE_PROJECT_DIR} anchoring: absolute Windows paths with
// backslashes, pointing straight at node.exe (e.g. "C:\Program Files\nodejs\node.exe"
// "D:\...\.claude\bmad-hooks\user-prompt-submit.js"). Match the directory on either
// separator, anywhere in the command and under any hook name or file beneath it — not
// anchored to a specific prefix (${CLAUDE_PROJECT_DIR}, a drive path, or anything else).
const LEGACY_BMAD_HOOKS_RE = /\.claude[\\/]bmad-hooks[\\/]/;
const isOurHookEntry = (entry) => {
  const cmd = entry && Array.isArray(entry.hooks) && entry.hooks[0] && entry.hooks[0].command;
  if (typeof cmd !== 'string') return false;
  return cmd.includes(`${STELLA_HOOKS_DIR}/`) || LEGACY_BMAD_HOOKS_RE.test(cmd);
};

function readSettings(root) {
  const file = rel(root, SETTINGS_LOCAL);
  try {
    const text = fs.readFileSync(file, 'utf8');
    try {
      return cjson.parse(text);
    } catch {
      return JSON.parse(text);
    }
  } catch {
    return {};
  }
}

function writeSettings(root, settings) {
  const file = rel(root, SETTINGS_LOCAL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, cjson.stringify(settings, null, 2) + '\n');
  return file;
}

/** Our hook entries replaced (never duplicated); foreign entries untouched. */
function mergeHooks(settings) {
  if (!settings.hooks || typeof settings.hooks !== 'object') settings.hooks = {};
  for (const event of Object.keys(settings.hooks)) {
    if (Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = settings.hooks[event].filter((e) => !isOurHookEntry(e));
      if (settings.hooks[event].length === 0) delete settings.hooks[event];
    }
  }
  for (const hook of PROJECT_HOOKS) {
    for (const [event, spec] of Object.entries(hook.events)) {
      if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
      const entry = { hooks: [{ type: 'command', command: hookCommand(hook, spec.file) }] };
      if (spec.matcher) entry.matcher = spec.matcher;
      settings.hooks[event].push(entry);
    }
  }
  return settings;
}

/** Allow + deny lists from the Task 5 manager; deprecated v4 rules pruned. */
function mergePermissions(settings) {
  if (!settings.permissions || typeof settings.permissions !== 'object') settings.permissions = {};
  const { kept } = permissions.pruneDeprecatedPermissions(settings.permissions.allow || []);
  const allow = new Set(kept);
  for (const rule of permissions.getAllPermissions()) allow.add(rule);
  const deny = new Set(settings.permissions.deny || []);
  for (const rule of permissions.getAllDenyPermissions()) deny.add(rule);
  settings.permissions.allow = [...allow];
  settings.permissions.deny = [...deny];
  return settings;
}

// ---- steps 11 + 12: settings.local.json ----
function registerSettings(root) {
  const settings = mergePermissions(mergeHooks(readSettings(root)));
  return writeSettings(root, settings);
}

/** Removes our hook entries and our permission rules; everything else stays. */
function unregisterSettings(root) {
  const file = rel(root, SETTINGS_LOCAL);
  if (!fs.existsSync(file)) return false;
  const settings = readSettings(root);
  if (settings.hooks && typeof settings.hooks === 'object') {
    for (const event of Object.keys(settings.hooks)) {
      if (!Array.isArray(settings.hooks[event])) continue;
      settings.hooks[event] = settings.hooks[event].filter((e) => !isOurHookEntry(e));
      if (settings.hooks[event].length === 0) delete settings.hooks[event];
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }
  if (settings.permissions && typeof settings.permissions === 'object') {
    const ours = new Set([
      ...permissions.getAllPermissions(),
      ...permissions.deprecatedPermissions,
    ]);
    const ourDeny = new Set(permissions.getAllDenyPermissions());
    if (Array.isArray(settings.permissions.allow)) {
      settings.permissions.allow = settings.permissions.allow.filter((r) => !ours.has(r));
      if (settings.permissions.allow.length === 0) delete settings.permissions.allow;
    }
    if (Array.isArray(settings.permissions.deny)) {
      settings.permissions.deny = settings.permissions.deny.filter((r) => !ourDeny.has(r));
      if (settings.permissions.deny.length === 0) delete settings.permissions.deny;
    }
    if (Object.keys(settings.permissions).length === 0) delete settings.permissions;
  }
  writeSettings(root, settings);
  return true;
}

// ---- step 13: _bmad-output/stella/ folders (created only when missing) ----
function ensureOutputFolders(root) {
  const created = [];
  for (const folder of OUTPUT_FOLDERS) {
    const target = rel(root, `${STELLA_OUTPUT_DIR}/${folder}`);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
      created.push(folder);
    }
  }
  return created;
}

// ---- reverse: Stella parts of .claude/ (re-run clean + uninstall) ----
function removeStellaClaudeParts(root) {
  const removed = [];
  for (const name of STELLA_SKILLS) {
    if (rmIfPresent(rel(root, `${CLAUDE_SKILLS_DIR}/${name}`)))
      removed.push(`${CLAUDE_SKILLS_DIR}/${name}`);
  }
  if (rmIfPresent(rel(root, STELLA_CLAUDE_DIR))) removed.push(STELLA_CLAUDE_DIR);
  return removed;
}

/** Official skills replaced by a Stella version: not kept after the BMad install. */
function removeShadowedBmadSkills(root) {
  const removed = [];
  for (const name of BMAD_SKILLS_REMOVED) {
    if (rmIfPresent(rel(root, `${CLAUDE_SKILLS_DIR}/${name}`))) removed.push(name);
  }
  return removed;
}

/** Official BMad skills (uninstall only). */
function removeBmadSkills(root) {
  const dir = rel(root, CLAUDE_SKILLS_DIR);
  const removed = [];
  if (!fs.existsSync(dir)) return removed;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('bmad-')) {
      rmIfPresent(path.join(dir, entry.name));
      removed.push(`${CLAUDE_SKILLS_DIR}/${entry.name}`);
    }
  }
  return removed;
}

module.exports = {
  copyStellaFiles,
  copySkills,
  copyHooks,
  registerSettings,
  unregisterSettings,
  ensureOutputFolders,
  removeStellaClaudeParts,
  removeBmadSkills,
  removeShadowedBmadSkills,
  readSettings,
  mergeHooks,
  mergePermissions,
  hookCommand,
  copyDir,
  SRC,
};
