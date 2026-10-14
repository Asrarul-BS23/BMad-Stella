'use strict';

// Migration Task 11 — installer part 2: the Stella layer, re-run, uninstall.
// The whole cycle install → re-run → uninstall → install runs in a temp repo with
// a fake BMad runner (writes what the real one would), injected prompt/fetch, and
// user-level hooks stubbed. Trees are compared each time.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const LIB = path.join(REPO, 'tools', 'installer', 'lib');
const C = require(path.join(LIB, 'constants.js'));
const installer = require(path.join(LIB, 'installer.js'));
const layer = require(path.join(LIB, 'stella-layer.js'));
const domain = require(path.join(LIB, 'domain-knowledge-fetcher.js'));
const gitignore = require(path.join(LIB, 'gitignore.js'));
const permissions = require(path.join(LIB, 'claude-permissions-manager.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `stella-t11-${name}-`));
const quiet = () => {};
const exists = (root, rel) => fs.existsSync(path.join(root, ...rel.split('/')));
const read = (root, rel) => fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');
const listTree = (dir, base = dir) => {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listTree(full, base));
    else out.push(path.relative(base, full).replaceAll('\\', '/'));
  }
  return out.sort();
};
const jsonRes = (status, body) => ({ ok: status < 300, status, json: async () => body });

