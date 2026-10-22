'use strict';

// uv + Python auto-install (tool-installer.js) and its use in installer step 1.
// Every `run` is a mock: no network, no real install.

const path = require('node:path');
const LIB = path.resolve(__dirname, '..', '..', 'tools', 'installer', 'lib');
const ti = require(path.join(LIB, 'tool-installer.js'));
const preflight = require(path.join(LIB, 'preflight.js'));
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

/**
 * Mock runner. `present` maps command → stdout of `--version` (missing = status 1).
 * `onInstall` is called for the uv installer; when it returns true, uv becomes present.
 * `pythonInstall` → status of `uv python install`.
 */
function mockRun({ present = {}, onInstall = () => true, pythonInstall = 0 } = {}) {
  const state = { ...present };
  const calls = [];
  const run = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const a = args || [];
    if (
      (cmd === 'powershell' && /astral\.sh\/uv\/install\.ps1/.test(a.join(' '))) ||
      (cmd === 'sh' && /astral\.sh\/uv\/install\.sh/.test(a.join(' ')))
    ) {
      const good = onInstall();
      if (good) state.uv = 'uv 0.9.4';
      return {
        status: good ? 0 : 1,
        stdout: '',
        stderr: good ? '' : 'curl: (6) Could not resolve host',
      };
    }
    if (cmd === 'uv' && a[0] === 'python' && a[1] === 'install') {
      if (pythonInstall === 0) state['/managed/python3.12'] = 'Python 3.12.8';
      return {
        status: pythonInstall,
        stdout: '',
        stderr: pythonInstall ? 'error: no download' : '',
      };
    }
    if (cmd === 'uv' && a[0] === 'python' && a[1] === 'find') {
      return state['/managed/python3.12']
        ? { status: 0, stdout: '/managed/python3.12\n', stderr: '' }
        : { status: 1, stdout: '', stderr: 'not found' };
    }
    if (a[0] === '--version' && state[cmd])
      return { status: 0, stdout: state[cmd] + '\n', stderr: '' };
    return { status: 1, stdout: '', stderr: `${cmd}: not found` };
  };
  return { run, calls, state };
}

// ---- commands per platform ----
ok(ti.uvInstallCommand('win32').cmd === 'powershell', 'uv cmd: windows uses powershell');
ok(
  /irm https:\/\/astral\.sh\/uv\/install\.ps1 \| iex/.test(
    ti.uvInstallCommand('win32').args.join(' '),
  ),
  'uv cmd: windows runs the official ps1',
);
ok(
  ti.uvInstallCommand('win32').args.includes('-NoProfile') &&
    ti.uvInstallCommand('win32').args.includes('ByPass'),
  'uv cmd: windows no profile, bypass execution policy',
);
for (const p of ['darwin', 'linux']) {
  const c = ti.uvInstallCommand(p);
  ok(
    c.cmd === 'sh' &&
      /curl -LsSf https:\/\/astral\.sh\/uv\/install\.sh \| sh/.test(c.args.join(' ')),
    `uv cmd: ${p} runs the official sh installer`,
  );
}
ok(
  ti.uvBinDir('win32', { USERPROFILE: 'C:\\Users\\me' }) ===
    path.join('C:\\Users\\me', '.local', 'bin'),
  'uv bin dir: windows under USERPROFILE',
);
ok(
  ti.uvBinDir('linux', { HOME: '/home/me' }) === path.join('/home/me', '.local', 'bin'),
  'uv bin dir: posix under HOME',
);

// ---- python version rule ----
ok(ti.pythonOk('3.11.0') && ti.pythonOk('3.12.8') && ti.pythonOk('3.13'), 'python: 3.11+ ok');
ok(!ti.pythonOk('3.10.12') && !ti.pythonOk('2.7') && !ti.pythonOk(null), 'python: < 3.11 not ok');
ok(C.MIN_PYTHON.major === 3 && C.MIN_PYTHON.minor === 11, 'constants: MIN_PYTHON 3.11');
ok(C.PYTHON_INSTALL_VERSION === '3.12', 'constants: installs 3.12');

// ---- ensureUv ----
let m = mockRun({ present: { uv: 'uv 0.8.0' } });
let r = ti.ensureUv({ run: m.run, platform: 'linux', env: { HOME: '/h', PATH: '/usr/bin' } });
ok(r.status === 'present' && r.version === '0.8.0', 'ensureUv: present → no install');
ok(m.calls.length === 1, 'ensureUv: present → only the probe ran');

