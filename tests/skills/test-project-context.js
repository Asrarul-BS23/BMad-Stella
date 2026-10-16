'use strict';

// stella-project-context — a lead-run plain skill that writes project-context/{project,
// architecture}.md for stella-build. Checks: frontmatter, references present, the two
// output files and their budgets, section order, the four modes and their detection,
// no git policy, the guardrails, and the installer copying it.

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
const V4 =
  /bmad-docs|\.bmad-core|bmad-core|BMad:agents|BMad:tasks|BMad:caveman|Dev Agent Record|core-config\.yaml/;

// ---- files ----
const files = ['SKILL.md', 'references/template.md', 'references/best-practices.md'];
for (const f of files) ok(fs.existsSync(path.join(SKILL, f)), `files: ${f} exists`);
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
  `files: folder holds exactly the three files (${listed.join(', ')})`,
);

const skill = read(SKILL, 'SKILL.md');
const template = read(SKILL, 'references', 'template.md');
const practices = read(SKILL, 'references', 'best-practices.md');
for (const [name, text] of [
  ['SKILL.md', skill],
  ['template.md', template],
  ['best-practices.md', practices],
]) {
  ok(!text.includes('\r\n'), `${name}: LF line endings`);
  ok(!V4.test(text), `${name}: no v4 strings`);
}

// ---- frontmatter ----
const fm = skill.match(/^---\n([\s\S]*?)\n---\n/);
ok(fm !== null, 'frontmatter: block present');
ok(fm && /^name: stella-project-context$/m.test(fm[1]), 'frontmatter: name equals folder');
ok(fm && /^description: >/m.test(fm[1]), 'frontmatter: description present');
ok(fm && /\/stella-project-context/.test(fm[1]), 'frontmatter: trigger names the slash command');

