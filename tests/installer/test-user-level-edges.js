'use strict';

// User-level install, the cases test-user-level.js leaves out: failure paths of
// `setup`, the interactive and the refused paths of `init`, the options added to
// existing modules (TEA --copy, MCP scope, memory hooksDir, ui.section), the CLI
// commands themselves, and the shipped skill and hook files. No network, no real home.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
// Guard: nothing in this file may touch the real home directory.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-ule-home-'));
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
const LIB = path.join(REPO, 'tools', 'installer', 'lib');
const BIN = path.join(REPO, 'tools', 'installer', 'bin', 'bmad.js');
const C = require(path.join(LIB, 'constants.js'));
const userLevel = require(path.join(LIB, 'user-level.js'));
const machineSetup = require(path.join(LIB, 'machine-setup.js'));
const projectInit = require(path.join(LIB, 'project-init.js'));
const teaSkillInstaller = require(path.join(LIB, 'tea-skill-installer.js'));
const mcpRegistrar = require(path.join(LIB, 'mcp-registrar.js'));
const memoryBootstrap = require(path.join(LIB, 'memory-bootstrap.js'));
const { createUi, silentUi } = require(path.join(LIB, 'ui.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `stella-ule-${name}-`));
const at = (root, rel) => path.join(root, ...rel.split('/'));
const exists = (root, rel) => fs.existsSync(at(root, rel));
const read = (root, rel) => fs.readFileSync(at(root, rel), 'utf8');
const write = (root, rel, text) => {
  fs.mkdirSync(path.dirname(at(root, rel)), { recursive: true });
  fs.writeFileSync(at(root, rel), text);
};
const jsonRes = (status, body) => ({ ok: status < 300, status, json: async () => body });
const rejects = async (fn) => {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
};

const fakeBmad = async (root, { projectName, userName }) => {
  write(
    root,
    '_bmad/config.toml',
    `[core]\nuser_name = "${userName}"\nproject_name = "${projectName}"\n`,
  );
  write(root, '_bmad/bmm/config.yaml', `project_name: ${projectName}\n`);
  write(root, '_bmad/core/config.yaml', `project_name: ${projectName}\n`);
  for (const skill of ['bmad-help', 'bmad-prd']) {
    write(root, `.claude/skills/${skill}/SKILL.md`, `---\nname: ${skill}\n---\n`);
  }
  return 0;
};
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
  if (url.includes('/descendant/page')) return jsonRes(200, { results: [], _links: {} });
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
const pf = (over = {}) => ({
  ok: true,
  errors: [],
  warnings: [],
  found: { node: true, uv: true, python: true, gh: true, git: true, ...over.found },
  versions: {},
  ...over.rest,
});
const setupDeps = (extra) => ({
  home: HOME,
  fetch: fetchMock,
  check: () => pf(),
  runBmad: fakeBmad,
  runTeaSkill: async () => 0,
  cleanNpmCache: () => ({ status: 'cleaned', seconds: 1, detail: null }),
  installAppDeps: () => {},
  pluginInstalled: () => false,
  installPlugin: () => ({ status: 'installed', detail: null }),
  mcp: { register: () => ({ status: 'registered', url: 'u', detail: null }) },
  playwrightMcp: { register: () => [] },
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
  bootstrapMemory: () => ({ domainMap: false, patterns: false }),
  projectContext: () => ({ status: 'present' }),
  ...extra,
});
const CREDS = ['dev@stella.com', 'tok-abcdefghijklmnop'];

(async () => {
  // ================= setup: refused before anything is written =================
  {
    const h = tmp('h-node');
    const err = await rejects(() =>
      machineSetup.setup(
        setupDeps({
          home: h,
          prompt: scripted(CREDS).prompt,
          env: { JIRA_EMAIL: CREDS[0], JIRA_API_TOKEN: CREDS[1] },
          check: () => ({ ...pf({ found: { node: false } }), ok: false, errors: ['Node too old'] }),
        }),
      ),
    );
    ok(
      err && err.message === 'Node too old' && !exists(h, '.claude/stella'),
      'setup: node check fails → stops, nothing written',
    );

    const h2 = tmp('h-uv');
    const err2 = await rejects(() =>
      machineSetup.setup(
        setupDeps({
          home: h2,
          prompt: scripted(CREDS).prompt,
          check: () => pf({ found: { uv: false } }),
          tools: { ensureUv: () => ({ status: 'failed', detail: 'blocked' }) },
        }),
      ),
    );
    ok(
      err2 && /uv could not be installed \(blocked\)/.test(err2.message) && !exists(h2, '.claude'),
      'setup: uv cannot be installed → stops with the install link',
    );
  }

  // ================= setup: warnings that do not stop it =================
  {
    const h = tmp('h-warn');
    let checks = 0;
    const lines = [];
    const ui = { ...silentUi(), line: (kind, text) => lines.push(`${kind}:${text}`) };
    const sum = await machineSetup.setup(
      setupDeps({
        home: h,
        ui,
        verbose: true,
        prompt: scripted([...CREDS, false]).prompt,
        check: () => (checks++ === 0 ? pf({ found: { python: false } }) : pf()),
        tools: { ensurePython: () => ({ status: 'failed', detail: 'no network' }) },
        cleanNpmCache: () => ({ status: 'failed', seconds: 1, detail: 'exit 1' }),
        mcp: {
          register: () => ({ status: 'no-cli', url: 'u', detail: 'claude command not found' }),
        },
        userHooks: async () => {
          throw new Error('hooks boom');
        },
      }),
    );
    ok(checks === 2, 'setup: tools are checked again after an install attempt');
    ok(
      sum.warnings.some((w) => w.startsWith('Python 3.12 was not installed (no network)')) &&
        sum.warnings.some((w) => w.startsWith('npm cache clean failed (exit 1)')) &&
        sum.warnings.some((w) => w.startsWith('Atlassian MCP not registered')) &&
        sum.warnings.includes('User-level hooks not installed: hooks boom'),
      'setup: python, npm cache, MCP and user-hook problems are warnings',
    );
    ok(
      sum.userHooks.status === 'error' && userLevel.templateMarker(h) && sum.hooks.length === 1,
      'setup: finishes in spite of the warnings',
    );
    ok(
      lines.some((l) => l.startsWith('ok:Master copy built')) &&
        lines.filter((l) => l.startsWith('warn:')).length === sum.warnings.length,
      'setup --verbose: lines instead of spinners, every warning printed once',
    );

    // TEA step fails → the master copy that exists is kept
    const before = read(h, '.claude/stella/bmad-template/_bmad/.stella-template.json');
    const err = await rejects(() =>
      machineSetup.setup(
        setupDeps({ home: h, prompt: scripted([false]).prompt, runTeaSkill: async () => 3 }),
      ),
    );
    ok(
      err &&
        /TEA skill install exited with code 3/.test(err.message) &&
        read(h, '.claude/stella/bmad-template/_bmad/.stella-template.json') === before &&
        !exists(h, '.claude/stella/bmad-template.new'),
      'setup: TEA step fails → error, old master copy kept, staging removed',
    );

    // user hooks reported as an error object, not thrown
    const sum2 = await machineSetup.setup(
      setupDeps({
        home: h,
        prompt: scripted([false]).prompt,
        userHooks: async () => ({ error: new Error('copy failed') }),
      }),
    );
    ok(
      sum2.warnings.includes('User-level hooks not installed: copy failed'),
      'setup: user hooks return an error → warning',
    );

    // run after run: our hook entries are replaced, never added twice
    const settings = JSON.parse(read(h, '.claude/settings.json'));
    const ours = Object.values(settings.hooks)
      .flat()
      .filter((e) => e.hooks[0].command.includes(machineSetup.APP_HOOKS_MARK));
    ok(ours.length === 1, 'setup: three runs → still one hook entry');

    // a skill the previous master copy shipped and this one dropped is removed
    const sum3 = await machineSetup.setup(
      setupDeps({
        home: h,
        prompt: scripted([false]).prompt,
        runBmad: async (root, o) => {
          await fakeBmad(root, o);
          fs.rmSync(at(root, '.claude/skills/bmad-prd'), { recursive: true });
          return 0;
        },
      }),
    );
    ok(
      !exists(h, '.claude/skills/bmad-prd') &&
        exists(h, '.claude/skills/bmad-help') &&
        !sum3.skills.bmadSkills.includes('bmad-prd'),
      'setup: official skill dropped upstream → removed from ~/.claude/skills',
    );

    // plugin mode with nothing of ours in settings.json → the file is not rewritten
    const clean = tmp('h-clean');
    write(clean, '.claude/settings.json', '{\n  // mine\n  "model": "x"\n}\n');
    ok(
      machineSetup.registerUserHooks({ home: clean, pluginMode: true }).length === 0 &&
        read(clean, '.claude/settings.json') === '{\n  // mine\n  "model": "x"\n}\n',
      'registerUserHooks: plugin mode, nothing to remove → settings.json untouched',
    );
    machineSetup.registerUserHooks({ home: clean, pluginMode: false });
    ok(
      read(clean, '.claude/settings.json').includes('// mine') &&
        JSON.parse(read(clean, '.claude/settings.json').replace('// mine', '')).model === 'x',
      'registerUserHooks: comments and other settings survive',
    );

    // setup started from the app copy itself does not copy the app onto itself
    const self = machineSetup.installApp({
      home: h,
      repoRoot: userLevel.appDir(h),
      installAppDeps: () => {
        throw new Error('must not run');
      },
    });
    ok(self.status === 'self', 'installApp: run from the app copy → nothing copied');
  }

  // ================= init: the project name is written safely =================
  await machineSetup.setup(setupDeps({ prompt: scripted([...CREDS, false]).prompt }));
  {
    const proj = tmp('odd name');
    const odd = 'R&D "Core" \\ $1';
    await projectInit.init(proj, initDeps({ projectName: odd }));
    ok(userLevel.readProjectName(proj) === odd, 'init: quotes, backslash and $ in a name survive');
    ok(
      read(proj, '_bmad/core/config.yaml').includes(`project_name: ${JSON.stringify(odd)}`),
      'init: the YAML files get a quoted name',
    );
    // refresh keeps that name
    const markerFile = at(HOME, '.claude/stella/bmad-template/_bmad/.stella-template.json');
    const original = fs.readFileSync(markerFile, 'utf8');
    fs.writeFileSync(markerFile, JSON.stringify({ ...JSON.parse(original), id: 'other' }));
    userLevel.sessionCheck(proj, { home: HOME });
    ok(userLevel.readProjectName(proj) === odd, 'refresh: an odd project name is kept as it is');
    fs.writeFileSync(markerFile, original);
  }

  // ================= init: with a terminal the list is shown =================
  {
    const proj = tmp('tty');
    const s = scripted(['SLS']);
    const sum = await projectInit.init(proj, initDeps({ isTTY: true, prompt: s.prompt }));
    ok(
      s.asked.join(',') === 'choice' && sum.project.name === 'SLS' && exists(proj, '_bmad'),
      'init: terminal → project picked from the list',
    );
    // STELLA_PROJECT in the environment answers it too
    const proj2 = tmp('envpick');
    const sum2 = await projectInit.init(proj2, initDeps({ env: { STELLA_PROJECT: 'LEADRSC' } }));
    ok(sum2.project.pageId === '1626308638', 'init: STELLA_PROJECT names the project');
    // a session in a subfolder sets up the parent that holds _bmad
    fs.mkdirSync(at(proj2, 'src/deep'), { recursive: true });
    const sum3 = await projectInit.init(at(proj2, 'src/deep'), initDeps());
    ok(
      sum3.root === proj2 && sum3.rootKind === 'parent' && !exists(proj2, 'src/deep/_bmad'),
      'init: from a subfolder → the parent project, no second _bmad',
    );
  }

  // ================= init: refused without a terminal =================
  {
    const empty = tmp('h-nocreds');
    write(empty, '.claude/stella/bmad-template/_bmad/.stella-template.json', '{"id":"x"}');
    const proj = tmp('nocreds');
    let err = await rejects(() =>
      projectInit.init(proj, initDeps({ home: empty, projectName: 'SLS' })),
    );
    ok(
      err &&
        err.code === 'NO_CREDENTIALS' &&
        !exists(proj, '_bmad') &&
        !exists(proj, '_bmad-output'),
      'init: no saved credentials → refused, nothing written',
    );
    // saved credentials that JIRA rejects cannot be re-entered without a terminal
    const rejected = async (url) => (url.includes('/myself') ? jsonRes(401, {}) : fetchMock(url));
    err = await rejects(() =>
      projectInit.init(tmp('expired'), initDeps({ projectName: 'SLS', fetch: rejected })),
    );
    ok(err && err.code === 'NEED_TERMINAL', 'init: saved token rejected → asks for a terminal');
    // Confluence unreachable: --project still works, the list is just empty
    const offline = async (url) => {
      if (url.includes('/myself')) return jsonRes(200, {});
      throw new Error('offline');
    };
    err = await rejects(() => projectInit.init(tmp('offline'), initDeps({ fetch: offline })));
    ok(
      err && err.code === 'NEED_PROJECT' && err.projects.join(',') === 'Other',
      'init: project list unreachable → still asks for --project',
    );
    const sum = await projectInit.init(
      tmp('offline2'),
      initDeps({ fetch: offline, projectName: 'SLS' }),
    );
    ok(
      sum.project.name === 'SLS' &&
        sum.project.pageId === null &&
        sum.domainDocs.status === 'skipped',
      'init: offline with --project → set up, no domain docs',
    );
  }

  // ================= swapDir puts the old folder back when the swap fails =================
  {
    const box = tmp('swapfail');
    write(box, 'final/a.txt', 'old');
    const err = await rejects(async () =>
      userLevel.swapDir(at(box, 'missing-staged'), at(box, 'final')),
    );
    ok(
      err && read(box, 'final/a.txt') === 'old' && !exists(box, 'final.stella-old'),
      'swapDir: staged folder missing → old folder back in place',
    );
    userLevel.discard(null);
    ok(userLevel.readProjectName(box) === null, 'readProjectName: no config → null');
    ok(userLevel.findRoot(at(box, 'not-there')).kind === 'none', 'findRoot: missing folder → none');
    ok(
      userLevel.sessionCheck(at(box, 'final'), { home: tmp('h-none') }) === null,
      'sessionCheck: machine without a master copy → silent',
    );
  }

  // ================= options added to existing modules =================
  {
    const plain = teaSkillInstaller.buildArgs();
    const copy = teaSkillInstaller.buildArgs({ copy: true });
    ok(
      !plain.includes('--copy') && plain.at(-1) === '-y' && plain.length === 9,
      'TEA: default arguments unchanged',
    );
    ok(
      copy.includes('--copy') && copy.at(-1) === '-y' && copy.length === 10,
      'TEA: copy adds --copy before the final -y',
    );
    let cmd = null;
    teaSkillInstaller.install(tmp('tea'), {
      copy: true,
      write: () => {},
      spawn: (c) => ((cmd = c), { status: 0 }),
    });
    ok(cmd.endsWith(' --copy -y'), 'TEA: install passes copy on to the command line');

    const runs = [];
    const run = (command) => {
      runs.push(command);
      return command.startsWith('claude mcp get') ? { status: 1 } : { status: 0, stdout: '' };
    };
    mcpRegistrar.register(tmp('mcp'), { run, scope: 'user' });
    ok(
      runs.some((c) => c.includes('claude mcp add --transport http --scope user atlassian ')),
      'MCP: scope option reaches the claude command',
    );
    runs.length = 0;
    mcpRegistrar.register(tmp('mcp2'), { run });
    ok(
      runs.some((c) => c.includes('--scope local atlassian ')),
      'MCP: default scope is still local',
    );

    // hooksDir: scripts are looked up there, not in the project
    const root = tmp('mem');
    write(root, '.claude/stella/hooks/memory/pattern-scanner.js', 'process.exit(0)');
    write(root, '_bmad-output/stella/memory/domain-map.md', 'x');
    write(root, '_bmad-output/stella/memory/patterns.md', 'x');
    ok(
      JSON.stringify(memoryBootstrap.bootstrapIfMissing(root, { hooksDir: tmp('nohooks') })) ===
        '{"domainMap":false,"patterns":false}',
      'memory: both files present → nothing started',
    );
    fs.rmSync(at(root, '_bmad-output/stella/memory/patterns.md'));
    ok(
      memoryBootstrap.bootstrapIfMissing(root, { hooksDir: tmp('nohooks2') }).patterns === false,
      'memory: hooksDir given → the project copy is not used',
    );

    const out = [];
    const ui = createUi({ version: '1', bmadVersion: '2', stream: { write: (s) => out.push(s) } });
    ui.section('Plugin');
    ok(out.join('').includes('Plugin'), 'ui: section prints its label');
    ok(typeof silentUi().section === 'function', 'ui: the silent ui has section too');
  }

  // ================= the CLI commands =================
  {
    const cli = (cwd, args) =>
      spawnSync(process.execPath, [BIN, ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, HOME, USERPROFILE: HOME },
      });
    const help = cli(REPO, ['--help']).stdout;
    ok(
      !/^\s+setup\b/m.test(help) &&
        /\binit\b/.test(help) &&
        /\binstall\b/.test(help) &&
        /\buninstall\b/.test(help),
      'cli: install, init and uninstall listed; no setup command',
    );
    const initHelp = cli(REPO, ['init', '--help']).stdout;
    ok(
      ['--project', '--root', '--list-projects', '--status'].every((o) => initHelp.includes(o)),
      'cli: init options',
    );

    const none = tmp('cli-none');
    let r = cli(none, ['init', '--status']);
    ok(
      r.status === 0 && r.stdout.includes('BMad-Stella is not set up here. Run /stella-init.'),
      'cli: status in a folder that is not set up',
    );

    const proj = tmp('cli-proj');
    await projectInit.init(proj, initDeps({ projectName: 'SLS' }));
    r = cli(proj, ['init', '--status']);
    ok(
      r.status === 0 &&
        r.stdout.includes('project: SLS') &&
        /_bmad: \S+\+bmad\.6\.12\.2/.test(r.stdout) &&
        r.stdout.includes('project context: not yet') &&
        !r.stdout.includes('update pending'),
      'cli: status of a project that is set up',
    );

    // A newer install on the machine: status says so, and running init again applies it.
    const markerFile = at(HOME, '.claude/stella/bmad-template/_bmad/.stella-template.json');
    const original = fs.readFileSync(markerFile, 'utf8');
    fs.writeFileSync(markerFile, JSON.stringify({ ...JSON.parse(original), id: 'newer-install' }));
    r = cli(proj, ['init', '--status']);
    ok(
      r.stdout.includes('update pending: newer-install') &&
        r.stdout.includes('or now by running init again'),
      'cli: status names the newer install and how to apply it',
    );
    const before = userLevel.readMarker(at(proj, '_bmad')).id;
    const again = await projectInit.init(proj, initDeps());
    ok(
      before !== 'newer-install' &&
        userLevel.readMarker(at(proj, '_bmad')).id === 'newer-install' &&
        again.project.name === 'SLS',
      'init again, no --project: older _bmad replaced, saved project kept',
    );
    ok(
      !cli(proj, ['init', '--status']).stdout.includes('update pending'),
      'cli: no update pending after it',
    );
    fs.writeFileSync(markerFile, original);

    const ws = tmp('cli-ws');
    fs.mkdirSync(at(ws, 'a/_bmad'), { recursive: true });
    fs.mkdirSync(at(ws, 'b/_bmad'), { recursive: true });
    r = cli(ws, ['init', '--status']);
    ok(r.stdout.includes('Several folders here hold _bmad/'), 'cli: status with several projects');
    r = cli(ws, ['init', '--project', 'SLS']);
    ok(
      r.status === 1 && r.stdout.includes('Run again with --root <folder>') && !exists(ws, '_bmad'),
      'cli: init with several projects → exit 1, asks for --root',
    );
    r = cli(ws, ['init', '--project', 'SLS', '--root', 'nope']);
    ok(r.status === 1 && r.stdout.includes('--root: no such folder'), 'cli: bad --root → exit 1');

    const noCreds = tmp('cli-h');
    r = spawnSync(process.execPath, [BIN, 'init', '--list-projects'], {
      cwd: none,
      encoding: 'utf8',
      env: { ...process.env, HOME: noCreds, USERPROFILE: noCreds },
    });
    ok(
      r.status === 1 && r.stdout.includes('No saved Atlassian credentials'),
      'cli: --list-projects without credentials → exit 1, says to run setup',
    );
    r = spawnSync(process.execPath, [BIN, 'install'], {
      cwd: none,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: noCreds,
        USERPROFILE: noCreds,
        JIRA_EMAIL: '',
        JIRA_API_TOKEN: '',
      },
    });
    ok(
      r.status === 1 && r.stdout.includes('No interactive terminal') && !exists(noCreds, '.claude'),
      'cli: install without a terminal and without credentials → exit 1, nothing written',
    );
  }

  // ================= shipped files =================
  {
    const skill = read(REPO, 'stella/skills/stella-init/SKILL.md');
    ok(
      skill.includes('<home>/.claude/stella/app/tools/installer/bin/bmad.js') && fs.existsSync(BIN),
      'skill: names the app entry point that exists in this package',
    );
    ok(
      [
        'init --status',
        'init --list-projects',
        'init --project "<name>"',
        '--root "<folder>"',
      ].every((c) => skill.includes(c)),
      'skill: uses only commands the CLI has',
    );
    ok(
      skill.includes('npx -y bmad-stella@latest') && /Do not copy, create or edit/.test(skill),
      'skill: runs through npx without the app, and never edits by hand',
    );
    const hooks = JSON.parse(read(REPO, 'stella/hooks/hooks.json')).hooks;
    ok(
      hooks.SessionStart.some((e) =>
        e.hooks[0].command.endsWith('/hooks/project/init-check/session-start.js"'),
      ) && exists(REPO, 'stella/hooks/project/init-check/session-start.js'),
      'plugin: hooks.json registers init-check and the script exists',
    );
    const hookSrc = read(REPO, 'stella/hooks/project/init-check/session-start.js');
    ok(
      C.APP_DIR_PARTS.every((p) => hookSrc.includes(`'${p}'`)) &&
        !/require\('(?!node:)[^.]/.test(hookSrc),
      'hook: points at the app folder and needs no installed package',
    );
    const tea = read(REPO, 'stella/skills/stella-tea-live-testing/SKILL.md');
    ok(
      tea.includes('{skill-root}/../bmod-tea/knowledge') &&
        tea.includes('~/.claude/skills/bmod-tea/knowledge'),
      'TEA skill: knowledge folder also looked up at user level',
    );
    ok(
      /`update pending:` line[^\n]*run `\{run\} init`/.test(skill),
      'skill: an older _bmad is brought up to date by running init again',
    );

    // The version id follows the content of the skills and the hooks, not only version
    // numbers: a change in either marks every project copy as behind.
    const layer = require(path.join(LIB, 'stella-layer.js'));
    const real = { ...layer.SRC };
    const baseline = userLevel.layerHash();
    ok(userLevel.layerHash() === baseline, 'hash: stable while nothing changes');
    const hashWith = (key, change) => {
      const copy = tmp(`hash-${key}`);
      layer.copyDir(real[key], copy);
      change(copy);
      layer.SRC[key] = copy;
      try {
        return userLevel.layerHash();
      } finally {
        layer.SRC[key] = real[key];
      }
    };
    ok(
      hashWith('skills', (dir) => fs.appendFileSync(at(dir, 'stella-build/workflow.md'), '\n')) !==
        baseline,
      'hash: one changed skill file → a new id',
    );
    ok(
      hashWith('skills', (dir) => write(dir, 'stella-build/new-step.md', 'x')) !== baseline,
      'hash: one added skill file → a new id',
    );
    ok(
      hashWith('hooks', (dir) => fs.appendFileSync(at(dir, 'memory/daily-job.js'), '\n')) !==
        baseline,
      'hash: one changed project hook file → a new id',
    );
    ok(
      hashWith('utils', (dir) => fs.appendFileSync(at(dir, 'jira-comment/index.js'), '\n')) !==
        baseline,
      'hash: one changed helper file → a new id',
    );
    ok(hashWith('skills', () => {}) === baseline, 'hash: an identical copy → the same id');
    ok(userLevel.templateId().endsWith(baseline), 'hash: it is the last part of the version id');

    // A skill run in a folder without _bmad/ says how to set the project up.
    for (const name of C.STELLA_SKILLS.filter((s) => s !== 'caveman')) {
      const text = read(REPO, `stella/skills/${name}/SKILL.md`);
      ok(
        /no `_bmad\/` folder[^\n]*\/stella-init/i.test(text),
        `${name}: without _bmad/ it tells the user to run /stella-init`,
      );
    }
    ok(
      !/Stella installer/.test(read(REPO, 'stella/skills/stella-domain-expert/SKILL.md')),
      'stella-domain-expert: no advice to re-run the old installer',
    );
    ok(
      C.PROJECT_NAME_FILES.join(',') === 'config.toml,bmm/config.yaml,core/config.yaml' &&
        C.TEMPLATE_DIR_PARTS.join('/') === '.claude/stella/bmad-template' &&
        C.PLUGIN.source === 'Asrarul-BS23/BMad-Stella',
      'constants: user-level paths and plugin source',
    );
  }

  console.log(
    fails === 0
      ? `\nAll ${total} user-level edge checks passed.`
      : `\n${fails} of ${total} check(s) failed.`,
  );
  process.exit(fails === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
