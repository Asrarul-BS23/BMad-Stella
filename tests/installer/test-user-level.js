'use strict';

// User-level install: `setup` (once per machine) and `init` (per project, what
// /stella-init runs), plus the session-start check. Design and decisions L1-L7:
// tea-module/rnd-docs/user-level-install-design.md. Everything runs against temp
// folders with injected prompt / fetch / BMad / npm — no network, no real home.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
// Guard: nothing in this file may touch the real home directory.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-ul-home-'));
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
const LIB = path.join(REPO, 'tools', 'installer', 'lib');
const C = require(path.join(LIB, 'constants.js'));
const userLevel = require(path.join(LIB, 'user-level.js'));
const machineSetup = require(path.join(LIB, 'machine-setup.js'));
const projectInit = require(path.join(LIB, 'project-init.js'));
const pluginInstaller = require(path.join(LIB, 'plugin-installer.js'));
const installer = require(path.join(LIB, 'installer.js'));
const layer = require(path.join(LIB, 'stella-layer.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `stella-ul-${name}-`));
const at = (root, rel) => path.join(root, ...rel.split('/'));
const exists = (root, rel) => fs.existsSync(at(root, rel));
const read = (root, rel) => fs.readFileSync(at(root, rel), 'utf8');
const write = (root, rel, text) => {
  fs.mkdirSync(path.dirname(at(root, rel)), { recursive: true });
  fs.writeFileSync(at(root, rel), text);
};
const jsonRes = (status, body) => ({ ok: status < 300, status, json: async () => body });

// What the official installer leaves behind, minimal: the three files that carry
// the project name, a render cache folder, and four skills (three are replaced by Stella).
const BMAD_SKILLS = ['bmad-build', 'bmad-build-auto', 'bmad-help', 'bmad-project-context'];
const fakeBmad = async (root, { projectName, userName }) => {
  write(
    root,
    '_bmad/config.toml',
    `[core]\nuser_name = "${userName}"\nproject_name = "${projectName}"\n`,
  );
  write(root, '_bmad/bmm/config.yaml', `user_name: ${userName}\nproject_name: ${projectName}\n`);
  write(root, '_bmad/core/config.yaml', `project_name: ${projectName}\n`);
  write(root, '_bmad/custom/config.toml', '# team overrides\n');
  write(root, '_bmad/render/cache.txt', 'x');
  write(root, '_bmad/scripts/render_skill.py', '# script\n');
  for (const skill of BMAD_SKILLS)
    write(root, `.claude/skills/${skill}/SKILL.md`, `---\nname: ${skill}\n---\n`);
  write(
    root,
    '_bmad/_config/skill-manifest.csv',
    'canonicalId,name,description,module,path\n' +
      BMAD_SKILLS.map((s) => `"${s}","${s}","d","bmm","_bmad/bmm/${s}/SKILL.md"`).join('\r\n') +
      '\r\n',
  );
  return 0;
};
const teaCalls = [];
const fakeTeaSkill = async (root, opts) => {
  teaCalls.push(opts);
  write(root, '.claude/skills/bmod-tea/SKILL.md', '---\nname: bmod-tea\n---\n');
  return 0;
};
const builderCalls = [];
const fakeBuilderSkill = async (root, opts) => {
  builderCalls.push(opts);
  write(
    root,
    '.claude/skills/bmad-workflow-builder/SKILL.md',
    '---\nname: bmad-workflow-builder\n---\n',
  );
  return 0;
};
const fakeNpmCache = () => ({ status: 'cleaned', seconds: 1, detail: null });
const fetchMock = async (url) => {
  if (url.includes('/rest/api/3/myself')) return jsonRes(200, { displayName: 'Ash' });
  if (url.includes('/child/page'))
    return jsonRes(200, {
      results: [
        { id: '1626308638', title: 'P-LEADRSC' },
        { id: 2, title: 'P-SLS' },
      ],
      _links: {},
    });
  if (url.includes('/descendant/page'))
    return jsonRes(200, {
      results: [
        {
          id: 11,
          title: 'api-leadrsc',
          space: { key: 'AIL' },
          body: { view: { value: '<p>api</p>' } },
        },
      ],
      _links: {},
    });
  return jsonRes(404, {});
};
const scripted = (answers) => {
  const queue = [...answers];
  const asked = [];
  return {
    asked,
    prompt: async (qs) => {
      const out = {};
      for (const q of qs) {
        asked.push(q.name);
        if (queue.length === 0) throw new Error(`no scripted answer for ${q.name}`);
        let v = queue.shift();
        if (q.filter) v = q.filter(v);
        out[q.name] = v;
      }
      return out;
    },
  };
};
const mcpCalls = [];
const mcpMock = {
  register: (root, opts) => {
    mcpCalls.push(opts);
    return { status: 'registered', url: 'u', detail: null };
  },
};
const playwrightMcpMock = {
  register: () => [{ name: 'playwright', status: 'present', detail: null }],
};
const pfOk = () => ({
  ok: true,
  errors: [],
  warnings: [],
  found: { node: true, uv: true, python: true, gh: true, git: true },
  versions: {},
});
const setupDeps = (extra) => ({
  home: HOME,
  fetch: fetchMock,
  check: pfOk,
  runBmad: fakeBmad,
  runTeaSkill: fakeTeaSkill,
  runBuilderSkill: fakeBuilderSkill,
  cleanNpmCache: fakeNpmCache,
  installAppDeps: () => {},
  pluginInstalled: () => false,
  installPlugin: () => ({ status: 'installed', detail: null }),
  mcp: mcpMock,
  playwrightMcp: playwrightMcpMock,
  userHooks: async () => ({ status: 'current', changed: false }),
  env: {},
  isTTY: true,
  ...extra,
});
const initDeps = (extra) => ({
  home: HOME,
  fetch: fetchMock,
  env: {},
  isTTY: false,
  bootstrapMemory: () => ({ domainMap: true, patterns: false }),
  projectContext: () => ({ status: 'started' }),
  ...extra,
});
const userSkill = (name) => path.join(HOME, '.claude', 'skills', name);
const userSettings = () => JSON.parse(fs.readFileSync(userLevel.userSettingsFile(HOME), 'utf8'));
const hookCommands = (settings) =>
  Object.values(settings.hooks || {})
    .flat()
    .flatMap((e) => e.hooks.map((h) => h.command));

(async () => {
  // ================= findRoot (L1): here, parent, one child, several children =================
  {
    const ws = tmp('roots');
    ok(userLevel.findRoot(ws).kind === 'none', 'findRoot: nothing → none');
    fs.mkdirSync(at(ws, 'api/_bmad'), { recursive: true });
    fs.mkdirSync(at(ws, 'api/src/deep'), { recursive: true });
    fs.mkdirSync(at(ws, '.hidden/_bmad'), { recursive: true });
    fs.mkdirSync(at(ws, 'node_modules/_bmad'), { recursive: true });
    let r = userLevel.findRoot(at(ws, 'api'));
    ok(r.kind === 'here' && r.root === at(ws, 'api'), 'findRoot: _bmad in the folder → here');
    r = userLevel.findRoot(at(ws, 'api/src/deep'));
    ok(r.kind === 'parent' && r.root === at(ws, 'api'), 'findRoot: _bmad in a parent → parent');
    r = userLevel.findRoot(ws);
    ok(
      r.kind === 'child' && r.root === at(ws, 'api'),
      'findRoot: one direct child holds _bmad → child (dot folders and node_modules skipped)',
    );
    fs.mkdirSync(at(ws, 'web/_bmad'), { recursive: true });
    r = userLevel.findRoot(ws);
    ok(
      r.kind === 'children' && r.root === null && r.roots.length === 2,
      'findRoot: two children → children',
    );
  }

  // ================= session check before any setup: silent =================
  {
    const repo = tmp('nosetup');
    fs.mkdirSync(at(repo, '.git'));
    ok(
      userLevel.sessionCheck(repo, { home: HOME }) === null,
      'sessionCheck: no master copy → silent',
    );
  }

  // ================= askPlugin =================
  ok(
    (await machineSetup.askPlugin({ env: { STELLA_PLUGIN: 'yes' }, isTTY: false })) === true &&
      (await machineSetup.askPlugin({ env: { STELLA_PLUGIN: 'n' }, isTTY: true })) === false &&
      (await machineSetup.askPlugin({ env: {}, isTTY: false })) === false,
    'askPlugin: env answers it; no terminal → no',
  );

  // ================= setup, plugin declined =================
  write(
    HOME,
    '.claude/settings.json',
    JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node mine.js' }] }] },
    }),
  );
  write(HOME, '.claude/skills/my-own/SKILL.md', 'mine');
  let s = scripted(['dev@stella.com', 'tok-abcdefghijklmnop', false]);
  let pluginCalls = 0;
  let sum = await machineSetup.setup(
    setupDeps({ prompt: s.prompt, installPlugin: () => (pluginCalls++, { status: 'installed' }) }),
  );
  ok(
    s.asked.join(',') === 'email,token,plugin',
    'setup: asks email, token, then the plugin question',
  );
  ok(
    machineSetup.PLUGIN_QUESTION === 'Do you want plugins for Claude Desktop?',
    'setup: plugin question wording',
  );
  ok(pluginCalls === 0 && sum.pluginMode === false, 'setup: answer no → plugin step not run');
  ok(
    exists(HOME, '.claude/stella/credentials.env'),
    'setup: credentials saved under the home folder',
  );

  const marker = userLevel.templateMarker(HOME);
  ok(
    marker && marker.id === userLevel.templateId() && marker.bmadVersion === C.BMAD_VERSION,
    'setup: master copy built with a marker',
  );
  ok(
    read(HOME, '.claude/stella/bmad-template/_bmad/config.toml').includes(
      `project_name = "${C.TEMPLATE_PROJECT_NAME}"`,
    ),
    'setup: master copy uses the placeholder project name',
  );
  ok(
    read(HOME, '.claude/stella/bmad-template/_bmad/config.toml').includes('[modules.tea]'),
    'setup: TEA config written into the master copy',
  );
  ok(
    !exists(HOME, '.claude/stella/bmad-template/_bmad/render'),
    'setup: render cache not kept in the master copy',
  );
  ok(!exists(HOME, '.claude/stella/bmad-template.new'), 'setup: staging folder gone');
  ok(teaCalls.at(-1).copy === true, 'setup: TEA skills installed as plain folders');
  ok(builderCalls.at(-1).copy === true, 'setup: Builder skills installed as plain folders');
  ok(
    fs.existsSync(userSkill('bmad-workflow-builder')),
    'setup: Builder skills copied to user level',
  );
  ok(
    read(HOME, '.claude/stella/bmad-template/_bmad/bmb/config.yaml').includes('.claude/skills') &&
      exists(HOME, '.claude/stella/bmad-template/_bmad/custom/bmad-workflow-builder.toml'),
    'setup: Builder output folder settings written into the master copy',
  );

  ok(
    exists(HOME, '.claude/stella/app/tools/installer/bin/bmad.js') &&
      exists(HOME, '.claude/stella/app/stella/skills/stella-build/SKILL.md') &&
      exists(HOME, '.claude/stella/app/package.json'),
    'setup: app copied (tools, stella, package.json)',
  );

  ok(
    fs.existsSync(userSkill('bmad-help')) && fs.existsSync(userSkill('bmod-tea')),
    'setup: official BMad + TEA skills at user level',
  );
  ok(
    C.BMAD_SKILLS_REMOVED.every((n) => !fs.existsSync(userSkill(n))),
    'setup: skills replaced by Stella not copied',
  );
  ok(
    [...C.STELLA_SKILLS, 'stella-init'].every((n) =>
      fs.existsSync(path.join(userSkill(n), 'SKILL.md')),
    ),
    'setup: Stella skills + stella-init at user level',
  );
  ok(fs.existsSync(userSkill('my-own')), "setup: the developer's own skill stays");

  let settings = userSettings();
  let commands = hookCommands(settings);
  ok(commands.includes('node mine.js'), 'setup: foreign hook kept');
  const appHooks = commands.filter((c) => c.includes('.claude/stella/app/stella/hooks/project/'));
  ok(
    appHooks.length === 1 &&
      appHooks[0].endsWith('init-check/session-start.js"') &&
      !appHooks[0].includes('\\'),
    'setup: only the session check is registered at user level, run from the app copy',
  );
  ok(
    !settings.hooks.PreToolUse && !settings.hooks.UserPromptSubmit && !settings.hooks.SessionEnd,
    'setup: the project hooks are not registered at user level',
  );
  ok(
    appHooks.every((c) => fs.existsSync(/"(.+)"/.exec(c)[1])),
    'setup: every registered hook script exists',
  );
  ok(mcpCalls.at(-1).scope === 'user', 'setup: Atlassian MCP in user scope');
  const state = userLevel.readMachineState(HOME);
  ok(
    state.templateId === marker.id &&
      state.pluginMode === false &&
      state.bmadSkills.includes('bmod-tea') &&
      state.stellaSkills.includes('stella-init'),
    'setup: machine state recorded',
  );

  // ================= init: new project, no terminal =================
  const proj = tmp('proj');
  write(proj, '.gitignore', 'node_modules/\n');
  fs.mkdirSync(at(proj, '.git'));
  ok(
    userLevel.sessionCheck(proj, { home: HOME }).message === userLevel.MESSAGES.notSetUp,
    'sessionCheck: git repo without _bmad → run /stella-init',
  );
  ok(!exists(proj, '_bmad'), 'sessionCheck: writes nothing into a folder that is not set up (L6)');
  ok(
    userLevel.sessionCheck(tmp('plain'), { home: HOME }) === null,
    'sessionCheck: not a git repo → silent',
  );

  let err = null;
  try {
    await projectInit.init(proj, initDeps());
  } catch (error) {
    err = error;
  }
  ok(
    err && err.code === 'NEED_PROJECT' && err.projects.join(',') === 'LEADRSC,SLS,Other',
    'init: no terminal and no project → asks for --project with the list',
  );
  ok(!exists(proj, '_bmad'), 'init: nothing written before the project is known');

  let memoryOpts = null;
  sum = await projectInit.init(
    proj,
    initDeps({
      projectName: 'LEADRSC',
      bootstrapMemory: (r, o) => ((memoryOpts = o), { domainMap: true, patterns: true }),
    }),
  );
  ok(
    sum.mode === 'template' && sum.root === proj && sum.project.pageId === '1626308638',
    'init: set up from the master copy',
  );
  ok(
    read(proj, '_bmad/config.toml').includes('project_name = "LEADRSC"') &&
      read(proj, '_bmad/bmm/config.yaml').includes('project_name: "LEADRSC"') &&
      read(proj, '_bmad/core/config.yaml').includes('project_name: "LEADRSC"'),
    'init: project name written into all three files',
  );
  ok(
    !read(proj, '_bmad/config.toml').includes(C.TEMPLATE_PROJECT_NAME) &&
      read(proj, '_bmad/config.toml').includes('[modules.tea]'),
    'init: placeholder gone, TEA config present',
  );
  ok(
    userLevel.readMarker(at(proj, '_bmad')).id === marker.id,
    'init: project carries the master copy marker',
  );
  ok(
    exists(proj, '_bmad/custom/stella/utils/jira-attachments/index.js') &&
      exists(proj, '_bmad/custom/stella/checklists/backend-security.md') &&
      exists(proj, '_bmad/custom/stella/guard.json'),
    'init: Stella helpers in _bmad/custom/stella',
  );
  ok(
    JSON.parse(read(proj, '_bmad/custom/stella/friction.json')).confluence.enabled === true,
    'init: friction.json follows the project pick',
  );
  ok(
    exists(proj, '_bmad-output/stella/project.json') &&
      exists(proj, '_bmad-output/stella/memory/episodes') &&
      exists(proj, '_bmad-output/stella/domain-knowledge/api.md'),
    'init: _bmad-output folders, project.json, domain docs',
  );
  ok(
    sum.domainDocs.status === 'fetched' && sum.domainDocs.files.length === 1,
    'init: domain docs fetched in the foreground',
  );
  ok(
    read(proj, '.gitignore').includes('_bmad/') &&
      read(proj, '.gitignore').includes('node_modules/'),
    'init: .gitignore lines added, existing kept',
  );
  const local = JSON.parse(read(proj, '.claude/settings.local.json'));
  ok(local.permissions.allow.length > 10, 'init: permissions in settings.local.json');
  const projectHooks = hookCommands(local);
  ok(
    sum.hooksInProject === true &&
      sum.hooks.join(',') === C.PROJECT_HOOKS.map((h) => h.name).join(',') &&
      C.PROJECT_HOOKS.every((h) =>
        Object.values(h.events).every((e) =>
          exists(proj, `.claude/stella/hooks/${h.name}/${e.file}`),
        ),
      ) &&
      exists(proj, '.claude/stella/package.json'),
    'init: project hooks copied into .claude/stella/hooks/',
  );
  ok(
    projectHooks.length === 5 &&
      projectHooks.every((c) =>
        c.startsWith('node "${CLAUDE_PROJECT_DIR}/.claude/stella/hooks/'),
      ) &&
      local.hooks.PreToolUse[0].matcher === 'Edit|MultiEdit|Write|Bash|PowerShell',
    'init: project hooks registered in settings.local.json, as the per-project installer did',
  );
  ok(
    !exists(proj, '.claude/stella/hooks/init-check') &&
      !projectHooks.some((c) => c.includes('init-check')),
    'init: the session check is not a project hook',
  );
  ok(
    !exists(proj, '.claude/skills/stella-build') &&
      !exists(proj, '.claude/skills/stella-project-context/SKILL.md'),
    'init: no skills copied into the project',
  );
  ok(
    exists(proj, '.claude/skills/stella-project-context/scripts/check-context.js'),
    'init: check script at the fixed path the skill and worker use',
  );
  ok(
    memoryOpts.hooksDir === undefined &&
      exists(proj, '.claude/stella/hooks/memory/pattern-scanner.js') &&
      exists(proj, '.claude/stella/hooks/memory/lib/domain-map-distiller.js'),
    'init: memory collectors run from the project hooks',
  );
  ok(
    userLevel.sessionCheck(proj, { home: HOME }) === null,
    'sessionCheck: project up to date → silent',
  );
  ok(
    userLevel.sessionCheck(at(proj, '_bmad-output/stella'), { home: HOME }) === null,
    'sessionCheck: from a subfolder, root found in a parent → silent',
  );

  // ---- status ----
  let st = projectInit.status(proj, { home: HOME });
  ok(
    st.setUp &&
      st.upToDate &&
      st.items.find((i) => i.name === 'project').state === 'LEADRSC' &&
      st.items.find((i) => i.name === 'domain docs').state === '1 pages' &&
      st.items.find((i) => i.name === 'project context').state === 'not yet',
    'status: reads the project state from its files',
  );
  ok(
    projectInit.status(tmp('empty'), { home: HOME }).root === null,
    'status: no project → no root',
  );

  // ---- re-run without --project: the saved pick is reused, team files and switches kept ----
  write(proj, '_bmad/custom/team.toml', 'x = 1\n');
  write(proj, '_bmad/custom/stella/guard.json', '{"enabled": false}\n');
  sum = await projectInit.init(proj, initDeps());
  ok(sum.project.name === 'LEADRSC', 'init re-run: saved project reused when nothing can be asked');
  ok(
    read(proj, '_bmad/custom/team.toml') === 'x = 1\n' &&
      JSON.parse(read(proj, '_bmad/custom/stella/guard.json')).enabled === false,
    'init re-run: _bmad/custom files and the guard switch kept',
  );

  // ================= L1: workspace folder above the project =================
  {
    const ws = tmp('ws');
    fs.mkdirSync(at(ws, 'api'));
    await projectInit.init(at(ws, 'api'), initDeps({ projectName: 'SLS' }));
    sum = await projectInit.init(ws, initDeps());
    ok(
      sum.root === at(ws, 'api') && sum.rootKind === 'child' && !exists(ws, '_bmad'),
      'init: one child holds _bmad → the child is the root, no second _bmad',
    );
    fs.mkdirSync(at(ws, 'web/_bmad'), { recursive: true });
    err = null;
    try {
      await projectInit.init(ws, initDeps());
    } catch (error) {
      err = error;
    }
    ok(
      err && err.code === 'SEVERAL_ROOTS' && !exists(ws, '_bmad'),
      'init: several children → asks which, creates nothing',
    );
    sum = await projectInit.init(ws, initDeps({ rootOverride: 'api' }));
    ok(sum.root === at(ws, 'api'), 'init: --root names the folder');
    ok(
      userLevel.sessionCheck(ws, { home: HOME }) === null,
      'sessionCheck: several child projects → silent',
    );
  }

  // ================= L2: master copy moves on → refresh at session start =================
  {
    const bmadDir = userLevel.templateBmadDir(HOME);
    const newer = { ...userLevel.readMarker(bmadDir), id: 'newer-id' };
    fs.writeFileSync(path.join(bmadDir, C.TEMPLATE_MARKER), JSON.stringify(newer));
    write(HOME, '.claude/stella/bmad-template/_bmad/scripts/new_script.py', '# new\n');
    write(proj, '_bmad/scripts/stale.py', '# dropped upstream\n');
    ok(projectInit.status(proj, { home: HOME }).upToDate === false, 'status: update pending');
    const r = userLevel.sessionCheck(proj, { home: HOME });
    ok(
      r && r.action === 'refreshed' && r.message.includes('newer-id'),
      'sessionCheck: stale project → refreshed, one line',
    );
    ok(
      exists(proj, '_bmad/scripts/new_script.py') && !exists(proj, '_bmad/scripts/stale.py'),
      'refresh: _bmad replaced, dropped files gone',
    );
    ok(
      userLevel.readProjectName(proj) === 'LEADRSC' &&
        read(proj, '_bmad/core/config.yaml').includes('"LEADRSC"'),
      'refresh: project name kept',
    );
    ok(
      read(proj, '_bmad/custom/team.toml') === 'x = 1\n' &&
        JSON.parse(read(proj, '_bmad/custom/stella/guard.json')).enabled === false &&
        JSON.parse(read(proj, '_bmad/custom/stella/friction.json')).confluence.enabled === true,
      'refresh: _bmad/custom files, guard and friction settings kept',
    );
    ok(
      exists(proj, '_bmad-output/stella/domain-knowledge/api.md') &&
        !exists(proj, '_bmad.stella-new'),
      'refresh: _bmad-output untouched, staging folder gone',
    );
    ok(
      userLevel.sessionCheck(proj, { home: HOME }) === null,
      'sessionCheck: silent again after the refresh',
    );
  }

  // ================= project from the per-project installer → hint, then switched by init =================
  {
    const old = tmp('old');
    await fakeBmad(old, { projectName: 'SLS', userName: 'dev' });
    write(old, '_bmad/custom/mine.user.toml', 'y = 2\n');
    // the per-project installer always writes its Stella folder
    write(old, '_bmad/custom/stella/guard.json', '{"enabled": true}\n');
    write(old, '.claude/skills/stella-build/SKILL.md', 'old copy');
    write(old, '.claude/skills/my-skill/SKILL.md', 'mine');
    write(old, '.claude/stella/hooks/memory/x.js', '');
    write(
      old,
      '.claude/settings.local.json',
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command:
                    'node "${CLAUDE_PROJECT_DIR}/.claude/stella/hooks/friction-logger/session-start.js"',
                },
              ],
            },
          ],
        },
      }),
    );
    const hint = userLevel.sessionCheck(old, { home: HOME });
    ok(
      hint && hint.action === 'hint' && hint.message === userLevel.MESSAGES.perProject,
      'sessionCheck: per-project install → hint only',
    );
    ok(
      !userLevel.readMarker(at(old, '_bmad')) && exists(old, '.claude/skills/stella-build'),
      'sessionCheck: per-project install is never changed automatically (L5)',
    );
    sum = await projectInit.init(old, initDeps({ projectName: 'SLS' }));
    ok(
      userLevel.readMarker(at(old, '_bmad')) &&
        read(old, '_bmad/custom/mine.user.toml') === 'y = 2\n',
      'init: per-project install switched, personal override kept',
    );
    ok(
      !exists(old, '.claude/skills/stella-build') &&
        !exists(old, '.claude/skills/bmad-help') &&
        exists(old, '.claude/skills/my-skill'),
      "init: project copies of the skills removed, the developer's own skill stays",
    );
    ok(
      !exists(old, '.claude/stella/hooks/memory/x.js') &&
        exists(old, '.claude/stella/hooks/memory/user-prompt-submit.js') &&
        exists(old, '.claude/stella/hooks/friction-logger/session-start.js'),
      'init: project hooks stay in the project, replaced by the current ones',
    );
    const oldHooks = hookCommands(JSON.parse(read(old, '.claude/settings.local.json')));
    ok(
      oldHooks.length === 5 &&
        oldHooks.filter((c) => c.includes('friction-logger/session-start.js')).length === 1,
      'init: project hook entries registered once, not duplicated',
    );
  }

  // ================= L7: no master copy → the full project install =================
  {
    const bare = tmp('bare-home');
    let called = null;
    sum = await projectInit.init(
      tmp('l7'),
      initDeps({
        home: bare,
        projectName: 'SLS',
        fullInstall: async (root, deps) => ((called = deps), { root }),
      }),
    );
    ok(
      sum.mode === 'full' && called.env.STELLA_PROJECT === 'SLS' && called.home === bare,
      'init: master copy missing → full project install with the same project',
    );
  }

  // ================= setup again, plugin not installed, answer yes =================
  s = scripted([true]);
  let pluginOpts = null;
  sum = await machineSetup.setup(
    setupDeps({
      prompt: s.prompt,
      installPlugin: (o) => ((pluginOpts = o), { status: 'installed', detail: null }),
    }),
  );
  ok(s.asked.join(',') === 'plugin', 'setup re-run: saved credentials, only the plugin question');
  ok(
    sum.pluginMode === true && sum.plugin.status === 'installed' && pluginOpts.reinstall === false,
    'setup: plugin not installed + yes → installed, not a reinstall (L3)',
  );
  ok(
    [...C.STELLA_SKILLS, 'stella-init'].every((n) => !fs.existsSync(userSkill(n))),
    'plugin mode: user-level Stella skill copies removed (no double load)',
  );
  ok(
    fs.existsSync(userSkill('bmad-help')) && fs.existsSync(userSkill('my-own')),
    'plugin mode: official skills and own skills stay',
  );
  settings = userSettings();
  commands = hookCommands(settings);
  ok(
    commands.join('|') === 'node mine.js',
    'plugin mode: our user-level hook entries removed, foreign hook kept',
  );
  ok(
    userLevel.readMachineState(HOME).stellaSkills.length === 0 &&
      userLevel.readMachineState(HOME).pluginMode === true,
    'plugin mode: recorded in the machine state',
  );

  // plugin already installed → no question, uninstall + install again
  s = scripted([]);
  pluginOpts = null;
  sum = await machineSetup.setup(
    setupDeps({
      prompt: s.prompt,
      pluginInstalled: () => true,
      installPlugin: (o) => ((pluginOpts = o), { status: 'reinstalled', detail: null }),
    }),
  );
  ok(
    s.asked.length === 0 && sum.pluginWasInstalled === true && pluginOpts.reinstall === true,
    'setup: plugin already installed → nothing asked, reinstalled (L3)',
  );
  ok(
    sum.pluginMode === true && !fs.existsSync(userSkill('stella-build')),
    'setup: reinstalled plugin → plugin mode, no user-level Stella copies',
  );

  // reinstall fails but the plugin is still on the machine → stay in plugin mode
  sum = await machineSetup.setup(
    setupDeps({
      prompt: scripted([]).prompt,
      pluginInstalled: () => true,
      installPlugin: () => ({ status: 'failed', detail: 'uninstall: busy' }),
    }),
  );
  ok(
    sum.pluginMode === true &&
      sum.warnings.some((w) => w.includes('uninstall: busy')) &&
      !fs.existsSync(userSkill('stella-build')),
    'setup: reinstall fails, plugin still there → warning, no duplicate copies',
  );

  // reinstall fails after the uninstall → the plugin is gone, plain copies instead
  let listed = true;
  sum = await machineSetup.setup(
    setupDeps({
      prompt: scripted([]).prompt,
      pluginInstalled: () => listed,
      installPlugin: () => ((listed = false), { status: 'failed', detail: 'plugin: no network' }),
    }),
  );
  ok(
    sum.pluginMode === false &&
      sum.warnings.some((w) => w.includes('no network')) &&
      fs.existsSync(userSkill('stella-init')),
    'setup: reinstall fails after the uninstall → warning and user-level copies',
  );

  // first install fails → warning, plain copies instead
  sum = await machineSetup.setup(
    setupDeps({
      prompt: scripted([true]).prompt,
      installPlugin: () => ({ status: 'failed', detail: 'no network' }),
    }),
  );
  ok(
    sum.pluginMode === false &&
      sum.warnings.some((w) => w.includes('no network')) &&
      fs.existsSync(userSkill('stella-init')),
    'setup: plugin step fails → warning and user-level copies',
  );

  // ================= plugin-installer =================
  {
    const runs = [];
    const make = (table) => (command) => {
      runs.push(command);
      const hit = Object.keys(table).find((k) => command.startsWith(k));
      return hit ? table[hit] : { status: 0, stdout: '', stderr: '' };
    };
    let r = pluginInstaller.ensure({ run: make({}) });
    ok(
      r.status === 'installed' &&
        runs.join('|') ===
          'claude --version|claude plugin marketplace add Asrarul-BS23/BMad-Stella|claude plugin install bmad-stella@stella',
      'plugin: not installed → marketplace add + install, nothing uninstalled',
    );
    runs.length = 0;
    r = pluginInstaller.ensure({
      run: make({ 'claude plugin marketplace add': { status: 1, stderr: 'already added' } }),
    });
    ok(
      r.status === 'installed' && runs.includes('claude plugin marketplace update stella'),
      'plugin: marketplace already added → refreshed instead',
    );
    runs.length = 0;
    r = pluginInstaller.ensure({ run: make({}), reinstall: true });
    ok(
      r.status === 'reinstalled' &&
        runs.join('|') ===
          'claude --version|claude plugin uninstall bmad-stella@stella|claude plugin marketplace update stella|claude plugin install bmad-stella@stella',
      'plugin: installed → uninstall, marketplace update, install again',
    );
    runs.length = 0;
    r = pluginInstaller.ensure({
      run: make({ 'claude plugin uninstall': { status: 1, stderr: 'busy' } }),
      reinstall: true,
    });
    ok(
      r.status === 'failed' &&
        r.detail === 'uninstall: busy' &&
        !runs.includes('claude plugin install bmad-stella@stella'),
      'plugin: uninstall fails → stops, nothing else touched',
    );
    r = pluginInstaller.ensure({ run: make({ 'claude --version': { status: 1 } }) });
    ok(r.status === 'no-cli', 'plugin: no claude command → no-cli');
    r = pluginInstaller.ensure({
      run: make({ 'claude plugin install': { status: 1, stderr: 'boom\nmore' } }),
    });
    ok(
      r.status === 'failed' && r.detail === 'plugin: boom',
      'plugin: install fails → failed with the first output line',
    );
    const listedOut = { status: 0, stdout: 'bmad-stella@stella 3.0.0' };
    ok(
      pluginInstaller.isInstalled({ run: make({ 'claude plugin list': listedOut }) }).installed ===
        true &&
        pluginInstaller.isInstalled({ run: make({}) }).installed === false &&
        pluginInstaller.isInstalled({ run: make({ 'claude --version': { status: 1 } }) }).cli ===
          false,
      'plugin: isInstalled reads the plugin list',
    );
  }

  // ================= the hook script, end to end =================
  {
    const hook = path.join(REPO, 'stella', 'hooks', 'project', 'init-check', 'session-start.js');
    const run = (cwd, env = {}) =>
      spawnSync(process.execPath, [hook], {
        input: JSON.stringify({ cwd }),
        encoding: 'utf8',
        env: { ...process.env, ...env },
      });
    // The copied app has no node_modules in this test; point it at the repo's module.
    const appLib = path.join(
      HOME,
      '.claude',
      'stella',
      'app',
      'tools',
      'installer',
      'lib',
      'user-level.js',
    );
    fs.writeFileSync(
      appLib,
      `module.exports = require(${JSON.stringify(path.join(LIB, 'user-level.js'))});\n`,
    );
    const repo = tmp('hook-repo');
    fs.mkdirSync(at(repo, '.git'));
    let r = run(repo);
    const out = JSON.parse(r.stdout);
    ok(
      r.status === 0 &&
        out.systemMessage === userLevel.MESSAGES.notSetUp &&
        out.hookSpecificOutput.hookEventName === 'SessionStart',
      'hook: prints the /stella-init hint as a system message',
    );
    // The setup re-runs above rebuilt the master copy, so the project is behind once more.
    r = run(proj);
    ok(
      r.status === 0 &&
        JSON.parse(r.stdout).systemMessage.startsWith('BMad-Stella updated in this project'),
      'hook: refreshes a project that is behind and says so',
    );
    r = run(proj);
    ok(r.status === 0 && r.stdout === '', 'hook: silent in a project that is up to date');
    r = run(repo, { BMAD_HOOK_SUBPROCESS: '1' });
    ok(r.status === 0 && r.stdout === '', 'hook: silent inside a hook subprocess');
    const noApp = tmp('no-app-home');
    r = run(repo, { HOME: noApp, USERPROFILE: noApp });
    ok(r.status === 0 && r.stdout === '', 'hook: no app on the machine → silent');
  }

  // ================= review fixes =================
  {
    // id carries a content hash of the helpers copied into projects
    ok(
      /\+[0-9a-f]{8}$/.test(userLevel.templateId()) &&
        userLevel.templateId().endsWith(userLevel.layerHash()),
      'template id ends with the layer content hash',
    );

    // swapDir: rename in, old folder handed back, nothing deleted first
    const box = tmp('swap');
    write(box, 'final/a.txt', 'old');
    write(box, 'staged/a.txt', 'new');
    const old = userLevel.swapDir(at(box, 'staged'), at(box, 'final'));
    ok(
      read(box, 'final/a.txt') === 'new' &&
        fs.readFileSync(path.join(old, 'a.txt'), 'utf8') === 'old' &&
        !exists(box, 'staged'),
      'swapDir: new folder in place, old one kept until discarded',
    );
    ok(
      userLevel.swapDir(at(box, 'final'), at(box, 'fresh')) === null && exists(box, 'fresh/a.txt'),
      'swapDir: nothing to replace → null',
    );

    // a fresh project: the developer's own project skills are not ours to delete
    const fresh = tmp('fresh');
    write(fresh, '.claude/skills/caveman/SKILL.md', 'team copy');
    await projectInit.init(fresh, initDeps({ projectName: 'SLS' }));
    ok(
      read(fresh, '.claude/skills/caveman/SKILL.md') === 'team copy',
      'init: fresh project → project skills left alone',
    );

    // refresh keeps the render cache and custom subfolders, drops helpers removed upstream
    write(fresh, '_bmad/render/stella-build/gen/workflow.md', 'in use');
    write(fresh, '_bmad/custom/team/notes.md', 'kept');
    write(fresh, '_bmad/custom/stella/utils/gone-upstream/index.js', '');
    const bmadDir = userLevel.templateBmadDir(HOME);
    const markerFile = path.join(bmadDir, C.TEMPLATE_MARKER);
    const original = fs.readFileSync(markerFile, 'utf8');
    fs.writeFileSync(markerFile, JSON.stringify({ ...JSON.parse(original), id: 'next-id' }));

    // locked: another session is refreshing → silent, nothing touched
    fs.mkdirSync(at(fresh, '_bmad.stella-lock'));
    ok(
      userLevel.sessionCheck(fresh, { home: HOME }) === null &&
        userLevel.readMarker(at(fresh, '_bmad')).id !== 'next-id',
      'sessionCheck: project locked by another run → silent, unchanged',
    );
    let lockErr = null;
    try {
      await projectInit.init(fresh, initDeps({ projectName: 'SLS' }));
    } catch (error) {
      lockErr = error;
    }
    ok(lockErr && lockErr.code === 'LOCKED', 'init: project locked → clear error');
    const longAgo = new Date(Date.now() - 10 * 60 * 1000);
    fs.utimesSync(at(fresh, '_bmad.stella-lock'), longAgo, longAgo);

    const r = userLevel.sessionCheck(fresh, { home: HOME, source: 'resume' });
    ok(
      r && r.action === 'refreshed',
      'sessionCheck: stale lock reclaimed, refresh runs on resume too',
    );
    ok(
      read(fresh, '_bmad/render/stella-build/gen/workflow.md') === 'in use',
      'refresh: render cache of a running session kept',
    );
    ok(read(fresh, '_bmad/custom/team/notes.md') === 'kept', 'refresh: custom subfolders kept');
    ok(
      !exists(fresh, '_bmad/custom/stella/utils/gone-upstream') &&
        exists(fresh, '_bmad/custom/stella/utils/jira-attachments/index.js'),
      'refresh: helpers replaced, not merged',
    );
    ok(
      !exists(fresh, '_bmad.stella-lock') &&
        !exists(fresh, '_bmad.stella-old') &&
        !exists(fresh, '_bmad.stella-new'),
      'refresh: no lock, old or staging folder left behind',
    );
    fs.writeFileSync(markerFile, original);
    userLevel.sessionCheck(fresh, { home: HOME });

    // hints only when a session starts
    const repo = tmp('hint-repo');
    fs.mkdirSync(at(repo, '.git'));
    ok(
      userLevel.sessionCheck(repo, { home: HOME, source: 'startup' }).action === 'hint' &&
        userLevel.sessionCheck(repo, { home: HOME, source: 'compact' }) === null &&
        userLevel.sessionCheck(repo, { home: HOME, source: 'resume' }) === null,
      'sessionCheck: hint at startup, not on resume or compact',
    );
    // session opened one level above the project: skills cannot find _bmad from there
    const above = tmp('above');
    fs.mkdirSync(at(above, 'api'));
    await projectInit.init(at(above, 'api'), initDeps({ projectName: 'SLS' }));
    const childHint = userLevel.sessionCheck(above, { home: HOME });
    ok(
      childHint && childHint.message === userLevel.MESSAGES.openChild('api'),
      'sessionCheck: project one level down → says where to open Claude Code',
    );

    // the per-project installer on this machine: user-level copies count like the plugin
    ok(
      userLevel.readMachineState(HOME).stellaSkills.length > 0 &&
        layer.pluginActive(tmp('pp'), { home: HOME }) === true &&
        layer.pluginEnabled(tmp('pp'), { home: HOME }) === false,
      'install: user-level Stella skills → no project copies (no double load)',
    );
    ok(
      layer.pluginActive(tmp('pp2'), { home: tmp('clean-home') }) === false,
      'install: machine without setup → unchanged behaviour',
    );

    // a fresh machine where the plugin is already installed: no plugin question
    const ph = tmp('plugin-home');
    const asked = scripted(['dev@stella.com', 'tok-abcdefghijklmnop']);
    const res = await machineSetup.setup(
      setupDeps({
        home: ph,
        prompt: asked.prompt,
        pluginInstalled: () => true,
        installPlugin: () => ({ status: 'reinstalled', detail: null }),
      }),
    );
    ok(
      asked.asked.join(',') === 'email,token' &&
        res.pluginMode === true &&
        !fs.existsSync(path.join(ph, '.claude', 'skills', 'stella-build')) &&
        fs.existsSync(path.join(ph, '.claude', 'skills', 'bmad-help')),
      'setup: plugin already installed → not asked, no duplicate Stella copies',
    );

    // a settings.json that cannot be parsed is never overwritten
    const bh = tmp('broken-home');
    write(bh, '.claude/settings.json', '{ broken');
    const broken = await machineSetup.setup(
      setupDeps({
        home: bh,
        prompt: scripted(['dev@stella.com', 'tok-abcdefghijklmnop', false]).prompt,
      }),
    );
    ok(
      read(bh, '.claude/settings.json') === '{ broken' &&
        broken.hooks.length === 0 &&
        broken.warnings.some((w) => w.startsWith('Hooks not registered')),
      'setup: unreadable settings.json → warning, file untouched',
    );

    // app failure comes first: the old master copy is not replaced
    const before = fs.readFileSync(markerFile, 'utf8');
    let appErr = null;
    try {
      await machineSetup.setup(
        setupDeps({
          prompt: scripted([false]).prompt,
          installAppDeps: () => {
            throw new Error('npm down');
          },
        }),
      );
    } catch (error) {
      appErr = error;
    }
    ok(
      appErr && /npm down/.test(appErr.message) && fs.readFileSync(markerFile, 'utf8') === before,
      'setup: app install fails → stops before the master copy is rebuilt',
    );
    ok(
      exists(HOME, '.claude/stella/app/tools/installer/bin/bmad.js') &&
        !exists(HOME, '.claude/stella/app.new/tools'),
      'setup: failed app install keeps the previous app',
    );

    // L7 without a terminal: saved credentials and the project are handed on
    const l7home = tmp('l7-home');
    write(
      l7home,
      '.claude/stella/credentials.env',
      'JIRA_EMAIL=dev@stella.com\nJIRA_API_TOKEN=tok-abcdefghijklmnop\n',
    );
    let handed = null;
    await projectInit.init(
      tmp('l7b'),
      initDeps({
        home: l7home,
        projectName: 'SLS',
        fullInstall: async (root, deps) => ((handed = deps), {}),
      }),
    );
    ok(
      handed.env.JIRA_EMAIL === 'dev@stella.com' && handed.env.STELLA_PROJECT === 'SLS',
      'init L7: no terminal → saved credentials and project passed to the full install',
    );
    let l7err = null;
    try {
      await projectInit.init(tmp('l7c'), initDeps({ home: l7home, fullInstall: async () => ({}) }));
    } catch (error) {
      l7err = error;
    }
    ok(
      l7err && l7err.code === 'NEED_PROJECT' && l7err.projects.includes('LEADRSC'),
      'init L7: no terminal and no project → asks for --project',
    );
  }

  // ================= second review pass =================
  {
    // a plain official BMad project (no Stella folder) is none of our business
    const vanilla = tmp('vanilla');
    write(vanilla, '_bmad/config.toml', '[core]\nproject_name = "X"\n');
    ok(
      userLevel.sessionCheck(vanilla, { home: HOME }) === null,
      'sessionCheck: official BMad project without the Stella folder → silent',
    );

    // a mistyped --root must not become a new project
    const ws = tmp('typo');
    let rootErr = null;
    try {
      await projectInit.init(ws, initDeps({ projectName: 'SLS', rootOverride: 'nope' }));
    } catch (error) {
      rootErr = error;
    }
    ok(
      rootErr && rootErr.code === 'NO_ROOT' && !exists(ws, 'nope'),
      'init: --root to a missing folder → error, nothing created',
    );

    // a copy that fails half-way in a new project leaves no _bmad behind
    const half = tmp('half');
    write(half, '.claude/skills/stella-project-context/scripts', 'a file where a folder must go');
    let halfErr = null;
    try {
      userLevel.applyTemplate(half, { home: HOME, projectName: 'SLS' });
    } catch (error) {
      halfErr = error;
    }
    ok(
      halfErr && !exists(half, '_bmad') && !exists(half, '_bmad.stella-lock'),
      'applyTemplate: failure in a new project → no half _bmad, lock released',
    );

    // the same failure in an existing project puts the old _bmad back
    const back = tmp('back');
    await projectInit.init(back, initDeps({ projectName: 'SLS' }));
    write(back, '_bmad/scripts/mine.py', '# old tree\n');
    fs.rmSync(at(back, '.claude/skills/stella-project-context'), { recursive: true });
    write(back, '.claude/skills/stella-project-context/scripts', 'blocker');
    let backErr = null;
    try {
      userLevel.applyTemplate(back, { home: HOME });
    } catch (error) {
      backErr = error;
    }
    ok(
      backErr &&
        exists(back, '_bmad/scripts/mine.py') &&
        userLevel.readProjectName(back) === 'SLS' &&
        !exists(back, '_bmad.stella-old'),
      'applyTemplate: failure in an existing project → previous _bmad restored',
    );
  }

  // ================= project hooks stay in the project =================
  {
    // refresh: the project's hooks move on with the master copy, replaced as a whole
    const hp = tmp('hooks-refresh');
    await projectInit.init(hp, initDeps({ projectName: 'SLS' }));
    write(hp, '.claude/stella/hooks/memory/dropped-upstream.js', '');
    fs.rmSync(at(hp, '.claude/stella/hooks/friction-logger/session-start.js'));
    const markerFile = path.join(userLevel.templateBmadDir(HOME), C.TEMPLATE_MARKER);
    const original = fs.readFileSync(markerFile, 'utf8');
    fs.writeFileSync(markerFile, JSON.stringify({ ...JSON.parse(original), id: 'hooks-next' }));
    const before = read(hp, '.claude/settings.local.json');
    ok(userLevel.sessionCheck(hp, { home: HOME }).action === 'refreshed', 'refresh runs');
    ok(
      !exists(hp, '.claude/stella/hooks/memory/dropped-upstream.js') &&
        exists(hp, '.claude/stella/hooks/friction-logger/session-start.js'),
      'refresh: project hooks replaced by the current ones',
    );
    ok(
      read(hp, '.claude/settings.local.json') === before,
      'refresh: settings.local.json is not rewritten',
    );

    // plugin enabled: its hooks.json runs the same scripts, so the project gets none
    const ph = tmp('hooks-plugin-home');
    layer.copyDir(path.join(HOME, '.claude', 'stella'), path.join(ph, '.claude', 'stella'));
    write(
      ph,
      '.claude/settings.json',
      JSON.stringify({ enabledPlugins: { 'bmad-stella@stella': true } }),
    );
    const pp = tmp('hooks-plugin');
    write(pp, '.claude/stella/hooks/memory/old.js', '');
    let memOpts = null;
    const psum = await projectInit.init(
      pp,
      initDeps({
        home: ph,
        projectName: 'SLS',
        bootstrapMemory: (r, o) => ((memOpts = o), { domainMap: false, patterns: false }),
      }),
    );
    ok(
      psum.hooksInProject === false &&
        !exists(pp, '.claude/stella') &&
        !JSON.parse(read(pp, '.claude/settings.local.json')).hooks,
      'init with the plugin enabled: no project hooks, old copies removed (no double firing)',
    );
    ok(
      memOpts.hooksDir === path.join(REPO, 'stella', 'hooks', 'project', 'memory'),
      'init with the plugin enabled: memory collectors run from this package',
    );
    // and a refresh does not bring hooks into such a project
    fs.writeFileSync(
      path.join(userLevel.templateBmadDir(ph), C.TEMPLATE_MARKER),
      JSON.stringify({ ...JSON.parse(original), id: 'hooks-plugin-next' }),
    );
    userLevel.sessionCheck(pp, { home: ph });
    ok(!exists(pp, '.claude/stella'), 'refresh: a project without hooks does not get them');
    fs.writeFileSync(markerFile, original);

    // an earlier version registered the project hooks at user level: cleared on install
    const eh = tmp('hooks-early-home');
    const early = (name, file) => ({
      hooks: [
        {
          type: 'command',
          command: `node "${eh.replaceAll('\\', '/')}/.claude/stella/app/stella/hooks/project/${name}/${file}"`,
        },
      ],
    });
    write(
      eh,
      '.claude/settings.json',
      JSON.stringify({
        hooks: {
          SessionStart: [early('friction-logger', 'session-start.js')],
          PreToolUse: [early('pr-review-guard', 'pre-tool-use.js')],
          Stop: [{ hooks: [{ type: 'command', command: 'node mine.js' }] }],
        },
      }),
    );
    await machineSetup.setup(
      setupDeps({
        home: eh,
        prompt: scripted(['dev@stella.com', 'tok-abcdefghijklmnop', false]).prompt,
      }),
    );
    const cleaned = JSON.parse(read(eh, '.claude/settings.json')).hooks;
    ok(
      !cleaned.PreToolUse &&
        cleaned.SessionStart.length === 1 &&
        cleaned.SessionStart[0].hooks[0].command.includes('init-check') &&
        cleaned.Stop.length === 1,
      'install: project hooks an earlier version put at user level are removed',
    );
  }

  // ================= L5: the per-project installer is untouched =================
  ok(
    !C.STELLA_SKILLS.includes('stella-init') &&
      !C.PROJECT_HOOKS.some((h) => h.name === 'init-check'),
    'L5: stella-init and init-check are not part of the per-project install',
  );
  ok(
    typeof installer.install === 'function' && typeof installer.uninstall === 'function',
    'L5: install and uninstall still exported',
  );

  console.log(
    fails === 0
      ? `\nAll ${total} user-level checks passed.`
      : `\n${fails} of ${total} check(s) failed.`,
  );
  process.exit(fails === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
