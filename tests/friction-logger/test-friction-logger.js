'use strict';

// Migration Task 3 — friction logger on the BMad v6 layout.
// Ported from the v4-era scratch suite (tests/legacy-scratch/friction-logger) with v6
// fixtures: _bmad/config.toml root, friction.json config, stella-build session gate,
// spec-*.md under implementation-artifacts, frontmatter status, logs under
// _bmad-output/stella/bmad-logs. Runs entirely inside a temp project.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const FL = path.join(REPO, 'stella', 'hooks', 'project', 'friction-logger');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-t3-'));

const LOGS = path.join(ROOT, '_bmad-output', 'stella', 'bmad-logs');
const SPECS = path.join(ROOT, '_bmad-output', 'implementation-artifacts');
const CONFIG = path.join(ROOT, '_bmad', 'custom', 'stella', 'friction.json');

let fails = 0;
let passes = 0;
const ok = (c, m) => {
  if (c) passes++;
  else {
    fails++;
    console.log('FAIL ' + m);
  }
};

// ---- fresh fake v6 project ----
fs.mkdirSync(path.join(ROOT, '_bmad', 'custom', 'stella'), { recursive: true });
fs.mkdirSync(SPECS, { recursive: true });
fs.writeFileSync(path.join(ROOT, '_bmad', 'config.toml'), '[core]\nuser_name = "test"\n');

const SPEC_NAME = 'spec-AIL-1-test-feature.md';
const SPEC = path.join(SPECS, SPEC_NAME);
const specWith = (status) =>
  `---\ntitle: 'Test feature'\ntype: 'feature'\nstatus: '${status}'\nroute: 'dispatch'\n---\n\n## Intent\n\n**Problem:** x\n`;
fs.writeFileSync(SPEC, specWith('done'));

const line = (o) => JSON.stringify(o);
const user = (t, extra = {}) =>
  line({ type: 'user', message: { content: t }, timestamp: '2026-10-13T00:00:00Z', ...extra });
const userBlocks = (t) => line({ type: 'user', message: { content: [{ type: 'text', text: t }] } });
const agentText = (t) =>
  line({
    type: 'assistant',
    message: { content: [{ type: 'text', text: t }] },
    timestamp: '2026-10-13T00:00:01Z',
  });
const tool = (name, input) =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const skill = (name) => tool('Skill', { skill: name });

function runSessionEnd(sid, tp, cwd = ROOT) {
  return spawnSync(process.execPath, [path.join(FL, 'session-end.js')], {
    input: JSON.stringify({ cwd, session_id: sid, transcript_path: tp }),
  });
}
const trk = () => JSON.parse(fs.readFileSync(path.join(LOGS, 'plan-tracker.json'), 'utf8'));
// fs.cpSync is flagged experimental for our Node range — tiny recursive copy instead.
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}
const writeTranscript = (name, lines) => {
  const p = path.join(ROOT, name);
  fs.writeFileSync(p, lines.join('\n'));
  return p;
};

