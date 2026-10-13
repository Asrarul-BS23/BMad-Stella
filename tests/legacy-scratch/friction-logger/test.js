'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const FL = 'C:/Users/BS01602/Desktop/JEMS/BMad-Stella/bmad-core/bmad-hooks/project/friction-logger';
const ROOT = path.join(__dirname, 'proj');
let fails = 0;
const ok = (c, m) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};

// ---- fresh fake project ----
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, '.bmad-core'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'bmad-docs', 'impl-plan'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, '.bmad-core', 'core-config.yaml'),
  'logging:\n  triggerStatuses:\n    - Ready for Done\n',
);
const PLAN = path.join(ROOT, 'bmad-docs', 'impl-plan', 'AIL-1-test.md');
fs.writeFileSync(
  PLAN,
  '# Implementation Plan: AIL-1 - Test\n\n## Status\n\nReady for Done\n\n## Task Information\n\n- **Plan ID:** AIL-1\n',
);

const line = (o) => JSON.stringify(o);
const user = (t) =>
  line({ type: 'user', message: { content: t }, timestamp: '2026-09-30T00:00:00Z' });
const agentText = (t) =>
  line({
    type: 'assistant',
    message: { content: [{ type: 'text', text: t }] },
    timestamp: '2026-09-30T00:00:01Z',
  });
const tool = (name, input) =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const marker = (id, name) =>
  line({
    type: 'user',
    isMeta: true,
    message: { content: [{ type: 'text', text: `# x\nid: ${id}\nname: ${name}` }] },
  });

// ================= #2 Bash plan writes (session-end) =================
const T1 = path.join(ROOT, 't-planner.jsonl');
fs.writeFileSync(
  T1,
  [
    marker('planner', 'Alex'),
    user('plan it'),
    tool('Bash', { command: "cat > bmad-docs/impl-plan/AIL-1-test.md <<'EOF'\n# x\nEOF" }),
  ].join('\n'),
);
const T2 = path.join(ROOT, 't-dev.jsonl');
fs.writeFileSync(
  T2,
  [
    marker('dev', 'Bob'),
    user('do it'),
    tool('Bash', { command: 'sed -i "s/a/b/" "bmad-docs\\impl-plan\\AIL-1-test.md"' }),
  ].join('\n'),
);
const T3 = path.join(ROOT, 't-noise.jsonl'); // Bash mentions a plan that does NOT exist on disk
fs.writeFileSync(
  T3,
  [
    marker('dev', 'Bob'),
    user('x'),
    tool('Bash', { command: 'grep foo bmad-docs/impl-plan/NOPE-9.md' }),
  ].join('\n'),
);
function runSessionEnd(sid, tp) {
  return spawnSync(process.execPath, [path.join(FL, 'session-end.js')], {
    input: JSON.stringify({ cwd: ROOT, session_id: sid, transcript_path: tp }),
  });
}
runSessionEnd('s1-planner', T1);
runSessionEnd('s2-dev', T2);
runSessionEnd('s3-noise', T3);
const trk = () =>
  JSON.parse(
    fs.readFileSync(path.join(ROOT, 'bmad-docs', 'bmad-logs', 'plan-tracker.json'), 'utf8'),
  );
let t = trk();
ok(
  t.plans['AIL-1'] && t.plans['AIL-1'].sessions.length === 2,
  '#2 heredoc + sed -i Bash writes tracked (2 sessions)',
);
ok(!t.plans['NOPE-9'], '#2 Bash mention of non-existent plan ignored');
ok(t.plans['AIL-1'].analysisAttempts === 0, '#1 new entry has analysisAttempts=0');

