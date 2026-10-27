'use strict';

// stella-project-context — a plain skill anyone runs. It writes project-context/{project,
// architecture}.md and one import line in CLAUDE.md. Checks: frontmatter, references present,
// the two output files and their budgets, section order, the root rule (git root, one level
// down, no git), the four modes and their detection, no questions and the marked-line cap,
// no git policy, no role wording, the guardrails, and the installer copying it.

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
const files = [
  'SKILL.md',
  'references/template.md',
  'references/best-practices.md',
  'scripts/check-context.js',
];
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
  `files: folder holds exactly the four files (${listed.join(', ')})`,
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
  ok(!V4.test(text), `${name}: no v4 strings`);
}

// ---- frontmatter ----
const fm = skill.match(/^---\n([\s\S]*?)\n---\n/);
ok(fm !== null, 'frontmatter: block present');
ok(fm && /^name: stella-project-context$/m.test(fm[1]), 'frontmatter: name equals folder');
ok(fm && /^description: >/m.test(fm[1]), 'frontmatter: description present');
ok(fm && /\/stella-project-context/.test(fm[1]), 'frontmatter: trigger names the slash command');
ok(fm && /Anyone runs it/.test(fm[1]), 'frontmatter: anyone runs it');
ok(fm && /^disable-model-invocation: true$/m.test(fm[1]), 'frontmatter: typed command only');

