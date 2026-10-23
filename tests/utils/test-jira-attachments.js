'use strict';

// Migration Task 5 — jira-attachments helper on the BMad v6 layout: project-root
// detection, token file location, env precedence, cache location, and the CLI's
// behaviour without credentials. Network calls are not exercised here
// (`--self-test` against the real site is the manual check).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const H = path.join(REPO, 'stella', 'utils', 'jira-attachments');
const cfg = require(path.join(H, 'lib', 'config.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-t5-jira-'));
fs.mkdirSync(path.join(ROOT, '_bmad'), { recursive: true });
const nested = path.join(ROOT, 'src', 'deep');
fs.mkdirSync(nested, { recursive: true });
const ENV_FILE = path.join(ROOT, '_bmad-output', 'stella', '.bmad-tokens', '.env');

// strip any real credentials from the environment for these checks
const cleanEnv = () => {
  for (const k of ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'BMAD_JIRA_CACHE_DIR'])
    delete process.env[k];
};
cleanEnv();

// ---- root detection ----
ok(cfg.findProjectRoot(nested) === ROOT, 'root: found from nested cwd via _bmad/');
ok(cfg.findProjectRoot(ROOT) === ROOT, 'root: found at the root itself');
const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-t5-plain-'));
ok(cfg.findProjectRoot(plain) === null, 'root: null outside a project');
ok(cfg.tokensEnvPath(ROOT) === ENV_FILE, 'tokens: _bmad-output/stella/.bmad-tokens/.env');

// ---- config without a token file ----
let c = cfg.resolveConfig({ cwd: nested });
ok(c.projectRoot === ROOT, 'config: projectRoot resolved by walking up from cwd');
ok(
  c.cacheRoot === path.join(ROOT, '_bmad-output', 'stella', 'cache', 'jira'),
  'config: cache under _bmad-output/stella/cache/jira',
);
ok(
  !cfg.validateConfig(c).ok && cfg.validateConfig(c).missing.length === 3,
  'config: nothing set → three missing',
);
c = cfg.resolveConfig({ cwd: plain });
ok(c.projectRoot === plain, 'config: outside a project falls back to cwd');

// ---- token file read + precedence ----
fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true });
fs.writeFileSync(
  ENV_FILE,
  'JIRA_BASE_URL=stellaint.atlassian.net\nJIRA_EMAIL="file@x.com"\nJIRA_API_TOKEN=\'tok-file\'\n# comment\n',
);
c = cfg.resolveConfig({ cwd: nested });
ok(
  c.baseUrl === 'https://stellaint.atlassian.net' &&
    c.email === 'file@x.com' &&
    c.token === 'tok-file',
  'env file: values read, quotes stripped, https added',
);
ok(cfg.validateConfig(c).ok, 'env file: config valid');
process.env.JIRA_EMAIL = 'env@x.com';
c = cfg.resolveConfig({ cwd: nested });
ok(
  c.email === 'env@x.com' && c.token === 'tok-file',
  'precedence: process env wins over the file per key',
);
process.env.BMAD_JIRA_CACHE_DIR = 'tmp/jira-cache';
c = cfg.resolveConfig({ cwd: nested });
ok(
  c.cacheRoot === path.resolve(ROOT, 'tmp', 'jira-cache'),
  'cache: BMAD_JIRA_CACHE_DIR override resolved against the root',
);
cleanEnv();
c = cfg.resolveConfig({ projectRoot: plain, cwd: nested });
ok(
  c.projectRoot === plain && !cfg.validateConfig(c).ok,
  'config: explicit projectRoot wins over cwd detection',
);
fs.writeFileSync(
  ENV_FILE,
  'JIRA_BASE_URL=http://stellaint.atlassian.net\nJIRA_EMAIL=a\nJIRA_API_TOKEN=b\n',
);
c = cfg.resolveConfig({ cwd: nested });
ok(c.baseUrl === null && /https/.test(c.baseUrlWarning), 'security: http base URL refused');
fs.rmSync(ENV_FILE);

// ---- CLI behaviour without credentials (no network) ----
const run = (argv, cwd = nested) =>
  spawnSync(process.execPath, [path.join(H, 'index.js'), ...argv], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      JIRA_BASE_URL: '',
      JIRA_EMAIL: '',
      JIRA_API_TOKEN: '',
      BMAD_JIRA_CACHE_DIR: '',
    },
  });
let res = run(['--help']);
ok(
  res.status === 0 &&
    /_bmad\/custom\/stella\/utils\/jira-attachments/.test(res.stdout) &&
    !/bmad-core/.test(res.stdout),
  'cli: help shows the v6 helper path',
);
res = run(['AIL-1']);
ok(
  res.status === 10 &&
    /Missing credentials/.test(res.stderr) &&
    /_bmad-output[\\/]stella[\\/]\.bmad-tokens[\\/]\.env/.test(res.stderr),
  'cli: missing credentials → exit 10, names the v6 token file',
);
ok(
  (() => {
    try {
      const j = JSON.parse(res.stdout);
      return (
        j.ok === false &&
        j.code === 10 &&
        j.message === 'Jira token file missing. Run the installer again.'
      );
    } catch {
      return false;
    }
  })(),
  'cli: missing credentials → stdout JSON carries the dev-facing line',
);
res = run(['--self-test']);
ok(res.status === 10, 'cli: --self-test without credentials → exit 10');
res = run(['AIL-1', '--purge']);
ok(
  res.status === 0 && /Nothing to purge/.test(res.stderr + res.stdout),
  'cli: --purge works without credentials',
);
res = run(['--bogus']);
ok(res.status === 10 && /Unknown flag/.test(res.stderr), 'cli: unknown flag → exit 10');

// ---- source hygiene ----
const files = [
  'index.js',
  'lib/config.js',
  'lib/cache.js',
  'lib/client.js',
  'lib/adf.js',
  'README.md',
];
const stale = files.filter((f) =>
  /bmad-docs|\.bmad-core/.test(fs.readFileSync(path.join(H, f), 'utf8')),
);
ok(stale.length === 0, `source: no v4 paths left (${stale.join(', ')})`);

console.log(
  `utils jira-attachments: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
