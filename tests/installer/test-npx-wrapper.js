'use strict';

// The npx entry must keep the developer's working directory. Regression test for
// the v4 wrapper bug that installed BMad into the npm cache folder.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const WRAPPER = path.join(REPO, 'tools', 'bmad-npx-wrapper.js');

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

const src = fs.readFileSync(WRAPPER, 'utf8');
ok(!/cwd\s*:/.test(src), 'wrapper: never sets cwd');
ok(!/execSync|spawnSync|spawn\(/.test(src), 'wrapper: does not re-spawn the CLI');
ok(
  /require\('\.\/installer\/bin\/bmad\.js'\)/.test(src),
  'wrapper: requires the installer CLI directly',
);
ok(
  require('../../package.json').bin['bmad-stella'] === 'tools/bmad-npx-wrapper.js',
  'package.json: bin points at the wrapper',
);

// Running the wrapper from another folder keeps that folder as cwd: `uninstall`
// without a TTY refuses with the --yes hint but reports nothing about the package dir,
// and `--help` works through the wrapper.
const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-npx-'));
const help = spawnSync(process.execPath, [WRAPPER, '--help'], { cwd: elsewhere, encoding: 'utf8' });
ok(help.status === 0 && /install/.test(help.stdout), 'wrapper: --help runs from another folder');
const un = spawnSync(process.execPath, [WRAPPER, 'uninstall', '--yes'], {
  cwd: elsewhere,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
ok(
  un.status === 0 && !fs.existsSync(path.join(REPO, '_bmad')),
  'wrapper: uninstall acts on the cwd, not the package folder',
);

console.log(`npx wrapper: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
