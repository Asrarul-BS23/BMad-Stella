'use strict';

// stella-investigate skill: valid frontmatter, the launcher shape, every file the
// renderer needs, the Guard section agreeing with the real guard policy, paths
// agreeing with the guard and the db-query helper, the mode list, and the plain
// words rule (none of the upstream bmad-investigate metaphors).

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const SKILL_DIR = path.join(REPO, 'stella', 'skills', 'stella-investigate');
const GUARD = path.join(REPO, 'stella', 'hooks', 'project', 'pr-review-guard', 'lib');
const HELPER = path.join(REPO, 'stella', 'utils', 'db-query');
const policy = require(path.join(GUARD, 'investigate-policy.js'));
const paths = require(path.join(GUARD, 'paths.js'));
const profile = require(path.join(HELPER, 'lib', 'profile.js'));
const toml = require(path.join(HELPER, 'lib', 'toml-lite.js'));
const { STELLA_SKILLS, OUTPUT_FOLDERS } = require(
  path.join(REPO, 'tools', 'installer', 'lib', 'constants.js'),
);

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const read = (...p) => fs.readFileSync(path.join(SKILL_DIR, ...p), 'utf8');

// ---- installer: the helper is copied, the folder is made, the permissions fit ----
{
  const os = require('node:os');
  const layer = require(path.join(REPO, 'tools', 'installer', 'lib', 'stella-layer.js'));
  const pm = require(path.join(REPO, 'tools', 'installer', 'lib', 'claude-permissions-manager.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-inv-install-'));
  fs.mkdirSync(path.join(tmp, '_bmad'), { recursive: true });
  layer.copyStellaFiles(tmp);
  const util = path.join(tmp, '_bmad', 'custom', 'stella', 'utils', 'db-query');
  for (const f of [
    'index.js',
    'lib/sql-guard.js',
    'lib/clients.js',
    'lib/profile.js',
    'lib/toml-lite.js',
  ]) {
    ok(fs.existsSync(path.join(util, ...f.split('/'))), `installer copies db-query/${f}`);
  }
  layer.copyStellaFiles(tmp); // a re-run must be safe
  ok(fs.existsSync(path.join(util, 'index.js')), 'installer: second run keeps the helper');
  layer.ensureOutputFolders(tmp);
  ok(
    fs.existsSync(path.join(tmp, '_bmad-output', 'stella', 'investigations')),
    'installer creates _bmad-output/stella/investigations',
  );
  fs.rmSync(tmp, { recursive: true, force: true });

  const allow = pm.getAllPermissions();
  for (const rule of [
    'git fetch origin',
    'git fetch origin --tags',
    'git rev-parse *',
    'git tag --list *',
    'git branch -r',
    'git status *',
    'git ls-tree *',
  ]) {
    ok(allow.includes(`Bash(${rule})`), `permission: Bash(${rule})`);
    ok(allow.includes(`PowerShell(${rule})`), `permission: PowerShell(${rule})`);
  }
  // the guard hook decides each query; an allow rule here would skip the production prompt
  ok(!allow.some((r) => r.includes('db-query')), 'permission: db-query is not on the allow list');
  ok(
    !allow.some((r) => /\((?:sqlcmd|psql|mysql)\b/.test(r)),
    'permission: no database client on the allow list',
  );
  ok(
    !allow.includes('Bash(git fetch *)') && !allow.includes('Bash(git tag *)'),
    'permission: no wide git fetch or git tag rule',
  );
}

// ---- files ----
const listFiles = (dir, base = '') =>
  fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap((e) => {
    const rel = base ? `${base}/${e.name}` : e.name;
    return e.isDirectory() ? listFiles(dir, rel) : [rel];
  });
const files = listFiles(SKILL_DIR).sort();
const EXPECTED = [
  'SKILL.md',
  'case-template.md',
  'customize.toml',
  'references/ask.md',
  'references/compare.md',
  'references/investigate.md',
  'references/profile.md',
  'workflow.md',
];
ok(files.join(',') === EXPECTED.join(','), `skill folder holds exactly its 8 files (${files})`);
for (const f of files) {
  ok(!read(f).includes('\r\n'), `${f}: LF line endings`);
}

const skill = read('SKILL.md');
const workflow = read('workflow.md');
const refs = {
  ask: read('references', 'ask.md'),
  investigate: read('references', 'investigate.md'),
  compare: read('references', 'compare.md'),
  profile: read('references', 'profile.md'),
};
const template = read('case-template.md');
const allText = [skill, workflow, ...Object.values(refs), template].join('\n');

// ---- frontmatter and launcher ----
const fm = skill.match(/^---\n([\s\S]*?)\n---\n/);
ok(fm !== null, 'frontmatter present');
ok(fm && /^name:\s*stella-investigate\s*$/m.test(fm[1]), 'frontmatter name = folder name');
const desc = fm && fm[1].match(/^description:\s*'(.*)'\s*$/m);
ok(Boolean(desc), 'description is one single-quoted line');
ok(desc && desc[1].length <= 1024, 'description fits the 1024 character limit');
ok(desc && desc[1].includes('/stella-investigate'), 'description names the command');
ok(
  desc && /Never start it during other work/.test(desc[1]),
  'description says it never starts by itself',
);
ok(desc && /Read-only/.test(desc[1]), 'description says read-only');
ok(
  skill.includes(
    'uv run --no-cache "{project-root}/_bmad/scripts/render_skill.py" --project-root "{project-root}" --skill "{skill-root}"',
  ),
  'SKILL.md is the stella-build style launcher',
);
ok(/\/stella-init/.test(skill), 'launcher points to /stella-init when the project is not set up');
ok(
  policy.checkBash(
    'uv run --no-cache "D:/p/_bmad/scripts/render_skill.py" --project-root "D:/p" --skill "D:/p/.claude/skills/stella-investigate"',
  ).allow === true,
  'the guard lets the launcher command through',
);

// ---- what the renderer needs ----
const snapshots = [...allText.matchAll(/\[\[bmad-snapshot:([^\]]+)\]\]/g)].map((m) => m[1]);
ok(snapshots.length >= 6, `snapshot links present (${snapshots.length})`);
for (const target of new Set(snapshots)) {
  ok(files.includes(target), `snapshot target exists: ${target}`);
}
for (const mode of ['ask', 'investigate', 'compare']) {
  ok(
    workflow.includes(`[[bmad-snapshot:references/${mode}.md]]`),
    `workflow routes to references/${mode}.md`,
  );
}
ok(
  workflow.includes('[[bmad-snapshot:references/profile.md]]'),
  'workflow routes to the profile setup',
);
ok(
  refs.investigate.includes('[[bmad-snapshot:case-template.md]]'),
  'investigate uses the case template',
);