// Fake BMad: what the official installer leaves behind, minimal.
const fakeBmad = async (root, { projectName, userName }) => {
  fs.mkdirSync(path.join(root, '_bmad'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '_bmad', 'config.toml'),
    `[core]\nproject_name = "${projectName}"\nuser_name = "${userName}"\n`,
  );
  for (const skill of ['bmad-build', 'bmad-help', 'bmad-project-context']) {
    const dir = path.join(root, '.claude', 'skills', skill);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${skill}\n---\n`);
  }
  fs.mkdirSync(path.join(root, '_bmad-output', 'implementation-artifacts'), { recursive: true });
  return 0;
};

// Confluence mock: project children + LEADRSC descendants with bodies.
const children = {
  results: [
    { id: '1626308638', title: 'P-LEADRSC' },
    { id: 2, title: 'P-SLS' },
  ],
  _links: {},
};
const descendants = {
  results: [
    {
      id: 11,
      title: 'api-contracts-leadrsc',
      space: { key: 'AIL' },
      body: { view: { value: '<h2>API</h2><p>contracts</p>' } },
    },
    {
      id: 12,
      title: 'business-logic-leadrsc',
      space: { key: 'AIL' },
      body: { view: { value: '<p>rules</p>' } },
    },
    { id: 13, title: 'empty-page', space: { key: 'AIL' }, body: { view: { value: '' } } },
  ],
  _links: {},
};
const fetchMock = async (url) => {
  if (url.includes('/rest/api/3/myself')) return jsonRes(200, { displayName: 'Ash' });
  if (url.includes('/child/page')) return jsonRes(200, children);
  if (url.includes('/descendant/page')) return jsonRes(200, descendants);
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
const userHooks = async () => ({ status: 'current', changed: false });

(async () => {
  const root = tmp('cycle');
  fs.mkdirSync(path.join(root, '.git'));
  // foreign settings that must survive
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude', 'settings.local.json'),
    JSON.stringify(
      {
        permissions: { allow: ['Bash(npm test)', 'Read(bmad-docs/**)'], deny: ['Bash(rm -rf *)'] },
        hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node my-own-hook.js' }] }] },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
  // v4 leftovers
  fs.mkdirSync(path.join(root, '.bmad-core'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bmad-docs', 'memory'), { recursive: true });

  // ================= 1. fresh install =================
  let s = scripted(['dev@stella.com', 'tok-abcdefghijklmnop', 'LEADRSC']);
  let sum = await installer.install(root, {
    prompt: s.prompt,
    fetch: fetchMock,
    runBmad: fakeBmad,
    userHooks,
    log: quiet,
    env: {},
    isTTY: true,
  });
  ok(s.asked.join(',') === 'email,token,choice', 'install: exactly email, token, project asked');
  ok(
    !sum.rerun && sum.project.name === 'LEADRSC' && sum.project.pageId === '1626308638',
    'install: fresh, project with page id',
  );
  ok(sum.removed.join(',') === '.bmad-core,bmad-docs', 'install: v4 leftovers removed');

  // step 9
  ok(
    exists(root, '_bmad/custom/stella/checklists/backend-security.md') &&
      exists(root, '_bmad/custom/stella/checklists/frontend-security.md'),
    'layer: checklists copied',
  );
  ok(
    exists(root, '_bmad/custom/stella/utils/jira-attachments/index.js') &&
      exists(root, '_bmad/custom/stella/utils/pr-comments/lib/build.js'),
    'layer: helpers copied',
  );
  ok(
    JSON.parse(read(root, '_bmad/custom/stella/friction.json')).triggerStatuses[0] === 'done',
    'layer: friction.json default',
  );
  ok(
    JSON.parse(read(root, '_bmad/custom/stella/guard.json')).enabled === true,
    'layer: guard.json default',
  );
  // step 10
  for (const skill of C.STELLA_SKILLS)
    ok(exists(root, `.claude/skills/${skill}/SKILL.md`), `layer: skill ${skill} installed`);
  ok(exists(root, '.claude/skills/bmad-build/SKILL.md'), 'layer: official bmad-build kept');
  ok(
    /^name: stella-build/m.test(read(root, '.claude/skills/stella-build/SKILL.md')),
    'layer: installed stella-build carries its own name',
  );
  // step 11
  for (const hook of C.PROJECT_HOOKS) {
    for (const spec of Object.values(hook.events))
      ok(
        exists(root, `.claude/stella/hooks/${hook.name}/${spec.file}`),
        `layer: hook file ${hook.name}/${spec.file}`,
      );
  }
  ok(!exists(root, '.claude/stella/hooks/memory'), 'layer: memory hook NOT installed');
  ok(
    exists(root, '.claude/stella/hooks/friction-logger/lib/paths.js') &&
      exists(root, '.claude/stella/hooks/pr-review-guard/lib/policy.js'),
    'layer: hook libs copied',
  );
  let settings = JSON.parse(read(root, '.claude/settings.local.json'));
  const guardEntry = (settings.hooks.PreToolUse || []).find((e) =>
    e.hooks[0].command.includes('pr-review-guard'),
  );
  ok(
    guardEntry && guardEntry.matcher === 'Edit|MultiEdit|Write|Bash|PowerShell',
    'settings: guard registered with matcher',
  );
  ok(
    guardEntry.hooks[0].command === 'node ".claude/stella/hooks/pr-review-guard/pre-tool-use.js"',
    'settings: hook command relative to the project root',
  );
  ok(
    settings.hooks.SessionStart.some((e) => e.hooks[0].command === 'node my-own-hook.js'),
    'settings: foreign hook kept',
  );
  ok(
    settings.hooks.SessionStart.some((e) =>
      e.hooks[0].command.includes('friction-logger/session-start.js'),
    ) &&
      settings.hooks.SessionEnd.some((e) =>
        e.hooks[0].command.includes('friction-logger/session-end.js'),
      ),
    'settings: friction logger on SessionStart + SessionEnd',
  );
  ok(
    settings.hooks.UserPromptExpansion.some((e) =>
      e.hooks[0].command.includes('personalization-inject'),
    ),
    'settings: personalization-inject on UserPromptExpansion',
  );
  // step 12
  ok(
    settings.permissions.allow.includes('Bash(npm test)') &&
      !settings.permissions.allow.includes('Read(bmad-docs/**)'),
    'settings: foreign allow kept, deprecated v4 rule pruned',
  );
  ok(
    permissions.getAllPermissions().every((r) => settings.permissions.allow.includes(r)),
    'settings: every Task 5 allow rule present',
  );
  ok(
    settings.permissions.deny.includes('Bash(rm -rf *)') &&
      permissions.getAllDenyPermissions().every((r) => settings.permissions.deny.includes(r)),
    'settings: foreign deny kept, our deny rules present',
  );
  ok(
    new Set(settings.permissions.allow).size === settings.permissions.allow.length,
    'settings: no duplicate allow rules',
  );
  // step 13
  for (const f of C.OUTPUT_FOLDERS)
    ok(exists(root, `_bmad-output/stella/${f}`), `output: folder ${f}`);
  ok(!exists(root, '_bmad-output/stella/memory/MEMORY.md'), 'output: no memory starters');
  // step 14
  ok(
    sum.domainDocs.status === 'fetched' &&
      sum.domainDocs.files.join(',') === 'api-contracts.md,business-logic.md',
    `domain: fetched with suffix stripped (${sum.domainDocs.files})`,
  );
  ok(
    /# api-contracts-leadrsc/.test(
      read(root, '_bmad-output/stella/domain-knowledge/api-contracts.md'),
    ) && /contracts/.test(read(root, '_bmad-output/stella/domain-knowledge/api-contracts.md')),
    'domain: markdown content written',
  );
  // step 8 + 15
  ok(
    sum.gitignoreAdded.length === 4 && /^node_modules\//m.test(read(root, '.gitignore')),
    'gitignore: four lines added, existing kept',
  );
  ok(sum.userHooks.status === 'current', 'user hooks: called');
  ok(
    /Atlassian connector/.test(installer.formatSummary(sum)) &&
      /\/stella-build/.test(installer.formatSummary(sum)),
    'summary: connector reminder + next step',
  );
  const tree1 = listTree(root);

  // ================= 2. re-run =================
  fs.writeFileSync(path.join(root, '_bmad-output', 'stella', 'reviewer', 'keep.md'), 'x');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'stella-build', 'tampered.md'), 'x');
  fs.writeFileSync(
    path.join(root, '_bmad', 'custom', 'stella', 'friction.json'),
    '{"triggerStatuses":["in-review"]}',
  );
  s = scripted([true, true]);
  sum = await installer.install(root, {
    prompt: s.prompt,
    fetch: fetchMock,
    runBmad: fakeBmad,
    userHooks,
    log: quiet,
    env: {},
    isTTY: true,
  });
  ok(
    sum.rerun && s.asked.join(',') === 'reuse,reuse',
    're-run: detected, only the two "use as is?" questions',
  );
  ok(
    sum.removed.includes('_bmad') &&
      sum.removed.includes('.claude/stella') &&
      sum.removed.includes('.claude/skills/stella-build'),
    're-run: _bmad and Stella .claude parts removed first',
  );
  ok(!exists(root, '.claude/skills/stella-build/tampered.md'), 're-run: skill folder fresh');
  ok(
    JSON.parse(read(root, '_bmad/custom/stella/friction.json')).triggerStatuses[0] === 'done',
    're-run: _bmad/custom/stella fresh',
  );
  ok(
    exists(root, '_bmad-output/stella/reviewer/keep.md') && sum.created.length === 0,
    're-run: _bmad-output kept, no folder recreated',
  );
  ok(
    sum.domainDocs.status === 'skipped' && /already has files/.test(sum.domainDocs.reason),
    're-run: domain docs skipped (present)',
  );
  settings = JSON.parse(read(root, '.claude/settings.local.json'));
  ok(
    settings.hooks.PreToolUse.filter((e) => e.hooks[0].command.includes('pr-review-guard'))
      .length === 1,
    're-run: hook entries not duplicated',
  );
  ok(
    settings.hooks.SessionStart.some((e) => e.hooks[0].command === 'node my-own-hook.js'),
    're-run: foreign hook still there',
  );
  const tree2 = listTree(root).filter((f) => f !== '_bmad-output/stella/reviewer/keep.md');
  ok(tree2.join('\n') === tree1.join('\n'), 're-run: tree identical to the first install');

  // ================= 3. uninstall =================
  s = scripted([false]);
  let u = await installer.uninstall(root, { prompt: s.prompt });
  ok(u.aborted && exists(root, '_bmad/config.toml'), 'uninstall: "n" → nothing removed');
  s = scripted([true]);
  u = await installer.uninstall(root, { prompt: s.prompt });
  ok(
    !u.aborted && !exists(root, '_bmad') && !exists(root, '.claude/stella'),
    'uninstall: _bmad and .claude/stella gone',
  );
  ok(
    !exists(root, '.claude/skills/stella-build') &&
      !exists(root, '.claude/skills/bmad-build') &&
      !exists(root, '.claude/skills/caveman'),
    'uninstall: Stella and official skills gone',
  );
  ok(
    exists(root, '_bmad-output/stella/reviewer/keep.md') &&
      exists(root, '_bmad-output/stella/domain-knowledge/api-contracts.md') &&
      exists(root, '_bmad-output/stella/.bmad-tokens/.env'),
    'uninstall: _bmad-output untouched',
  );
  settings = JSON.parse(read(root, '.claude/settings.local.json'));
  ok(
    settings.hooks.SessionStart.length === 1 &&
      settings.hooks.SessionStart[0].hooks[0].command === 'node my-own-hook.js' &&
      !settings.hooks.PreToolUse,
    'uninstall: only the foreign hook remains',
  );
  ok(
    settings.permissions.allow.join(',') === 'Bash(npm test)' &&
      settings.permissions.deny.join(',') === 'Bash(rm -rf *)',
    'uninstall: only foreign permissions remain',
  );
  const gi = read(root, '.gitignore');
  ok(gi === 'node_modules/\n', `uninstall: gitignore back to the original (${JSON.stringify(gi)})`);
  ok(
    u.removed.some((r) => r.startsWith('.gitignore')) && u.removed.includes('_bmad'),
    'uninstall: removal list reported',
  );

  // ================= 4. install again =================
  s = scripted([true, true]);
  sum = await installer.install(root, {
    prompt: s.prompt,
    fetch: fetchMock,
    runBmad: fakeBmad,
    userHooks,
    log: quiet,
    env: {},
    isTTY: true,
  });
  ok(
    !sum.rerun && s.asked.join(',') === 'reuse,reuse',
    'reinstall: not a re-run (no _bmad), saved creds + project reused',
  );
  const tree4 = listTree(root).filter((f) => f !== '_bmad-output/stella/reviewer/keep.md');
  ok(tree4.join('\n') === tree1.join('\n'), 'reinstall: tree identical to the first install');

  // ================= unit: domain fetcher skip rules =================
  const r1 = await domain.fetchDomainDocs(tmp('d1'), {
    project: { name: 'X', pageId: null },
    creds: { email: 'e', token: 't' },
    fetch: fetchMock,
  });
  ok(r1.status === 'skipped' && /Other/.test(r1.reason), 'domain: Other → skipped');
  const r2 = await domain.fetchDomainDocs(tmp('d2'), {
    project: { name: 'LEADRSC', pageId: '1' },
    creds: { email: 'e', token: 't' },
    fetch: async () => jsonRes(500, {}),
  });
  ok(r2.status === 'failed' && /500/.test(r2.reason), 'domain: API error → failed, not thrown');
  ok(
    domain.projectSuffix('RISK MONITOR') === 'risk-monitor' &&
      domain.projectSuffix('QuarryConnect') === 'quarryconnect',
    'domain: project suffix slug',
  );

  // ================= unit: non-interactive guard + bmad failure =================
  let threw = null;
  try {
    await installer.install(tmp('ni'), {
      prompt: async () => ({}),
      fetch: fetchMock,
      runBmad: fakeBmad,
      userHooks,
      log: quiet,
      env: {},
      isTTY: false,
    });
  } catch (error) {
    threw = error.message;
  }
  ok(
    /No interactive terminal/.test(threw || '') && /STELLA_PROJECT/.test(threw || ''),
    'install: no TTY without env → clear error',
  );
  const failRoot = tmp('bmadfail');
  threw = null;
  try {
    await installer.install(failRoot, {
      prompt: async () => ({}),
      fetch: fetchMock,
      runBmad: async () => 2,
      userHooks,
      log: quiet,
      env: { JIRA_EMAIL: 'a@b.co', JIRA_API_TOKEN: 'tok-abcdefghijklmnop', STELLA_PROJECT: 'SLS' },
      isTTY: false,
    });
  } catch (error) {
    threw = error.message;
  }
  ok(
    /exited with code 2/.test(threw || '') && !exists(failRoot, '.claude/skills/stella-build'),
    'install: BMad failure stops before the Stella layer',
  );

  // ================= unit: gitignore.remove =================
  const gRoot = tmp('gi');
  fs.writeFileSync(path.join(gRoot, '.gitignore'), 'dist/\n.env\n');
  gitignore.ensure(gRoot);
  const rm = gitignore.remove(gRoot);
  ok(
    [...rm.removed].sort().join(',') ===
      ['_bmad/', '_bmad-output/', '.claude/', '.env'].sort().join(',') &&
      read(gRoot, '.gitignore') === 'dist/\n',
    'gitignore.remove: our lines + header gone, others kept',
  );

  // ================= unit: merge helpers are pure on foreign shapes =================
  const merged = layer.mergeHooks({ hooks: { Stop: 'garbage' } });
  ok(
    merged.hooks.Stop === 'garbage' && Array.isArray(merged.hooks.PreToolUse),
    'mergeHooks: odd foreign values left alone',
  );

  console.log(
    `installer part 2: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
  );
  process.exit(fails ? 1 : 0);
})().catch((error) => {
  console.log('FAIL unexpected: ' + (error.stack || error));
  process.exit(1);
});
