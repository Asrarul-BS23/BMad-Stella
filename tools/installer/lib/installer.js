'use strict';

// Orchestrator for `install` and `uninstall`. Every external effect (prompt, fetch,
// BMad runner, user-level hooks, terminal output) is injectable so the whole cycle
// is testable. Terminal output goes through a `ui` (see ./ui.js); tests pass the
// silent one.

const path = require('node:path');
const constants = require('./constants');
const preflight = require('./preflight');
const toolInstaller = require('./tool-installer');
const mcpRegistrar = require('./mcp-registrar');
const jira = require('./jira-credentials-manager');
const picker = require('./project-picker');
const cleaner = require('./cleaner');
const legacyMemory = require('./legacy-memory-migrator');
const runner = require('./bmad-runner');
const gitignore = require('./gitignore');
const layer = require('./stella-layer');
const memoryBootstrap = require('./memory-bootstrap');
const projectContextBootstrap = require('./project-context-bootstrap');
const domain = require('./domain-knowledge-fetcher');
const { silentUi } = require('./ui');

const defaultUserHooks = async () => {
  const hooksManager = require('./hooks-manager');
  return hooksManager.setupCustomHooks(null, { quiet: true });
};

const seconds = (ms) => Math.max(1, Math.round(ms / 1000));

/**
 * @param {string} root project folder
 * @param {object} deps prompt (required), fetch, verbose, runBmad(root, opts) → status,
 *   userHooks() → {status}, bootstrapMemory(root) → {domainMap, patterns}, ui, env, isTTY,
 *   now, home (credentials file lives under it)
 * @returns {Promise<object>} summary
 */
