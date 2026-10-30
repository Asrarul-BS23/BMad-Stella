'use strict';

// Installer terminal look (tree design): header with right-aligned BMad version,
// `◆ Label … n/5` step lines, `│ ✓/▲/↻` rows, right-aligned timings, `└ Ready.`,
// the Next panel with the connector text only, and the silent twin.

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

const capture = (columns = 82) => {
  let out = '';
  const stream = new Writable({
    write(chunk, enc, cb) {
      out += chunk.toString();
      cb();
    },
  });
  stream.isTTY = false;
  stream.columns = columns;
  return { stream, text: () => strip(out) };
};

// ---- helpers ----
ok(strip(ui.justify('left', 'right', 20)).length === 20, 'justify: fills to the width');
ok(
  ui.justify('a'.repeat(30), 'b', 20).endsWith('  b'),
  'justify: keeps a two-space gap when too long',
);
const p = ui.panel('Next: connect Atlassian', ['line one', 'line two'], 60).map(strip);
ok(
  p.length === 5 && new Set(p.map((l) => [...l].length)).size === 1,
  'panel: five rows, same width',
);
ok(
  p[1].includes('◆ Next: connect Atlassian') && p[2].includes('  line one'),
  'panel: title + indented text',
);
ok(
  ui.stepTitle(4, '6.12.2') === 'BMad 6.12.2' && ui.stepTitle(5) === 'Stella layer',
  'stepTitle: BMad carries the version',
);

// ---- full render ----
const c = capture();
const u = ui.createUi({ version: '2.0.0', bmadVersion: '6.12.2', stream: c.stream });
ok(u.width === 80, 'width: columns minus margin, capped');
u.header('C:\\proj');
u.step(1);
const s1 = u.spin('checking…');
s1.succeed('node 24.12.0   uv 0.12.23');
u.line('info', 'Existing install found — re-installing (_bmad-output is kept)');
u.gap();
u.step(2);
u.line('ok', 'Signed in as Ash');
u.gap();
u.step(4);
const s4 = u.spin('installing…');
s4.update('still…');
s4.succeed('Installed', '12s');
u.gap();
u.step(5);
u.spin('x').fail('boom');
u.line('warn', 'Domain docs skipped — domain-knowledge/ already has files');
u.cont('delete the folder and re-run to refresh');
u.line('note', '.gitignore  added _bmad/');
u.end('SLS is set up in proj');
const t = c.text();
const lines = t.split('\n');

ok(
  /✦ BMad·Stella {2}v2\.0\.0 +powered by BMad 6\.12\.2$/m.test(t) && /^ {2}C:\\proj$/m.test(t),
  'header: name, version, right-aligned BMad version, folder',
);
ok(
  lines.some((l) => /^◆ Checks +1\/5$/.test(l) && l.length === 80),
  'step: ◆ label with right-aligned 1/5 at the width',
);
ok(
  /^◆ BMad 6\.12\.2 +4\/5$/m.test(t) && /^◆ Stella layer +5\/5$/m.test(t),
  'step: BMad and Stella layer titles',
);
ok(/^│ ✓ node 24\.12\.0 {3}uv 0\.12\.23$/m.test(t), 'spin: settles to a ✓ row');
ok(
  lines.some((l) => /^│ ✓ Installed +12s$/.test(l) && l.length === 80),
  'spin: right-aligned timing',
);
ok(
  /^│ ↻ Existing install found/m.test(t) && /^│ ✓ Signed in as Ash$/m.test(t),
  'rows: info and ok marks',
);
ok(/^│ ✗ boom$/m.test(t), 'spin: fail row');
ok(
  /^│ ▲ Domain docs skipped — domain-knowledge\/ already has files\n│ {3}delete the folder and re-run to refresh$/m.test(
    t,
  ),
  'rows: warn + continuation',
);
ok(/^│ {3}\.gitignore {2}added _bmad\/$/m.test(t), 'rows: note row without a mark');
ok((t.match(/^│$/gm) || []).length === 3, 'gap: bare │ rows between steps');
ok(/^└ Ready\. {2}SLS is set up in proj$/m.test(t), 'end: Ready line');
ok(!/┌─+┐/.test(t) && !/Next:/.test(t), 'next: no panel after the Ready line');
ok(!/stella-build|\/bmad|Settings → Connectors/.test(t), 'no command hints anywhere');
ok(ui.NEXT_TEXT === undefined && installer.NEXT_TEXT === undefined, 'no Next text exported');

// ---- questions ----
const styled = ui.styleQuestions([{ type: 'confirm', name: 'x', message: 'Use them as is?' }]);
ok(
  strip(styled[0].prefix) === '│ ◇' &&
    strip(styled[0].message) === 'Use them as is?' &&
    styled[0].name === 'x',
  'questions: rendered as │ ◇ rows, fields kept',
);

// ---- silent twin ----
const silent = ui.silentUi();
silent.header('x');
silent.step(1);
silent.line('ok', 'y');
silent.spin('z').succeed('w', '1s');
silent.cont('c');
silent.gap();
silent.end('e');
silent.failed('f');
ok(typeof silent.spin('a').fail === 'function', 'silent ui: full surface, no output');

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
  gitignoreAdded: ['_bmad/', '_bmad-output/'],
  created: ['domain-knowledge', 'reviewer', 'bmad-logs', 'cache/jira'],
};
ok(
  installer.layerDetail(sum) === '5 skills   3 hooks   permissions   2 domain pages   user hooks',
  'detail: full line',
);
ok(
  installer.layerNotes(sum).length === 0,
  'notes: nothing printed for .gitignore lines, created folders or fetched domain docs',
);
sum.domainDocs = {
  status: 'skipped',
  reason: 'domain-knowledge already has files (delete the folder and re-run to refresh)',
};
sum.userHooks = { status: 'error' };
const notes = installer.layerNotes(sum);
ok(
  installer.layerDetail(sum) === '5 skills   3 hooks   permissions',
  'detail: skipped docs + failed user hooks left out',
);
ok(!notes.some((n) => /Domain docs skipped/.test(n.text)), 'notes: docs already present → silent');
sum.domainDocs = { status: 'skipped', reason: 'no Confluence page for this project (Other)' };
ok(
  !installer.layerNotes(sum).some((n) => /Domain docs skipped/.test(n.text)),
  'notes: every skip reason is silent',
);
sum.removedBmadSkills = ['bmad-build'];
ok(
  !installer.layerNotes(sum).some((n) => /removed bmad-build/.test(n.text)),
  'notes: removed official skills not shown',
);

console.log(`installer ui: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
