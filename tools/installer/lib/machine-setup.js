'use strict';

// `bmad-stella install` — the once-per-machine half of the user-level install.
// Puts under ~/.claude/: the credentials, a runnable copy of this package (the
// app), a pinned BMad + TEA install kept as the _bmad/ master copy, the official
// skills, and the Stella skills (through the bmad-stella plugin when the developer
// wants it, as plain user-level copies otherwise). It touches no project;
// `/stella-init` (project-init.js) does the per-project part, project hooks included.
// Design: tea-module/rnd-docs/user-level-install-design.md.
// Every external effect is injectable, as in installer.js.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cjson = require('comment-json');
const constants = require('./constants');
const preflight = require('./preflight');
const toolInstaller = require('./tool-installer');
const mcpRegistrar = require('./mcp-registrar');
const playwrightMcpRegistrar = require('./playwright-mcp-registrar');
const jira = require('./jira-credentials-manager');
const runner = require('./bmad-runner');
const teaSkillInstaller = require('./tea-skill-installer');
const teaSetup = require('./tea-setup');
const builderSkillInstaller = require('./builder-skill-installer');
const builderSetup = require('./builder-setup');
const npmCache = require('./npm-cache');
const pluginInstaller = require('./plugin-installer');
const layer = require('./stella-layer');
const userLevel = require('./user-level');
const { silentUi } = require('./ui');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const NEW_SUFFIX = '.new';
const APP_ENTRIES = ['tools', 'stella']; // + package.json (and the lock file when present)
const PLUGIN_QUESTION = 'Do you want plugins for Claude Desktop?';
const PLUGIN_OK = new Set(['installed', 'reinstalled']);
// Marks our entries in ~/.claude/settings.json: commands that run from the app copy.
const APP_HOOKS_MARK = `${constants.APP_DIR_PARTS.join('/')}/stella/hooks/project/`;

const seconds = (ms) => Math.max(1, Math.round(ms / 1000));
const posix = (p) => p.split(path.sep).join('/');
const rm = (target) => fs.rmSync(target, { recursive: true, force: true });

const defaultUserHooks = async () => {
  const hooksManager = require('./hooks-manager');
  return hooksManager.setupCustomHooks(null, { quiet: true });
};