for (const [platform, env, cmd] of [
  ['win32', { USERPROFILE: 'C:\\Users\\me', PATH: 'C:\\Windows' }, 'powershell'],
  ['darwin', { HOME: '/Users/me', PATH: '/usr/bin' }, 'sh'],
  ['linux', { HOME: '/home/me', PATH: '/usr/bin' }, 'sh'],
]) {
  m = mockRun();
  const e = { ...env };
  r = ti.ensureUv({ run: m.run, platform, env: e });
  ok(
    r.status === 'installed' && r.version === '0.9.4',
    `ensureUv ${platform}: missing → installed`,
  );
  ok(m.calls[1].cmd === cmd, `ensureUv ${platform}: installer command is ${cmd}`);
  ok(
    e.PATH.startsWith(ti.uvBinDir(platform, env)),
    `ensureUv ${platform}: ~/.local/bin prepended to PATH for this process`,
  );
  ok(m.calls.length === 3, `ensureUv ${platform}: probe, install, re-probe`);
}

m = mockRun({ onInstall: () => false });
r = ti.ensureUv({ run: m.run, platform: 'linux', env: { HOME: '/h', PATH: '' } });
ok(
  r.status === 'failed' && /Could not resolve host/.test(r.detail),
  'ensureUv: download fails → failed with stderr',
);

m = mockRun({ onInstall: () => true });
const throwing = (cmd, args, opts) => {
  if (cmd === 'sh') throw new Error('spawn sh ENOENT');
  return m.run(cmd, args, opts);
};
r = ti.ensureUv({ run: throwing, platform: 'linux', env: { HOME: '/h', PATH: '' } });
ok(r.status === 'failed' && /ENOENT/.test(r.detail), 'ensureUv: spawn throws → failed');

// ---- ensurePython ----
m = mockRun({ present: { python3: 'Python 3.12.1' } });
r = ti.ensurePython({ run: m.run, platform: 'linux', env: {} });
ok(r.status === 'present' && r.version === '3.12.1', 'ensurePython: 3.12 on PATH → present');

m = mockRun({ present: { python: 'Python 3.9.7', python3: 'Python 3.10.0' } });
r = ti.ensurePython({ run: m.run, platform: 'win32', env: {} });
ok(
  r.status === 'installed' && r.version === '3.12.8',
  'ensurePython: only old pythons → uv-managed 3.12 installed',
);
ok(
  m.calls.some((c) => c.cmd === 'uv' && c.args.join(' ') === 'python install 3.12'),
  'ensurePython: ran `uv python install 3.12`',
);
ok(
  !m.calls.some((c) => /pip|winget|brew|apt/.test(c.cmd)),
  'ensurePython: never touches a system package manager',
);

m = mockRun({ pythonInstall: 1 });
r = ti.ensurePython({ run: m.run, platform: 'linux', env: {} });
ok(
  r.status === 'failed' && /no download/.test(r.detail),
  'ensurePython: uv install fails → failed',
);

m = mockRun();
r = ti.ensurePython({ run: m.run, platform: 'linux', env: {}, uvOk: false });
ok(
  r.status === 'skipped' && m.calls.every((c) => c.cmd !== 'uv'),
  'ensurePython: no uv → skipped, nothing run',
);

// ---- ensureTools ----
m = mockRun({ onInstall: () => false });
r = ti.ensureTools({ run: m.run, platform: 'linux', env: { HOME: '/h', PATH: '' } });
ok(
  r.uv.status === 'failed' && r.python.status === 'skipped',
  'ensureTools: uv failed → python skipped',
);

// ---- preflight reports python, never errors on it ----
const pfRun = mockRun({
  present: { uv: 'uv 0.9.4', git: 'git version 2.51.0', gh: 'gh version 2.98.0' },
}).run;
let pf = preflight.check({ run: pfRun, nodeVersion: 'v22.0.0', platform: 'linux' });
ok(
  pf.ok && pf.found.python === false && pf.versions.python === null,
  'preflight: no python → still ok',
);
const pfRun2 = mockRun({
  present: { uv: 'uv 0.9.4', git: 'git version 2.51.0', gh: 'gh 2.98.0', python3: 'Python 3.11.9' },
}).run;
pf = preflight.check({ run: pfRun2, nodeVersion: 'v22.0.0', platform: 'linux' });
ok(pf.found.python === true && pf.versions.python === '3.11.9', 'preflight: python 3.11 reported');
const pfRun3 = mockRun({ present: { uv: 'uv 0.9.4', python3: 'Python 3.8.10' } }).run;
pf = preflight.check({ run: pfRun3, nodeVersion: 'v22.0.0', platform: 'linux' });
ok(pf.found.python === false, 'preflight: python 3.8 counts as missing');