// ================= #5 tracker tmp + #1 reset =================
const tracker = require(path.join(FL, 'lib', 'tracker.js'));
t.plans['AIL-1'].analysisAttempts = 3;
t.plans['AIL-1'].analyzed = true;
tracker.upsertSession(
  t,
  'AIL-1',
  'bmad-docs/impl-plan/AIL-1-test.md',
  { sessionId: 'brand-new', agents: new Set(['dev']), transcript: T2, endLine: 3 },
  0,
);
ok(
  t.plans['AIL-1'].analysisAttempts === 0 && t.plans['AIL-1'].analyzed === false,
  '#1 new session resets analysisAttempts',
);
tracker.writeTracker(ROOT, t);
ok(
  !fs.readdirSync(path.join(ROOT, 'bmad-docs', 'bmad-logs')).some((f) => f.includes('.tmp')),
  '#5 no stray tmp after write',
);
// concurrent writers: 8 processes hammer writeTracker at once
const script = `const t=require(${JSON.stringify(path.join(FL, 'lib', 'tracker.js'))});for(let i=0;i<30;i++){const x=t.readTracker(${JSON.stringify(ROOT)});x.plans['P'+process.pid]={planFile:'x',analyzed:false,generationCount:0,sessions:[]};t.writeTracker(${JSON.stringify(ROOT)},x);}`;
const procs = Array.from({ length: 8 }, () => spawn(process.execPath, ['-e', script]));
let done = 0,
  errs = 0;
const wait = new Promise((r) =>
  procs.forEach((p) => {
    p.stderr.on('data', (d) => {
      errs++;
      console.log('  stderr:', String(d).slice(0, 200));
    });
    p.on('close', (c) => {
      if (c !== 0) errs++;
      if (++done === procs.length) r();
    });
  }),
);

