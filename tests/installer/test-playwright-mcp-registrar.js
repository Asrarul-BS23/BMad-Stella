'use strict';

// Playwright MCP servers (playwright-mcp-registrar.js) — registered once per machine
// (user scope) through the `claude` CLI. Every `run` is a mock: ~/.claude.json is
// never touched.

const path = require('node:path');
const LIB = path.resolve(__dirname, '..', '..', 'tools', 'installer', 'lib');
const pw = require(path.join(LIB, 'playwright-mcp-registrar.js'));
const installer = require(path.join(LIB, 'installer.js'));
const C = require(path.join(LIB, 'constants.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

ok(
  C.PLAYWRIGHT_MCP_SERVERS.map((s) => s.name)
    .sort()
    .join(',') === 'playwright,playwright-test',
  'constants: both server names',
);

/** Mock `claude` CLI. `registered` = Set of names already present. */
function mockCli({ present = true, registered = new Set(), addFails = new Set() } = {}) {
  const calls = [];
  const run = (command, opts) => {
    calls.push({ command, cwd: opts && opts.cwd });
    if (!present) return { status: 1, stdout: '', stderr: 'claude: command not found' };
    if (command === 'claude --version') return { status: 0, stdout: '2.1.0\n', stderr: '' };
    const getMatch = /^claude mcp get (\S+)$/.exec(command);
    if (getMatch) {
      return registered.has(getMatch[1])
        ? { status: 0, stdout: `${getMatch[1]}:\n  Scope: User\n`, stderr: '' }
        : { status: 1, stdout: '', stderr: `No MCP server found with name: ${getMatch[1]}` };
    }
    const addMatch = /^claude mcp add -s user --transport stdio (\S+) -- /.exec(command);
    if (addMatch) {
      if (addFails.has(addMatch[1])) return { status: 1, stdout: '', stderr: 'Error: boom' };
      registered.add(addMatch[1]);
      return { status: 0, stdout: `Added stdio MCP server ${addMatch[1]}\n`, stderr: '' };
    }
    return { status: 1, stdout: '', stderr: `unknown: ${command}` };
  };
  return { run, calls, registered };
}

// ---- register: fresh machine, both servers added ----
let m = mockCli();
let results = pw.register('C:/proj', { run: m.run });
ok(
  results.every((r) => r.status === 'registered') &&
    results
      .map((r) => r.name)
      .sort()
      .join(',') === 'playwright,playwright-test',
  'register: fresh → both registered',
);
ok(
  m.calls.some(
    (c) =>
      c.command ===
      'claude mcp add -s user --transport stdio playwright -- npx -y @playwright/mcp@latest',
  ),
  'register: exact command for playwright',
);
ok(
  m.calls.some(
    (c) =>
      c.command ===
      'claude mcp add -s user --transport stdio playwright-test -- npx playwright run-test-mcp-server',
  ),
  'register: exact command for playwright-test',
);
ok(
  m.calls.every((c) => c.cwd === 'C:/proj'),
  'register: every command runs in the project folder',
);

// ---- already registered → present, no add ----
m = mockCli({ registered: new Set(['playwright', 'playwright-test']) });
results = pw.register('C:/proj', { run: m.run });
ok(
  results.every((r) => r.status === 'present'),
  'register: already registered → present',
);
ok(!m.calls.some((c) => c.command.includes('mcp add')), 'register: present → no add attempted');

// ---- one already present, one missing ----
m = mockCli({ registered: new Set(['playwright']) });
results = pw.register('C:/proj', { run: m.run });
ok(
  results.find((r) => r.name === 'playwright').status === 'present' &&
    results.find((r) => r.name === 'playwright-test').status === 'registered',
  'register: mixed state handled per server',
);

// ---- no claude CLI ----
m = mockCli({ present: false });
results = pw.register('C:/proj', { run: m.run });
ok(
  results.every((r) => r.status === 'no-cli') && m.calls.length === 2,
  'register: no claude command → no-cli for each, nothing else tried',
);

// ---- add fails for one server, the other still runs ----
m = mockCli({ addFails: new Set(['playwright-test']) });
results = pw.register('C:/proj', { run: m.run });
ok(
  results.find((r) => r.name === 'playwright').status === 'registered' &&
    results.find((r) => r.name === 'playwright-test').status === 'failed' &&
    /boom/.test(results.find((r) => r.name === 'playwright-test').detail),
  'register: one add failing does not stop the other',
);

// ---- spawn throwing counts as no-cli ----
results = pw.register('C:/proj', {
  run: () => {
    throw new Error('spawn EACCES');
  },
});
ok(
  results.every((r) => r.status === 'no-cli'),
  'register: spawn throwing counts as no cli',
);

// ---- installer: ✓ line and notes ----
const base = {
  root: 'C:/proj',
  skills: ['a', 'b', 'c', 'd', 'e', 'f'],
  hooks: ['x', 'y', 'z'],
  domainDocs: { status: 'skipped', reason: 'no Confluence page for this project (Other)' },
  userHooks: { status: 'current' },
  gitignoreAdded: [],
  created: [],
  mcp: { status: 'registered' },
};
ok(
  installer.layerDetail({
    ...base,
    playwrightMcp: [
      { name: 'playwright', status: 'registered', detail: null },
      { name: 'playwright-test', status: 'present', detail: null },
    ],
  }) === '6 skills   3 hooks   permissions   Atlassian MCP   Playwright MCP   user hooks',
  'detail: Playwright MCP shown when at least one server is ok',
);
ok(
  !/Playwright MCP/.test(installer.layerDetail({ ...base })),
  'detail: hidden when summary has no playwrightMcp entry',
);
ok(
  !/Playwright MCP/.test(
    installer.layerDetail({
      ...base,
      playwrightMcp: [
        { name: 'playwright', status: 'no-cli', detail: 'claude command not found' },
        { name: 'playwright-test', status: 'no-cli', detail: 'claude command not found' },
      ],
    }),
  ),
  'detail: hidden when every server failed',
);
let notes = installer.layerNotes({
  ...base,
  playwrightMcp: [
    { name: 'playwright', status: 'registered', detail: null },
    { name: 'playwright-test', status: 'no-cli', detail: 'claude command not found' },
  ],
});
let n = notes.find((x) => /playwright-test MCP/.test(x.text));
ok(
  n &&
    n.kind === 'warn' &&
    n.text === 'playwright-test MCP not registered — claude command not found' &&
    /install the Claude Code CLI/.test(n.cont),
  'notes: no-cli → warn with how-to continuation, only for the failed server',
);
ok(
  !notes.some((x) => x.text.startsWith('playwright MCP')),
  'notes: nothing for the server that registered fine',
);
notes = installer.layerNotes({
  ...base,
  playwrightMcp: [{ name: 'playwright', status: 'failed', detail: 'network unreachable' }],
});
n = notes.find((x) => /playwright MCP/.test(x.text));
ok(
  n && n.kind === 'warn' && /network unreachable/.test(n.text) && n.cont === null,
  'notes: failed → warn with the reason',
);
ok(
  !installer
    .layerNotes({
      ...base,
      playwrightMcp: [
        { name: 'playwright', status: 'registered', detail: null },
        { name: 'playwright-test', status: 'present', detail: null },
      ],
    })
    .some((x) => /Playwright/.test(x.text)),
  'notes: nothing when every server is ok',
);

console.log(
  `playwright mcp registrar: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
