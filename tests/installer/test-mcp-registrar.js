'use strict';

// Atlassian MCP registration through the `claude` CLI (mcp-registrar.js) and its
// use in the installer. Every `run` is a mock: ~/.claude.json is never touched.

const path = require('node:path');
const LIB = path.resolve(__dirname, '..', '..', 'tools', 'installer', 'lib');
const mcp = require(path.join(LIB, 'mcp-registrar.js'));
const installer = require(path.join(LIB, 'installer.js'));
const C = require(path.join(LIB, 'constants.js'));
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

const URL = C.ATLASSIAN_MCP.url;
const SSE = 'https://mcp.atlassian.com/v1/sse';

/** Mock `claude` CLI. `registered` = url currently stored, or null. */
function mockCli({
  present = true,
  registered = null,
  addFails = false,
  removeFails = false,
} = {}) {
  const state = { registered };
  const calls = [];
  const run = (command, opts) => {
    calls.push({ command, cwd: opts && opts.cwd });
    if (!present) return { status: 1, stdout: '', stderr: 'claude: command not found' };
    if (command === 'claude --version') return { status: 0, stdout: '2.1.0\n', stderr: '' };
    if (command === 'claude mcp get atlassian') {
      return state.registered
        ? {
            status: 0,
            stdout: `atlassian:\n  Scope: Local\n  Type: http\n  URL: ${state.registered}\n`,
            stderr: '',
          }
        : { status: 1, stdout: '', stderr: 'No MCP server found with name: atlassian' };
    }
    if (command === 'claude mcp remove atlassian') {
      if (removeFails) return { status: 1, stdout: '', stderr: 'boom' };
      state.registered = null;
      return { status: 0, stdout: 'Removed MCP server atlassian\n', stderr: '' };
    }
    if (command.startsWith('claude mcp add ')) {
      if (addFails) return { status: 1, stdout: '', stderr: 'Error: network unreachable' };
      state.registered = command.trim().split(/\s+/).pop();
      return { status: 0, stdout: 'Added HTTP MCP server atlassian\n', stderr: '' };
    }
    return { status: 1, stdout: '', stderr: `unknown: ${command}` };
  };
  return { run, calls, state };
}

ok(
  C.ATLASSIAN_MCP.name === 'atlassian' && C.ATLASSIAN_MCP.transport === 'http',
  'constants: server name + transport',
);
ok(
  URL === 'https://mcp.atlassian.com/v1/mcp',
  'constants: official streamable-http endpoint (not the retired SSE one)',
);
ok(C.STALE_ATLASSIAN_MCP_URLS.includes(SSE), 'constants: retired SSE url listed as stale');

// ---- register ----
let m = mockCli();
let r = mcp.register('C:/proj', { run: m.run });
ok(r.status === 'registered' && r.url === URL, 'register: fresh → registered');
ok(
  m.calls.some(
    (c) => c.command === `claude mcp add --transport http --scope local atlassian ${URL}`,
  ),
  'register: exact claude mcp add command, local scope',
);
ok(
  m.calls.every((c) => c.cwd === 'C:/proj'),
  'register: every command runs in the project folder',
);
ok(!m.calls.some((c) => c.command.includes('remove')), 'register: fresh → nothing removed');

m = mockCli({ registered: URL });
r = mcp.register('C:/proj', { run: m.run });
ok(r.status === 'present', 'register: already correct → present');
ok(
  !m.calls.some((c) => /mcp (add|remove)/.test(c.command)),
  'register: already correct → no add, no remove',
);

m = mockCli({ registered: SSE });
r = mcp.register('C:/proj', { run: m.run });
ok(
  r.status === 'replaced' && m.state.registered === URL,
  'register: retired SSE url → removed and re-added',
);
const order = m.calls.map((c) => c.command).filter((c) => /mcp (add|remove)/.test(c));
ok(
  order.length === 2 && order[0].includes('remove') && order[1].includes('add'),
  'register: remove before add',
);