/** Production dependencies for the app copy. Throws with the last output line on failure. */
function defaultInstallAppDeps(dir) {
  const command = fs.existsSync(path.join(dir, 'package-lock.json')) ? 'ci' : 'install';
  const r = spawnSync(`npm ${command} --omit=dev --ignore-scripts --no-audit --no-fund`, {
    cwd: dir,
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const lines = runner.tail(`${r.stdout || ''}\n${r.stderr || ''}`);
    throw new Error(`npm ${command} failed: ${lines.at(-1) || `exit ${r.status}`}`);
  }
}

/**
 * One y/n question (L3), asked only when the plugin is not installed yet.
 * STELLA_PLUGIN answers it without a terminal; no terminal = no.
 */
async function askPlugin({ prompt, env, isTTY }) {
  const flag = String(env.STELLA_PLUGIN || '')
    .trim()
    .toLowerCase();
  if (flag) return ['1', 'y', 'yes', 'true'].includes(flag);
  if (!isTTY) return false;
  const { plugin } = await prompt([
    { type: 'confirm', name: 'plugin', message: PLUGIN_QUESTION, default: false },
  ]);
  return Boolean(plugin);
}

/**
 * Copies this package to ~/.claude/stella/app/ and installs its production
 * dependencies. Staged first, so a failed dependency install keeps the old app.
 * @returns {{status:'installed'|'self', dir:string}}
 */
function installApp({ home, repoRoot = REPO_ROOT, installAppDeps = defaultInstallAppDeps }) {
  const dest = userLevel.appDir(home);
  if (path.resolve(repoRoot) === path.resolve(dest)) return { status: 'self', dir: dest };
  const staged = dest + NEW_SUFFIX;
  rm(staged);
  fs.mkdirSync(staged, { recursive: true });
  for (const file of ['package.json', 'package-lock.json']) {
    const src = path.join(repoRoot, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(staged, file));
  }
  for (const entry of APP_ENTRIES) {
    layer.copyDir(path.join(repoRoot, entry), path.join(staged, entry));
  }
  try {
    installAppDeps(staged);
    userLevel.discard(userLevel.swapDir(staged, dest));
  } finally {
    userLevel.discard(staged); // gone after a successful swap; removed after a failure
  }
  return { status: 'installed', dir: dest };
}

/**
 * Builds the master copy: the pinned official BMad install, the TEA and Builder
 * skills (as plain folders) and the [modules.tea] answers, in a staging folder that
 * replaces ~/.claude/stella/bmad-template/ only when every step succeeded.
 * @returns {Promise<object>} the template marker
 */
async function buildTemplate({
  home,
  userName,
  verbose,
  log,
  runBmad,
  runTeaSkill,
  setupTeaConfig,
  runBuilderSkill,
}) {
  const final = userLevel.templateDir(home);
  const staged = final + NEW_SUFFIX;
  rm(staged);
  fs.mkdirSync(staged, { recursive: true });
  const opts = { verbose, write: () => {}, log };

  try {
    const bmadStatus = await runBmad(staged, {
      ...opts,
      projectName: constants.TEMPLATE_PROJECT_NAME,
      userName,
    });
    if (bmadStatus !== 0) throw new Error(`BMad install exited with code ${bmadStatus}.`);
    const teaStatus = await runTeaSkill(staged, { ...opts, copy: true });
    if (teaStatus !== 0) throw new Error(`TEA skill install exited with code ${teaStatus}.`);
    setupTeaConfig(staged);
    const builderStatus = await runBuilderSkill(staged, { ...opts, copy: true });
    if (builderStatus !== 0) {
      throw new Error(`Builder skill install exited with code ${builderStatus}.`);
    }
    // Into the master copy's _bmad/, so every project gets it with /stella-init.
    builderSetup.apply(staged);

    const bmadDir = path.join(staged, constants.BMAD_DIR);
    rm(path.join(bmadDir, 'render'));
    const marker = userLevel.writeMarker(bmadDir);
    userLevel.discard(userLevel.swapDir(staged, final));
    return marker;
  } finally {
    userLevel.discard(staged);
  }
}

const dirNames = (dir) => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
};

function replaceDir(src, dest) {
  rm(dest);
  layer.copyDir(src, dest);
}

/**
 * ~/.claude/skills/: the official BMad + TEA + Builder skills from the template (minus the
 * ones a Stella skill replaces), and the Stella skills unless the plugin ships
 * them. Each folder is replaced by exact name; a developer's own skills stay.
 * Stella copies from an earlier run are removed in plugin mode only when that
 * run recorded them, so a developer's own same-named skill is never deleted.
 * @returns {{bmadSkills:string[], stellaSkills:string[]}}
 */
function installUserSkills({ home, pluginMode, repoRoot = REPO_ROOT, previous = null }) {
  const dest = userLevel.userSkillsDir(home);
  const templateSkills = path.join(
    userLevel.templateDir(home),
    ...constants.CLAUDE_SKILLS_DIR.split('/'),
  );
  fs.mkdirSync(dest, { recursive: true });

  const shadowed = new Set(constants.BMAD_SKILLS_REMOVED);
  const bmadSkills = dirNames(templateSkills).filter((name) => !shadowed.has(name));
  for (const name of bmadSkills) replaceDir(path.join(templateSkills, name), path.join(dest, name));
  // Skills an earlier template shipped and this one dropped.
  for (const name of (previous && previous.bmadSkills) || []) {
    if (!bmadSkills.includes(name)) rm(path.join(dest, name));
  }

  const ours = [...constants.STELLA_SKILLS, ...constants.USER_LEVEL_ONLY_SKILLS];
  for (const name of (previous && previous.stellaSkills) || []) {
    if (pluginMode || !ours.includes(name)) rm(path.join(dest, name));
  }
  if (pluginMode) return { bmadSkills, stellaSkills: [] };
  for (const name of ours) {
    replaceDir(path.join(repoRoot, 'stella', 'skills', name), path.join(dest, name));
  }
  return { bmadSkills, stellaSkills: ours };
}

