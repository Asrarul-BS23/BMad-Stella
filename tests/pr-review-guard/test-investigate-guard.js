'use strict';

// Guard for stella-investigate: the allow / ask / deny policy, the files it may
// write, the *allow-run switch, the production lookup in the profile, transcript
// markers for two guarded skills, and end-to-end hook runs.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const G = path.join(REPO, 'stella', 'hooks', 'project', 'pr-review-guard');
const HOOK = path.join(G, 'pre-tool-use.js');
const inv = require(path.join(G, 'lib', 'investigate-policy.js'));
const rs = require(path.join(G, 'lib', 'review-state.js'));
const paths = require(path.join(G, 'lib', 'paths.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

const SHA = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0';
const SHA2 = 'ffffffffffffffffffffffffffffffffffffffff';
const CASES = '_bmad-output/stella/investigations';
const DB = '_bmad/custom/stella/utils/db-query';
const notProd = { isProduction: () => false };
const prod = { isProduction: () => true };

// ================= 1. shell: allowed read commands =================
const ALLOW = [
  'git fetch origin',
  'git fetch origin --tags',
  'git rev-parse HEAD',
  'git rev-parse origin/staging',
  'git rev-parse --verify --short origin/main',
  'git tag --list "release-*" --sort=-v:refname',
  'git tag -l',
  'git branch -r',
  'git branch -r --contains ' + SHA,
  'git status --porcelain',
  'git status',
  `git ls-tree -r --name-only ${SHA} -- src/Features`,
  `git ls-tree ${SHA}`,
  `git cat-file -t ${SHA}`,
  `git show ${SHA}:src/Services/OrderService.cs`,
  `git show ${SHA}:"src/My Folder/File.cs"`,
  `git grep -n -e "GeneratePdf" ${SHA}`,
  `git grep -n -i -e "-Ocalc" ${SHA} -- src/`,
  `git log -1 --format=%cI ${SHA}`,
  `git log --oneline ${SHA.slice(0, 7)}..${SHA2} -- src/Orders`,
  'git log -S "IsLocked" --oneline -- src/Orders/Order.cs',
  'git log --since=2026-10-01 --oneline',
  `git diff ${SHA} ${SHA2} --stat`,
  `git diff ${SHA} ${SHA2} -- src/Orders/Order.cs`,
  // another repository
  `git -C "C:/src/Production/mjh_api" rev-parse HEAD`,
  `git -C ../other-repo log -1 --format=%H`,
  String.raw`git -C C:\src\prod show ${SHA}:Api/Program.cs`,
  // a leading cd is tolerated
  `cd "D:/work/project" && git rev-parse HEAD`,
  // the skill launcher
  'uv run --no-cache "D:/p/_bmad/scripts/render_skill.py" --project-root "D:/p" --skill "D:/p/.claude/skills/stella-investigate"',
  'uv run /p/_bmad/scripts/render_skill.py --project-root /p --skill /p/.claude/skills/stella-investigate',
  // ticket fetch
  'node _bmad/custom/stella/utils/jira-attachments LEADRSC-4901',
];
for (const cmd of ALLOW) {
  const v = inv.checkBash(cmd, notProd);
  ok(v.allow === true && !v.ask, `allow: ${cmd.slice(0, 70)} (${v.reason || ''})`);
}

// ================= 2. shell: blocked =================
const BLOCK = [
  '',
  '   ',
  'git pull',
  'git pull origin staging',
  'git merge origin/staging',
  'git checkout staging',
  'git switch staging',
  'git reset --hard HEAD~1',
  'git stash',
  'git commit -m x',
  'git push',
  'git fetch origin staging:staging', // would move a local branch
  'git fetch origin +refs/heads/*:refs/heads/*',
  'git fetch',
  'git fetch upstream',
  'git fetch origin --prune',
  'git tag v1.0', // creates a tag
  'git tag -d v1.0',
  'git tag --list -d v1.0',
  'git branch -D feature',
  'git branch new-branch',
  'git branch -r -d origin/x',
  'git show HEAD:src/a.cs', // not pinned to a commit
  'git show staging:src/a.cs',
  `git show ${SHA}`, // whole commit, no path
  `git diff ${SHA}`, // would compare against the working tree
  'git diff',
  'git grep -n GeneratePdf',
  `git grep -n -O"calc" -e x ${SHA}`,
  `git log --output=x.txt`,
  `git -C /other commit -m x`,
  `git -C /other checkout main`,
  'git rev-parse --git-dir=/x HEAD',
  // database clients, never directly
  'sqlcmd -S server -d db -Q "SELECT 1"',
  'psql -h host -c "select 1"',
  'mysql -e "select 1"',
  // compound, piped, redirected
  `git rev-parse HEAD && git pull`,
  `git log --oneline | head -5`,
  `git show ${SHA}:a.cs > a.cs`,
  'git rev-parse $(cat x)',
  // other tools
  'npm test',
  'dotnet test',
  'rm -rf src',
  'cat .env',
  'node script.js',
  'uv run evil.py',
  'uv run --no-cache "D:/p/_bmad/scripts/render_skill.py" --project-root "D:/p" --skill "D:/p/x" --extra',
  'node _bmad/custom/stella/utils/jira-attachments KEY-1 --purge',
  'node _bmad/custom/stella/utils/jira-attachments',
  'node _bmad/custom/stella/utils/pr-comments x.json --post',
];
for (const cmd of BLOCK) {
  const v = inv.checkBash(cmd, notProd);
  ok(v.allow === false && Boolean(v.reason), `block: ${cmd.slice(0, 70) || '(empty)'}`);
}
ok(inv.checkBash(null, notProd).allow === false, 'block: null command');
ok(inv.checkBash().allow === false, 'block: undefined command, no context');

// ================= 3. db-query helper: allow / ask / deny =================
let v = inv.checkBash(`node ${DB} --env staging --query "SELECT Id FROM Orders"`, notProd);
ok(
  v.allow === true && v.grant === true && !v.ask,
  'db: non-production query is granted, no prompt',
);
v = inv.checkBash(`node ${DB}/index.js --env staging --file ${CASES}/c1/queries/01.sql`, notProd);
ok(v.allow === true && v.grant === true, 'db: --file form, index.js path');
v = inv.checkBash(
  String.raw`node _bmad\custom\stella\utils\db-query\ --env dev --query "SELECT 1"`,
  notProd,
);
ok(v.allow === true, 'db: Windows path with a trailing slash');
v = inv.checkBash(`node ${DB} --env production --query "SELECT COUNT(*) FROM Orders"`, prod);
ok(
  v.allow === true && v.ask === true && /production/.test(v.reason),
  'db: production query asks the user',
);
v = inv.checkBash(`node ${DB} --env production --query "SELECT Id FROM Orders" --print`, prod);
ok(v.allow === true && !v.ask, 'db: --print on production runs nothing, no prompt');
v = inv.checkBash(`node ${DB} --env staging --query "SELECT 1"`);
ok(v.ask === true, 'db: with no production lookup, ask');
v = inv.checkBash(`node ${DB} --env staging --query "SELECT 'a;b' FROM t"`, notProd);
ok(v.allow === true, 'db: a ; inside the quoted query is not a second command');

for (const cmd of [
  `node ${DB}`,
  `node ${DB} --query "SELECT 1"`,
  `node ${DB} --env staging`,
  `node ${DB} --env staging --query "SELECT 1" --file q.sql`,
  `node ${DB} --env "a b" --query "SELECT 1"`,
  `node ${DB} --env staging --query`,
  `node ${DB} --env staging --query "SELECT 1" --server evil`,
  `node ${DB} --env staging --query "SELECT 1" && git pull`,
  `node ${DB} --env staging --query "SELECT 1" > out.txt`,
  `node other/db-query --env staging --query "SELECT 1"`,
]) {
  ok(inv.checkBash(cmd, notProd).allow === false, `db block: ${cmd.slice(0, 70)}`);
}

// ================= 4. file tools =================
const W = (p) => 'C:\\proj\\' + p.replaceAll('/', '\\');
const writable = [
  `/p/${CASES}/LEAD-12/case.md`,
  W(`${CASES}/LEAD-12/case.md`),
  W(`${CASES}/LEAD-12/queries/01.sql`),
  `${CASES}/login-error/case.md`,
  '/p/_bmad/custom/stella-investigate.user.toml',
  W('_bmad/custom/stella-investigate.profile.toml'),
  W('_bmad/custom/stella-investigate.secrets.env'),
];
for (const p of writable) {
  ok(inv.decide('Write', { file_path: p }).allow === true, `write allowed: ${p}`);
  ok(inv.decide('Edit', { file_path: p }).allow === true, `edit allowed: ${p}`);
}
const notWritable = [
  'C:\\proj\\src\\a.cs',
  '/p/src/Orders/Order.cs',
  `/p/${CASES}/../../../src/a.cs`,
  `/p/${CASES}/..`,
  `/p/${CASES}`,
  '/p/_bmad-output/stella/reviewer/r-pr1/review.md',
  '/p/_bmad/custom/stella-tea-live-testing.user.toml',
  '/p/_bmad/custom/stella-investigate.user.toml.bak',
  '/p/_bmad/custom/stella/guard.json',
  '/p/_bmad/config.toml',
  '/p/.env',
  '',
];
for (const p of notWritable) {
  ok(inv.decide('Write', { file_path: p }).allow === false, `write blocked: ${p || '(empty)'}`);
  ok(inv.decide('Edit', { file_path: p }).allow === false, `edit blocked: ${p || '(empty)'}`);
  ok(
    inv.decide('MultiEdit', { file_path: p }).allow === false,
    `multiedit blocked: ${p || '(empty)'}`,
  );
}
ok(inv.decide('Write', {}).allow === false, 'write blocked: no file_path');
ok(inv.decide('Write', null).allow === false, 'write blocked: null input');
ok(
  inv.decide('NotebookEdit', { file_path: `/p/${CASES}/x/n.ipynb` }).allow === false,
  'NotebookEdit blocked',
);
ok(
  inv.decide('Read', { file_path: 'C:\\proj\\src\\a.cs' }).allow === true,
  'Read allowed anywhere',
);
ok(inv.decide('Grep', { pattern: 'x' }).allow === true, 'Grep allowed');
ok(inv.decide('Glob', { pattern: '**/*.cs' }).allow === true, 'Glob allowed');
// subagents: their tool calls would run outside this guard
for (const t of ['Agent', 'Task']) {
  const d = inv.decide(t, { prompt: 'find the export code', subagent_type: 'Explore' });
  ok(d.allow === false && /subagents are not allowed/.test(d.reason), `${t} tool blocked`);
  ok(
    inv.decide(t, null, { allowRun: true }).allow === false,
    `${t} tool blocked after allow-run too`,
  );
}
ok(inv.decide('WebFetch', { url: 'https://x' }).allow === true, 'tools outside the policy pass');
// the wider hook matcher must not change the PR review: it still lets these through
const prPolicy = require(path.join(G, 'lib', 'policy.js'));
ok(
  prPolicy.decide('Agent', { prompt: 'x' }).allow === true,
  'PR review policy: Agent is still allowed',
);
ok(
  prPolicy.decide('Task', { prompt: 'x' }).allow === true,
  'PR review policy: Task is still allowed',
);
ok(
  inv.decide('PowerShell', { command: 'git rev-parse HEAD' }, notProd).allow === true,
  'PowerShell uses the same rules',
);
ok(
  inv.decide('PowerShell', { command: 'git pull' }, notProd).allow === false,
  'PowerShell: git pull blocked',
);

// ================= 5. after *allow-run =================
const runCtx = { allowRun: true, isProduction: () => false };
for (const cmd of [
  'npm test',
  'dotnet test --filter OrderTests',
  'pytest tests/test_orders.py -k locked',
  'npm run test:unit 2>&1',
  'npx jest orders > /dev/null',
  'dotnet build; dotnet test',
  'cd src && npm test',
  'node scripts/repro.js',
  'curl -s http://localhost:5000/health',
  'git status --porcelain', // read commands still pass
]) {
  ok(inv.checkBash(cmd, runCtx).allow === true, `allow-run allows: ${cmd}`);
}
for (const cmd of [
  'git commit -m x',
  'git pull',
  'git checkout .',
  'npm test && git push',
  'npm test; git stash',
  'git.exe reset --hard',
  'sqlcmd -S s -Q "DELETE FROM t"',
  'npm test && psql -c "select 1"',
  'mysql -e "drop table t"',
  'rm -rf node_modules',
  'del /q src\\a.cs',
  'Remove-Item src -Recurse',
  'mv a.cs b.cs',
  'Set-Content src/a.cs "x"',
  "sed -i 's/a/b/' src/a.cs",
  'npm test > result.txt',
  'echo x >> src/a.cs',
  'npm test | tee out.log',
]) {
  ok(inv.checkBash(cmd, runCtx).allow === false, `allow-run still blocks: ${cmd}`);
}
ok(
  inv.checkBash('npm test', { allowRun: false }).allow === false,
  'without allow-run: npm test blocked',
);
ok(
  inv.decide('Edit', { file_path: 'C:\\proj\\src\\a.cs' }, runCtx).allow === false,
  'allow-run never unlocks Edit on source',
);
v = inv.checkBash(`node ${DB} --env production --query "SELECT 1"`, {
  allowRun: true,
  isProduction: () => true,
});
ok(v.ask === true, 'allow-run: a production query still asks');
ok(
  inv.runModeDenial('echo "git pull is a command"') === null,
  'allow-run: words inside quotes are not commands',
);

// ================= 6. production lookup in the profile =================
const PROFILE = `
[workflow.defaults]
environment = "dev"

[workflow.environments.dev]
[[workflow.environments.dev.sources]]
kind = "working-tree"

[workflow.environments.staging]
production = false
[workflow.environments.staging.db]
tool = "sqlcmd"

[workflow.environments.production]   # live
layout = "x"
production = true
[workflow.environments.production.db]
tool = "sqlcmd"

[workflow.environments."uat-2"]
production = true

[workflow.environments.late]
[workflow.environments.late.db]
production = true
`;
ok(inv.profileSaysProduction(PROFILE, 'production') === true, 'profile: production = true');
ok(inv.profileSaysProduction(PROFILE, 'staging') === false, 'profile: production = false');
ok(inv.profileSaysProduction(PROFILE, 'dev') === false, 'profile: no production line');
ok(inv.profileSaysProduction(PROFILE, 'uat-2') === true, 'profile: quoted environment name');
ok(
  inv.profileSaysProduction(PROFILE, 'late') === false,
  'profile: a production line in a sub-table does not count',
);
ok(
  inv.profileSaysProduction(PROFILE, 'unknown') === true,
  'profile: unknown environment counts as production',
);
ok(inv.profileSaysProduction('', 'dev') === true, 'profile: empty file counts as production');
ok(
  inv.profileSaysProduction(PROFILE.replaceAll('\n', '\r\n'), 'production') === true,
  'profile: CRLF',
);
ok(
  inv.profileSaysProduction('[workflow.environments.p]\n# production = true\n', 'p') === false,
  'profile: commented line ignored',
);
// production by name: no flag -> the name decides; a flag always wins
const NAMED = `
[workflow.environments.prod]
[workflow.environments.prod.db]
tool = "sqlcmd"

[workflow.environments.live-eu]
layout = "x"

[workflow.environments.pre-prod]
production = false

[workflow.environments.PRD]

[workflow.environments.preprod]

[workflow.environments.qa]
production = true
`;
ok(inv.profileSaysProduction(NAMED, 'prod') === true, 'by name: prod with no flag is production');
ok(inv.profileSaysProduction(NAMED, 'live-eu') === true, 'by name: live as one part of the name');
ok(inv.profileSaysProduction(NAMED, 'PRD') === true, 'by name: any letter case');
ok(
  inv.profileSaysProduction(NAMED, 'pre-prod') === false,
  'by name: production = false wins over the name',
);
ok(
  inv.profileSaysProduction(NAMED, 'preprod') === false,
  'by name: prod inside a longer word does not count',
);
ok(inv.profileSaysProduction(NAMED, 'qa') === true, 'by name: production = true wins for any name');
for (const [name, expected] of [
  ['production', true],
  ['prod', true],
  ['prd', true],
  ['live', true],
  ['prod_eu', true],
  ['eu.prod', true],
  ['staging', false],
  ['dev', false],
  ['nonprod', false],
  ['reproduction', false],
  ['delivery', false],
  ['', false],
  [undefined, false],
]) {
  ok(inv.nameLooksProduction(name) === expected, `by name: "${name}" -> ${expected}`);
}

// ================= 7. transcript markers =================
const line = (o) => JSON.stringify(o);
const user = (t, extra = {}) => line({ type: 'user', message: { content: t }, ...extra });
const userArr = (t) => line({ type: 'user', message: { content: [{ type: 'text', text: t }] } });
const tool = (name, input) =>
  line({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const kind = (l) => {
  const m = rs.classify(l);
  return m ? (m.skill ? `${m.kind}:${m.skill}` : m.kind) : null;
};
const INV = 'start:stella-investigate';

ok(
  kind(user('/stella-investigate why does login fail on production')) === INV,
  'start: typed command',
);
ok(kind(user('<command-name>/stella-investigate</command-name>')) === INV, 'start: command tag');
ok(
  kind(user('<command-name>/bmad-stella:stella-investigate</command-name>')) === INV,
  'start: plugin command tag',
);
ok(kind(user('/bmad-stella:stella-investigate ask x')) === INV, 'start: plugin typed command');
ok(
  kind(userArr('  /STELLA-INVESTIGATE x')) === INV,
  'start: array content, any case, leading spaces',
);
ok(kind(tool('Skill', { skill: 'stella-investigate' })) === INV, 'start: Skill tool call');
ok(
  kind(tool('Skill', { skill: 'bmad-stella:stella-investigate', args: 'x' })) === INV,
  'start: plugin Skill call',
);
ok(kind(user('what does stella-investigate do?')) === null, 'not start: name in prose');
ok(
  kind(user('please run /stella-investigate later')) === null,
  'not start: command inside a sentence',
);
ok(kind(user('/stella-investigate', { isMeta: true })) === null, 'not start: isMeta line');
ok(
  kind(tool('Read', { file_path: '.claude/skills/stella-investigate/SKILL.md' })) === null,
  'not start: reading the skill file',
);
ok(kind(user('/stella-investigator x')) === 'end', 'another stella command is an end, not a start');
ok(kind(user('*allow-run')) === 'allow-run', 'allow-run: typed');
ok(
  kind(userArr('ok\n  *allow-run')) === 'allow-run',
  'allow-run: on its own line in a longer message',
);
ok(kind(user('do not *allow-run yet')) === null, 'allow-run: not inside a sentence');
ok(kind(user('*allow-running')) === null, 'allow-run: not a longer word');
ok(kind(user('*exit')) === 'end', 'end: *exit');
ok(kind(user('/stella-build')) === 'end', 'end: stella-build');
ok(kind(tool('Skill', { skill: 'stella-build' })) === 'end', 'end: Skill stella-build');
ok(
  kind(user('/stella-pr-review 12')) === 'start:stella-pr-review',
  'the PR review start is unchanged',
);
ok(
  rs.classifyLine(user('/stella-investigate x')) === 'end',
  'PR review view: investigate starting ends the review',
);
ok(rs.classifyLine(user('*allow-run')) === null, 'PR review view: allow-run means nothing');
ok(kind('not json') === null && kind('') === null, 'garbage lines ignored');

// ================= 8. end to end: the hook =================
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-inv-'));
const CUSTOM = path.join(ROOT, '_bmad', 'custom');
fs.mkdirSync(path.join(CUSTOM, 'stella'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'src'), { recursive: true });
const T = path.join(ROOT, 'transcript.jsonl');
const PROFILE_FILE = path.join(CUSTOM, 'stella-investigate.user.toml');

function run(toolName, toolInput, sessionId = 's1', env = {}) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({
      session_id: sessionId,
      transcript_path: T,
      cwd: path.join(ROOT, 'src'),
      tool_name: toolName,
      tool_input: toolInput,
      hook_event_name: 'PreToolUse',
    }),
    encoding: 'utf8',
    env: { ...process.env, STELLA_GUARD_OFF: '', ...env },
  });
  let decision = null;
  try {
    decision = JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
  } catch {
    /* no decision printed */
  }
  return { code: r.status, err: r.stderr, out: r.stdout, decision };
}
const say = (l) => fs.appendFileSync(T, l + '\n');
const SRC = path.join(ROOT, 'src', 'a.cs');
const CASE = path.join(ROOT, '_bmad-output', 'stella', 'investigations', 'LEAD-1', 'case.md');
const query = (envName, extra = '') => ({
  command: `node ${DB} --env ${envName} --query "SELECT Id FROM Orders"${extra}`,
});

// 8a. no skill active: the hook stays out of the way
fs.writeFileSync(T, user('hello') + '\n');
ok(run('Edit', { file_path: SRC }).code === 0, 'e2e: no skill -> Edit allowed');
ok(run('Bash', { command: 'git pull' }).code === 0, 'e2e: no skill -> git pull allowed');
let r = run('Bash', query('production'));
ok(r.code === 0 && r.decision === null, 'e2e: no skill -> no decision printed for db-query');

// 8b. investigation started by the typed command
say(
  user(
    '<command-name>/stella-investigate</command-name>\n<command-args>why does login fail</command-args>',
  ),
);
r = run('Edit', { file_path: SRC });
ok(r.code === 2, 'e2e: Edit on source blocked');
ok(/Investigation active \(stella-investigate\)/.test(r.err), 'e2e: refusal names the skill');
ok(
  /\*allow-run/.test(r.err) && /\*exit/.test(r.err),
  'e2e: refusal says how to allow runs and how to leave',
);
ok(r.err.includes(paths.INVESTIGATIONS_LABEL), 'e2e: refusal names the case folder');
ok(run('Write', { file_path: CASE }).code === 0, 'e2e: Write to the case file allowed');
ok(run('Edit', { file_path: CASE }).code === 0, 'e2e: Edit of the case file allowed');
ok(run('Write', { file_path: PROFILE_FILE }).code === 0, 'e2e: Write to the profile allowed');
ok(run('Bash', { command: 'git rev-parse HEAD' }).code === 0, 'e2e: git rev-parse allowed');
ok(run('Bash', { command: 'git fetch origin' }).code === 0, 'e2e: git fetch origin allowed');
ok(run('Bash', { command: 'git pull' }).code === 2, 'e2e: git pull blocked');
ok(
  run('PowerShell', { command: 'git checkout staging' }).code === 2,
  'e2e: PowerShell git checkout blocked',
);
ok(run('Bash', { command: 'npm test' }).code === 2, 'e2e: npm test blocked before *allow-run');
ok(run('Read', { file_path: SRC }).code === 0, 'e2e: Read is never touched');
r = run('Agent', { prompt: 'search the repo', subagent_type: 'Explore' });
ok(
  r.code === 2 && /subagents are not allowed/.test(r.err),
  'e2e: Agent tool blocked in an investigation',
);
ok(
  run('Task', { prompt: 'search the repo' }).code === 2,
  'e2e: Task tool blocked in an investigation',
);
ok(
  fs.existsSync(path.join(ROOT, '_bmad-output', 'stella', 'reviewer', '.state', 'guard-debug.log')),
  'e2e: blocks are logged',
);

// 8c. database: no profile yet -> every query asks
r = run('Bash', query('staging'));
ok(r.code === 0 && r.decision === 'ask', 'e2e: no profile -> a query asks the user');

fs.writeFileSync(PROFILE_FILE, PROFILE);
r = run('Bash', query('staging'));
ok(r.code === 0 && r.decision === 'allow', 'e2e: staging query -> allow, no prompt');
r = run('Bash', query('production'));
ok(r.code === 0 && r.decision === 'ask', 'e2e: production query -> ask');
ok(/production/.test(r.out), 'e2e: the prompt text names production');
ok(/SELECT Id FROM Orders/.test(r.out), 'e2e: the prompt shows the query');
// a query given as a file: the user must still see the SQL, not only a path
{
  const reason = (res) => JSON.parse(res.out).hookSpecificOutput.permissionDecisionReason;
  const qdir = path.join(ROOT, '_bmad-output', 'stella', 'investigations', 'LEAD-1', 'queries');
  fs.mkdirSync(qdir, { recursive: true });
  const qfile = path.join(qdir, '01.sql');
  fs.writeFileSync(qfile, "SELECT COUNT(*) FROM Orders WHERE Status = 'Open'\n");
  const viaFile = (file) =>
    run('Bash', { command: `node ${DB} --env production --file "${file.replaceAll('\\', '/')}"` });
  r = viaFile(qfile);
  ok(r.decision === 'ask', 'e2e: production query from a file -> ask');
  ok(/WHERE Status = 'Open'/.test(reason(r)), 'e2e: the prompt shows the SQL read from the file');
  // a path relative to the session folder (ROOT/src) is resolved from there
  r = viaFile('../_bmad-output/stella/investigations/LEAD-1/queries/01.sql');
  ok(/WHERE Status = 'Open'/.test(reason(r)), 'e2e: a relative query file is read');
  r = viaFile(path.join(qdir, 'missing.sql'));
  ok(
    r.decision === 'ask' && /could not be read/.test(reason(r)),
    'e2e: a missing query file still asks, and says the file could not be read',
  );
  fs.writeFileSync(qfile, 'SELECT ' + 'LongColumnName, '.repeat(400) + 'Id FROM Orders');
  r = viaFile(qfile);
  ok(
    reason(r).length < 1800 && /\(cut\)/.test(reason(r)),
    'e2e: a very long query is cut in the prompt',
  );
}
r = run('Bash', query('production', ' --print'));
ok(r.code === 0 && r.decision === 'allow', 'e2e: production --print -> allow');
r = run('Bash', query('never-heard-of-it'));
ok(r.decision === 'ask', 'e2e: an environment the profile does not name -> ask');
ok(run('Bash', { command: 'sqlcmd -S s -Q "SELECT 1"' }).code === 2, 'e2e: direct sqlcmd blocked');

// `.profile.toml` wins when both files exist
fs.writeFileSync(
  path.join(CUSTOM, 'stella-investigate.profile.toml'),
  '[workflow.environments.staging]\nproduction = true\n',
);
ok(run('Bash', query('staging')).decision === 'ask', 'e2e: .profile.toml is read first');
fs.rmSync(path.join(CUSTOM, 'stella-investigate.profile.toml'));

// 8d. *allow-run
say(user('*allow-run'));
ok(run('Bash', { command: 'npm test' }).code === 0, 'e2e: npm test allowed after *allow-run');
ok(run('Bash', { command: 'git commit -m x' }).code === 2, 'e2e: git commit still blocked');
r = run('Edit', { file_path: SRC });
ok(
  r.code === 2 && /allowed \(\*allow-run was given\)/.test(r.err),
  'e2e: Edit still blocked; message reflects allow-run',
);
ok(run('Bash', query('production')).decision === 'ask', 'e2e: production query still asks');

// 8e. *exit ends it; a new start does not inherit allow-run
say(user('*exit'));
ok(run('Edit', { file_path: SRC }).code === 0, 'e2e: after *exit Edit is allowed');
ok(run('Bash', { command: 'git pull' }).code === 0, 'e2e: after *exit git pull is allowed');
say(tool('Skill', { skill: 'stella-investigate' }));
ok(
  run('Bash', { command: 'npm test' }).code === 2,
  'e2e: a new investigation starts without allow-run',
);
ok(run('Edit', { file_path: SRC }).code === 2, 'e2e: Skill tool start guards too');

// 8f. *allow-run typed outside an investigation does nothing later
say(user('*exit'));
say(user('*allow-run'));
say(user('/stella-investigate x'));
ok(
  run('Bash', { command: 'npm test' }).code === 2,
  'e2e: allow-run given before the start does not count',
);

// 8g. starting stella-build ends the investigation
say(user('<command-name>/stella-build</command-name>'));
ok(run('Edit', { file_path: SRC }).code === 0, 'e2e: stella-build ends the investigation');

// 8h. switching between the two guarded skills
say(user('/stella-investigate x'));
say(user('/stella-pr-review https://github.com/o/r/pull/12'));
r = run('Write', { file_path: CASE });
ok(
  r.code === 2 && /PR review active/.test(r.err),
  'e2e: PR review took over; case file not writable',
);
ok(
  run('Bash', { command: 'git fetch origin' }).code === 2,
  'e2e: PR review rules apply (no plain fetch)',
);
say(user('/stella-investigate y'));
ok(run('Write', { file_path: CASE }).code === 0, 'e2e: investigation took over again');
r = run('Write', {
  file_path: path.join(ROOT, '_bmad-output', 'stella', 'reviewer', 'r-pr12', 'review.md'),
});
ok(
  r.code === 2 && /Investigation active/.test(r.err),
  'e2e: review files are not writable in an investigation',
);
// a review.md written during an investigation must not end it
say(
  tool('Write', {
    file_path: path.join(ROOT, '_bmad-output', 'stella', 'reviewer', 'r-pr12', 'review.md'),
  }),
);
ok(
  run('Edit', { file_path: SRC }).code === 2,
  'e2e: writing a review.md does not end an investigation',
);

// 8i. sessions are separate
ok(
  run('Edit', { file_path: SRC }, 'other-session').code === 2,
  'e2e: same transcript, new session id -> rescanned, still guarded',
);

// 8j. kill switch and fail-open
ok(
  run('Edit', { file_path: SRC }, 's1', { STELLA_GUARD_OFF: '1' }).code === 0,
  'e2e: STELLA_GUARD_OFF=1 disables the guard',
);
fs.writeFileSync(path.join(CUSTOM, 'stella', 'guard.json'), '{"enabled": false}');
ok(run('Edit', { file_path: SRC }).code === 0, 'e2e: guard.json enabled=false disables the guard');
fs.writeFileSync(path.join(CUSTOM, 'stella', 'guard.json'), '{"enabled": true}');
ok(run('Edit', { file_path: SRC }).code === 2, 'e2e: guard.json enabled=true keeps it on');
const bad = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
ok(bad.status === 0, 'e2e: unreadable hook input -> allow (fail open)');

// 8k. a cache written before this change (no skill name) still means "PR review active"
{
  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-inv-old-'));
  fs.mkdirSync(path.join(root2, '_bmad'), { recursive: true });
  const t2 = path.join(root2, 't.jsonl');
  fs.writeFileSync(t2, user('/stella-pr-review 1') + '\n');
  const cache = rs.cachePath(root2, 'old');
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify({ scannedLines: 2, active: true }));
  const state = rs.reviewState(root2, 'old', t2);
  ok(
    state.active === true && state.skill === rs.REVIEW_SKILL,
    'old cache format reads as an active PR review',
  );
  ok(
    rs.reviewState(root2, 'none', path.join(root2, 'missing.jsonl')).skill === null,
    'missing transcript -> nothing active',
  );
  fs.rmSync(root2, { recursive: true, force: true });
}