// ================= paths / state / config / planfile units =================
{
  const paths = require(path.join(FL, 'lib', 'paths.js'));
  ok(paths.rootMarker(ROOT) === path.join(ROOT, '_bmad', 'config.toml'), 'paths: root marker');
  ok(paths.logsDir(ROOT) === LOGS, 'paths: logs dir');
  ok(
    paths.specRel('spec-x.md') === '_bmad-output/implementation-artifacts/spec-x.md',
    'paths: spec rel',
  );

  const { findBmadRoot } = require(path.join(FL, 'lib', 'state.js'));
  const nested = path.join(ROOT, 'src', 'deep');
  fs.mkdirSync(nested, { recursive: true });
  ok(findBmadRoot(nested) === ROOT, 'state: root found from nested cwd via _bmad/config.toml');
  ok(
    findBmadRoot(os.tmpdir()) === null ||
      !fs.existsSync(path.join(findBmadRoot(os.tmpdir()) || '', '_bmad')),
    'state: outside a project -> null',
  );

  const { readLoggingConfig, DEFAULTS } = require(path.join(FL, 'lib', 'config.js'));
  const d = readLoggingConfig(ROOT);
  ok(
    JSON.stringify(d.triggerStatuses) === '["done"]' &&
      d.model === 'claude-sonnet-5' &&
      d.confluence.enabled === false,
    'config: defaults when friction.json missing',
  );
  ok(
    JSON.stringify(DEFAULTS.triggerStatuses) === '["done"]',
    'config: default trigger is done only',
  );
  fs.writeFileSync(
    CONFIG,
    JSON.stringify({
      triggerStatuses: ['done', 'in-review'],
      model: 'sonnet',
      confluence: {
        enabled: true,
        logsPageUrl: 'https://x.atlassian.net/wiki/spaces/K/pages/123/Logs',
      },
    }),
  );
  const c = readLoggingConfig(ROOT);
  ok(
    c.triggerStatuses.length === 2 &&
      c.model === 'sonnet' &&
      c.confluence.enabled === true &&
      c.confluence.logsPageUrl.includes('/pages/123/'),
    'config: friction.json values read',
  );
  fs.writeFileSync(CONFIG, '{ not json');
  ok(
    JSON.stringify(readLoggingConfig(ROOT).triggerStatuses) === '["done"]',
    'config: corrupt file -> defaults',
  );
  fs.writeFileSync(CONFIG, JSON.stringify({ triggerStatuses: [], model: '' }));
  ok(
    JSON.stringify(readLoggingConfig(ROOT).triggerStatuses) === '["done"]' &&
      readLoggingConfig(ROOT).model === 'claude-sonnet-5',
    'config: empty values -> defaults',
  );
  fs.rmSync(CONFIG);

  const { resolvePlanId, readStatus } = require(path.join(FL, 'lib', 'planfile.js'));
  ok(resolvePlanId(SPEC, SPEC_NAME) === 'AIL-1', 'planfile: ticket key from spec filename');
  ok(
    resolvePlanId(SPEC, 'spec-dark-mode-toggle.md') === 'dark-mode-toggle',
    'planfile: slug when no ticket',
  );
  ok(resolvePlanId(SPEC, 'spec-gh-47-fix-auth.md') === 'gh-47', 'planfile: gh-47 style key');
  ok(readStatus(SPEC) === 'done', 'planfile: frontmatter status quoted');
  fs.writeFileSync(SPEC, '---\nstatus: in-review # comment\n---\n# body\n## Status\n\ndone\n');
  ok(
    readStatus(SPEC) === 'in-review',
    'planfile: unquoted status with comment; body heading ignored',
  );
  fs.writeFileSync(SPEC, '# no frontmatter\n\n## Status\n\ndone\n');
  ok(readStatus(SPEC) === null, 'planfile: no frontmatter -> null');
  fs.writeFileSync(SPEC, specWith('done'));
}

// ================= session-end gate + spec detection =================
const T1 = writeTranscript('t-typed.jsonl', [
  user('/stella-build AIL-1 add the feature'),
  tool('Bash', {
    command:
      "cat > _bmad-output/implementation-artifacts/spec-AIL-1-test-feature.md <<'EOF'\n# x\nEOF",
  }),
]);
const T2 = writeTranscript('t-skill.jsonl', [
  user('please build AIL-1'),
  skill('stella-build'),
  tool('Write', { file_path: SPEC.replaceAll('\\', '/') }),
]);
const T3 = writeTranscript('t-ps.jsonl', [
  userBlocks('/stella-build'),
  tool('PowerShell', {
    command: 'Set-Content "_bmad-output\\implementation-artifacts\\spec-AIL-1-test-feature.md" x',
  }),
]);
const T4 = writeTranscript('t-noise.jsonl', [
  skill('stella-build'),
  tool('Bash', { command: 'grep foo _bmad-output/implementation-artifacts/spec-NOPE-9-x.md' }),
]);
const T5 = writeTranscript('t-other-skill.jsonl', [
  user('/stella-pr-review https://github.com/o/r/pull/1'),
  skill('stella-pr-review'),
  tool('Write', { file_path: SPEC.replaceAll('\\', '/') }),
]);
const T6 = writeTranscript('t-mention.jsonl', [
  user('what does stella-build do? I read /stella-build docs'),
  agentText('stella-build is a skill'),
  tool('Read', { file_path: path.join(ROOT, '.claude', 'skills', 'stella-build', 'SKILL.md') }),
  tool('Write', { file_path: SPEC.replaceAll('\\', '/') }),
]);
const T7 = writeTranscript('t-meta.jsonl', [
  user('/stella-build', { isMeta: true }),
  tool('Write', { file_path: SPEC.replaceAll('\\', '/') }),
]);
const T8 = writeTranscript('t-no-spec.jsonl', [
  user('/stella-build'),
  agentText('nothing written'),
]);
const T9 = writeTranscript('t-official.jsonl', [
  user('/bmad-build AIL-1 add the feature'),
  skill('bmad-build'),
  tool('Write', { file_path: SPEC.replaceAll('\\', '/') }),
]);
// Real shape of a typed slash command in a Claude Code transcript (pilot, 2026-10-22):
// the message is the command tags, not the raw "/stella-build …" text.
const TAGGED = (name, args) =>
  `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>\n<command-args>${args}</command-args>`;