async function install(root, deps) {
  const {
    prompt,
    fetch,
    verbose = false,
    runBmad = (r, o) => runner.install(r, o),
    userHooks = defaultUserHooks,
    bootstrapMemory = (r) => memoryBootstrap.bootstrapIfMissing(r),
    projectContext = (r) => projectContextBootstrap.startIfMissing(r),
    check = preflight.check,
    tools = toolInstaller,
    mcp = mcpRegistrar,
    ui = silentUi(),
    env = process.env,
    isTTY = Boolean(process.stdin.isTTY),
    now = Date.now,
    home,
  } = deps;
  const summary = { root, warnings: [], removed: [], created: [] };
  const note = (text) => ui.line('note', text);

  if (!isTTY) {
    const missing = ['JIRA_EMAIL', 'JIRA_API_TOKEN', 'STELLA_PROJECT'].filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `No interactive terminal. Set ${missing.join(', ')} in the environment to install non-interactively.`,
      );
    }
  }

  ui.header(root);

  // 1. preflight; uv and Python are installed when missing (silent, user-level)
  ui.step(1);
  const s1 = ui.spin('checking node, uv, python, gh, git…');
  let pf = check();
  if (!pf.found.node) {
    s1.fail(pf.errors[0]);
    throw new Error(pf.errors.join('\n'));
  }
  const installed = {};
  const installedVersions = {};
  const earlyWarnings = [];
  if (!pf.found.uv) {
    s1.update('installing uv…');
    const r = tools.ensureUv();
    if (r.status === 'failed') {
      s1.fail(`uv could not be installed — ${r.detail}`);
      throw new Error(
        `uv could not be installed (${r.detail}). Install it from ${constants.UV_INSTALL_URL} and re-run.`,
      );
    }
    if (r.status === 'installed') installed.uv = true;
  }
  if (!pf.found.python) {
    s1.update(`installing python ${constants.PYTHON_INSTALL_VERSION} for uv…`);
    const r = tools.ensurePython();
    if (r.status === 'installed') {
      installed.python = true;
      installedVersions.python = r.version;
    } else if (r.status !== 'present')
      earlyWarnings.push(
        `Python ${constants.PYTHON_INSTALL_VERSION} was not installed (${r.detail}). uv will download one on first use.`,
      );
  }
  if (installed.uv || installed.python) pf = check();
  summary.tools = { installed: Object.keys(installed) };
  earlyWarnings.push(...pf.warnings);
  summary.warnings.push(...earlyWarnings);
  if (!pf.ok) {
    s1.fail(pf.errors[0]);
    throw new Error(pf.errors.join('\n'));
  }
  s1.succeed(
    // uv's own Python is not on PATH, so the re-check misses it; show it when we installed it.
    ['node', 'uv', 'python', 'gh', 'git']
      .filter((t) => pf.found[t] || installed[t])
      .map((t) => {
        const ver = pf.versions[t] || installedVersions[t];
        const v = ver ? `${t} ${ver}` : t;
        if (!installed[t]) return v;
        return `${v} (installed${t === 'python' ? ' for uv' : ''})`;
      })
      .join('   '),
  );
  for (const w of earlyWarnings) ui.line('warn', w);

  // 2. re-run detection
  summary.rerun = cleaner.isRerun(root);
  if (summary.rerun)
    ui.line('info', 'Existing install found — re-installing (_bmad-output is kept)');
  ui.gap();

  // 3 + 4. credentials (inquirer lines render inside the tree)
  ui.step(2);
  const creds = await jira.run(root, { prompt, fetch, log: note, env, home });
  summary.credentials = {
    email: creds.email,
    verified: creds.verified,
    source: creds.source,
    displayName: creds.displayName || null,
    removedProjectFile: creds.removedProjectFile,
  };
  const moved = creds.source === 'project' || creds.source === 'legacy';
  ui.line(
    'ok',
    creds.verified
      ? `Signed in as ${creds.displayName || creds.email}${
          moved ? `  (credentials moved to ${constants.CREDENTIALS_FILE_LABEL})` : ''
        }`
      : `${creds.email} (not verified)`,
  );
  ui.gap();

  // 5. project
  ui.step(3);
  const project = await picker.run(root, creds, { prompt, fetch, log: note, env });
  summary.project = project;
  ui.line('ok', `${project.name}${project.pageId ? '' : ' (no Confluence page)'}`);

  // 5.5. carry a v4 project's memory forward before clean() deletes bmad-docs/
  summary.legacyMigration = legacyMemory.migrateLegacy(root);
  if (summary.legacyMigration.memoryMigrated)
    ui.line('ok', 'Carried over previous memory  →  _bmad-output/stella/memory');
  if (summary.legacyMigration.plansMigrated > 0)
    ui.line(
      'ok',
      `Archived ${summary.legacyMigration.plansMigrated} previous plan file(s)  →  _bmad-output/implementation-artifacts/legacy-plans`,
    );

  // 6. clean (v4 leftovers; on re-run also _bmad/ and the Stella parts of .claude/)
  summary.removed.push(...cleaner.clean(root, { rerun: summary.rerun }).removed);
  if (summary.rerun) summary.removed.push(...layer.removeStellaClaudeParts(root));
  if (summary.rerun)
    ui.line('ok', 'Removed previous install  _bmad · Stella skills · .claude/stella');
  else if (summary.removed.length > 0)
    ui.line('ok', `Removed v4 leftovers  ${summary.removed.join(' · ')}`);
  ui.gap();

  // 7. BMad (spinner unless --verbose streams BMad's own output)
  ui.step(4);
  const started = now();
  const tail = [];
  const s4 = verbose ? null : ui.spin('installing…');
  const status = await runBmad(root, {
    projectName: project.name,
    userName: runner.gitUserName({ cwd: root }),
    verbose,
    write: () => {},
    log: verbose ? note : (t) => tail.push(t),
  });
  const took = `${seconds(now() - started)}s`;
  if (status !== 0) {
    if (s4) s4.fail(`exit ${status}`);
    else ui.line('fail', `exit ${status}`);
    for (const t of tail) ui.cont(t);
    throw new Error(`BMad install exited with code ${status}. Nothing else was changed.`);
  }
  if (s4) s4.succeed('Installed', took);
  else ui.line('ok', 'Installed', took);
  ui.gap();

  // 8. gitignore
  summary.gitignoreAdded = gitignore.ensure(root).added;

  // 9-13. Stella layer
  ui.step(5);
  const s5 = ui.spin('copying skills, hooks and helpers…');
  layer.copyStellaFiles(root, { project });
  summary.skills = layer.copySkills(root);
  summary.removedBmadSkills = layer.removeShadowedBmadSkills(root);
  summary.hooks = layer.copyHooks(root);
  summary.settings = layer.registerSettings(root);
  summary.created.push(...layer.ensureOutputFolders(root));

  // Fire-and-forget: collect domain-map.md/patterns.md now if a legacy
  // migration didn't already carry them over, instead of waiting for
  // daily-job.js's first weekly run.
  summary.memoryBootstrap = bootstrapMemory(root);

  // Per-machine project context, generated in the background by the worker (silent, never fatal)
  summary.projectContext = projectContext(root);

  // Atlassian MCP in Claude Code's local scope (silent; login happens later via /mcp)
  s5.update('registering Atlassian MCP…');
  summary.mcp = mcp.register(root);

  // 14. domain docs
  s5.update('fetching domain docs…');
  summary.domainDocs = await domain.fetchDomainDocs(root, { project, creds, fetch, log: note });

  // 15. user-level hooks, silent and never fatal
  s5.update('user-level hooks…');
  try {
    summary.userHooks = await userHooks();
    if (summary.userHooks && summary.userHooks.error) {
      summary.userHooks.status = 'error';
      summary.warnings.push(
        `User-level hooks not installed: ${summary.userHooks.error.message || summary.userHooks.error}`,
      );
    }
  } catch (error) {
    summary.userHooks = { status: 'error', error: error.message };
    summary.warnings.push(`User-level hooks not installed: ${error.message}`);
  }
  s5.succeed(layerDetail(summary));
  for (const n of layerNotes(summary)) {
    if (n.kind === 'warn') {
      ui.line('warn', n.text);
      if (n.cont) ui.cont(n.cont);
    } else ui.line('note', n.text);
  }
  for (const w of summary.warnings.filter((w) => !earlyWarnings.includes(w))) ui.line('warn', w);

  ui.end(`${project.name} is set up in ${path.basename(root)}`);
  return summary;
}

