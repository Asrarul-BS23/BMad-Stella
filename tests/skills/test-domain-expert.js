'use strict';

// Migration Task 9 — stella-domain-expert (Sage) as a plain skill: valid frontmatter,
// no v4 strings, no Confluence/connector/credential dependency (docs are fetched by the
// installer), the seven commands, the strict knowledge-base rule, the v6 paths, and the
// onboarding steps.

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const DIR = path.join(REPO, 'stella', 'skills', 'stella-domain-expert');

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

const skill = fs.readFileSync(path.join(DIR, 'SKILL.md'), 'utf8');
const onboard = fs.readFileSync(path.join(DIR, 'onboard.md'), 'utf8');

// ---- frontmatter / hygiene ----
const fm = skill.match(/^---\n([\s\S]*?)\n---\n/);
ok(fm !== null, 'frontmatter present');
ok(fm && /^name:\s*stella-domain-expert\s*$/m.test(fm[1]), 'frontmatter name = folder');
ok(fm && /^description:/m.test(fm[1]), 'description present');
const V4 =
  /bmad-docs|\.bmad-core|bmad-core|core-config|architectureFolderUrl|domainKnowledge\.|BMad:caveman|Atlassian MCP|domain-expert-onboard/;
ok(!V4.test(skill), 'skill: no v4 strings');
ok(!V4.test(onboard), 'onboard: no v4 strings');
ok(!skill.includes('\r\n') && !onboard.includes('\r\n'), 'LF line endings');
const files = fs.readdirSync(DIR).sort();
ok(files.join(',') === 'SKILL.md,onboard.md', `folder holds SKILL.md + onboard.md (${files})`);

// ---- no fetch in the skill (user decision: installer fetches once) ----
const FETCH =
  /reload|getConfluencePage|getConfluencePageDescendants|mcp__|connector|JIRA_API_TOKEN|\.bmad-tokens|project\.json|Confluence client/i;
ok(!FETCH.test(skill), 'skill: no reload / connector / credential references');
ok(!FETCH.test(onboard), 'onboard: no reload / connector / credential references');
ok(
  /delete `_bmad-output\/stella\/domain-knowledge\/` and re-run the Stella installer/.test(skill),
  'skill: refresh instruction (delete folder, re-run installer)',
);

// ---- paths ----
ok(skill.includes('_bmad-output/stella/domain-knowledge/'), 'skill: domain-knowledge folder');
ok(
  /project-context\//.test(skill) && !/AGENTS\.md/.test(skill),
  'skill: project-context/ as technical reference, no AGENTS.md',
);
ok(/stella-project-context/.test(skill), 'skill: names the skill that writes project-context/');
ok(
  /Folder missing or empty/.test(skill) && /Continue/.test(skill),
  'skill: empty folder → warn and continue',
);

// ---- commands ----
for (const cmd of ['*ask', '*explain', '*decide', '*onboard', '*search', '*status', '*exit']) {
  ok(skill.includes(`\`${cmd}`), `skill: command ${cmd} documented`);
}
ok(/treated as `\*ask`/.test(skill), 'skill: freeform question = *ask');
ok(/read `onboard\.md` next to this skill/.test(skill), 'skill: *onboard reads onboard.md');
ok(/caveman skill with `stop`/.test(skill), 'skill: *exit stops caveman');
ok(/Caveman full/.test(skill), 'skill: caveman full on');

// ---- strict knowledge-base rule ----
ok(/ABSOLUTE RULE/.test(skill), 'rule: ABSOLUTE RULE section');
ok(
  /FORBIDDEN from scanning, grepping, reading or searching the project source code/.test(skill),
  'rule: forbidden to scan source',
);
ok(/not currently covered in my knowledge base/.test(skill), 'rule: gap sentence');
ok(/Would you like me to scan the codebase/.test(skill), 'rule: permission question');
ok(/Never skip the permission step/.test(skill), 'rule: never skip permission');
ok(
  /\[Source: domain-knowledge\/\{file\}\.md\]/.test(skill) &&
    /\[Source: project-context\/\{file\}\.md\]/.test(skill),
  'rule: citation formats',
);
ok(/\[Source: codebase scan\]/.test(skill), 'rule: scan answers marked');

// ---- onboarding ----
for (let n = 1; n <= 9; n++)
  ok(new RegExp(`^### Step ${n}:`, 'm').test(onboard), `onboard: step ${n} present`);
ok(/Welcome! I'm Sage/.test(onboard), 'onboard: Sage welcome kept');
ok(
  /Codebase scan is allowed INSIDE onboarding only/.test(onboard),
  'onboard: scan allowed inside onboarding only',
);
ok(
  /\/stella-build/.test(onboard) &&
    /\/stella-security/.test(onboard) &&
    /\/stella-pr-review/.test(onboard),
  'onboard: Stella workflow names the three skills',
);
ok(/QUICK REFERENCE/.test(onboard), 'onboard: quick reference kept');
ok(
  /ABSOLUTE RULE of the skill applies again/.test(onboard),
  'onboard: rule restored after Q&A starts',
);
ok(
  !/architecture\/tech-stack\.md|project-structure\.md|git-workflow\.md|coding-standards\.md/.test(
    onboard,
  ),
  'onboard: no v4 architecture doc names',
);

console.log(
  `domain-expert skill: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