// 8l. bug fix: a transcript that ends with a line break. The first line added after
// a scan was skipped, so a marker in that position was never seen.
{
  const root3 = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-inv-nl-'));
  fs.mkdirSync(path.join(root3, '_bmad'), { recursive: true });
  const t3 = path.join(root3, 't.jsonl');
  fs.writeFileSync(t3, user('hello') + '\n');
  ok(rs.reviewState(root3, 'nl', t3).skill === null, 'trailing newline: nothing active at first');
  fs.appendFileSync(t3, user('/stella-pr-review 7') + '\n');
  ok(
    rs.reviewState(root3, 'nl', t3).active === true,
    'trailing newline: PR review start right after a scan is seen',
  );
  fs.appendFileSync(t3, user('/stella-investigate x') + '\n');
  ok(
    rs.reviewState(root3, 'nl', t3).skill === rs.INVESTIGATE_SKILL,
    'trailing newline: investigate start right after a scan is seen',
  );
  fs.appendFileSync(t3, user('*allow-run') + '\r\n');
  ok(
    rs.reviewState(root3, 'nl', t3).allowRun === true,
    'trailing CRLF: allow-run right after a scan is seen',
  );
  ok(rs.reviewState(root3, 'nl', t3).allowRun === true, 'a scan with no new lines keeps the state');
  // the transcript file is replaced by a shorter one -> rescan from the start
  fs.writeFileSync(t3, user('hello') + '\n');
  const fresh = rs.reviewState(root3, 'nl', t3);
  ok(
    fresh.skill === null && fresh.allowRun === false,
    'shorter transcript: state is rebuilt from the start',
  );
  fs.rmSync(root3, { recursive: true, force: true });
}

fs.rmSync(ROOT, { recursive: true, force: true });

console.log(
  `investigate guard: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
