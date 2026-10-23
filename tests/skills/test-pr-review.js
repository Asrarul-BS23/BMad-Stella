'use strict';

// Migration Task 8 — stella-pr-review skill: valid frontmatter, no v4 strings,
// the Guard section agrees with the real guard policy (allowed commands pass,
// forbidden ones are refused), folder/file names match the guard's paths module,
// and the Post-to-PR flow keeps its helper flags, exit codes and y/n rule.

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const SKILL_DIR = path.join(REPO, 'stella', 'skills', 'stella-pr-review');
const GUARD = path.join(REPO, 'stella', 'hooks', 'project', 'pr-review-guard', 'lib');
const policy = require(path.join(GUARD, 'policy.js'));
const paths = require(path.join(GUARD, 'paths.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
const checklist = fs.readFileSync(path.join(SKILL_DIR, 'checklist.md'), 'utf8');

// ---- frontmatter / hygiene ----
const fm = skill.match(/^---\n([\s\S]*?)\n---\n/);
ok(fm !== null, 'frontmatter present');
ok(fm && /^name:\s*stella-pr-review\s*$/m.test(fm[1]), 'frontmatter name = stella-pr-review');
ok(fm && /^description:/m.test(fm[1]), 'description present');
const V4 =
  /bmad-docs|\.bmad-core|bmad-core|devLoadAlwaysFiles|core-config|domainKnowledge\.location|execute-checklist|\*pr-review|Morgan|reviewer agent|review-pr\.md|pr-review-checklist/i;
ok(!V4.test(skill), 'skill: no v4 strings');
ok(!V4.test(checklist), 'checklist: no v4 strings');
ok(!skill.includes('\r\n') && !checklist.includes('\r\n'), 'LF line endings');
const files = fs.readdirSync(SKILL_DIR).sort();
ok(files.join(',') === 'SKILL.md,checklist.md', `folder holds SKILL.md + checklist.md (${files})`);

// ---- paths agree with the guard ----
const reviewer = paths.REVIEWER_LABEL; // _bmad-output/stella/reviewer
const scratch = paths.SCRATCH_LABEL; // _bmad-output/stella/reviewer/.scratch
const helper = paths.HELPER_LABEL; // _bmad/custom/stella/utils/pr-comments
ok(skill.includes(`${reviewer}/{repo}-pr{number}/`), 'skill: review folder = guard reviewer dir');
ok(skill.includes(`${scratch}/`), 'skill: scratch folder = guard scratch dir');
ok(skill.includes(`node ${helper} {folder}/findings.json`), 'skill: helper path = guard helper');
ok(skill.includes(`node ${helper} {folder}/findings.json --post`), 'skill: --post via helper');
ok(
  checklist.includes(`${reviewer}/`) && checklist.includes(`${scratch}/`),
  'checklist: guard paths',
);
ok(
  /project-context\/project\.md/.test(skill) && !/AGENTS\.md/.test(skill),
  'skill: context from project-context/, no AGENTS.md',
);
ok(/_bmad-output\/stella\/domain-knowledge\//.test(skill), 'skill: domain knowledge folder');
ok(
  /node _bmad\/custom\/stella\/utils\/jira-attachments \{KEY\}/.test(skill) &&
    /Exit 20: print its `message`, then fetch the ticket through the Atlassian MCP/.test(skill) &&
    !/Settings → Connectors/.test(skill),
  'skill: ticket via the token helper first, MCP as fallback, no connector hint',
);
ok(/`parent` in the manifest/.test(skill), 'skill: parent ticket read from the helper manifest');
ok(/read `checklist\.md` next to this skill/i.test(skill), 'skill: checklist evaluated inline');

// ---- every command the Guard section allows is accepted by the policy ----
const SHA = 'a'.repeat(40);
const allowed = [
  'gh auth status',
  'gh pr view https://github.com/o/r/pull/1 --json number,title,headRefOid',
  'gh pr diff https://github.com/o/r/pull/1',
  'gh pr checks https://github.com/o/r/pull/1',
  'git fetch origin pull/1/head',
  `git cat-file -t ${SHA}`,
  `git show ${SHA}:src/File.cs`,
  `git grep -n -e "term" ${SHA}`,
  `git grep -n -e "-dash" ${SHA}`,
  `git log --oneline ${SHA}..${SHA}`,
  `git diff ${SHA} ${SHA} --name-only`,
  `git diff ${SHA} ${SHA} -- src/File.cs`,
  `node ${helper} ${reviewer}/r-pr1/findings.json`,
  `node ${helper} ${reviewer}/r-pr1/findings.json --post`,
  `node ${helper} ${reviewer}/r-pr1/findings.json --post --submit`,
  'node -e "console.log(1+1)"',
  `cd C:/proj && gh pr view https://github.com/o/r/pull/1 --json number`,
];
for (const cmd of allowed) {
  const r = policy.decide('Bash', { command: cmd });
  ok(r.allow, `policy allows: ${cmd} (${r.reason || ''})`);
}

// ---- every command the Guard section forbids is refused ----
const forbidden = [
  'gh api repos/o/r/pulls/1',
  'gh pr comment https://github.com/o/r/pull/1 --body hi',
  'gh pr merge https://github.com/o/r/pull/1',
  'gh pr checkout 1',
  'git checkout main',
  'git switch main',
  'git add .',
  'git commit -m x',
  'git push',
  'git stash',
  'git reset --hard',
  'git diff main',
  `git diff ${SHA}`,
  'gh pr diff https://github.com/o/r/pull/1 | head',
  'gh pr view https://github.com/o/r/pull/1 > out.txt',
  'cat src/File.cs',
  'npm test',
  'node .bmad-core/utils/pr-comments bmad-docs/reviewer/r-pr1/findings.json',
];
for (const cmd of forbidden) {
  const r = policy.decide('Bash', { command: cmd });
  ok(!r.allow, `policy refuses: ${cmd}`);
}
ok(!policy.decide('Edit', { file_path: 'src/a.js' }).allow, 'policy refuses Edit');
ok(
  policy.decide('Write', { file_path: `C:/proj/${reviewer}/r-pr1/review.md` }).allow,
  'policy allows Write of review.md in the reviewer folder',
);
ok(
  !policy.decide('Write', { file_path: 'C:/proj/src/a.js' }).allow,
  'policy refuses Write outside',
);

// ---- Post to PR flow ----
ok(/\(y\/n\)/.test(skill), 'post: asks y/n once');
ok(/`--submit` only if the user literally types "submit"/.test(skill), 'post: --submit rule');
ok(/exit 5/.test(skill) && /Exit 4/.test(skill), 'post: helper exit codes 4 and 5');
ok(/typing `again`/.test(skill), 'same-SHA skip with again');
ok(/\/stella-pr-review/.test(skill), 'skill names its own command');
ok(/by stella-pr-review/.test(skill), 'report header credits stella-pr-review');
ok(!/caveman/i.test(skill), 'no caveman for the reviewer');

// ---- checklist content ----
ok(
  (checklist.match(/^- \[ \]/gm) || []).length === 18,
  'checklist: 17 validation items + final confirmation',
);
ok(/All 10 universal criteria/.test(checklist), 'checklist: criteria item kept');

console.log(
  `pr-review skill: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
