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
  /project-context\/context\.md/.test(skill) && !/AGENTS\.md/.test(skill),
  'skill: context from project-context/, no AGENTS.md',
);
ok(!/domain-knowledge/.test(skill), 'skill: no domain-knowledge grep');
ok(
  /\n7\. Read `_bmad-output\/stella\/project-context\/context\.md`/.test(skill) &&
    !/Load context first/.test(skill),
  'skill: context read as step 7, after the fetch steps, not in the Guard',
);
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

// ---- design and dependency checks (from addyosmani/agent-skills code-review-and-quality) ----
ok(
  /Dependencies: a new package the existing stack already covers; a manifest change without its lockfile\./.test(
    skill,
  ),
  'crit 5: dependency review',
);
ok(
  /Feature logic placed in a shared module; a near-duplicate of a helper that already exists/.test(
    skill,
  ),
  'crit 8: shared-module logic and duplicate helpers',
);
ok(
  /a test would fail if the new condition were inverted/.test(skill),
  'crit 9: inverted-condition test check',
);
ok(
  /a new condition bolted onto an unrelated flow; a refactor that moves complexity instead of removing it; a silent fallback that hides an unclear invariant; a file grown past ~1000 lines without splitting; code left unused by this change\./.test(
    skill,
  ),
  'crit 10: structural smells',
);
ok(
  /Fix: \{specific action: the helper to reuse, the sibling to mirror, or the restructuring to make\}/.test(
    skill,
  ),
  'report: Fix names the concrete move',
);
ok(
  /A design finding is a Blocker only when the change makes the structure worse/.test(skill),
  'rules: design blocker standard',
);

// ---- checklist content ----
ok((checklist.match(/^- \[ \]/gm) || []).length === 6, 'checklist: 6 items');
ok(!/\[\[LLM:/.test(checklist), 'checklist: no v4 LLM block');
ok(
  !/^- NEVER, even if it looks harmless/m.test(skill) &&
    /Anything else is blocked by the `pr-review-guard` hook while this skill is active\./.test(
      skill,
    ),
  'guard: allowed list plus one hook line, no NEVER list',
);
ok(/All 10 universal criteria/.test(checklist), 'checklist: criteria item kept');
ok(
  /dependencies \(5\), the inverted-condition test check \(9\) and the structural smells \(8, 10\)/.test(
    checklist,
  ),
  'checklist: new checks named',
);

console.log(
  `pr-review skill: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