// ---- installer step 1 with mocked preflight + tools ----
(async () => {
  const installer = require(path.join(LIB, 'installer.js'));
  const lines = [];
  const ui = {
    width: 80,
    header() {},
    step() {},
    line(kind, text) {
      lines.push(`${kind}:${text}`);
    },
    cont() {},
    gap() {},
    spin() {
      return {
        update(t) {
          lines.push(`spin:${t}`);
        },
        succeed(d) {
          lines.push(`ok:${d}`);
        },
        fail(d) {
          lines.push(`fail:${d}`);
        },
      };
    },
    end() {},
    failed() {},
    next() {},
  };
  const pfMissing = {
    ok: true,
    errors: [],
    warnings: [],
    found: { node: true, uv: false, python: false, gh: true, git: true },
    versions: { node: '24.0.0', uv: null, python: null, gh: '2.98.0', git: '2.51.0' },
  };
  const pfAfter = {
    ...pfMissing,
    found: { ...pfMissing.found, uv: true, python: true },
    versions: { ...pfMissing.versions, uv: '0.9.4', python: '3.12.8' },
  };
  let checks = 0;
  const toolCalls = [];
  const tools = {
    ensureUv: () => {
      toolCalls.push('uv');
      return { status: 'installed', version: '0.9.4', detail: null };
    },
    ensurePython: () => {
      toolCalls.push('python');
      return { status: 'installed', version: '3.12.8', detail: null };
    },
  };
  // Stop the run right after step 1 by making the credentials step throw.
  const stop = new Error('STOP');
  let summaryTools = null;
  try {
    await installer.install('C:/nowhere', {
      prompt: () => {
        throw stop;
      },
      check: () => (++checks === 1 ? pfMissing : pfAfter),
      tools,
      ui,
      isTTY: true,
      env: {},
    });
  } catch (error) {
    if (error !== stop) throw error;
  }
  ok(toolCalls.join(',') === 'uv,python', 'step 1: both installers ran, uv first');
  ok(checks === 2, 'step 1: preflight re-run after installing');
  ok(lines.includes('spin:installing uv…'), 'step 1: spinner says installing uv');
  ok(
    lines.includes('spin:installing python 3.12 for uv…'),
    'step 1: spinner says installing python',
  );
  ok(
    lines.includes(
      'ok:node 24.0.0   uv 0.9.4 (installed)   python 3.12.8 (installed for uv)   gh 2.98.0   git 2.51.0',
    ),
    `step 1: ✓ line tags what was installed (${lines.find((l) => l.startsWith('ok:'))})`,
  );
  ok(
    lines.some((l) => l.startsWith('note:') && /new terminals/.test(l)),
    'step 1: note about reopening terminals',
  );

  // uv install fails → the run stops with the URL
  const lines2 = [];
  const ui2 = {
    ...ui,
    line: (k, t) => lines2.push(`${k}:${t}`),
    spin: () => ({ update() {}, succeed() {}, fail: (d) => lines2.push(`fail:${d}`) }),
  };
  let thrown = null;
  try {
    await installer.install('C:/nowhere', {
      prompt: () => {},
      check: () => pfMissing,
      tools: {
        ensureUv: () => ({ status: 'failed', version: null, detail: 'Could not resolve host' }),
        ensurePython: () => ({ status: 'skipped' }),
      },
      ui: ui2,
      isTTY: true,
      env: {},
    });
  } catch (error) {
    thrown = error;
  }
  ok(
    thrown &&
      /uv could not be installed/.test(thrown.message) &&
      thrown.message.includes(C.UV_INSTALL_URL),
    'step 1: uv failure stops with the install URL',
  );
  ok(
    lines2.some((l) => l.startsWith('fail:uv could not be installed — Could not resolve host')),
    'step 1: fail line shows the reason',
  );

  // python install fails → warning, run continues
  const lines3 = [];
  const ui3 = {
    ...ui,
    line: (k, t) => lines3.push(`${k}:${t}`),
    spin: () => ({ update() {}, succeed: (d) => lines3.push(`ok:${d}`), fail() {} }),
  };
  let checks3 = 0;
  const pfOnlyPython = {
    ...pfMissing,
    found: { ...pfMissing.found, uv: true },
    versions: { ...pfMissing.versions, uv: '0.9.4' },
  };
  try {
    await installer.install('C:/nowhere', {
      prompt: () => {
        throw stop;
      },
      check: () => (++checks3 === 1 ? pfOnlyPython : pfOnlyPython),
      tools: {
        ensureUv: () => ({ status: 'present' }),
        ensurePython: () => ({ status: 'failed', version: null, detail: 'no download' }),
      },
      ui: ui3,
      isTTY: true,
      env: {},
    });
  } catch (error) {
    if (error !== stop) throw error;
  }
  ok(
    lines3.some((l) =>
      /^warn:Python 3\.12 was not installed \(no download\)\. uv will download one on first use\./.test(
        l,
      ),
    ),
    'step 1: python failure is a warning only',
  );
  ok(
    lines3.some((l) => l.startsWith('ok:node 24.0.0   uv 0.9.4   gh')),
    'step 1: run continues past python failure',
  );
  void summaryTools;

  console.log(
    `tool installer: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
  );
  process.exit(fails ? 1 : 0);
})();