(async () => {
  await wait;
  let parsed = null;
  try {
    parsed = trk();
  } catch {}
  ok(errs === 0 && parsed !== null, `#5 8 concurrent writers, no crash, file valid (errs=${errs})`);
  ok(
    !fs.readdirSync(path.join(ROOT, 'bmad-docs', 'bmad-logs')).some((f) => f.includes('.tmp')),
    '#5 no stray tmp after concurrent writes',
  );

  // ================= #3 reducer caps =================
  const { buildScreenplays, reduceTranscript, MAX_SCREENPLAY_CHARS } = require(
    path.join(FL, 'lib', 'reducer.js'),
  );
  const big = path.join(ROOT, 'big.jsonl');
  fs.writeFileSync(big, [user('hi'), agentText('A'.repeat(5000))].join('\n'));
  const r = reduceTranscript(big);
  ok(r.script.length < 2000 && r.script.includes('[truncated]'), '#3 AGENT line capped at 1500');
  // 5 sessions x ~120k each -> only newest 2 fit in 300k
  const sess = [];
  for (let i = 0; i < 5; i++) {
    const p = path.join(ROOT, `s${i}.jsonl`);
    fs.writeFileSync(
      p,
      Array.from({ length: 30 }, (_, k) => user(`S${i} msg ${k} ` + 'x'.repeat(4000))).join('\n'),
    );
    sess.push({
      sessionId: `sess${i}0000`,
      agents: ['dev'],
      transcript: p,
      endedAt: `2026-09-0${i + 1}T00:00:00Z`,
    });
  }
  const sp = buildScreenplays(sess);
  ok(sp.length <= MAX_SCREENPLAY_CHARS + 100, `#3 total within budget (${sp.length})`);
  ok(
    sp.startsWith('[TRUNCATED: 3 older session(s) omitted'),
    '#3 oldest 3 dropped, marker present',
  );
  ok(
    sp.includes('Session sess3') && sp.includes('Session sess4') && !sp.includes('Session sess0'),
    '#3 newest kept, oldest gone',
  );
  // single giant session -> sliced, still present
  const giant = path.join(ROOT, 'giant.jsonl');
  fs.writeFileSync(
    giant,
    Array.from({ length: 100 }, (_, k) => user(`G ${k} ` + 'y'.repeat(4000))).join('\n'),
  );
  const sp2 = buildScreenplays([
    { sessionId: 'giant000', agents: ['dev'], transcript: giant, endedAt: '2026-09-09T00:00:00Z' },
  ]);
  ok(
    sp2.length <= MAX_SCREENPLAY_CHARS + 100 && sp2.includes('[session truncated'),
    '#3 single giant session sliced',
  );

  // ================= #1 analysis cap + #4 heartbeat (fake claude) =================
  const bin = path.join(ROOT, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    path.join(bin, 'claude.cmd'),
    '@echo off\r\necho {"is_error":false,"result":"NOT JSON AT ALL","total_cost_usd":0}\r\n',
  );
  const t2 = trk();
  t2.plans = { 'AIL-1': t2.plans['AIL-1'] };
  t2.plans['AIL-1'].sessions = [
    {
      sessionId: 's1-planner',
      agents: ['planner'],
      transcript: T1,
      endedAt: '2026-09-30T00:00:00Z',
      endLine: 3,
    },
    {
      sessionId: 's2-dev',
      agents: ['dev'],
      transcript: T2,
      endedAt: '2026-09-30T00:01:00Z',
      endLine: 3,
    },
  ];
  t2.plans['AIL-1'].analyzed = false;
  t2.plans['AIL-1'].analysisAttempts = 0;
  t2.plans['AIL-1'].generationCount = 0;
  tracker.writeTracker(ROOT, t2);
  const env = {
    ...process.env,
    PATH: bin + path.delimiter + process.env.PATH,
    Path: bin + path.delimiter + (process.env.Path || ''),
  };
  const dbg = path.join(ROOT, 'bmad-docs', 'bmad-logs', '.hook-debug.log');
  const lock = path.join(ROOT, 'bmad-docs', 'bmad-logs', '.fire-lock');
  for (let i = 1; i <= 4; i++) {
    fs.writeFileSync(lock, JSON.stringify({ pid: 0, startedAt: '2000-01-01T00:00:00Z' }));
    spawnSync(process.execPath, [path.join(FL, 'worker.js'), ROOT], { env });
    const a = trk().plans['AIL-1'].analysisAttempts;
    const log = fs.readFileSync(dbg, 'utf8');
    if (i <= 3) ok(a === i, `#1 run ${i}: analysisAttempts=${a}`);
    else
      ok(
        a === 3 && /skip AIL-1 — analysis-cap/.test(log),
        `#1 run 4: gate 'analysis-cap', no LLM call`,
      );
  }
  ok(!fs.existsSync(lock), '#4/#6 lock released after run');
  ok(
    /giving up on AIL-1 after 3 failed analyses/.test(fs.readFileSync(dbg, 'utf8')),
    '#1 give-up message logged',
  );

  // #4 heartbeat: fake slow claude, read lock mid-run, startedAt must be fresh
  fs.writeFileSync(
    path.join(bin, 'claude.cmd'),
    '@echo off\r\nping -n 4 127.0.0.1 >nul\r\necho {"is_error":false,"result":"{\\"summary\\":\\"ok\\",\\"entries\\":[]}","total_cost_usd":0}\r\n',
  );
  const t3 = trk();
  t3.plans['AIL-1'].analysisAttempts = 0;
  t3.plans['AIL-1'].analyzed = false;
  tracker.writeTracker(ROOT, t3);
  fs.writeFileSync(lock, JSON.stringify({ pid: 0, startedAt: '2000-01-01T00:00:00Z' }));
  const w = spawnSync(process.execPath, [path.join(FL, 'worker.js'), ROOT], { env });
  const after = trk().plans['AIL-1'];
  ok(
    after.analyzed === true && after.generationCount === 1 && after.analysisAttempts === 0,
    '#1 success path: analyzed, generation=1, attempts reset',
  );
  ok(
    /analysis heartbeat|worker: AIL-1 done/.test(fs.readFileSync(dbg, 'utf8')),
    '#4 slow LLM run completed (heartbeat path exercised)',
  );
  ok(
    fs.existsSync(path.join(ROOT, 'bmad-docs', 'bmad-logs', 'AIL-1', 'friction.md')),
    '#1 friction.md written',
  );

  // ================= #6 require failure -> FATAL log + lock release =================
  const broken = path.join(ROOT, 'fl-broken');
  fs.cpSync(FL, broken, { recursive: true });
  fs.rmSync(path.join(broken, 'lib', 'render.js'));
  fs.writeFileSync(lock, '{}');
  const res = spawnSync(process.execPath, [path.join(broken, 'worker.js'), ROOT]);
  ok(res.status === 1, '#6 broken worker exits 1');
  ok(
    /FATAL require failed/.test(fs.readFileSync(dbg, 'utf8')),
    '#6 FATAL logged to .hook-debug.log',
  );
  ok(!fs.existsSync(lock), '#6 lock released on require failure');

  console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
  process.exit(fails ? 1 : 0);
})();