function readUserSettings(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  if (!text.trim()) return {};
  return cjson.parse(text); // a broken settings.json must stop us, not be overwritten
}

const isAppHookEntry = (entry) =>
  Boolean(entry) &&
  Array.isArray(entry.hooks) &&
  entry.hooks.some(
    (h) => typeof h.command === 'string' && posix(h.command).includes(APP_HOOKS_MARK),
  );

/**
 * The session check (init-check) in ~/.claude/settings.json, run from the app copy.
 * It is the one hook that must fire outside a set-up project, so it cannot live in
 * one. The project hooks (friction-logger, pr-review-guard, memory) are not
 * registered here: `init` puts them into each project. Our entries are replaced,
 * never duplicated — that also clears project hooks an earlier version registered
 * here; in plugin mode they are only removed (the plugin's hooks.json has the
 * check). Foreign entries stay.
 * @returns {string[]} hook names registered
 */
function registerUserHooks({ home, pluginMode }) {
  const file = userLevel.userSettingsFile(home);
  const settings = readUserSettings(file);
  const hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};
  let touched = false;
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue;
    const kept = hooks[event].filter((e) => !isAppHookEntry(e));
    if (kept.length !== hooks[event].length) touched = true;
    if (kept.length === 0) delete hooks[event];
    else hooks[event] = kept;
  }
  const registered = [];
  if (!pluginMode) {
    const base = `${posix(userLevel.appDir(home))}/stella/hooks/project`;
    for (const hook of [constants.INIT_CHECK_HOOK]) {
      for (const [event, spec] of Object.entries(hook.events)) {
        if (!Array.isArray(hooks[event])) hooks[event] = [];
        const entry = {
          hooks: [{ type: 'command', command: `node "${base}/${hook.name}/${spec.file}"` }],
        };
        if (spec.matcher) entry.matcher = spec.matcher;
        hooks[event].push(entry);
      }
      registered.push(hook.name);
    }
    touched = true;
  }
  if (!touched) return registered;
  if (Object.keys(hooks).length > 0) settings.hooks = hooks;
  else delete settings.hooks;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, cjson.stringify(settings, null, 2) + '\n');
  return registered;
}

const mcpOk = (m) => Boolean(m && ['registered', 'replaced', 'present'].includes(m.status));

/**
 * @param {object} deps prompt (required), fetch, verbose, ui, env, isTTY, now, home,
 *   repoRoot, check, tools, runBmad, runTeaSkill, setupTeaConfig, runBuilderSkill, cleanNpmCache,
 *   pluginInstalled() → boolean, installPlugin({reinstall}) → {status, detail},
 *   installAppDeps(dir), mcp, playwrightMcp, userHooks
 * @returns {Promise<object>} summary
 */