const T10 = writeTranscript('t-tagged.jsonl', [
  user(TAGGED('stella-build', 'https://stellaint.atlassian.net/browse/AIL-1')),
  tool('Write', { file_path: SPEC.replaceAll('\\', '/') }),
]);
const T11 = writeTranscript('t-tagged-official.jsonl', [
  user(TAGGED('bmad-build', 'AIL-1 add the feature')),
  tool('Write', { file_path: SPEC.replaceAll('\\', '/') }),
]);

runSessionEnd('s1-typed', T1);
runSessionEnd('s10-tagged', T10);
runSessionEnd('s11-tagged-official', T11);
runSessionEnd('s2-skill', T2);
runSessionEnd('s3-ps', T3);
runSessionEnd('s4-noise', T4);
runSessionEnd('s5-other', T5);
runSessionEnd('s6-mention', T6);
runSessionEnd('s7-meta', T7);
runSessionEnd('s8-nospec', T8);
runSessionEnd('s9-official', T9);

let t = trk();
const sessions = (t.plans['AIL-1'] && t.plans['AIL-1'].sessions.map((s) => s.sessionId)) || [];
ok(sessions.includes('s1-typed'), 'gate: typed /stella-build + Bash heredoc write tracked');
ok(sessions.includes('s2-skill'), 'gate: Skill tool call + Write tracked');
ok(sessions.includes('s3-ps'), 'gate: user text as blocks + PowerShell write tracked');
ok(sessions.includes('s10-tagged'), 'gate: <command-name>/stella-build</command-name> tracked');
ok(
  !sessions.includes('s11-tagged-official'),
  'gate: <command-name>/bmad-build</command-name> NOT tracked',
);
ok(sessions.length === 4, `gate: exactly 4 tracked sessions (got ${sessions.length})`);
ok(!t.plans['NOPE-9'], 'spec: Bash mention of a non-existent spec ignored');
ok(!sessions.includes('s5-other'), 'gate: stella-pr-review session NOT tracked');
ok(!sessions.includes('s6-mention'), 'gate: prose mention + Read of SKILL.md NOT tracked');
ok(!sessions.includes('s7-meta'), 'gate: isMeta user line NOT a trigger');
ok(
  !sessions.includes('s9-official'),
  'gate: official /bmad-build session NOT tracked (stella-build only)',
);
ok(!sessions.includes('s8-nospec'), 'gate: stella-build without a spec write NOT tracked');
ok(
  t.plans['AIL-1'].planFile === '_bmad-output/implementation-artifacts/spec-AIL-1-test-feature.md',
  'tracker: planFile stored as v6 relative path',
);
ok(
  t.plans['AIL-1'].sessions.every((s) => s.agents.includes('stella-build')),
  'tracker: agents = [stella-build]',
);
ok(t.plans['AIL-1'].analysisAttempts === 0, 'tracker: new entry has analysisAttempts=0');
ok(
  fs.existsSync(path.join(LOGS, '.hook-debug.log')),
  'logs: debug log under _bmad-output/stella/bmad-logs',
);
ok(!fs.existsSync(path.join(ROOT, 'bmad-docs')), 'logs: no bmad-docs folder created');

// outside a project: nothing created
{
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-t3-plain-'));
  runSessionEnd('sx', T1, plain);
  ok(
    !fs.existsSync(path.join(plain, '_bmad-output')),
    'session-end: outside a v6 project creates nothing',
  );
}

// ================= tracker tmp + reset + concurrency =================
const tracker = require(path.join(FL, 'lib', 'tracker.js'));
t.plans['AIL-1'].analysisAttempts = 3;
t.plans['AIL-1'].analyzed = true;
tracker.upsertSession(
  t,
  'AIL-1',
  '_bmad-output/implementation-artifacts/spec-AIL-1-test-feature.md',
  { sessionId: 'brand-new', agents: new Set(['stella-build']), transcript: T2, endLine: 3 },
  0,
);
ok(
  t.plans['AIL-1'].analysisAttempts === 0 && t.plans['AIL-1'].analyzed === false,
  'tracker: new session resets analysisAttempts',
);
tracker.writeTracker(ROOT, t);
ok(!fs.readdirSync(LOGS).some((f) => f.includes('.tmp')), 'tracker: no stray tmp after write');

