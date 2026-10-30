'use strict';

// Step 1b — uv and Python, installed when missing, silently, user-level, on
// Windows, macOS and Linux. uv comes from its official installer; Python is a
// uv-managed interpreter (`uv python install`), isolated from any system Python.
// `run(cmd, args, opts) → { status, stdout, stderr }` is injectable for tests.

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { MIN_PYTHON, PYTHON_INSTALL_VERSION, UV_INSTALL_URL } = require('./constants');

const INSTALL_TIMEOUT_MS = 180_000;

const defaultRun = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', timeout: INSTALL_TIMEOUT_MS, ...opts });

/** The official uv installer, per platform. Both are user-level and non-interactive. */
function uvInstallCommand(platform) {
  if (platform === 'win32') {
    return {
      cmd: 'powershell',
      args: [
        '-NoProfile',
        '-ExecutionPolicy',
        'ByPass',
        '-c',
        'irm https://astral.sh/uv/install.ps1 | iex',
      ],
    };
  }
  return { cmd: 'sh', args: ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'] };
}

/** Where the uv installer puts the binary: ~/.local/bin on every platform. */
function uvBinDir(platform, env) {
  const home =
    (platform === 'win32' ? env.USERPROFILE : env.HOME) || env.HOME || env.USERPROFILE || '';
  return path.join(home, '.local', 'bin');
}

const firstLine = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean) || '';

function versionOf(text) {
  const m = /(\d+\.\d+(?:\.\d+)?)/.exec(String(text || ''));
  return m ? m[1] : null;
}

function probe(run, cmd, args = ['--version']) {
  try {
    const r = run(cmd, args);
    const ok = Boolean(r && r.status === 0);
    return { ok, version: ok ? versionOf(r.stdout || r.stderr) : null, stdout: ok ? r.stdout : '' };
  } catch {
    return { ok: false, version: null, stdout: '' };
  }
}

/** Python 3.11+ is what BMad's scripts declare. Returns {ok, version} for the first good interpreter. */
function pythonOk(version) {
  const m = /^(\d+)\.(\d+)/.exec(String(version || ''));
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > MIN_PYTHON.major || (major === MIN_PYTHON.major && minor >= MIN_PYTHON.minor);
}

function probePython(run, platform) {
  const candidates = platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    const p = probe(run, cmd);
    if (p.ok && pythonOk(p.version)) return { ok: true, version: p.version, cmd };
  }
  return { ok: false, version: null, cmd: null };
}

/**
 * @returns {{status:'present'|'installed'|'failed', version:string|null, detail:string|null}}
 */
function ensureUv({ run = defaultRun, platform = process.platform, env = process.env } = {}) {
  const before = probe(run, 'uv');
  if (before.ok) return { status: 'present', version: before.version, detail: null };

  const { cmd, args } = uvInstallCommand(platform);
  let r;
  try {
    r = run(cmd, args, { env });
  } catch (error) {
    return { status: 'failed', version: null, detail: error.message || String(error) };
  }
  // The installer adds ~/.local/bin to the user's PATH for future shells; this
  // process needs it now.
  const bin = uvBinDir(platform, env);
  const sep = platform === 'win32' ? ';' : ':';
  const current = env.PATH || env.Path || '';
  if (!current.split(sep).includes(bin)) env.PATH = `${bin}${sep}${current}`;

  const after = probe(run, 'uv');
  if (after.ok) return { status: 'installed', version: after.version, detail: null };
  const detail =
    (r && r.status !== 0 && (firstLine(r.stderr) || `exit ${r.status}`)) ||
    `uv not found in ${bin} after install`;
  return { status: 'failed', version: null, detail };
}

/**
 * Python 3.11+ on PATH → present. Otherwise `uv python install <ver>`: a managed
 * interpreter under uv's own folder; the system Python is untouched.
 * @returns {{status:'present'|'installed'|'failed'|'skipped', version:string|null, detail:string|null}}
 */
function ensurePython({
  run = defaultRun,
  platform = process.platform,
  env = process.env,
  uvOk = true,
} = {}) {
  const found = probePython(run, platform);
  if (found.ok) return { status: 'present', version: found.version, detail: null };
  if (!uvOk) return { status: 'skipped', version: null, detail: 'uv is not available' };

  let r;
  try {
    r = run('uv', ['python', 'install', PYTHON_INSTALL_VERSION], { env });
  } catch (error) {
    return { status: 'failed', version: null, detail: error.message || String(error) };
  }
  if (!r || r.status !== 0) {
    return {
      status: 'failed',
      version: null,
      detail: (r && (firstLine(r.stderr) || `exit ${r.status}`)) || 'no result',
    };
  }
  const find = probe(run, 'uv', ['python', 'find', PYTHON_INSTALL_VERSION]);
  const interpreter = firstLine(find.stdout);
  const v = interpreter ? probe(run, interpreter) : { ok: false, version: null };
  return { status: 'installed', version: v.version || PYTHON_INSTALL_VERSION, detail: null };
}

/** Both, in order. Python is skipped when uv could not be installed. */
function ensureTools(opts = {}) {
  const uv = ensureUv(opts);
  const python = ensurePython({ ...opts, uvOk: uv.status !== 'failed' });
  return { uv, python };
}

module.exports = {
  ensureUv,
  ensurePython,
  ensureTools,
  uvInstallCommand,
  uvBinDir,
  probePython,
  pythonOk,
  UV_INSTALL_URL,
};
