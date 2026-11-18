'use strict';

// `bmad-stella init` — the per-project half of the user-level install, run by the
// `/stella-init` skill from the app copy in ~/.claude/stella/app/. No npx and no
// BMad download: _bmad/ is copied from the machine's master copy. Fast steps run
// here in the foreground, one line each; the two slow collectors (memory, project
// context) start in the background and `status()` reports on them.
// Design: tea-module/rnd-docs/user-level-install-design.md (L1, L4, L7).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const constants = require('./constants');
const jira = require('./jira-credentials-manager');
const picker = require('./project-picker');
const cleaner = require('./cleaner');
const legacyMemory = require('./legacy-memory-migrator');
const gitignore = require('./gitignore');
const layer = require('./stella-layer');
const memoryBootstrap = require('./memory-bootstrap');
const projectContextBootstrap = require('./project-context-bootstrap');
const domain = require('./domain-knowledge-fetcher');
const userLevel = require('./user-level');
const { silentUi } = require('./ui');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SETUP_HINT = 'Run `npx bmad-stella@latest setup` in a terminal first.';

const rel = (root, p) => path.join(root, ...p.split('/'));

function codedError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

/** Project names from Confluence; [] when they cannot be listed. */
async function projectNames(creds, fetch) {
  if (!creds) return [];
  try {
    return (await picker.listProjects(creds, { fetch })).map((p) => p.name);
  } catch {
    return [];
  }
}

/**
 * The folder to set up (L1): the working directory, a parent that already holds
 * _bmad/, or the one direct child that does. Several children → the caller must name one.
 * @returns {{root:string, kind:string}}
 */
function resolveRoot(cwd, rootOverride) {
  if (rootOverride) {
    const root = path.resolve(cwd, rootOverride);
    // A mistyped folder must not become a new project.
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw codedError('NO_ROOT', `--root: no such folder: ${root}`);
    }
    return { root, kind: 'given' };
  }
  const found = userLevel.findRoot(cwd);
  if (found.kind === 'children') {
    throw codedError(
      'SEVERAL_ROOTS',
      `Several folders here hold _bmad/: ${found.roots.map((r) => path.basename(r)).join(', ')}. Run again with --root <folder>.`,
      { roots: found.roots },
    );
  }
  return { root: found.root || path.resolve(cwd), kind: found.kind };
}

/**
 * @param {string} cwd where the session is
 * @param {object} deps prompt, fetch, ui, env, isTTY, home, repoRoot, projectName,
 *   rootOverride, fullInstall(root, deps) → summary (L7 fallback),
 *   bootstrapMemory(root, opts), projectContext(root)
 * @returns {Promise<object>} summary
 */
