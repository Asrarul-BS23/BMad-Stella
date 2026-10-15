'use strict';

// Installer terminal look (stepper): boxes line up, every step settles to one line,
// the Next panel carries only the connector sentence (no command hints), and the
// silent twin prints nothing.

const { Writable } = require('node:stream');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const ui = require(path.join(REPO, 'tools', 'installer', 'lib', 'ui.js'));
const installer = require(path.join(REPO, 'tools', 'installer', 'lib', 'installer.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const strip = (s) => s.replaceAll(/\u001B\[[\d;]*m/g, ''); // eslint-disable-line no-control-regex

const capture = () => {
  let out = '';
  const stream = new Writable({
    write(chunk, enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  stream.isTTY = false;
  stream.columns = 100;
  return { stream, text: () => strip(out) };
};

// ---- box ----
const b = ui.box(['short', 'a much longer line that sets the width of the box here'], {
  title: 'Next',
});
ok(b.length === 4 && new Set(b.map((l) => [...l].length)).size === 1, 'box: all lines same width');
ok(
  b[0].startsWith('╭─ Next ') && b.at(-1).startsWith('╰') && b[1].startsWith('│  short'),
  'box: title, body, bottom',
);
ok([...ui.box(['x'])[0]].length === 48, 'box: minimum width applies');

// ---- steps ----
ok(
  ui.stepLabel(4, '6.12.2').startsWith('[4/5] BMad 6.12.2'),
  'step: BMad label carries the version',
);
ok(
  ui.stepLabel(1, '6.12.2').length === ui.stepLabel(5, '6.12.2').length,
  'step: labels padded to one width',
);

const c = capture();
const u = ui.createUi({ version: '2.0.0', bmadVersion: '6.12.2', stream: c.stream });
u.header('C:\\proj');
u.done(2, 'dev@stella.com (Ash)');
const s = u.spin(4, 'installing…');
s.update('still installing…');
s.succeed('installed (12s)');
u.dim('removed .bmad-core');
u.warn('gh not found');
u.spin(5, 'x').fail('boom');
u.next();
const t = c.text();
ok(
  /BMad-Stella 2\.0\.0 {2}· {2}BMad 6\.12\.2/.test(t) && /C:\\proj/.test(t),
  'ui: header shows version and folder',
);
ok(/\[2\/5\] JIRA\s+✔ dev@stella\.com \(Ash\)/.test(t), 'ui: done line');
ok(/\[4\/5\] BMad 6\.12\.2\s+✔ installed \(12s\)/.test(t), 'ui: spinner settles to ✔');
ok(/\[5\/5\] Stella layer\s+✖ boom/.test(t), 'ui: spinner fail line');
ok(/removed \.bmad-core/.test(t) && /! gh not found/.test(t), 'ui: dim and warn lines');
ok(
  /╭─ Next/.test(t) &&
    /Check your Claude account connectors:/.test(t) &&
    /Atlassian must be connected\./.test(t),
  'ui: Next panel text',
);
ok(!/stella-build|\/bmad|Settings → Connectors/.test(t), 'ui: no command hints in the output');
ok(
  ui.NEXT_TEXT.join(' ') === installer.NEXT_TEXT.join(' '),
  'ui: installer exposes the same Next text',
);

// ---- silent twin ----
const silent = ui.silentUi();
silent.header('x');
silent.done(1, 'y');
silent.spin(1, 'z').succeed('w');
silent.next();
ok(typeof silent.spin(2, 'a').fail === 'function', 'silent ui: full surface, no output');

// ---- layer detail / notes ----
const sum = {
  root: 'C:\\proj',
  skills: ['a', 'b', 'c', 'd', 'e'],
  hooks: ['f', 'g', 'h'],
  domainDocs: {
    status: 'fetched',
    files: ['x.md', 'y.md'],
    dir: 'C:\\proj\\_bmad-output\\stella\\domain-knowledge',
  },
  userHooks: { status: 'current' },
  gitignoreAdded: ['_bmad/'],
  created: [],
};
ok(
  installer.layerDetail(sum) === '5 skills · 3 hooks · permissions · 2 domain pages · user hooks',
  'detail: full line',
);
ok(
  installer.layerNotes(sum).join('|') ===
    '.gitignore: added _bmad/|domain docs → _bmad-output\\stella\\domain-knowledge',
  'notes: gitignore + domain folder',
);
sum.domainDocs = { status: 'skipped', reason: 'Other' };
sum.userHooks = { status: 'error' };
ok(
  installer.layerDetail(sum) === '5 skills · 3 hooks · permissions' &&
    /skipped: Other/.test(installer.layerNotes(sum).join('|')),
  'detail/notes: skipped docs, failed user hooks left out',
);

console.log(`installer ui: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