m = mockCli({ present: false });
r = mcp.register('C:/proj', { run: m.run });
ok(
  r.status === 'no-cli' && m.calls.length === 1,
  'register: no claude command → no-cli, nothing else tried',
);

m = mockCli({ addFails: true });
r = mcp.register('C:/proj', { run: m.run });
ok(
  r.status === 'failed' && /network unreachable/.test(r.detail),
  'register: add fails → failed with stderr',
);

m = mockCli({ registered: SSE, removeFails: true });
r = mcp.register('C:/proj', { run: m.run });
ok(
  r.status === 'failed' && /could not replace/.test(r.detail),
  'register: remove of stale entry fails → failed',
);

r = mcp.register('C:/proj', {
  run: () => {
    throw new Error('spawn EACCES');
  },
});
ok(r.status === 'no-cli', 'register: spawn throwing counts as no cli');

// ---- unregister ----
m = mockCli({ registered: URL });
r = mcp.unregister('C:/proj', { run: m.run });
ok(r.status === 'removed' && m.state.registered === null, 'unregister: registered → removed');
m = mockCli();
r = mcp.unregister('C:/proj', { run: m.run });
ok(
  r.status === 'absent' && !m.calls.some((c) => c.command.includes('remove')),
  'unregister: not registered → absent, no remove',
);
m = mockCli({ present: false });
ok(mcp.unregister('C:/proj', { run: m.run }).status === 'no-cli', 'unregister: no cli → no-cli');
m = mockCli({ registered: URL, removeFails: true });
ok(
  mcp.unregister('C:/proj', { run: m.run }).status === 'failed',
  'unregister: remove fails → failed',
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
};
ok(
  installer.layerDetail({ ...base, mcp: { status: 'registered' } }) ===
    '6 skills   3 hooks   permissions   Atlassian MCP   user hooks',
  'detail: Atlassian MCP after permissions when registered',
);
for (const status of ['replaced', 'present']) {
  ok(
    /Atlassian MCP/.test(installer.layerDetail({ ...base, mcp: { status } })),
    `detail: shown for ${status}`,
  );
}
ok(
  !/Atlassian MCP/.test(installer.layerDetail({ ...base, mcp: { status: 'no-cli' } })),
  'detail: hidden when not registered',
);
ok(!/Atlassian MCP/.test(installer.layerDetail(base)), 'detail: tolerates a summary without mcp');
let notes = installer.layerNotes({
  ...base,
  mcp: { status: 'no-cli', detail: 'claude command not found' },
});
let n = notes.find((x) => /Atlassian MCP/.test(x.text));
ok(
  n &&
    n.kind === 'warn' &&
    n.text === 'Atlassian MCP not registered — claude command not found' &&
    /install the Claude Code CLI/.test(n.cont),
  'notes: no-cli → warn with how-to continuation',
);
notes = installer.layerNotes({ ...base, mcp: { status: 'failed', detail: 'network unreachable' } });
n = notes.find((x) => /Atlassian MCP/.test(x.text));
ok(
  n && n.kind === 'warn' && /network unreachable/.test(n.text) && n.cont === null,
  'notes: failed → warn with the reason',
);
ok(
  !installer
    .layerNotes({ ...base, mcp: { status: 'registered' } })
    .some((x) => /Atlassian MCP/.test(x.text)),
  'notes: nothing when registered',
);

// ---- permissions for the per-project server ----
const allow = permissions.getAllPermissions();
for (const tool of [
  'getJiraIssue',
  'addCommentToJiraIssue',
  'getConfluencePageDescendants',
  'fetch',
]) {
  ok(allow.includes(`mcp__atlassian__${tool}`), `permissions: mcp__atlassian__${tool} allowed`);
  ok(
    allow.includes(`mcp__claude_ai_Atlassian__${tool}`),
    `permissions: connector name still allowed`,
  );
}

console.log(`mcp registrar: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