const script = `const t=require(${JSON.stringify(path.join(FL, 'lib', 'tracker.js'))});for(let i=0;i<30;i++){const x=t.readTracker(${JSON.stringify(ROOT)});x.plans['P'+process.pid]={planFile:'x',analyzed:false,generationCount:0,sessions:[]};t.writeTracker(${JSON.stringify(ROOT)},x);}`;
const procs = Array.from({ length: 8 }, () => spawn(process.execPath, ['-e', script]));
let done = 0;
let errs = 0;
const wait = new Promise((r) => {
  for (const p of procs) {
    p.stderr.on('data', () => errs++);
    p.on('close', (c) => {
      if (c !== 0) errs++;
      if (++done === procs.length) r();
    });
  }
});

(async () => {
  await wait;
  let parsed = null;
  try {
    parsed = trk();
  } catch {
    /* invalid */
  }
  ok(errs === 0 && parsed !== null, `tracker: 8 concurrent writers, file valid (errs=${errs})`);

  // ================= reducer caps (unchanged logic, sanity) =================
  const { buildScreenplays, reduceTranscript, MAX_SCREENPLAY_CHARS } = require(
    path.join(FL, 'lib', 'reducer.js'),
  );
  const big = path.join(ROOT, 'big.jsonl');
  fs.writeFileSync(big, [user('hi'), agentText('A'.repeat(5000))].join('\n'));
  const r = reduceTranscript(big);
  ok(r.script.length < 2000 && r.script.includes('[truncated]'), 'reducer: AGENT line capped');
  const sess = [];
  for (let i = 0; i < 5; i++) {
    const p = path.join(ROOT, `s${i}.jsonl`);
    fs.writeFileSync(
      p,
      Array.from({ length: 30 }, (_, k) => user(`S${i} msg ${k} ` + 'x'.repeat(4000))).join('\n'),
    );
    sess.push({
      sessionId: `sess${i}0000`,
      agents: ['stella-build'],
      transcript: p,
      endedAt: `2026-10-0${i + 1}T00:00:00Z`,
    });
  }
  const sp = buildScreenplays(sess);
  ok(
    sp.length <= MAX_SCREENPLAY_CHARS + 100 &&
      sp.startsWith('[TRUNCATED: 3 older session(s) omitted'),
    'reducer: budget kept, oldest dropped',
  );

  // ================= worker: status gate, analysis cap, success, outputs =================
  const bin = path.join(ROOT, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const fakeClaude = (body) =>
    fs.writeFileSync(path.join(bin, process.platform === 'win32' ? 'claude.cmd' : 'claude'), body, {
      mode: 0o755,
    });
  const win = process.platform === 'win32';
  const badJson = win
    ? '@echo off\r\necho {"is_error":false,"result":"NOT JSON AT ALL","total_cost_usd":0}\r\n'
    : '#!/bin/sh\necho \'{"is_error":false,"result":"NOT JSON AT ALL","total_cost_usd":0}\'\n';
  const goodJson = win
    ? '@echo off\r\necho {"is_error":false,"result":"{\\"summary\\":\\"ok\\",\\"entries\\":[]}","total_cost_usd":0}\r\n'
    : '#!/bin/sh\necho \'{"is_error":false,"result":"{\\"summary\\":\\"ok\\",\\"entries\\":[]}","total_cost_usd":0}\'\n';
  // a throwaway home so the publisher never finds real credentials
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-fl-home-'));
  const env = {
    ...process.env,
    PATH: bin + path.delimiter + process.env.PATH,
    Path: bin + path.delimiter + (process.env.Path || ''),
    HOME: fakeHome,
    USERPROFILE: fakeHome,
  };
  const dbg = path.join(LOGS, '.hook-debug.log');
  const lock = path.join(LOGS, '.fire-lock');
  const runWorker = () => {
    fs.writeFileSync(lock, JSON.stringify({ pid: 0, startedAt: '2000-01-01T00:00:00Z' }));
    return spawnSync(process.execPath, [path.join(FL, 'worker.js'), ROOT], { env });
  };
  const resetPlan = () => {
    const x = trk();
    x.plans = { 'AIL-1': x.plans['AIL-1'] };
    x.plans['AIL-1'].sessions = [
      {
        sessionId: 's1-typed',
        agents: ['stella-build'],
        transcript: T1,
        endedAt: '2026-10-13T00:00:00Z',
        endLine: 2,
      },
      {
        sessionId: 's2-skill',
        agents: ['stella-build'],
        transcript: T2,
        endedAt: '2026-10-13T00:01:00Z',
        endLine: 3,
      },
    ];
    x.plans['AIL-1'].analyzed = false;
    x.plans['AIL-1'].analysisAttempts = 0;
    x.plans['AIL-1'].generationCount = 0;
    tracker.writeTracker(ROOT, x);
  };

  // status gate: in-review is NOT fireable by default (done only)
  fakeClaude(goodJson);
  fs.writeFileSync(SPEC, specWith('in-review'));
  resetPlan();
  runWorker();
  ok(
    trk().plans['AIL-1'].analyzed === false &&
      /status="in-review"/.test(fs.readFileSync(dbg, 'utf8')),
    'worker: status in-review gated (done only)',
  );
  ok(!fs.existsSync(lock), 'worker: lock released after gated run');

  // analysis cap with bad JSON from claude
  fs.writeFileSync(SPEC, specWith('done'));
  fakeClaude(badJson);
  resetPlan();
  for (let i = 1; i <= 4; i++) {
    runWorker();
    const a = trk().plans['AIL-1'].analysisAttempts;
    if (i <= 3) ok(a === i, `worker: run ${i} analysisAttempts=${a}`);
    else
      ok(
        a === 3 && /skip AIL-1 — analysis-cap/.test(fs.readFileSync(dbg, 'utf8')),
        'worker: run 4 gated by analysis-cap',
      );
  }

  // success path writes outputs under the v6 logs dir
  fakeClaude(goodJson);
  resetPlan();
  runWorker();
  const after = trk().plans['AIL-1'];
  ok(
    after.analyzed === true && after.generationCount === 1 && after.analysisAttempts === 0,
    'worker: success path analyzed, generation=1',
  );
  ok(
    fs.existsSync(path.join(LOGS, 'AIL-1', 'friction.md')) &&
      fs.existsSync(path.join(LOGS, 'AIL-1', 'friction.json')),
    'worker: friction.md/json under _bmad-output/stella/bmad-logs/AIL-1',
  );
  ok(
    /no Atlassian credentials \(~\/\.claude\/stella\/credentials\.env\)/.test(
      fs.readFileSync(dbg, 'utf8'),
    ) || !/publish:/.test(fs.readFileSync(dbg, 'utf8')),
    'publisher: credential path message names the home file (or publishing off)',
  );

  // require failure -> FATAL + lock release
  const broken = path.join(ROOT, 'fl-broken');
  copyDir(FL, broken);
  fs.rmSync(path.join(broken, 'lib', 'render.js'));
  fs.writeFileSync(lock, '{}');
  const res = spawnSync(process.execPath, [path.join(broken, 'worker.js'), ROOT]);
  ok(
    res.status === 1 &&
      /FATAL require failed/.test(fs.readFileSync(dbg, 'utf8')) &&
      !fs.existsSync(lock),
    'worker: broken lib -> FATAL logged, lock released',
  );

  // session-start smoke: spawns nothing when tracker has no plans, never throws
  const emptyProj = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-t3-empty-'));
  fs.mkdirSync(path.join(emptyProj, '_bmad'), { recursive: true });
  fs.writeFileSync(path.join(emptyProj, '_bmad', 'config.toml'), '');
  const ss = spawnSync(process.execPath, [path.join(FL, 'session-start.js')], {
    input: JSON.stringify({ cwd: emptyProj }),
  });
  ok(
    ss.status === 0 &&
      !fs.existsSync(path.join(emptyProj, '_bmad-output', 'stella', 'bmad-logs', '.fire-lock')),
    'session-start: empty tracker -> no lock, exit 0',
  );

  // prompt text no longer talks about impl-plan
  const promptSrc = fs.readFileSync(path.join(FL, 'prompts', 'extract-friction.js'), 'utf8');
  ok(
    !promptSrc.includes('impl-plan') && promptSrc.includes('spec-*.md'),
    'prompt: references spec-*.md, not impl-plan',
  );

  // no v4 paths anywhere in the hook
  const v4 = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (
        p.endsWith('.js') &&
        /bmad-docs|\.bmad-core|impl-plan/.test(fs.readFileSync(p, 'utf8'))
      )
        v4.push(path.relative(FL, p));
    }
  };
  walk(FL);
  ok(v4.length === 0, `source: no v4 paths left (${v4.join(', ')})`);

  console.log(`\nfriction-logger: ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