// ---- outputs and budgets ----
ok(skill.includes('project-context/project.md'), 'output: project.md path');
ok(skill.includes('project-context/architecture.md'), 'output: architecture.md path');
ok(/≤ 60 lines/.test(skill) && /≤ 90 lines/.test(skill), 'output: budgets 60 and 90 in SKILL.md');
ok(/## project\.md \(≤ 60 lines\)/.test(template), 'template: project.md budget');
ok(/## architecture\.md \(≤ 90 lines\)/.test(template), 'template: architecture.md budget');
ok(/`project\.md` ≤ 60 lines, `architecture\.md` ≤ 90/.test(practices), 'practices: budgets');
ok(/never raise the budget/i.test(practices), 'practices: budget never raised');
ok(/Verified YYYY-MM-DD against <short sha>/.test(template), 'template: provenance line');
ok(/git rev-parse --short HEAD/.test(skill), 'skill: SHA from git rev-parse');
ok(!/AGENTS\.md` block|<!-- bmad:context -->/.test(skill), 'output: not an AGENTS.md block');

// ---- sections in order ----
const order = (text, heads) => {
  let last = -1;
  for (const h of heads) {
    const i = text.indexOf(h);
    if (i === -1 || i < last) return h;
    last = i;
  }
  return null;
};
const projectSections = [
  '## Orientation',
  '## Policy',
  '## Where things are',
  '## Running and verifying',
  '## Conventions that differ from defaults',
  '## Known pitfalls',
];
const archSections = [
  '## Layers',
  '## Request flow',
  '## Data',
  '## Wiring',
  '## Background and integrations',
  '## Cross-component rules',
  '## Canonical files',
];
ok(order(template, projectSections) === null, `template: project.md sections in order`);
ok(order(template, archSections) === null, `template: architecture.md sections in order`);
ok(
  template.indexOf('## project.md') < template.indexOf('## architecture.md'),
  'template: project.md described before architecture.md',
);
ok(/never write an empty one/i.test(template), 'template: empty sections omitted');
ok(/Pointers only, never pasted code/.test(template), 'template: canonical files are pointers');

// ---- policy: six kinds, no git ----
for (const kind of [
  'Secrets',
  'Frozen and dead areas',
  'Generated and binary files',
  'Lead-approval areas',
  'External systems',
  'Same-PR obligations',
]) {
  ok(template.includes(kind), `policy: kind "${kind}" in template`);
}
ok(/No branch, commit, push or PR rules/.test(template), 'policy: template excludes git rules');
ok(/No git workflow rules in Policy/.test(skill), 'policy: SKILL guardrail excludes git rules');
ok(
  /Git workflow rules: branches, commit format, push, PR/.test(practices),
  'policy: practices exclude git',
);
const policyBlock = template.slice(
  template.indexOf('## Policy'),
  template.indexOf('## Where things are'),
);
ok(
  !/branch from|commit subject|pull request into/i.test(policyBlock),
  'policy: no git wording in the Policy rule',
);
ok(!/## Ownership/.test(template), 'template: no Ownership section');
ok(/People: lead names, module owners/.test(practices), 'practices: people excluded');

// ---- modes ----
for (const mode of ['## Setup', '## Refresh', '## Record', '## Audit']) {
  ok(skill.includes(mode), `modes: ${mode} section`);
}
ok(/The mode is optional/.test(skill), 'modes: optional');
ok(/has no `project\.md` +\| setup/.test(skill), 'modes: no folder → setup');
ok(/describes a mistake an agent made +\| record/.test(skill), 'modes: mistake → record');
ok(/nothing else said +\| refresh/.test(skill), 'modes: folder present → refresh');
ok(/`audit` is never auto-picked/.test(skill), 'modes: audit only by name');
ok(/git log --diff-filter=DR --name-only <sha>\.\.HEAD/.test(skill), 'refresh: diff since SHA');
ok(/Never re-ask what the first run settled/.test(skill), 'refresh: no re-asking');
ok(/Show a \*\*diff\*\*, not the full files/.test(skill), 'refresh: shows a diff');
ok(/not in history \(squash, rebase\)/.test(skill), 'refresh: lost SHA fallback');
ok(/Audit ends smaller or equal/.test(skill), 'audit: smaller or equal');
ok(/at most four questions/.test(skill), 'record: four questions');
ok(/propose the check first/.test(skill), 'record: check before line');

// ---- guardrails ----
ok(/Only two files are ever written/.test(skill), 'guard: only two files written');
ok(
  /`CLAUDE\.md`, `AGENTS\.md`, rule files, docs and source are read, never edited/.test(skill),
  'guard: existing files never edited',
);
ok(/Every path cited exists/.test(skill), 'guard: paths verified');
ok(/Code and tests beat docs/.test(skill), 'guard: code beats docs');
ok(/Pitfalls come only from observed mistakes/.test(skill), 'guard: pitfalls from evidence');
ok(
  /Nothing already in an auto-loaded file is repeated/.test(skill),
  'guard: no duplication of CLAUDE.md',
);
ok(/never `git add`, `git commit`/.test(skill), 'guard: never commits');
ok(/No writes until step 5/.test(skill), 'setup: no early writes');
ok(/at most eight questions/.test(skill), 'setup: interview capped at eight');
ok(
  /read-only subagents/i.test(skill) && /in parallel/.test(skill),
  'setup: parallel read-only subagents',
);
for (const l of ['`pointer`', '`carry`', '`contradicts`', '`skip`']) {
  ok(skill.includes(l) && practices.includes(l), `ledger: ${l} in skill and practices`);
}
ok(/persistent_facts/.test(skill), 'close: tells how stella-build loads it');
ok(/commit `project-context\/` themselves/.test(skill), 'close: lead commits');
ok(/Caveman full for chat output/.test(skill), 'style: caveman chat, files exact');

// ---- installer ----
ok(C.STELLA_SKILLS.includes('stella-project-context'), 'installer: in STELLA_SKILLS');
ok(C.STELLA_SKILLS.length === 6, 'installer: six Stella skills');

console.log(
  `project-context: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
