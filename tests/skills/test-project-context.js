'use strict';

// stella-project-context — writes one per-machine file of facts,
// _bmad-output/stella/project-context/context.md, that stella-build loads beside the memory
// files. Checks: frontmatter, the four files, one output and its budget, sections in order,
// facts only, nothing already known, the root rule, setup and refresh, the check script
// wiring, no questions, and the installer copying it.

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const SKILL = path.join(REPO, 'stella', 'skills', 'stella-project-context');
const C = require(path.join(REPO, 'tools', 'installer', 'lib', 'constants.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

// ---- files ----
const files = [
  'SKILL.md',
  'references/template.md',
  'references/best-practices.md',
  'scripts/check-context.js',
];
const listed = [];
const walk = (dir, prefix) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name), `${prefix}${e.name}/`);
    else listed.push(`${prefix}${e.name}`);
  }
};
walk(SKILL, '');
ok(
  listed.sort().join(',') === [...files].sort().join(','),
  `files: exactly the four files (${listed.join(', ')})`,
);

const skill = read(SKILL, 'SKILL.md');
const template = read(SKILL, 'references', 'template.md');
const practices = read(SKILL, 'references', 'best-practices.md');
const docs = read(REPO, 'docs', 'project-context.md');
for (const [name, text] of [
  ['SKILL.md', skill],
  ['template.md', template],
  ['best-practices.md', practices],
]) {
  ok(!text.includes('\r\n'), `${name}: LF line endings`);
  ok(!/bmad-docs|\.bmad-core|BMad:caveman/.test(text), `${name}: no v4 strings`);
}

// ---- frontmatter ----
const fm = skill.match(/^---\n([\s\S]*?)\n---\n/);
ok(fm !== null, 'frontmatter: block present');
ok(fm && /^name: stella-project-context$/m.test(fm[1]), 'frontmatter: name equals folder');
ok(fm && /\/stella-project-context/.test(fm[1]), 'frontmatter: names the slash command');
ok(
  fm && /^disable-model-invocation: true$/m.test(fm[1]),
  'frontmatter: typed command or installer only',
);

// ---- one output, one budget ----
const OUT = '_bmad-output/stella/project-context/context.md';
ok(skill.includes(OUT) && template.includes(OUT), 'output: context.md under _bmad-output/stella');
ok(!/project\.md|architecture\.md/.test(skill + template), 'output: the two old files are gone');
ok(/at most 60 lines/.test(skill) && /at most 60 lines/.test(template), 'budget: 60 lines');
ok(/\*\*One write:\*\* `\{context-dir\}\/context\.md`/.test(skill), 'guard: one write');
ok(!/CLAUDE\.md` line|append `@/.test(skill), 'guard: no CLAUDE.md write');

// ---- sections in order, nothing else ----
const order = ['## Where things are', '## Layers', '## Copy the shape from'];
let last = -1;
let inOrder = true;
for (const h of order) {
  const i = template.indexOf(h);
  if (i === -1 || i < last) inOrder = false;
  last = i;
}
ok(inOrder, 'template: three sections in order');
for (const gone of [
  '## Policy',
  '## Conventions',
  '## Known pitfalls',
  '## Running and verifying',
  '## Request flow',
  '## Orientation',
]) {
  ok(!template.includes(gone), `template: no ${gone.slice(3)} section`);
}
ok(/Omit a section with nothing to say/.test(template), 'template: empty sections omitted');
ok(/Verified YYYY-MM-DD against <short sha>/.test(template), 'template: provenance line');
ok(/Without git, `<short sha>` is `none`/.test(template), 'template: provenance without git');

// ---- facts only ----
ok(
  /\*\*Facts only\.\*\*/.test(template) && /\*\*Facts only\.\*\*/.test(skill),
  'facts: stated in template and skill',
);
ok(/a fact here can never contradict them/.test(template), 'facts: reason given');
ok(/## Facts, not rules/.test(practices), 'facts: practices section');
const fragment = template.slice(template.indexOf('## Worked fragment'));
ok(
  !/\b(?:never|always|must|should|don't)\b/i.test(fragment.replaceAll(/`[^`\n]*`/g, '')),
  'facts: the worked fragment states no rule',
);

// ---- nothing already known ----
for (const src of [
  '_bmad-output/stella/memory/domain-map.md',
  '_bmad-output/stella/memory/patterns.md',
]) {
  ok(skill.includes(src) && practices.includes(src), `known: ${src} named as already loaded`);
}
ok(/\*\*Nothing already known\.\*\*/.test(skill), 'known: guardrail');
ok(/1\. \*\*Read what is already known\.\*\*/.test(skill), 'known: setup reads sources first');

// ---- accuracy ----
ok(/\*\*Every path cited exists\*\*/.test(skill), 'accuracy: paths verified');
ok(
  /"only", "none", "every" or a specific value is written only after reading the line that proves it/.test(
    skill,
  ),
  'accuracy: strong claims need the proving line',
);

// ---- root rule ----
ok(
  /The working directory is a git repository root → `\{repo\}` is the working directory/.test(
    skill,
  ),
  'root: git root here',
);
ok(
  /Several git roots one level down: `\{repo\}` is the main repo, the one named like the project in `_bmad-output\/stella\/project\.json`, else the one the others depend on\. Say which and why\./.test(
    skill,
  ),
  'root: main repo chosen, no question',
);
ok(/No git anywhere → `\{repo\}` is the working directory/.test(skill), 'root: no git');

// ---- modes ----
ok(/No `context\.md` → setup\. `context\.md` exists → refresh\./.test(skill), 'modes: detected');
ok(!/## Record|## Audit/.test(skill), 'modes: record and audit removed');
ok(/\*\*No questions\.\*\*/.test(skill) && !/ask once/i.test(skill), 'modes: no questions at all');
ok(/git log --diff-filter=DR --name-only <sha>\.\.HEAD/.test(skill), 'refresh: renames since sha');
ok(/a line the runner deleted stays deleted/.test(skill), 'refresh: runner deletions kept');
ok(/show a diff/.test(skill), 'refresh: shows a diff');

// ---- scan ----
ok(/Up to 500 files/.test(skill) && /in parallel/.test(skill), 'scan: size rule');

// ---- check script wiring ----
const CHECK_CMD = 'node .claude/skills/stella-project-context/scripts/check-context.js';
ok(skill.includes(`run (do not read) \`${CHECK_CMD}\``), 'check: command named, run not read');
ok(/Do not modify the command\./.test(skill), 'check: command fixed');
ok(/the step ends only on `ok`/.test(skill), 'check: ends only on ok');
ok(
  /If the command itself cannot run, report its output and stop/.test(skill),
  'check: cannot-run rule',
);
ok(/quote the check's `ok` line/.test(skill), 'check: close quotes ok');

// ---- git ----
ok(/\*\*Git is read only:\*\*/.test(skill), 'guard: git read only');
ok(!/\blead\b/i.test(skill + template), 'no lead wording');

// ---- docs ----
ok(docs.includes(OUT), 'docs: one file named');
ok(/facts only, never rules/.test(docs), 'docs: facts only');

// ---- installer ----
ok(C.STELLA_SKILLS.includes('stella-project-context'), 'installer: in STELLA_SKILLS');

console.log(
  `project-context: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
