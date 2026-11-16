'use strict';

// Plugin mode (bmad-stella plugin installed): the installer must not copy
// project-level skills or register project hooks, and must clean up copies a
// pre-plugin install left behind. Exercises pluginActive detection and the
// register/clean behavior of mergeHooks/registerSettings around it.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LIB = path.join(__dirname, '..', '..', 'tools', 'installer', 'lib');
const layer = require(path.join(LIB, 'stella-layer.js'));
const {
  CLAUDE_SKILLS_DIR,
  STELLA_CLAUDE_DIR,
  SETTINGS_LOCAL,
  STELLA_SKILLS,
  PROJECT_HOOKS,
} = require(path.join(LIB, 'constants.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `stella-plugin-mode-${name}-`));
const rel = (root, p) => path.join(root, ...p.split('/'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
};

// ================= pluginActive detection =================
{
  const home = tmp('home-none');
  const root = tmp('root-none');
  ok(!layer.pluginActive(root, { home }), 'no settings anywhere: plugin not active');

  writeJson(path.join(home, '.claude', 'settings.json'), { enabledPlugins: {} });
  ok(!layer.pluginActive(root, { home }), 'empty enabledPlugins: not active');

  writeJson(path.join(home, '.claude', 'settings.json'), {
    enabledPlugins: { 'other-plugin@stella': true, 'bmad-stella@stella': false },
  });
  ok(!layer.pluginActive(root, { home }), 'other plugin true, ours false: not active');

  writeJson(path.join(home, '.claude', 'settings.json'), {
    enabledPlugins: { 'bmad-stella@stella': true },
  });
  ok(layer.pluginActive(root, { home }), 'bmad-stella@stella true in user settings: active');

  // Any marketplace name after @ counts.
  writeJson(path.join(home, '.claude', 'settings.json'), {
    enabledPlugins: { 'bmad-stella@my-fork': true },
  });
  ok(layer.pluginActive(root, { home }), 'bmad-stella@<other marketplace>: active');

  // Project-level enable also counts, with a clean home.
  const home2 = tmp('home-clean');
  writeJson(rel(root, SETTINGS_LOCAL), { enabledPlugins: { 'bmad-stella@stella': true } });
  ok(layer.pluginActive(root, { home: home2 }), 'enabled in project settings.local.json: active');

  // Malformed settings never throw.
  const home3 = tmp('home-bad');
  fs.mkdirSync(path.join(home3, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home3, '.claude', 'settings.json'), '{not json');
  const root3 = tmp('root-bad');
  ok(!layer.pluginActive(root3, { home: home3 }), 'malformed settings.json: not active, no throw');
}

// ================= mergeHooks register:false strips ours, adds none =================
{
  const foreign = {
    hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR}/.claude/mine/hook.js"' }],
  };
  const ours = {
    hooks: [
      {
        type: 'command',
        command: 'node "${CLAUDE_PROJECT_DIR}/.claude/stella/hooks/memory/user-prompt-submit.js"',
      },
    ],
  };
  const settings = layer.mergeHooks(
    { hooks: { UserPromptSubmit: [foreign, ours], SessionStart: [ours] } },
    { register: false },
  );
  ok(
    settings.hooks.UserPromptSubmit.length === 1 && settings.hooks.UserPromptSubmit[0] === foreign,
    'register:false keeps foreign entry, strips ours',
  );
  ok(!settings.hooks.SessionStart, 'register:false drops event left empty');
  const emptied = layer.mergeHooks({ hooks: { SessionStart: [ours] } }, { register: false });
  ok(!emptied.hooks, 'register:false drops hooks key when nothing remains');
}

// ================= registerSettings in plugin mode =================
{
  const root = tmp('register');
  // A pre-plugin install registered our hooks; plugin-mode re-run must remove them
  // but keep permissions management working.
  layer.registerSettings(root); // normal mode first
  const before = layer.readSettings(root);
  ok(Object.keys(before.hooks || {}).length > 0, 'precondition: normal mode registered our hooks');

  layer.registerSettings(root, { hooks: false });
  const after = layer.readSettings(root);
  ok(!after.hooks, 'plugin mode: our hook entries removed from settings.local.json');
  ok(
    Array.isArray(after.permissions && after.permissions.allow) &&
      after.permissions.allow.length > 0,
    'plugin mode: permissions still merged',
  );
}

// ================= project copies removed in plugin mode =================
{
  const root = tmp('cleanup');
  // Simulate a pre-plugin install: project skill copies + hook scripts present.
  layer.copySkills(root);
  layer.copyHooks(root);
  ok(
    fs.existsSync(rel(root, `${CLAUDE_SKILLS_DIR}/${STELLA_SKILLS[0]}`)),
    'precondition: project skill copies exist',
  );

  const removed = layer.removeStellaClaudeParts(root);
  ok(
    STELLA_SKILLS.every((name) => !fs.existsSync(rel(root, `${CLAUDE_SKILLS_DIR}/${name}`))),
    'all project skill copies removed',
  );
  ok(!fs.existsSync(rel(root, STELLA_CLAUDE_DIR)), '.claude/stella (hook scripts) removed');
  ok(
    removed.length === STELLA_SKILLS.length + 1 || removed.includes(STELLA_CLAUDE_DIR),
    'removal is reported for the summary',
  );
  // Hook definitions still come from one source of truth.
  ok(PROJECT_HOOKS.length > 0, 'PROJECT_HOOKS still defined for non-plugin installs');
}

console.log(`plugin-mode: ${total - fails}/${total} passed`);
process.exit(fails === 0 ? 0 : 1);