const custom = toml.parse(read('customize.toml'));
const tokens = [
  ...new Set([...allText.matchAll(/\{workflow\.([A-Za-z0-9_.-]+)\}/g)].map((m) => m[1])),
].sort();
ok(
  tokens.join(',') ===
    'activation_steps_append,activation_steps_prepend,on_complete,persistent_facts',
  `only the four customization tokens are used (${tokens})`,
);
for (const t of tokens) {
  const value = custom.workflow[t];
  // the renderer accepts a string or a list of strings, nothing else
  ok(
    typeof value === 'string' ||
      (Array.isArray(value) && value.every((x) => typeof x === 'string')),
    `customize.toml default for ${t} is a string or a string list`,
  );
}
ok(custom.workflow.on_complete === '', 'on_complete is empty by default');
ok(
  custom.workflow.persistent_facts.includes('file:_bmad-output/stella/project-context/context.md'),
  'project context is a persistent fact',
);
ok(
  custom.workflow.environments === undefined,
  'customize.toml carries no environment: the profile is personal',
);
// the two language values come from the central config, exactly as in stella-build
const configTokens = [
  ...new Set([...allText.matchAll(/\{\{\.([A-Za-z0-9_]+)\}\}/g)].map((m) => m[1])),
].sort();
ok(
  configTokens.join(',') === 'communication_language,document_output_language',
  `only the two language config tokens are used (${configTokens})`,
);
ok(!/\{\{config\./.test(allText), 'no long-form config tokens');
const buildStep = fs.readFileSync(
  path.join(REPO, 'stella', 'skills', 'stella-build', 'step-05-present.md'),
  'utf8',
);
const languageRule = buildStep.split('\n').find((l) => l.startsWith('- **Language**'));
ok(
  Boolean(languageRule) && workflow.includes(languageRule),
  'the Language rule is the stella-build line, word for word',
);
ok(/^## RULES$/m.test(workflow), 'workflow has a RULES section, as stella-build steps do');
ok(
  /Any other failure: print its `message` and HALT\./.test(workflow),
  'Jira fetch failure handling matches stella-pr-review',
);
ok(
  !/^\|.{200,}\|$/m.test(allText),
  'no table row wider than 200 characters in an instruction file',
);
ok((allText.match(/\bHALT\b/g) || []).length >= 6, 'stops are written as HALT, the repo word');

// ---- Guard section agrees with the real policy ----
const guard = workflow.slice(workflow.indexOf('## Guard'), workflow.indexOf('## On Activation'));
ok(guard.length > 200, 'workflow has a Guard section');
const SHA = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const fill = (cmd) =>
  cmd
    .replaceAll('{sha}', SHA)
    .replaceAll('{shaA}', SHA)
    .replaceAll('{shaB}', SHA)
    .replaceAll('{ref}', 'origin/staging')
    .replaceAll('{tag}', 'release-2.3.1')
    .replaceAll('{pattern}', 'release-*')
    .replaceAll('{path}', 'src/Orders/Order.cs')
    .replaceAll('{folder}', 'src/Orders')
    .replaceAll('{term}', 'IsLocked')
    .replaceAll('{root}', 'C:/src/prod')
    .replaceAll('{repo}', 'C:/src/other')
    .replaceAll('{environment}', 'staging')
    .replaceAll('{KEY}', 'LEAD-12')
    .replaceAll('{one SELECT statement}', 'SELECT Id FROM Orders')
    .replaceAll('{path to a .sql file}', '_bmad-output/stella/investigations/c1/queries/01.sql');
// every complete command the skill tells the agent to run
const COMMANDS = [
  'git fetch origin',
  'git fetch origin --tags',
  'git rev-parse HEAD',
  'git status --porcelain',
  'git rev-parse {ref}',
  'git rev-parse {tag}',
  'git tag --list "{pattern}" --sort=-v:refname',
  'git tag --list --sort=-v:refname',
  'git branch -r',
  'git -C "{root}" rev-parse HEAD',
  'git -C "{root}" fetch origin',
  'git -C "{root}" status --short --branch',
  'git show {sha}:{path}',
  'git grep -n -e "{term}" {sha}',
  'git ls-tree -r --name-only {sha} -- {folder}',
  'git log -1 --format=%cI {sha}',
  'git log --oneline {shaA}..{shaB} -- {path}',
  'git diff {shaA} {shaB} -- {path}',
  'node _bmad/custom/stella/utils/db-query --env {environment} --query "{one SELECT statement}"',
  'node _bmad/custom/stella/utils/db-query --env {environment} --file {path to a .sql file}',
  'node _bmad/custom/stella/utils/jira-attachments {KEY}',
];
for (const cmd of COMMANDS) {
  ok(allText.includes(cmd), `the skill text carries: ${cmd}`);
  const v = policy.checkBash(fill(cmd), { isProduction: () => false });
  ok(v.allow === true, `the guard allows it: ${cmd} (${v.reason || ''})`);
}
// each command family named in the Guard list is a real policy rule
for (const rule of policy.ALLOWED_COMMANDS) {
  const short = rule.name.replace(' {a} {b}', '').replace(' {sha}:{path}', '');
  ok(guard.includes(short), `Guard section names the allowed command: ${short}`);
}
for (const forbidden of [
  'git pull',
  'git merge origin/staging',
  'git checkout staging',
  'git switch x',
  'sqlcmd -Q "SELECT 1"',
  'psql -c "select 1"',
  'mysql -e "select 1"',
  'npm test',
]) {
  ok(
    policy.checkBash(forbidden, { isProduction: () => false }).allow === false,
    `the guard blocks what the skill forbids: ${forbidden}`,
  );
}
ok(
  /git pull/.test(guard) && /checkout/.test(guard) && /merge/.test(guard),
  'Guard section forbids pull, merge, checkout',
);
ok(/\*exit/.test(guard), 'Guard section names *exit');
ok(!/allow-run/.test(allText), 'no file mentions *allow-run: the skill runs no project code');
ok(
  /Never tests, builds, app starts or scripts/.test(guard),
  'Guard section: no project code is run',
);
ok(
  /Only the user ends the guard/.test(guard) &&
    /Starting another skill yourself does not end it/.test(guard),
  'Guard section: only the user ends the guard',
);
for (const cmd of [
  'npm test',
  'dotnet test',
  'dotnet build',
  'node scripts/repro.js',
  'dotnet ef database update',
]) {
  ok(
    policy.checkBash(cmd, { isProduction: () => false }).allow === false,
    `the guard runs no project code: ${cmd}`,
  );
}
ok(
  policy.checkBash(`git diff --stat ${SHA} ${SHA}`, { isProduction: () => false }).allow === true,
  'the guard allows git diff with the flag before the commits',
);
ok(/Start no subagents/.test(workflow), 'no subagents (decision 12)');

// ---- paths agree with the guard and the helper ----
ok(paths.INVESTIGATIONS_LABEL === '_bmad-output/stella/investigations', 'guard case folder');
ok(workflow.includes(`${paths.INVESTIGATIONS_LABEL}/`), 'workflow: case folder = guard folder');
ok(
  refs.investigate.includes(`${paths.INVESTIGATIONS_LABEL}/{slug}/case.md`),
  'investigate: case file path',
);
ok(
  workflow.includes(`node ${paths.DB_HELPER_LABEL} `),
  'workflow: helper path = guard helper path',
);
ok(OUTPUT_FOLDERS.includes('investigations'), 'installer creates the investigations folder');
ok(STELLA_SKILLS.includes('stella-investigate'), 'installer ships the skill');
for (const name of profile.PROFILE_FILES) {
  ok(paths.PROFILE_FILES.includes(name), `guard and helper agree on the profile file ${name}`);
  ok(workflow.includes(name), `workflow names ${name}`);
}
ok(
  paths.SECRETS_FILE === profile.SECRETS_FILE && workflow.includes(profile.SECRETS_FILE),
  'guard, helper and workflow agree on the secrets file',
);
ok(
  policy.isWritable(`/p/${profile.CUSTOM_LABEL}/${profile.PROFILE_FILES[1]}`),
  'the profile the skill writes is writable under the guard',
);
ok(
  policy.isWritable(`/p/${paths.INVESTIGATIONS_LABEL}/LEAD-1/queries/01.sql`),
  'a case query file is writable under the guard',
);

// ---- the profile example parses and matches the helper ----
const example = refs.profile.match(/```toml\n([\s\S]*?)```/);
ok(example !== null, 'profile.md has a TOML example');
const ex = example ? toml.parse(example[1]) : { workflow: {} };
const exEnvs = ex.workflow.environments || {};
ok(Object.keys(exEnvs).join(',') === 'dev,staging,production', 'example: dev, staging, production');
ok(exEnvs.dev.sources[0].kind === 'working-tree', 'example: dev is the working tree');
ok(
  exEnvs.staging.sources[0].kind === 'branch' && exEnvs.staging.sources[0].ref === 'origin/staging',
  'example: staging is a remote branch',
);
ok(exEnvs.production.production === true, 'example: production flag');
ok(
  exEnvs.production.sources.map((s) => s.kind).join(',') === 'tag,path',
  'example: production mixes two source kinds',
);
ok(exEnvs.production.db === undefined, 'example: production has no database entry');
ok(profile.TOOLS.includes(exEnvs.staging.db.tool), 'example: db.tool is one the helper knows');
ok(typeof exEnvs.staging.db.password_env === 'string', 'example: the password is a variable name');
ok(
  !/password\s*=\s*"/.test(example ? example[1] : ''),
  'example: no password value in the profile',
);
ok(ex.workflow.defaults.sql_dialect === 'tsql', 'example: SQL dialect is saved');
ok(Array.isArray(ex.workflow.db.pii_columns), 'example: personal-data column list');
for (const kind of ['working-tree', 'branch', 'tag', 'path']) {
  ok(workflow.includes(`\`${kind}\``), `workflow explains the source kind ${kind}`);
}
for (const tool of profile.TOOLS)
  ok(refs.profile.includes(tool), `profile.md names the client ${tool}`);
ok(/read_only = true/.test(refs.profile), 'profile.md explains read_only for production');

// ---- mode detection ----
const modeSection = workflow.slice(workflow.indexOf('## Mode'), workflow.indexOf('## Environment'));
const rules = modeSection.match(/^\d+\. \*\*/gm) || [];
ok(rules.length === 7, `mode list has seven rules (${rules.length})`);
ok(
  /1\. \*\*A mode word/.test(modeSection) && /7\. \*\*One question/.test(modeSection),
  'mode list: a mode word first, one question last',
);
ok(/Never guess/.test(modeSection), 'mode list: never guess');
ok(/choose ask/.test(modeSection), 'mode list: ask when unsure');
ok(/Never fall back to dev silently/.test(workflow), 'environment: no silent default');
ok(/never switch by yourself/.test(refs.ask), 'ask: moving to investigate needs a yes');

// ---- decisions that must stay in the text ----
ok(/never a local branch/.test(workflow), 'pinning: always the remote name');
ok(
  /--sort=-v:refname/.test(workflow) && /highest version/.test(workflow),
  'pinning: newest tag = highest version',
);
ok(
  /Confirmed/.test(workflow) && /Deduced/.test(workflow) && /Hypothesized/.test(workflow),
  'the three grades',
);
ok(/never deleted/.test(refs.investigate), 'hypotheses are never deleted');
ok(
  /Never select a personal-data column/.test(workflow) && /never `SELECT \*`/.test(workflow),
  'production: no personal data, no star',
);
ok(
  /--print/.test(workflow) && /person who has access/.test(workflow),
  'production with no access: --print hand-off',
);
ok(/Do not copy the image/.test(workflow), 'images are described, not copied');
ok(/Evidence is usually thin/.test(workflow), 'thin evidence is the normal case');
ok(
  /Thin evidence alone is not a reason to stop/.test(refs.investigate),
  'no pause for thin evidence',
);
ok(
  /Never start it yourself/.test(workflow) && /\/stella-build/.test(workflow),
  'stella-build is offered, never started',
);
ok(
  /Exit 15 \(no password\)/.test(workflow) &&
    /Recommended: the user adds the line/.test(workflow) &&
    /never enters this chat/.test(workflow) &&
    /Or: the user gives the password here/.test(workflow),
  'secrets: two ways for a missing password, the user-edits-the-file way recommended first',
);
ok(
  workflow.indexOf('Recommended: the user adds the line') <
    workflow.indexOf('Or: the user gives the password here'),
  'secrets: the recommended way comes first',
);

// ---- prompt review fixes (2026-11-25) ----
const rulesSection = workflow.slice(
  workflow.indexOf('## RULES'),
  workflow.indexOf('## Conventions'),
);
ok(
  /never use `Read`, `Grep` or `Glob` on project code/.test(rulesSection),
  'rule: a branch or tag source is never read from the files on disk',
);
ok(
  /answer about another environment/.test(rulesSection),
  'rule: the wrong-version rule gives its reason',
);
ok(
  !/`Read`, `Grep`, `Glob` anywhere/.test(workflow),
  'Guard no longer says the file tools may read anywhere',
);
ok(/\*\*Start no subagents\.\*\*/.test(rulesSection), 'no subagents is a rule, with its reason');
ok(/Never a subagent/.test(guard), 'Guard section names the subagent block');
ok(
  policy.decide('Agent', { prompt: 'search the repo' }).allow === false,
  'the guard blocks the Agent tool',
);
ok(
  policy.decide('Task', { prompt: 'search the repo' }).allow === false,
  'the guard blocks the Task tool',
);
ok(
  /## Opening message/.test(workflow) && /## Opening message/.test(refs.investigate),
  'one opening message, defined once and extended by investigate',
);
ok(
  workflow.indexOf('## Opening message') > workflow.indexOf('## Environment') &&
    workflow.indexOf('## Opening message') < workflow.indexOf('## Route'),
  'the opening message comes after pinning and before the mode file',
);
ok(
  /right after the user confirms the opening message, not before/.test(refs.investigate),
  'the case file is created after the yes',
);
ok(
  /do not ask about the name separately/.test(refs.investigate),
  'the case name needs no second stop',
);
ok(
  /3\. \*\*A reported problem/.test(modeSection) &&
    /4\. \*\*Two environments, no problem/.test(modeSection),
  'mode: a reported problem is checked before two environments',
);
ok(
  /the comparison becomes part of the case/.test(modeSection),
  'mode: a problem across two environments opens a case',
);
ok(
  /Judge by what the user wants, not by single words/.test(modeSection),
  'mode: chosen by intent, not keywords',
);
ok(/Look at the folder names/.test(modeSection), 'mode: the case folders are listed before rule 2');
ok(/Compare needs two environments/.test(workflow), 'environment: compare asks for the second one');
ok(
  /Match it to a profile name when only one fits/.test(workflow),
  'environment: other words for an environment are matched',
);
ok(
  /confirms only what it literally shows/.test(workflow),
  'evidence: material from the user is not Confirmed beyond what it shows',
);
ok(/you read it yourself/.test(workflow), 'evidence: Confirmed means read by the skill');
ok(
  /it is Hypothesized for production/.test(workflow),
  'database: a stand-in result is Hypothesized for production',
);
ok(/do not ask again in chat/.test(workflow), 'database: no second confirm in chat on production');
ok(
  /in the language of the environment's `db\.tool`/.test(workflow),
  'database: the query language follows the client',
);
const proving = workflow.slice(
  workflow.indexOf('## Proving a cause'),
  workflow.indexOf('## Route'),
);
ok(proving.length > 200, 'workflow has a "Proving a cause" section');
ok(
  /Never run project code: no tests, no build, no app start, no script/.test(proving),
  'proving: no project code is run',
);
ok(
  /1\. \*\*In the code\.\*\*/.test(proving) &&
    /2\. \*\*In the data\.\*\*/.test(proving) &&
    /3\. \*\*By a person\.\*\*/.test(proving),
  'proving: code, then data, then a person, in that order',
);
ok(!/## Running code/.test(workflow), 'the "Running code" section is gone');
ok(
  /the `layout` text in the profile wins/.test(workflow),
  'another environment: layout wins over the project context',
);
ok(
  /Once per finished request, not on every reply/.test(workflow),
  'leaving: the closing line is not repeated on every reply',
);
ok(/Keep typed tokens/.test(workflow), 'language: tokens and template headings stay as written');
ok(
  /Write "reproduced" only when a person followed the steps and told you the result/.test(
    refs.investigate,
  ),
  'confidence: "reproduced" only when a person tried the steps',
);
ok(
  !/a run you made|unless you ran it/.test(refs.investigate),
  'confidence: no wording that implies the skill runs code',
);
for (const part of [
  '**Start:**',
  '**Steps:**',
  '**Expected:**',
  '**Actual:**',
  '**Data check:**',
]) {
  ok(refs.investigate.includes(part), `steps to reproduce: the instruction names ${part}`);
}
ok(
  /for a PM or QA person who works in the product, not in the code/.test(refs.investigate),
  'steps to reproduce: written for PM and QA',
);
ok(
  /Use the names the user sees/.test(refs.investigate) &&
    /never from memory/.test(refs.investigate),
  'steps to reproduce: real screen and field names, read from the code',
);
ok(/## Steps to reproduce/.test(template), 'case template has the steps section');
for (const part of [
  '**Start:**',
  '**Expected:**',
  '**Actual:**',
  '**Data check:**',
  '**Tried by:**',
]) {
  ok(template.includes(part), `case template steps: ${part}`);
}
ok(
  /in chat and in a case file use the environment names/.test(refs.compare),
  'compare: A and B stay out of chat',
);
ok(/Shape, in this order/.test(refs.ask), 'ask: the answer has a fixed shape');
ok(
  desc && /stella-build/.test(desc[1]) && /stella-domain-expert/.test(desc[1]),
  'description says what the skill is not for',
);
ok(
  /never copy one into a real profile/.test(refs.profile),
  'profile: example values are marked as placeholders',
);
for (const key of ['server', 'database', 'user', 'password_env']) {
  ok(/^<.+>$/.test(exEnvs.staging.db[key]), `profile example: db.${key} is a placeholder`);
}
ok(
  ex.workflow.db.pii_columns.every((c) => /^<.+>$/.test(c)),
  'profile example: personal-data columns are placeholders',
);
ok(
  /`prod`, `production`, `prd` or `live`/.test(refs.profile),
  'profile: production by name is explained',
);
ok(
  policy.nameLooksProduction('prod') &&
    profile.isProduction('prod') &&
    !policy.nameLooksProduction('staging'),
  'production by name: guard and helper agree',
);
for (const name of [
  'prod',
  'production',
  'PRD',
  'live',
  'prod-eu',
  'pre-prod',
  'preprod',
  'nonprod',
  'staging',
  'dev',
  'uat',
  'reproduction',
  'delivery',
  '',
]) {
  ok(
    policy.nameLooksProduction(name) === profile.isProduction(name),
    `production by name: same answer in guard and helper for "${name}"`,
  );
}
ok(
  /Three kinds of difference/.test(refs.compare) &&
    /Code\./.test(refs.compare) &&
    /Config\./.test(refs.compare) &&
    /Data\./.test(refs.compare),
  'compare: code, config, data',
);
for (const row of ['Environment', 'Source', 'Commit', 'Pinned on']) {
  ok(new RegExp(String.raw`\| ${row}\s+\|`).test(template), `case template has the ${row} row`);
}
ok(/## Environment comparison/.test(template), 'case template has the comparison section');
ok(
  template.split('\n').length <= 100,
  `case template stays short (${template.split('\n').length} lines)`,
);

// ---- directive wording: no phrase that leaves the choice to the reader ----
const VAGUE = [
  'as needed',
  'if needed',
  'as appropriate',
  'if appropriate',
  'when it helps',
  'far enough',
  'good enough',
  'as you go',
  'in one pass',
  'a guide, not a script',
  'as much as you can',
  'if possible',
  'where possible',
  'try to',
  'clear next step',
  'work around it',
  'and so on',
  'etc.',
];
const instructionFiles = {
  'workflow.md': workflow,
  'references/ask.md': refs.ask,
  'references/investigate.md': refs.investigate,
  'references/compare.md': refs.compare,
  'references/profile.md': refs.profile,
};
for (const [name, text] of Object.entries(instructionFiles)) {
  const hits = VAGUE.filter((p) => text.toLowerCase().includes(p));
  ok(hits.length === 0, `${name}: no vague phrase (${hits.join(', ')})`);
  ok(
    !/\b(?:should|might|maybe|probably)\b/i.test(text),
    `${name}: no should / might / maybe / probably`,
  );
}
ok(
  (refs.investigate.match(/^\*\*\d\. /gm) || []).length === 5,
  'investigate: five numbered outcomes',
);
ok(
  /Reach all five\. Take them in this order\./.test(refs.investigate),
  'investigate: the outcomes have an order',
);
ok(/Only at these three points/.test(refs.investigate), 'investigate: exactly three stops');
ok(
  /Stop only when you have read the line that decides the answer/.test(refs.ask),
  'ask: when to stop reading is stated',
);
ok(/in two situations only/.test(refs.ask), 'ask: when to offer a case is stated');
ok(
  /Stop at the first that explains the difference/.test(refs.compare),
  'compare: when to stop checking is stated',
);
ok(
  /Read first, ask second/.test(refs.profile) && /never guess a branch/.test(refs.profile),
  'profile: read before asking, never guess',
);
ok(/ask for that one thing and nothing else/.test(workflow), 'profile gap: one thing is asked');
ok(
  /Never split, rename or re-encode a query to get past a refusal/.test(workflow),
  'database: a refusal is not worked around',
);

// ---- plain words: no upstream metaphors, no v4 strings ----
const JARGON =
  /stronghold|forensic|perimeter|crime scene|case file another engineer can pick up cold/i;
ok(!JARGON.test(allText), 'no upstream metaphors in any skill file');
ok(!/Outcome \d/.test(allText), 'no numbered outcomes');
const V4 = /bmad-docs|\.bmad-core|bmad-core|core-config\.yaml|implementation_artifacts/;
ok(!V4.test(allText), 'no v4 or upstream path strings');
ok(!/resolve_customization\.py/.test(allText), 'uses the render launcher, not the old resolver');

console.log(`investigate skill: ${total - fails}/${total} passed`);
process.exit(fails === 0 ? 0 : 1);
