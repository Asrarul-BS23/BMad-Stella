'use strict';

// Migration Task 10 — installer part 1 (steps 1-8), unit-tested with injected
// prompt / fetch / spawn against temp folders. The real end-to-end install runs
// only when STELLA_INSTALL_E2E=1 (network + npx).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const LIB = path.join(REPO, 'tools', 'installer', 'lib');
const BIN = path.join(REPO, 'tools', 'installer', 'bin', 'bmad.js');
const C = require(path.join(LIB, 'constants.js'));
const preflight = require(path.join(LIB, 'preflight.js'));
const jira = require(path.join(LIB, 'jira-credentials-manager.js'));
const picker = require(path.join(LIB, 'project-picker.js'));
const cleaner = require(path.join(LIB, 'cleaner.js'));
const runner = require(path.join(LIB, 'bmad-runner.js'));
const gitignore = require(path.join(LIB, 'gitignore.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `stella-t10-${name}-`));
const quiet = () => {};

// scripted prompt: answers consumed in order, keyed by question name
const scripted = (answers) => {
  const queue = [...answers];
  const asked = [];
  const prompt = async (questions) => {
    const out = {};
    for (const q of questions) {
      asked.push(q.name);
      if (queue.length === 0) throw new Error(`no scripted answer for ${q.name}`);
      let v = queue.shift();
      if (q.filter) v = q.filter(v);
      if (q.validate && q.validate(v) !== true)
        throw new Error(`invalid answer for ${q.name}: ${v}`);
      out[q.name] = v;
    }
    return out;
  };
  return { prompt, asked, queue };
};
const jsonRes = (status, body) => ({ ok: status < 300, status, json: async () => body });

(async () => {
  // ================= constants =================
  ok(
    C.BMAD_VERSION === '6.12.2' && C.BMAD_PACKAGE === 'bmad-method@6.12.2',
    'constants: BMad pinned 6.12.2',
  );
  ok(C.JIRA_BASE_URL === 'https://stellaint.atlassian.net', 'constants: JIRA base URL');
  ok(C.CONFLUENCE_PROJECTS_PAGE.id === '1626701832', 'constants: Confluence parent page id');
  ok(C.TOKEN_ENV_FILE === '_bmad-output/stella/.bmad-tokens/.env', 'constants: token file path');
  ok(C.PROJECT_JSON_FILE === '_bmad-output/stella/project.json', 'constants: project.json path');
  ok(
    C.GITIGNORE_LINES.join(',') === '_bmad/,_bmad-output/,.claude/,.env',
    'constants: gitignore lines',
  );
  ok(C.USER_NAME_FALLBACK === 'stella-dev', 'constants: user name fallback');

  // ================= preflight =================
  const runWith = (present) => (cmd) => ({ status: present.includes(cmd) ? 0 : 1, stdout: '' });
  let pf = preflight.check({ run: runWith(['uv', 'gh', 'git']), nodeVersion: 'v20.10.0' });
  ok(
    pf.ok && pf.errors.length === 0 && pf.warnings.length === 0,
    'preflight: all present → ok, silent',
  );
  pf = preflight.check({ run: runWith(['gh', 'git']), nodeVersion: 'v22.1.0' });
  ok(!pf.ok && /uv is required/.test(pf.errors[0]), 'preflight: no uv → stop');
  pf = preflight.check({ run: runWith(['uv']), nodeVersion: 'v22.1.0' });
  ok(
    pf.ok && pf.warnings.length === 2 && /gh/.test(pf.warnings[0]) && /git/.test(pf.warnings[1]),
    'preflight: no gh/git → warnings only',
  );
  pf = preflight.check({ run: runWith(['uv', 'gh', 'git']), nodeVersion: 'v20.9.1' });
  ok(!pf.ok && /Node 20\.10\+/.test(pf.errors[0]), 'preflight: Node 20.9 → stop');
  pf = preflight.check({
    run: () => {
      throw new Error('ENOENT');
    },
    nodeVersion: 'v20.10.0',
  });
  ok(!pf.ok && pf.found.uv === false, 'preflight: spawn throwing counts as missing');
  ok(
    preflight.nodeOk('v21.0.0') && !preflight.nodeOk('v18.20.0') && !preflight.nodeOk('garbage'),
    'preflight: nodeOk',
  );

  // ================= JIRA credentials =================
  {
    const root = tmp('jira');
    ok(jira.readTokenFile(root) === null, 'jira: no file → null');
    const fetchOk = async () => jsonRes(200, { displayName: 'Ash' });
    const fetch401 = async () => jsonRes(401, {});
    const fetchDown = async () => {
      throw new Error('ECONNREFUSED');
    };

    // fresh: ask email + token, verify ok, write
    let s = scripted(['dev@stella.com', 'tok-1234567890abcdef']);
    let r = await jira.run(root, { prompt: s.prompt, fetch: fetchOk, log: quiet, env: {} });
    ok(r.source === 'prompt' && r.verified && r.written, 'jira: fresh → prompt, verified, written');
    ok(s.asked.join(',') === 'email,token', 'jira: fresh asks email then token only (no base URL)');
    const file = jira.tokenFilePath(root);
    ok(
      file === path.join(root, '_bmad-output', 'stella', '.bmad-tokens', '.env'),
      'jira: token file at the v6 path',
    );
    const text = fs.readFileSync(file, 'utf8');
    ok(
      /^JIRA_BASE_URL=https:\/\/stellaint\.atlassian\.net$/m.test(text),
      'jira: base URL written as constant',
    );
    ok(
      /^JIRA_EMAIL=dev@stella\.com$/m.test(text) &&
        /^JIRA_API_TOKEN=tok-1234567890abcdef$/m.test(text),
      'jira: email + token written',
    );
    ok(jira.readTokenFile(root).email === 'dev@stella.com', 'jira: file reads back');

    // re-run: found → "use as is?" yes → verified → no questions beyond reuse
    s = scripted([true]);
    r = await jira.run(root, { prompt: s.prompt, fetch: fetchOk, log: quiet, env: {} });
    ok(
      r.source === 'file' && r.verified && s.asked.join(',') === 'reuse',
      'jira: re-run → reuse y → verified, nothing else asked',
    );

    // re-run: reuse but dead → asks fresh
    s = scripted([true, 'new@stella.com', 'tok-abcdefghijklmnop']);
    let calls = 0;
    r = await jira.run(root, {
      prompt: s.prompt,
      fetch: async () => (calls++ === 0 ? jsonRes(401, {}) : jsonRes(200, {})),
      log: quiet,
      env: {},
    });
    ok(
      r.email === 'new@stella.com' && s.asked.join(',') === 'reuse,email,token',
      'jira: reuse y but 401 → fresh entry',
    );

    // re-run: reuse n → fresh
    s = scripted([false, 'x@stella.com', 'tok-abcdefghijklmnop']);
    r = await jira.run(root, { prompt: s.prompt, fetch: fetchOk, log: quiet, env: {} });
    ok(r.email === 'x@stella.com' && r.source === 'prompt', 'jira: reuse n → fresh entry');

    // network down on reuse → keep saved, not rewritten
    s = scripted([true]);
    r = await jira.run(root, { prompt: s.prompt, fetch: fetchDown, log: quiet, env: {} });
    ok(r.source === 'file' && !r.verified && !r.written, 'jira: reuse + network down → keep saved');

    // three bad attempts → error
    s = scripted([
      'a@b.co',
      'tok-abcdefghijklmnop',
      'a@b.co',
      'tok-abcdefghijklmnop',
      'a@b.co',
      'tok-abcdefghijklmnop',
    ]);
    let threw = null;
    try {
      await jira.run(tmp('jira2'), { prompt: s.prompt, fetch: fetch401, log: quiet, env: {} });
    } catch (error) {
      threw = error.message;
    }
    ok(/after 3 attempts/.test(threw || ''), 'jira: 3 auth failures → error');

    // env override: nothing asked
    s = scripted([]);
    r = await jira.run(tmp('jira3'), {
      prompt: s.prompt,
      fetch: fetchOk,
      log: quiet,
      env: { JIRA_EMAIL: 'ci@stella.com', JIRA_API_TOKEN: 'tok-abcdefghijklmnop' },
    });
    ok(
      r.source === 'env' && s.asked.length === 0 && r.written,
      'jira: env vars → no prompt, written',
    );

    // verify: request shape
    let seen = null;
    await jira.verify(
      { email: 'e@x.com', token: 't' },
      {
        fetch: async (url, init) => {
          seen = { url, init };
          return jsonRes(200, {});
        },
      },
    );
    ok(
      seen.url === 'https://stellaint.atlassian.net/rest/api/3/myself' &&
        seen.init.headers.Authorization.startsWith('Basic '),
      'jira: verify hits /myself with Basic auth',
    );
    ok(
      /[\s#"'=]/.test('a b') && /"a b"/.test(fs.readFileSync(file, 'utf8')) === false,
      'jira: plain values unquoted',
    );
  }

  // ================= project picker =================
  {
    ok(picker.projectNameFromTitle('P-LEADRSC') === 'LEADRSC', 'picker: prefix stripped');
    ok(picker.projectNameFromTitle('P-RISK MONITOR') === 'RISK MONITOR', 'picker: spaces kept');
    ok(
      picker.projectNameFromTitle('Template') === null &&
        picker.projectNameFromTitle('P-') === null,
      'picker: no prefix / empty → ignored',
    );
    const parsed = picker.parseProjects([
      { id: 2, title: 'P-TEC' },
      { id: 9, title: 'How to' },
      { id: 1, title: 'P-DRE' },
      { id: 3, title: 'P-QuarryConnect' },
      { id: 4, title: 'P-LEADRSC' },
    ]);
    ok(
      parsed.map((p) => p.name).join(',') === 'DRE,LEADRSC,QuarryConnect,TEC',
      'picker: filtered + sorted',
    );
    ok(parsed[1].pageId === '4', 'picker: page id kept as string');

    const root = tmp('picker');
    const creds = { email: 'e@x.com', token: 't' };
    const page1 = {
      results: [
        { id: 1, title: 'P-SLS' },
        { id: 2, title: 'P-TEC' },
      ],
      _links: { next: '/rest/api/content/1626701832/child/page?limit=100&start=100' },
    };
    const page2 = { results: [{ id: 3, title: 'P-DRE' }], _links: {} };
    const urls = [];
    const fetchPages = async (url) => {
      urls.push(url);
      return jsonRes(200, urls.length === 1 ? page1 : page2);
    };

    let s = scripted(['TEC']);
    let r = await picker.run(root, creds, { prompt: s.prompt, fetch: fetchPages, log: quiet });
    ok(r.name === 'TEC' && r.pageId === '2' && !r.reused, 'picker: list → pick TEC');
    ok(
      urls.length === 2 &&
        /content\/1626701832\/child\/page/.test(urls[0]) &&
        /start=100/.test(urls[1]),
      'picker: lists children of the constant page, follows pagination',
    );
    const saved = JSON.parse(fs.readFileSync(picker.projectJsonPath(root), 'utf8'));
    ok(
      saved.name === 'TEC' && saved.pageId === '2' && saved.pageUrl.endsWith('pageId=2'),
      'picker: project.json written',
    );

    // re-run: the list is shown again (no "use saved?" question); saved pick is the default
    let seenDefault = null;
    s = {
      asked: [],
      prompt: async (qs) => {
        seenDefault = qs[0].default;
        s.asked.push(qs[0].name);
        return { choice: 'SLS' };
      },
    };
    urls.length = 0;
    r = await picker.run(root, creds, { prompt: s.prompt, fetch: fetchPages, log: quiet });
    ok(
      r.name === 'SLS' && s.asked.join(',') === 'choice' && seenDefault === 'TEC',
      'picker: re-run shows the list again with the saved pick as default',
    );

    // re-run → list → Other → name
    urls.length = 0;
    s = scripted(['Other', 'MyProj']);
    r = await picker.run(root, creds, { prompt: s.prompt, fetch: fetchPages, log: quiet });
    ok(
      r.name === 'MyProj' && r.pageId === null && s.asked.join(',') === 'choice,name',
      'picker: Other → name asked, no page id',
    );
    ok(
      JSON.parse(fs.readFileSync(picker.projectJsonPath(root), 'utf8')).pageId === null,
      'picker: Other saved with null page id',
    );

    // Confluence unreachable → name by hand
    s = scripted(['ByHand']);
    r = await picker.run(tmp('picker2'), creds, {
      prompt: s.prompt,
      fetch: async () => jsonRes(500, {}),
      log: quiet,
    });
    ok(
      r.name === 'ByHand' && s.asked.join(',') === 'name',
      'picker: Confluence error → manual name',
    );

    // STELLA_PROJECT env: no prompt, page id looked up when the name matches
    s = scripted([]);
    urls.length = 0;
    r = await picker.run(tmp('picker4'), creds, {
      prompt: s.prompt,
      fetch: fetchPages,
      log: quiet,
      env: { STELLA_PROJECT: 'tec' },
    });
    ok(
      r.name === 'tec' && r.pageId === '2' && s.asked.length === 0,
      'picker: STELLA_PROJECT → no prompt, page id matched case-insensitively',
    );
    r = await picker.run(tmp('picker5'), creds, {
      prompt: s.prompt,
      fetch: async () => jsonRes(500, {}),
      log: quiet,
      env: { STELLA_PROJECT: 'Solo' },
    });
    ok(
      r.name === 'Solo' && r.pageId === null,
      'picker: STELLA_PROJECT with Confluence down → name only',
    );

    // choices contain Other last
    let choices = null;
    s = {
      prompt: async (qs) => {
        choices = qs[0].choices;
        return { choice: 'SLS' };
      },
    };
    urls.length = 0;
    await picker.run(tmp('picker3'), creds, { prompt: s.prompt, fetch: fetchPages, log: quiet });
    ok(choices.join(',') === 'DRE,SLS,TEC,Other', 'picker: choices sorted with Other last');
  }

  // ================= cleaner =================
  {
    const root = tmp('clean');
    for (const d of [
      '.bmad-core',
      'bmad-docs/x',
      '.claude/commands/BMad',
      '.claude/skills/keep',
      '_bmad',
      '_bmad-output/stella',
    ]) {
      fs.mkdirSync(path.join(root, d), { recursive: true });
    }
    fs.writeFileSync(path.join(root, 'bmad-docs', 'x', 'a.md'), 'x');
    ok(cleaner.isRerun(root), 'cleaner: _bmad present → re-run');
    let r = cleaner.clean(root, { rerun: false });
    ok(
      r.removed.join(',') === '.bmad-core,bmad-docs,.claude/commands/BMad',
      'cleaner: v4 leftovers removed',
    );
    ok(
      fs.existsSync(path.join(root, '_bmad')) &&
        fs.existsSync(path.join(root, '.claude', 'skills', 'keep')),
      'cleaner: first install keeps _bmad and other .claude content',
    );
    r = cleaner.clean(root, { rerun: true });
    ok(
      r.removed.join(',') === '_bmad' && !fs.existsSync(path.join(root, '_bmad')),
      'cleaner: re-run removes _bmad',
    );
    ok(
      fs.existsSync(path.join(root, '_bmad-output', 'stella')),
      'cleaner: _bmad-output never touched',
    );
    ok(!cleaner.isRerun(root) && cleaner.clean(root).removed.length === 0, 'cleaner: idempotent');
  }

  // ================= bmad runner =================
  {
    const args = runner.buildArgs({ projectName: 'LEADRSC', userName: 'Ash' });
    ok(
      args.join(' ') ===
        '-y bmad-method@6.12.2 install --yes --tools claude-code --modules bmm --no-shims --user-name Ash --communication-language English --document-output-language English --output-folder _bmad-output --set core.project_name=LEADRSC --set bmm.user_skill_level=intermediate --set bmm.project_knowledge=docs',
      'runner: exact BMad command line',
    );
    const line = runner.commandLine(
      runner.buildArgs({ projectName: 'RISK MONITOR', userName: 'stella-dev' }),
    );
    ok(
      /core\.project_name=RISK MONITOR/.test(line) &&
        (/"core\.project_name=RISK MONITOR"/.test(line) ||
          /'core\.project_name=RISK MONITOR'/.test(line)),
      'runner: project name with a space is quoted',
    );
    ok(
      runner.gitUserName({ run: () => ({ status: 0, stdout: ' Ash Mahmud \n' }) }) === 'Ash Mahmud',
      'runner: git user.name trimmed',
    );
    ok(
      runner.gitUserName({ run: () => ({ status: 1, stdout: '' }) }) === 'stella-dev',
      'runner: no git name → stella-dev',
    );
    ok(
      runner.gitUserName({
        run: () => {
          throw new Error('x');
        },
      }) === 'stella-dev',
      'runner: git missing → stella-dev',
    );
    let spawned = null;
    let written = '';
    let clock = 1000;
    const status = runner.install('/proj', {
      projectName: 'SLS',
      userName: 'u',
      spawn: (cmd, opts) => {
        spawned = { cmd, opts };
        clock += 48_000;
        return { status: 0, stdout: 'banner\nlots of output', stderr: '' };
      },
      log: quiet,
      write: (s) => (written += s),
      now: () => clock,
    });
    ok(
      status === 0 &&
        spawned.cmd.startsWith('npx -y bmad-method@6.12.2 install') &&
        spawned.opts.cwd === '/proj' &&
        Array.isArray(spawned.opts.stdio) &&
        spawned.opts.stdio[1] === 'pipe',
      'runner: spawns npx in the project root, output captured by default',
    );
    ok(
      written === 'Installing BMad 6.12.2 ... done (48s)\n',
      `runner: quiet mode prints one line (${JSON.stringify(written)})`,
    );

    // failure → tail of the captured output, colours stripped
    const logged = [];
    written = '';
    const failed = runner.install('/proj', {
      projectName: 'SLS',
      userName: 'u',
      spawn: () => ({
        status: 1,
        stdout: 'step 1\n\u001B[31m✗ Could not write _bmad/config.toml: EACCES\u001B[0m\n',
        stderr: '',
      }),
      log: (l) => logged.push(l),
      write: (s) => (written += s),
      now: () => 0,
    });
    ok(
      failed === 1 &&
        written.endsWith('failed (exit 1)\n') &&
        logged.some((l) => l.includes('✗ Could not write _bmad/config.toml: EACCES')) &&
        !logged.some((l) => l.includes('\u001B[')),
      'runner: failure prints the output tail without colour codes',
    );

    // verbose → streamed as before
    spawned = null;
    runner.install('/proj', {
      projectName: 'SLS',
      userName: 'u',
      verbose: true,
      spawn: (cmd, opts) => {
        spawned = { cmd, opts };
        return { status: 0 };
      },
      log: quiet,
    });
    ok(spawned.opts.stdio === 'inherit', 'runner: --verbose streams BMad output');
    ok(
      runner.tail(Array.from({ length: 50 }, (_, i) => `l${i}`).join('\n')).length === 40,
      'runner: tail keeps the last 40 lines',
    );
  }

  // ================= gitignore =================
  {
    const root = tmp('gi');
    let r = gitignore.ensure(root);
    ok(r.added.length === 4, 'gitignore: created with 4 lines');
    let text = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    ok(
      /^_bmad\/$/m.test(text) &&
        /^_bmad-output\/$/m.test(text) &&
        /^\.claude\/$/m.test(text) &&
        /^\.env$/m.test(text),
      'gitignore: each line on its own',
    );
    r = gitignore.ensure(root);
    ok(
      r.added.length === 0 && fs.readFileSync(path.join(root, '.gitignore'), 'utf8') === text,
      'gitignore: idempotent',
    );
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n/.claude/\n.env');
    r = gitignore.ensure(root);
    text = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    ok(
      r.added.join(',') === '_bmad/,_bmad-output/' &&
        text.startsWith('node_modules/\n/.claude/\n.env\n'),
      'gitignore: existing lines (incl. leading slash) respected, only missing added',
    );
    ok((text.match(/\.env/g) || []).length === 1, 'gitignore: .env not duplicated');
  }

  // ================= bin =================
  {
    const r = spawnSync(process.execPath, [BIN, '--help'], { encoding: 'utf8' });
    ok(
      r.status === 0 && /install/.test(r.stdout) && /uninstall/.test(r.stdout),
      'bin: --help lists install and uninstall',
    );
    const u = spawnSync(process.execPath, [BIN, 'uninstall'], {
      encoding: 'utf8',
      cwd: tmp('bin'),
    });
    ok(u.status === 1 && /--yes/.test(u.stdout), 'bin: uninstall without a TTY needs --yes');
    const n = spawnSync(process.execPath, [BIN, 'install'], {
      encoding: 'utf8',
      cwd: tmp('bin2'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, JIRA_EMAIL: '', JIRA_API_TOKEN: '', STELLA_PROJECT: '' },
    });
    ok(
      n.status === 1 && /No interactive terminal/.test(n.stdout) && /STELLA_PROJECT/.test(n.stdout),
      'bin: no TTY + no env → clear error, no crash',
    );
  }

  // ================= end-to-end (opt-in) =================
  if (process.env.STELLA_INSTALL_E2E === '1') {
    const root = tmp('e2e');
    const fakeHome = tmp('e2e-home');
    spawnSync('git', ['init', '-q'], { cwd: root });
    const r = spawnSync(process.execPath, [BIN, 'install'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        JIRA_EMAIL: process.env.JIRA_EMAIL || 'e2e@stella.com',
        JIRA_API_TOKEN: process.env.JIRA_API_TOKEN || 'tok-abcdefghijklmnop',
        BMAD_SKIP_JIRA_VERIFY: '1',
        STELLA_PROJECT: 'E2E',
        // user-level hooks go to a throwaway home, never the real one
        HOME: fakeHome,
        USERPROFILE: fakeHome,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 600_000,
    });
    ok(r.status === 0, `e2e: install exits 0\n${r.stdout}\n${r.stderr}`);
    ok(fs.existsSync(path.join(root, '_bmad', 'config.toml')), 'e2e: _bmad/config.toml present');
    ok(
      fs.existsSync(path.join(root, '.claude', 'skills', 'bmad-build', 'SKILL.md')),
      'e2e: bmad-build skill present',
    );
    ok(
      /_bmad-output\//.test(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')),
      'e2e: gitignore written',
    );
  } else {
    console.log('  (end-to-end install skipped — set STELLA_INSTALL_E2E=1 to run it)');
  }

  console.log(`installer: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`);
  process.exit(fails ? 1 : 0);
})().catch((error) => {
  console.log('FAIL unexpected: ' + (error.stack || error));
  process.exit(1);
});