// ---- outputs and budgets ----
ok(
  skill.includes('_bmad-output/stella/project-context/'),
  'output: per-machine folder under _bmad-output',
);
ok(
  /\{context-dir\}\/project\.md/.test(skill) && /\{context-dir\}\/architecture\.md/.test(skill),
  'output: both files named',
);
ok(/≤ 60 lines/.test(skill) && /≤ 90 lines/.test(skill), 'output: budgets 60 and 90 in SKILL.md');
ok(/## project\.md \(≤ 60 lines\)/.test(template), 'template: project.md budget');
ok(/## architecture\.md \(≤ 90 lines\)/.test(template), 'template: architecture.md budget');
ok(/`project\.md` ≤ 60 lines, `architecture\.md` ≤ 90/.test(practices), 'practices: budgets');
ok(/never raise the budget/i.test(practices), 'practices: budget never raised');
ok(/Verified YYYY-MM-DD against <short sha>/.test(template), 'template: provenance line');
ok(/Without git, `<short sha>` is `none`/.test(template), 'template: provenance without git');
ok(/git rev-parse --short HEAD/.test(skill), 'skill: SHA from git rev-parse');
ok(!/AGENTS\.md` block|<!-- bmad:context -->/.test(skill), 'output: not an AGENTS.md block');

// ---- two writes, no CLAUDE.md ----
ok(/Two writes only/.test(skill), 'guard: two writes only');
ok(!/append `@/.test(skill) && !/CLAUDE\.md` line/.test(skill), 'guard: no CLAUDE.md write');
ok(/git-ignored/.test(skill), 'output: per machine, git-ignored');

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
  'root: several repos, main repo chosen, no question',
);
ok(
  /each other repo gets one line under Background and integrations/.test(skill),
  'root: supporting repos one line each',
);
ok(/No git anywhere → `\{repo\}` is the working directory/.test(skill), 'root: no git at all');
ok(
  !/HALT/.test(skill.slice(skill.indexOf('## Resolution'), skill.indexOf('## Style'))),
  'root: no halt',
);
ok(/`git ls-files` with git, a directory walk without/.test(skill), 'scan: count without git');
ok(
  /Up to 500 files/.test(skill) && /\*\*More:\*\* fan out read-only subagents/.test(skill),
  'scan: size rule',
);
ok(/in parallel/.test(skill), 'scan: parallel subagents');

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
  'Approval areas',
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

// ---- no questions, marked lines ----
ok(/## Marked lines/.test(template), 'marked: template section');
ok(/- Unverified: <the claim>\. Edit this line or delete it\./.test(template), 'marked: shape');
ok(/At most three across both files/.test(template), 'marked: cap in template');
ok(/at most three across both files/.test(skill), 'marked: cap in skill');
ok(/\*\*No questions\.\*\*/.test(skill), 'guard: no questions');
ok(
  /### 3\. Mark the gaps/.test(skill) && /Nothing is asked\./.test(skill),
  'setup: gaps are marked',
);
ok(!/Interview|interview/.test(skill), 'setup: no interview');
ok(!/eight questions|Wait for approval|wait for approval/.test(skill), 'setup: no approval wait');
ok(/No questions/.test(docs), 'docs: no questions');

// ---- no role wording ----
for (const [name, text] of [
  ['SKILL.md', skill],
  ['template.md', template],
  ['docs', docs],
]) {
  ok(!/\blead\b/i.test(text), `${name}: no lead wording`);
}
ok(/the runner sees where every instruction went/.test(skill), 'ledger: addressed to the runner');

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
ok(/or there is no git, say so and fall back/.test(skill), 'refresh: no-git fallback');
ok(/Show a \*\*diff\*\*, not the full files/.test(skill), 'refresh: shows a diff');
ok(/not in history \(squash, rebase\)/.test(skill), 'refresh: lost SHA fallback');
ok(
  /Start from the current files, not from scratch/.test(skill),
  'refresh: starts from current files',
);
ok(/a line the runner deleted stays deleted/.test(skill), 'refresh: runner deletions survive');
ok(
  /no longer starts with `Unverified:` is an ordinary line/.test(skill),
  'refresh: edited marks become ordinary lines',
);
ok(/refresh re-verifies every line/.test(template), 'template: provenance says re-verifies');
ok(!/edits are replaced on refresh/.test(template), 'template: no replace-on-refresh wording');
ok(/keep the three that would most change agent behaviour/.test(skill), 'marked: priority rule');
ok(/or `audit` without `project\.md`/.test(skill), 'modes: audit without files surfaced');
ok(/a missing mistake or correct form/.test(skill), 'guard: record question allowed');
ok(/Audit ends smaller or equal/.test(skill), 'audit: smaller or equal');
ok(/ask once for both; otherwise ask nothing/.test(skill), 'record: one question at most');
ok(/name the check in the reply/.test(skill), 'record: names the mechanical check');

// ---- guardrails ----
ok(/Every path cited exists/.test(skill), 'guard: paths verified');
ok(/Code and tests beat docs/.test(skill) && /the code wins/.test(skill), 'guard: code wins');
ok(/Pitfalls come only from observed mistakes/.test(skill), 'guard: pitfalls from evidence');
ok(
  /Nothing already in an auto-loaded file is repeated/.test(skill),
  'guard: no duplication of CLAUDE.md',
);
ok(
  /\*\*Git is read only:\*\*/.test(skill) && /No `git add`, `git commit`/.test(skill),
  'guard: git read only',
);
ok(/No writes until step 4/.test(skill), 'setup: no early writes');
ok(/the runner's auto memory/.test(skill), 'assess: runner memory is a source');
for (const l of ['`pointer`', '`carry`', '`contradicts`', '`skip`']) {
  ok(skill.includes(l) && practices.includes(l), `ledger: ${l} in skill and practices`);
}
ok(/persistent_facts/.test(skill), 'close: tells how stella-build loads it');
ok(/They stay on this machine; nothing to commit\./.test(skill), 'close: nothing to commit');
ok(!/caveman/i.test(skill), 'style: no caveman');

// ---- check script wiring ----
const CHECK_CMD = 'node .claude/skills/stella-project-context/scripts/check-context.js';
ok(skill.includes(`run (do not read) \`${CHECK_CMD}\``), 'check: command named, run not read');
ok(/Do not modify the command\./.test(skill), 'check: command fixed');
ok(/the step ends only on `ok`/.test(skill), 'check: ends only on ok');
ok(
  /If the command itself cannot run, report its output and stop/.test(skill),
  'check: cannot-run rule',
);
ok(
  (skill.match(/Run the check script as in setup step 4\./g) || []).length === 3,
  'check: refresh, record and audit run it',
);
ok(/The check script's `ok` line, quoted\./.test(skill), 'check: close quotes ok');
ok(/A check script verifies both files/.test(docs), 'docs: check script named');
ok(/^Contents: Marked lines/m.test(template), 'template: table of contents');

// ---- one term for the person ----
ok(/The runner → the person who invoked this skill/.test(skill), 'term: runner defined');
ok(
  /The only question this skill ever asks is in `record`/.test(skill),
  'guard: record is the only question',
);
for (const [name, text] of [
  ['SKILL.md', skill],
  ['template.md', template],
  ['best-practices.md', practices],
]) {
  ok(
    !/a human|whoever runs|the person who ran|a developer reported/i.test(text),
    `${name}: one term for the runner`,
  );
}
ok((skill.match(/\bnever\b/gi) || []).length <= 9, 'style: never used sparingly');

// ---- installer ----
ok(C.STELLA_SKILLS.includes('stella-project-context'), 'installer: in STELLA_SKILLS');
ok(C.STELLA_SKILLS.length === 6, 'installer: six Stella skills');

console.log(
  `project-context: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