/** The ✓ line of step 5. */
function layerDetail(s) {
  const d = s.domainDocs;
  const parts = [
    `${s.skills.length} skills`,
    `${s.hooks.length} hooks`,
    'permissions',
    mcpOk(s.mcp) ? 'Atlassian MCP' : null,
    d.status === 'fetched' ? `${d.files.length} domain pages` : null,
    s.userHooks && s.userHooks.status && s.userHooks.status !== 'error' ? 'user hooks' : null,
  ];
  return parts.filter(Boolean).join('   ');
}

const mcpOk = (m) => Boolean(m && ['registered', 'replaced', 'present'].includes(m.status));

/** Warn line when the Atlassian MCP could not be registered; null when it was. */
function mcpNote(m) {
  if (!m || mcpOk(m)) return null;
  if (m.status === 'no-cli')
    return {
      kind: 'warn',
      text: 'Atlassian MCP not registered — claude command not found',
      cont: 'install the Claude Code CLI and re-run',
    };
  return { kind: 'warn', text: `Atlassian MCP not registered — ${m.detail}`, cont: null };
}

/**
 * Lines under step 5: only what is new or failed. Skipped domain docs and the background
 * project-context worker stay silent (user decision 2026-10-27); their state is in the summary.
 */
function layerNotes(s) {
  const d = s.domainDocs;
  // .gitignore lines added, folders created and the domain docs folder are not printed;
  // the summary row already counts the domain pages (user decision 2026-10-28/29).
  return [
    d.status === 'failed' ? { kind: 'warn', text: `Domain docs failed — ${d.reason}` } : null,
    mcpNote(s.mcp),
  ].filter(Boolean);
}

/**
 * Removes everything the installer put in place except _bmad-output/.
 * @returns {Promise<{removed:string[], aborted:boolean}>}
 */
async function uninstall(root, { prompt, yes = false, mcp = mcpRegistrar } = {}) {
  if (!yes) {
    const { confirm } = await prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Remove BMad-Stella from this folder? (_bmad-output/ is kept)',
        default: false,
      },
    ]);
    if (!confirm) return { removed: [], aborted: true };
  }
  const settingsTouched = layer.unregisterSettings(root);
  const gi = gitignore.remove(root);
  const m = mcp.unregister(root);
  const removed = [
    ...cleaner.clean(root, { rerun: true }).removed,
    ...layer.removeStellaClaudeParts(root),
    ...layer.removeBmadSkills(root),
    settingsTouched ? `${constants.SETTINGS_LOCAL} (our entries)` : null,
    m.status === 'removed' ? 'Atlassian MCP (Claude Code local scope)' : null,
    gi.removed.length > 0 ? `.gitignore (${gi.removed.join(', ')})` : null,
  ].filter(Boolean);
  return { removed, aborted: false };
}

module.exports = { install, uninstall, layerDetail, layerNotes };
