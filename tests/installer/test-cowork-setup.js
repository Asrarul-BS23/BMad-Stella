'use strict';

// `/stella-init` on a machine where `bmad-stella install` never ran (Cowork, or the
// plugin added by hand). Decisions L8-L10, tea-module/rnd-docs/user-level-install-design.md:
//   L8   no app → the skill runs `init` through npx; `init` falls back to the
//        per-project installer, without project copies of the skills
//   L9   the project name is suggested from the folder, the git remote, the .sln
//   L10  credentials: check, ask in the chat, save — or skip and save the file later
// No network, no real home.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
// Guard: nothing in this file may touch the real home directory.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-cw-home-'));
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
delete process.env.BMAD_SKIP_JIRA_VERIFY;
const LIB = path.join(REPO, 'tools', 'installer', 'lib');
const BIN = path.join(REPO, 'tools', 'installer', 'bin', 'bmad.js');
const C = require(path.join(LIB, 'constants.js'));
const cowork = require(path.join(LIB, 'cowork-setup.js'));
const projectInit = require(path.join(LIB, 'project-init.js'));
const installer = require(path.join(LIB, 'installer.js'));
const picker = require(path.join(LIB, 'project-picker.js'));
const jira = require(path.join(LIB, 'jira-credentials-manager.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `stella-cw-${name}-`));
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

const PROJECTS = ['DRE', 'LEADRS', 'LEADRSC', 'RISK MONITOR', 'SLS', 'TEC'];
const calls = [];
const fetchMock = async (url) => {
  calls.push(url);
  if (url.includes('/rest/api/3/myself')) return jsonRes(200, { displayName: 'Ash' });
  if (url.includes('/child/page'))
    return jsonRes(200, {
      results: PROJECTS.map((name, i) => ({ id: String(100 + i), title: `P-${name}` })),
      _links: {},
    });
  if (url.includes('/descendant/page')) return jsonRes(200, { results: [], _links: {} });
  return jsonRes(404, {});
};
const rejected = async (url) => (url.includes('/myself') ? jsonRes(401, {}) : fetchMock(url));
const offline = async () => {
  throw new Error('offline');
};
const PAIR = { email: 'dev@stella.com', token: 'tok-abcdefghijklmnop' };
const saveHome = (name) => {
  const home = tmp(name);
  jira.writeCredentialsFile(PAIR, { home });
  return home;
};

// What the official installer leaves behind, minimal.
const fakeBmad = async (root, { projectName }) => {
  write(root, '_bmad/config.toml', `[core]\nproject_name = "${projectName}"\n`);
  for (const skill of ['bmad-build', 'bmad-help']) {
    write(root, `.claude/skills/${skill}/SKILL.md`, `---\nname: ${skill}\n---\n`);
  }
  return 0;
};
const installDeps = (extra) => ({
  fetch: fetchMock,
  runBmad: fakeBmad,
  runTeaSkill: async () => 0,
  cleanNpmCache: () => ({ status: 'cleaned', seconds: 1, detail: null }),
  setupTeaConfig: () => ({ status: 'written', file: '_bmad/config.toml', keys: 13 }),
  userHooks: async () => ({ status: 'current', changed: false }),
  bootstrapMemory: () => ({ domainMap: false, patterns: false }),
  projectContext: () => ({ status: 'present' }),
  mcp: { register: () => ({ status: 'registered', url: 'u', detail: null }) },
  playwrightMcp: { register: () => [] },
  check: () => ({
    ok: true,
    errors: [],
    warnings: [],
    found: { node: true, uv: true, python: true, gh: true, git: true },
    versions: {},
  }),
  isTTY: false,
  ...extra,
});

(async () => {
  // ================= L10: are credentials saved, and do they work? =================
  {
    const empty = tmp('h-empty');
    let s = await cowork.credentialsStatus({ home: empty, fetch: fetchMock });
    ok(
      s.state === 'missing' && s.file === at(empty, '.claude/stella/credentials.env'),
      'credentials: none saved → missing, with the file path',
    );
    const home = saveHome('h-saved');
    s = await cowork.credentialsStatus({ home, fetch: fetchMock });
    ok(s.state === 'saved' && s.verified && s.email === PAIR.email, 'credentials: saved and valid');
    s = await cowork.credentialsStatus({ home, fetch: rejected });
    ok(
      s.state === 'rejected' && s.detail === 'HTTP 401',
      'credentials: saved but rejected by JIRA',
    );
    s = await cowork.credentialsStatus({ home, fetch: offline });
    ok(s.state === 'saved' && !s.verified, 'credentials: JIRA unreachable → kept, not asked again');
  }

  // ================= L10: save what the user typed =================
  {
    const home = tmp('h-save');
    let s = await cowork.saveCredentials({ ...PAIR, home, fetch: rejected });
    ok(
      s.state === 'rejected' && !exists(home, '.claude/stella/credentials.env'),
      'save: rejected pair → not written',
    );
    s = await cowork.saveCredentials({ email: ' ', token: PAIR.token, home, fetch: fetchMock });
    ok(
      s.state === 'invalid' && !exists(home, '.claude'),
      'save: email missing → invalid, not written',
    );
    s = await cowork.saveCredentials({
      email: ` ${PAIR.email} `,
      token: PAIR.token,
      home,
      fetch: fetchMock,
    });
    const saved = jira.readCredentialsFile({ home });
    ok(
      s.state === 'saved' && s.verified && saved.email === PAIR.email && saved.token === PAIR.token,
      'save: valid pair → verified, written to the one file, trimmed',
    );
    ok(
      s.file === at(home, C.CREDENTIALS_FILE_PARTS.join('/')),
      'save: the file is ~/.claude/stella/credentials.env',
    );
    const home2 = tmp('h-save2');
    s = await cowork.saveCredentials({ ...PAIR, home: home2, fetch: offline });
    ok(
      s.state === 'saved' && !s.verified && jira.readCredentialsFile({ home: home2 }),
      'save: JIRA unreachable → saved, marked not verified',
    );
    const help = cowork.credentialsHelp({ home }).join('\n');
    ok(
      help.includes(at(home, '.claude/stella/credentials.env')) &&
        help.includes('JIRA_EMAIL=') &&
        help.includes('JIRA_API_TOKEN=') &&
        help.includes(C.TOKEN_HELP_URL),
      'help: file path, both lines and the token link',
    );
  }

  // ================= L9: which project does this folder belong to? =================
  {
    const pick = (names) => {
      const m = cowork.bestMatch(names, PROJECTS);
      return m ? m.name : null;
    };
    ok(pick(['leadersc']) === 'LEADRSC', 'match: leadersc → LEADRSC (similar spelling)');
    ok(
      pick(['LEADRS_CORE_SR']) === 'LEADRS',
      'match: LEADRS_CORE_SR → LEADRS (a word of the name)',
    );
    ok(pick(['sls-backend']) === 'SLS', 'match: sls-backend → SLS');
    ok(pick(['risk-monitor-api']) === 'RISK MONITOR', 'match: risk-monitor-api → RISK MONITOR');
    ok(pick(['Tec']) === 'TEC', 'match: same name in another case');
    ok(pick(['my-notes']) === null, 'match: nothing close → no suggestion');
    // one project is far ahead of the others, but still not close enough to offer
    ok(
      pick(['slx']) === null && cowork.matchScore('slx', 'SLS') > cowork.matchScore('slx', 'TEC'),
      'match: the best of weak matches is not suggested',
    );
    ok(pick(['leadrs-leadrsc']) === null, 'match: two projects fit about equally → no suggestion');
    ok(
      pick([]) === null && cowork.bestMatch(['x'], []) === null,
      'match: nothing to compare → none',
    );
    ok(
      pick(['random-folder', 'TecApi']) === 'TEC',
      'match: any of the candidate names may give the match (camelCase word)',
    );
    ok(
      cowork.matchScore('ab', 'abcdef') < 0.75,
      'match: a two-letter name inside another is not enough',
    );

    const root = path.join(tmp('cand'), 'leadersc');
    fs.mkdirSync(root);
    write(
      root,
      '.git/config',
      '[remote "origin"]\n\turl = git@github.com:stella/LeadRS-Core.git\n',
    );
    write(root, 'LEADRS.Core.sln', '');
    write(root, 'Other.slnx', '');
    const names = cowork.candidateNames(root);
    ok(
      names.join(',') === 'leadersc,LeadRS-Core,LEADRS.Core,Other',
      'candidates: folder name, git remote repository, solution files',
    );
    write(root, '.git/config', '[remote "origin"]\n  url = https://github.com/stella/sls-api/\n');
    ok(cowork.remoteRepoName(root) === 'sls-api', 'candidates: https remote with a trailing slash');
    ok(cowork.remoteRepoName(tmp('nogit')) === null, 'candidates: no git folder → no remote name');

    const home = saveHome('h-sugg');
    const proj = path.join(tmp('sugg'), 'leadersc');
    fs.mkdirSync(proj);
    let s = await cowork.suggestProject(proj, { home, fetch: fetchMock });
    ok(
      s.suggestion === 'LEADRSC' && s.from === 'leadersc' && s.projects.length === PROJECTS.length,
      'suggest: folder name matched against the Confluence list',
    );
    s = await cowork.suggestProject(tmp('zzz'), { home, fetch: fetchMock });
    ok(
      s.suggestion === null && s.reason === 'no clear match' && s.projects.includes('SLS'),
      'suggest: no match → none, the list is still returned',
    );
    s = await cowork.suggestProject(proj, { home: tmp('h-nocreds'), fetch: fetchMock });
    ok(
      s.suggestion === null && s.reason === 'no saved credentials',
      'suggest: no credentials → none',
    );
    s = await cowork.suggestProject(proj, { home, fetch: offline });
    ok(
      s.suggestion === null && /project list not available/.test(s.reason),
      'suggest: Confluence unreachable → none, no crash',
    );
  }

  // ================= L8: `init` without a master copy → the per-project installer =================
  {
    // no saved credentials, no terminal → runs without them instead of failing
    const home = tmp('h-l8');
    let handed = null;
    let sum = await projectInit.init(tmp('l8a'), {
      home,
      fetch: fetchMock,
      env: {},
      isTTY: false,
      projectName: 'SLS',
      fullInstall: async (root, deps) => ((handed = deps), {}),
    });
    ok(
      sum.mode === 'full' && sum.noCredentials === true && handed.skipCredentials === true,
      'init L8: no credentials on the machine → set up without them',
    );
    ok(
      handed.skillsAtUserLevel === true && handed.env.STELLA_PROJECT === 'SLS',
      'init L8: run by the skill → no project copies of the skills',
    );
    ok(
      typeof handed.bootstrapMemory === 'function',
      'init L8: memory collectors run from this package',
    );

    // saved credentials → used
    const home2 = saveHome('h-l8b');
    sum = await projectInit.init(tmp('l8b'), {
      home: home2,
      fetch: fetchMock,
      env: {},
      isTTY: false,
      projectName: 'SLS',
      fullInstall: async (root, deps) => ((handed = deps), {}),
    });
    ok(
      handed.skipCredentials === false &&
        handed.env.JIRA_EMAIL === PAIR.email &&
        !sum.noCredentials,
      'init L8: saved credentials → handed to the installer',
    );
    // saved credentials, but the user asked to go on without them
    sum = await projectInit.init(tmp('l8c'), {
      home: home2,
      fetch: fetchMock,
      env: {},
      isTTY: false,
      projectName: 'SLS',
      noCredentials: true,
      fullInstall: async (root, deps) => ((handed = deps), {}),
    });
    ok(
      handed.skipCredentials === true && !handed.env.JIRA_EMAIL,
      'init L8: --no-credentials wins over a saved file',
    );
    // still needs a project name
    const err = await rejects(() =>
      projectInit.init(tmp('l8d'), {
        home,
        fetch: fetchMock,
        env: {},
        isTTY: false,
        fullInstall: async () => ({}),
      }),
    );
    ok(
      err && err.code === 'NEED_PROJECT' && err.projects.join(',') === 'Other',
      'init L8: no project name → asks for it (no list without credentials)',
    );
  }

  // ================= the real per-project installer, as `init` calls it =================
  {
    const root = tmp('real');
    const home = tmp('h-real');
    calls.length = 0;
    const sum = await installer.install(
      root,
      installDeps({
        home,
        env: { STELLA_PROJECT: 'My Project' },
        skipCredentials: true,
        skillsAtUserLevel: true,
      }),
    );
    ok(
      sum.credentials.source === 'none' && sum.credentials.email === null,
      'install: skipCredentials → no credentials asked or required',
    );
    ok(calls.length === 0, 'install: without credentials nothing is sent to Atlassian');
    ok(
      sum.project.name === 'My Project' &&
        sum.project.pageId === null &&
        JSON.parse(read(root, '_bmad-output/stella/project.json')).name === 'My Project',
      'install: the typed project name is kept, no page id',
    );
    ok(
      sum.domainDocs.status === 'skipped' && !exists(home, '.claude/stella/credentials.env'),
      'install: domain docs skipped, no credentials file written',
    );
    ok(
      sum.pluginMode === true &&
        !exists(root, '.claude/skills/stella-build') &&
        !exists(root, '.claude/stella') &&
        exists(root, '.claude/skills/bmad-help'),
      'install: skillsAtUserLevel → no Stella skills or hooks copied, official skills stay',
    );
    ok(
      !JSON.parse(read(root, '.claude/settings.local.json')).hooks &&
        exists(root, '_bmad/custom/stella/utils/jira-attachments/index.js') &&
        exists(root, '_bmad-output/stella/memory/episodes'),
      'install: no project hooks registered; helpers and output folders in place',
    );

    // without the two switches the installer behaves as it always did
    const err = await rejects(() =>
      installer.install(tmp('strict'), installDeps({ home, env: { STELLA_PROJECT: 'X' } })),
    );
    ok(
      err && /JIRA_EMAIL, JIRA_API_TOKEN/.test(err.message),
      'install: default → credentials still required without a terminal',
    );
    const err2 = await rejects(() =>
      installer.install(tmp('strict2'), installDeps({ home, env: {}, skipCredentials: true })),
    );
    ok(
      err2 && /Set STELLA_PROJECT/.test(err2.message),
      'install: skipCredentials still needs a project',
    );

    // the picker asks Atlassian nothing when there are no credentials
    calls.length = 0;
    const picked = await picker.run(
      tmp('pick'),
      { email: null, token: null },
      { fetch: fetchMock, env: { STELLA_PROJECT: 'SLS' } },
    );
    ok(
      picked.name === 'SLS' && picked.pageId === null && calls.length === 0,
      'picker: no credentials → no request',
    );
    const picked2 = await picker.run(tmp('pick2'), PAIR, {
      fetch: fetchMock,
      env: { STELLA_PROJECT: 'sls' },
    });
    ok(picked2.pageId === '104', 'picker: with credentials the page id is still found');
  }

  // ================= init on the machine path also takes --no-credentials =================
  {
    // a master copy, built by hand
    const home = tmp('h-tpl');
    write(
      home,
      '.claude/stella/bmad-template/_bmad/config.toml',
      '[core]\nproject_name = "STELLA_TEMPLATE"\n',
    );
    write(home, '.claude/stella/bmad-template/_bmad/.stella-template.json', '{"id":"t1"}');
    calls.length = 0;
    const root = tmp('tpl');
    const sum = await projectInit.init(root, {
      home,
      fetch: fetchMock,
      env: {},
      isTTY: false,
      projectName: 'SLS',
      noCredentials: true,
      bootstrapMemory: () => ({ domainMap: false, patterns: false }),
      projectContext: () => ({ status: 'present' }),
    });
    ok(
      sum.noCredentials === true &&
        sum.project.pageId === null &&
        exists(root, '_bmad/config.toml'),
      'init --no-credentials: project set up from the master copy',
    );
    ok(
      calls.length === 0 && sum.domainDocs.status === 'skipped',
      'init --no-credentials: nothing fetched',
    );
  }

  // ================= the CLI, as the skill runs it =================
  {
    const cli = (cwd, args, env = {}) =>
      spawnSync(process.execPath, [BIN, ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, JIRA_EMAIL: '', JIRA_API_TOKEN: '', ...env },
      });
    const home = tmp('h-cli');
    const here = { HOME: home, USERPROFILE: home };
    const cwd = tmp('cli');

    const help = cli(cwd, ['init', '--help']).stdout;
    ok(
      [
        '--check-credentials',
        '--save-credentials',
        '--email',
        '--token',
        '--suggest-project',
        '--no-credentials',
      ].every((o) => !help.includes(o)),
      'cli: the options the skill uses are not offered to the user',
    );

    let r = cli(cwd, ['init', '--check-credentials'], here);
    ok(
      r.status === 0 &&
        r.stdout.includes('credentials: missing') &&
        r.stdout.includes(path.join(home, '.claude', 'stella', 'credentials.env')) &&
        r.stdout.includes('JIRA_API_TOKEN=') &&
        r.stdout.includes(C.TOKEN_HELP_URL),
      'cli: --check-credentials → missing, with path, lines and link',
    );
    r = cli(cwd, ['init', '--save-credentials', '--token', 'x'], here);
    ok(
      r.status === 1 &&
        r.stdout.includes('credentials: invalid') &&
        !fs.existsSync(path.join(home, '.claude')),
      'cli: --save-credentials without an email → exit 1, nothing written',
    );
    r = cli(cwd, ['init', '--save-credentials', '--email', PAIR.email, '--token', PAIR.token], {
      ...here,
      BMAD_SKIP_JIRA_VERIFY: '1',
    });
    ok(
      r.status === 0 &&
        r.stdout.includes('credentials: saved') &&
        jira.readCredentialsFile({ home }).token === PAIR.token,
      'cli: --save-credentials → file written under the home folder',
    );
    r = cli(cwd, ['init', '--check-credentials'], { ...here, BMAD_SKIP_JIRA_VERIFY: '1' });
    ok(
      r.status === 0 &&
        r.stdout.includes('credentials: saved') &&
        !r.stdout.includes('JIRA_API_TOKEN='),
      'cli: --check-credentials → saved, no instructions printed',
    );
    const bare = tmp('h-bare');
    r = cli(cwd, ['init', '--suggest-project'], { HOME: bare, USERPROFILE: bare });
    ok(
      r.status === 0 &&
        r.stdout.includes('suggestion: none (no saved credentials)') &&
        r.stdout.includes('projects: Other'),
      'cli: --suggest-project without credentials → none, only Other',
    );
  }

  // ================= the skill text =================
  {
    const skill = read(REPO, 'stella/skills/stella-init/SKILL.md');
    ok(
      skill.includes('npx -y bmad-stella@latest') && skill.includes('node "{app}"'),
      'skill: two ways to run — the app, or npx when the app is missing',
    );
    ok(
      [
        'init --check-credentials',
        'init --save-credentials --email "<email>" --token "<token>"',
        'init --suggest-project',
        '--no-credentials',
      ].every((c) => skill.includes(c)),
      'skill: names the commands the CLI has for the Cowork path',
    );
    ok(
      (skill.match(/Cowork path only/g) || []).length >= 2 &&
        /Never ask the user to run them/.test(skill),
      'skill: the Cowork steps are limited to that path and run by the skill itself',
    );
    ok(
      skill.includes(C.TOKEN_HELP_URL) && /stays in this conversation/.test(skill),
      'skill: the question gives the token link and says the token stays in the conversation',
    );
    ok(
      !/tell the user to run `npx bmad-stella@latest install`/.test(skill),
      'skill: a missing app no longer stops the setup',
    );
  }

  console.log(
    fails === 0
      ? `\nAll ${total} Cowork setup checks passed.`
      : `\n${fails} of ${total} check(s) failed.`,
  );
  process.exit(fails === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