async function init(cwd, deps = {}) {
  const {
    prompt,
    fetch,
    ui = silentUi(),
    env = process.env,
    isTTY = Boolean(process.stdin.isTTY),
    home = os.homedir(),
    repoRoot = REPO_ROOT,
    projectName = null,
    rootOverride = null,
    fullInstall = (r, d) => require('./installer').install(r, d),
    bootstrapMemory = (r, o) => memoryBootstrap.bootstrapIfMissing(r, o),
    projectContext = (r) => projectContextBootstrap.startIfMissing(r),
  } = deps;
  const note = (text) => ui.line('note', text);
  const { root, kind } = resolveRoot(cwd, rootOverride);
  const summary = { root, rootKind: kind, mode: 'template', removed: [], warnings: [] };

  // L7: no master copy on this machine (e.g. a session that cannot see ~/.claude/stella/).
  if (!userLevel.templateMarker(home)) {
    summary.mode = 'full';
    ui.line('warn', 'No BMad master copy on this machine — running the full project install');
    const fullEnv = projectName ? { ...env, STELLA_PROJECT: projectName } : { ...env };
    if (!isTTY) {
      // The full install asks nothing without a terminal: hand it what is already known.
      const saved = jira.readCredentialsFile({ home });
      if (saved && !(fullEnv.JIRA_EMAIL && fullEnv.JIRA_API_TOKEN)) {
        fullEnv.JIRA_EMAIL = saved.email;
        fullEnv.JIRA_API_TOKEN = saved.token;
      }
      if (!(fullEnv.STELLA_PROJECT && fullEnv.STELLA_PROJECT.trim())) {
        throw codedError('NEED_PROJECT', 'Pass the project with --project <name>.', {
          projects: [...(await projectNames(saved, fetch)), constants.OTHER_PROJECT],
        });
      }
    }
    summary.full = await fullInstall(root, { ...deps, env: fullEnv, home });
    return summary;
  }

  ui.header(root);
  ui.section('Project');
  if (kind === 'parent' || kind === 'child') {
    ui.line('info', `Project root is the ${kind} folder that already holds _bmad/`);
  }

  // Nothing may be asked without a terminal (the skill runs this from a tool call).
  const ask = isTTY
    ? prompt
    : () => {
        throw codedError(
          'NEED_TERMINAL',
          `Input is needed but there is no terminal. ${SETUP_HINT}`,
        );
      };
  const hasEnvCreds = Boolean(env.JIRA_EMAIL && env.JIRA_API_TOKEN);
  if (!isTTY && !hasEnvCreds && !jira.findCredentials(root, { home })) {
    throw codedError('NO_CREDENTIALS', `No saved Atlassian credentials. ${SETUP_HINT}`);
  }
  const creds = await jira.run(root, { prompt: ask, fetch, log: note, env, home });

  // Project pick: --project, else the saved pick, else the list (terminal only).
  let pickEnv = env;
  if (projectName) pickEnv = { ...env, STELLA_PROJECT: projectName };
  else if (!isTTY && !(env.STELLA_PROJECT && env.STELLA_PROJECT.trim())) {
    const saved = picker.readProjectJson(root);
    if (!saved) {
      throw codedError('NEED_PROJECT', 'Pass the project with --project <name>.', {
        projects: [...(await projectNames(creds, fetch)), constants.OTHER_PROJECT],
      });
    }
    pickEnv = { ...env, STELLA_PROJECT: saved.name };
  }
  const project = await picker.run(root, creds, { prompt: ask, fetch, log: note, env: pickEnv });
  summary.project = project;
  ui.line('ok', `${project.name}${project.pageId ? '' : ' (no Confluence page)'}`);

  // A project set up by the per-project installer is switched over: its own copies
  // of the skills and hooks go, the user-level ones take their place. In any other
  // project nothing under .claude/skills/ is ours to remove (a team may keep its own
  // copy of a Stella skill there, e.g. for cloud sessions).
  const bmadDir = rel(root, constants.BMAD_DIR);
  const wasPerProject = fs.existsSync(bmadDir) && !userLevel.readMarker(bmadDir);
  summary.legacyMigration = legacyMemory.migrateLegacy(root);
  summary.removed.push(
    ...cleaner.clean(root, { rerun: false }).removed,
    ...(wasPerProject ? layer.removeStellaClaudeParts(root) : []),
  );
  const applied = userLevel.applyTemplate(root, { home, projectName: project.name, project });
  summary.template = applied.marker;
  ui.line(
    'ok',
    `_bmad/ ${applied.replaced ? 'replaced' : 'copied'} from the master copy`,
    applied.marker.id,
  );

  summary.gitignoreAdded = gitignore.ensure(root).added;
  if (wasPerProject) {
    // Only the official skills this machine now has at user level: same names, so the
    // project copies would only shadow them with an older version.
    const machine = userLevel.readMachineState(home);
    summary.removed.push(...layer.removeBmadSkills(root, (machine && machine.bmadSkills) || []));
  }
  summary.settings = layer.registerSettings(root, { hooks: false });
  summary.created = layer.ensureOutputFolders(root);
  ui.line(
    'ok',
    wasPerProject
      ? 'Switched from the per-project install  permissions · folders · .gitignore'
      : 'Permissions, output folders and .gitignore in place',
  );

  const s = ui.spin('fetching domain docs…');
  summary.domainDocs = await domain.fetchDomainDocs(root, { project, creds, fetch, log: note });
  const d = summary.domainDocs;
  if (d.status === 'failed') s.fail(`Domain docs failed — ${d.reason}`);
  else
    s.succeed(
      d.status === 'fetched'
        ? `${d.files.length} domain pages`
        : `Domain docs skipped — ${d.reason}`,
    );

  // Background, fire-and-forget; `init --status` shows where they are.
  summary.memoryBootstrap = bootstrapMemory(root, {
    hooksDir: path.join(repoRoot, 'stella', 'hooks', 'project', 'memory'),
  });
  summary.projectContext = projectContext(root);
  const background = [
    summary.memoryBootstrap.domainMap || summary.memoryBootstrap.patterns ? 'memory' : null,
    summary.projectContext.status === 'started' ? 'project context' : null,
  ].filter(Boolean);
  if (background.length > 0) {
    ui.line('info', `Still running in the background: ${background.join(', ')}`);
    ui.cont('check with /stella-init status — stella-build works meanwhile');
  }

  ui.end(`${project.name} is set up in ${path.basename(root)}`);
  return summary;
}

const countFiles = (dir) => {
  try {
    return fs.readdirSync(dir).filter((e) => !e.startsWith('.')).length;
  } catch {
    return 0;
  }
};

/**
 * Where a project stands, read from the files only (no process is tracked).
 * @returns {{root:string|null, roots:string[], setUp:boolean, upToDate:boolean, items:object[]}}
 */
function status(cwd, { home = os.homedir(), rootOverride = null } = {}) {
  const found = rootOverride
    ? { root: path.resolve(cwd, rootOverride), roots: [] }
    : userLevel.findRoot(cwd);
  const template = userLevel.templateMarker(home);
  if (!found.root) {
    return { root: null, roots: found.roots, setUp: false, upToDate: false, template, items: [] };
  }
  const root = found.root;
  const marker = userLevel.readMarker(rel(root, constants.BMAD_DIR));
  const out = (p) => rel(root, `${constants.STELLA_OUTPUT_DIR}/${p}`);
  const state = (done) => (done ? 'done' : 'not yet');
  const project = picker.readProjectJson(root);
  const pages = countFiles(out('domain-knowledge'));
  const items = [
    { name: 'project', state: project ? project.name : 'not picked' },
    { name: '_bmad', state: marker ? marker.id : 'per-project install or missing' },
    { name: 'domain docs', state: pages > 0 ? `${pages} pages` : 'none' },
    { name: 'memory: domain map', state: state(fs.existsSync(out('memory/domain-map.md'))) },
    { name: 'memory: patterns', state: state(fs.existsSync(out('memory/patterns.md'))) },
    {
      name: 'project context',
      state: state(fs.existsSync(rel(root, `${constants.PROJECT_CONTEXT_DIR}/context.md`))),
    },
  ];
  return {
    root,
    roots: found.roots,
    setUp: Boolean(marker),
    upToDate: Boolean(marker && template && marker.id === template.id),
    template,
    items,
  };
}

module.exports = { init, status, resolveRoot, SETUP_HINT };