async function setup(deps) {
  const {
    prompt,
    fetch,
    verbose = false,
    ui = silentUi(),
    env = process.env,
    isTTY = Boolean(process.stdin.isTTY),
    now = Date.now,
    home = os.homedir(),
    repoRoot = REPO_ROOT,
    check = preflight.check,
    tools = toolInstaller,
    runBmad = (r, o) => runner.install(r, o),
    runTeaSkill = (r, o) => teaSkillInstaller.install(r, o),
    setupTeaConfig = (r) => teaSetup.apply(r),
    runBuilderSkill = (r, o) => builderSkillInstaller.install(r, o),
    cleanNpmCache = () => npmCache.clean(),
    installPlugin = (o) => pluginInstaller.ensure(o),
    // The CLI's own list, or the enabled flag in the settings when the CLI is missing.
    pluginInstalled = () =>
      pluginInstaller.isInstalled().installed ||
      layer.pluginEnabled(path.join(home, ...constants.STELLA_HOME_PARTS), { home }),
    installAppDeps = defaultInstallAppDeps,
    mcp = mcpRegistrar,
    playwrightMcp = playwrightMcpRegistrar,
    userHooks = defaultUserHooks,
  } = deps;
  const stellaHome = path.join(home, ...constants.STELLA_HOME_PARTS);
  const summary = { home: stellaHome, warnings: [] };
  const note = (text) => ui.line('note', text);
  const warn = (text) => {
    summary.warnings.push(text);
    ui.line('warn', text);
  };

  const hasEnvCreds = Boolean(env.JIRA_EMAIL && env.JIRA_API_TOKEN);
  if (!isTTY && !hasEnvCreds && !jira.findCredentials(stellaHome, { home })) {
    throw new Error(
      'No interactive terminal. Set JIRA_EMAIL and JIRA_API_TOKEN in the environment to install non-interactively.',
    );
  }

  ui.header(stellaHome);

  // ---- checks: node, then uv and Python (installed when missing, as in `install`) ----
  ui.section('Checks');
  let pf = check();
  if (!pf.found.node) throw new Error(pf.errors.join('\n'));
  if (!pf.found.uv) {
    const r = tools.ensureUv();
    if (r.status === 'failed') {
      throw new Error(
        `uv could not be installed (${r.detail}). Install it from ${constants.UV_INSTALL_URL} and re-run.`,
      );
    }
  }
  if (!pf.found.python) {
    const r = tools.ensurePython();
    if (r.status !== 'installed' && r.status !== 'present') {
      warn(
        `Python ${constants.PYTHON_INSTALL_VERSION} was not installed (${r.detail}). uv will download one on first use.`,
      );
    }
  }
  if (!pf.found.uv || !pf.found.python) pf = check();
  if (!pf.ok) throw new Error(pf.errors.join('\n'));
  for (const w of pf.warnings) warn(w);
  ui.line(
    'ok',
    ['node', 'uv', 'python', 'gh', 'git']
      .filter((t) => pf.found[t])
      .map((t) => (pf.versions[t] ? `${t} ${pf.versions[t]}` : t))
      .join('   '),
  );
  ui.gap();

  // ---- credentials: one file per machine ----
  ui.section('JIRA');
  const creds = await jira.run(stellaHome, { prompt, fetch, log: note, env, home });
  summary.credentials = { email: creds.email, verified: creds.verified, source: creds.source };
  ui.line(
    'ok',
    creds.verified
      ? `Signed in as ${creds.displayName || creds.email}`
      : `${creds.email} (not verified)`,
  );
  ui.gap();

  // ---- plugin (L3): look first, then act ----
  //   installed     → no question: uninstall and install again, so the plugin moves
  //                   on together with this BMad-Stella version
  //   not installed → one y/n question; yes installs the marketplace and the plugin
  ui.section('Plugin');
  const previous = userLevel.readMachineState(home);
  const hadPlugin = pluginInstalled();
  summary.pluginWasInstalled = hadPlugin;
  summary.pluginWanted = hadPlugin || (await askPlugin({ prompt, env, isTTY }));
  summary.plugin = null;
  const pluginId = `${constants.PLUGIN.name}@${constants.PLUGIN.marketplace}`;
  if (summary.pluginWanted) {
    const s = ui.spin(
      hadPlugin ? 'reinstalling the plugin…' : 'adding the marketplace and the plugin…',
    );
    summary.plugin = installPlugin({ reinstall: hadPlugin });
    if (PLUGIN_OK.has(summary.plugin.status)) {
      s.succeed(`${pluginId} ${summary.plugin.status}  (CLI · VS Code · Claude Desktop Code tab)`);
    } else {
      s.fail(`${pluginId} not installed — ${summary.plugin.detail}`);
      summary.warnings.push(`Plugin not installed: ${summary.plugin.detail}`);
    }
  } else ui.line('info', 'Skipped — skills and hooks are copied to ~/.claude/ instead');
  // Plugin and user-level copies at once would load every skill twice and fire every
  // hook twice. After a failed step, what is on the machine now decides.
  summary.pluginMode = summary.plugin
    ? PLUGIN_OK.has(summary.plugin.status) || pluginInstalled()
    : false;
  ui.gap();

  // ---- app, then the BMad master copy ----
  // The app goes first: a new master copy makes every project refresh at its next
  // session start, and that refresh must run the code that matches it.
  ui.section(`BMad ${constants.BMAD_VERSION}`);
  const appStarted = now();
  const s2 = ui.spin('installing the Stella app…');
  try {
    summary.app = installApp({ home, repoRoot, installAppDeps });
  } catch (error) {
    s2.fail(error.message);
    throw new Error(
      `Stella app install failed: ${error.message}. Nothing on this machine was replaced.`,
    );
  }
  s2.succeed(
    `App installed  ${constants.APP_DIR_PARTS.join('/')}`,
    `${seconds(now() - appStarted)}s`,
  );

  summary.npmCache = cleanNpmCache();
  if (summary.npmCache.status !== 'cleaned') {
    warn(`npm cache clean failed (${summary.npmCache.detail}) — continuing`);
  }
  const tail = [];
  const started = now();
  const s1 = verbose ? null : ui.spin('building the BMad master copy…');
  try {
    summary.template = await buildTemplate({
      home,
      userName: runner.gitUserName({ cwd: home }),
      verbose,
      log: verbose ? note : (t) => tail.push(t),
      runBmad,
      runTeaSkill,
      setupTeaConfig,
      runBuilderSkill,
    });
  } catch (error) {
    if (s1) s1.fail(error.message);
    else ui.line('fail', error.message);
    for (const t of tail) ui.cont(t);
    throw new Error(`${error.message} The previous master copy and skills were kept.`);
  }
  const built = `Master copy built  ${constants.TEMPLATE_DIR_PARTS.join('/')}`;
  if (s1) s1.succeed(built, `${seconds(now() - started)}s`);
  else ui.line('ok', built, `${seconds(now() - started)}s`);
  ui.gap();

  // ---- Stella layer at user level ----
  ui.section('Stella layer');
  const s3 = ui.spin('skills, hooks and MCP servers…');
  const late = []; // printed under the summary line, once the spinner has settled
  summary.skills = installUserSkills({ home, pluginMode: summary.pluginMode, repoRoot, previous });
  try {
    summary.hooks = registerUserHooks({ home, pluginMode: summary.pluginMode });
  } catch (error) {
    // A settings.json we cannot parse is left exactly as it is.
    summary.hooks = [];
    late.push(
      `Hooks not registered — ~/.claude/settings.json could not be read (${error.message}). Fix the file and run install again.`,
    );
  }
  summary.mcp = mcp.register(home, { scope: 'user' });
  if (!mcpOk(summary.mcp)) late.push(`Atlassian MCP not registered — ${summary.mcp.detail}`);
  summary.playwrightMcp = playwrightMcp.register(home);
  try {
    summary.userHooks = await userHooks();
    if (summary.userHooks && summary.userHooks.error) {
      late.push(
        `User-level hooks not installed: ${summary.userHooks.error.message || summary.userHooks.error}`,
      );
    }
  } catch (error) {
    summary.userHooks = { status: 'error', error: error.message };
    late.push(`User-level hooks not installed: ${error.message}`);
  }
  summary.state = {
    stellaVersion: userLevel.STELLA_VERSION,
    templateId: summary.template.id,
    pluginMode: summary.pluginMode,
    bmadSkills: summary.skills.bmadSkills,
    stellaSkills: summary.skills.stellaSkills,
    setupAt: new Date(now()).toISOString(),
  };
  userLevel.writeMachineState(summary.state, home);
  s3.succeed(
    [
      `${summary.skills.bmadSkills.length} BMad + TEA + Builder skills`,
      summary.pluginMode
        ? 'Stella skills + hooks from the plugin'
        : `${summary.skills.stellaSkills.length} Stella skills   session check hook`,
      mcpOk(summary.mcp) ? 'Atlassian MCP' : null,
      Array.isArray(summary.playwrightMcp) && summary.playwrightMcp.some(mcpOk)
        ? 'Playwright MCP'
        : null,
    ]
      .filter(Boolean)
      .join('   '),
  );
  for (const text of late) warn(text);

  ui.end('This machine is set up. In each project, open Claude Code and run /stella-init');
  return summary;
}

module.exports = {
  setup,
  askPlugin,
  installApp,
  buildTemplate,
  installUserSkills,
  registerUserHooks,
  PLUGIN_QUESTION,
  APP_HOOKS_MARK,
};
