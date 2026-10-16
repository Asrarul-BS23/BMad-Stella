'use strict';

// Migration Task 6 — stella-build is a copy of the official bmad-build 6.12.2 skill.
// The pristine reference lives in tests/fixtures. Every difference must be an agreed
// one: ALLOWED below mirrors CHANGES.md line by line. A file not in ALLOWED must be
// byte-identical; a file in ALLOWED must equal the fixture with exactly the listed
// rules applied — each rule replaces one fixture line (`from`) with `to`: a string,
// an array of lines, or null to delete the line.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO = path.resolve(__dirname, '..', '..');
const SKILL = path.join(REPO, 'stella', 'skills', 'stella-build');
const FIXTURE = path.join(REPO, 'tests', 'fixtures', 'bmad-build-6.12.2');

// Files that exist on one side only, by design.
const SKILL_ONLY = new Set(['CHANGES.md']);
const FIXTURE_ONLY = new Set(['SOURCE.md']);

const NO_COMMIT =
  'Do not commit, push or open a pull request. The developer reviews the working tree and commits by hand before the next ticket.';

const ALLOWED = {
  'SKILL.md': [{ line: 2, from: 'name: bmad-build', to: 'name: stella-build' }],

  // Task 6b-2 — settings only; every official key keeps its place.
  'customize.toml': [
    {
      line: 17,
      from: 'activation_steps_prepend = []',
      to: [
        'activation_steps_prepend = [',
        '  """',
        'Jira intent (Stella). Look at what the user passed with the skill invocation.',
        '- A Jira issue key (pattern `ABC-123`) or a Jira issue URL: set `{jira_key}` to the key. Fetch the issue through the Atlassian connector: summary, description, acceptance criteria, comments, linked issues. If the connector is unavailable or not authorized, HALT with: Atlassian connector not connected. Connect it in your Claude account settings, or paste the ticket text. Then run `node _bmad/custom/stella/utils/jira-attachments {jira_key}` and read its stdout JSON; open the manifest it names and read every image attachment, and the text of other attachments where relevant. If the helper fails, say so in one line and continue with the issue text. The fetched issue plus attachments are the intent for step 01. When the spec file is created, add `jira_key: {jira_key}` to its frontmatter.',
        '- A path to an existing spec file: read `jira_key` from its frontmatter if present, say nothing, continue as normal.',
        '- Anything else: say nothing, continue as normal.',
        '""",',
        ']',
      ],
    },
    {
      line: 27,
      from: 'persistent_facts = []',
      to: [
        'persistent_facts = [',
        '  "file:project-context/project.md",',
        '  "file:project-context/architecture.md",',
        '  "For the version-control check in step 01 and the diff in step 03, ignore changes to `.gitignore` and `project-context/`. A tree where only those differ counts as clean, and those paths are left out of the review diff.",',
        '  "Caveman full (`.claude/skills/caveman/SKILL.md`) for chat, the spec body and the Jira comment. Exact, never compressed: frontmatter, headings, paths, symbols, commands, code, error text, ticket keys, and order or condition words in a step. Code, tests, diff and deferred-work file: normal language.",',
        ']',
      ],
    },
    {
      line: 32,
      from: 'on_complete = ""',
      to: [
        'on_complete = """',
        'Jira comment (Stella). If `{jira_key}` is empty, do nothing. Otherwise compose a short comment in caveman: what changed, how it was verified, the review result, anything deferred, the spec path. Show it in chat and ask: Post to {jira_key}? (y/n). On y, add it as a comment on the issue through the Atlassian connector. On n, or if the connector is unavailable, say so in one line and stop. Never change status, assignee, labels or attachments.',
        '"""',
      ],
    },
  ],

  // Task 6b-2 — git read-only: no commit, no hash, no PR offer.
  'step-05-present.md': [
    { line: 19, from: '### Commit and Complete', to: '### Complete' },
    {
      line: 21,
      from: 'If version control is available and the tree is dirty, create a local commit with a conventional message derived from the spec title.',
      to: NO_COMMIT,
    },
    { line: 31, from: '- The commit hash, if one was created.', to: null },
    {
      line: 35,
      from: 'Offer applicable next actions in one short line: when version control and a remote are available, create a pull request (and push first if needed); use `bmad-walkthrough`; or make another change.',
      to: 'Offer applicable next actions in one short line: use `bmad-walkthrough`; or make another change.',
    },
  ],
  'step-oneshot.md': [
    { line: 81, from: '### Commit', to: '### Complete' },
    {
      line: 83,
      from: 'If git is available and there are uncommitted changes, commit with a conventional message based on the Intent. If git is not available, skip.',
      to: NO_COMMIT,
    },
    { line: 93, from: '- Commit hash, if you made one.', to: null },
    {
      line: 97,
      from: 'Offer next steps in one line: create a PR (push first if needed) when git and a remote exist; use `bmad-walkthrough`; or make another change.',
      to: 'Offer next steps in one line: use `bmad-walkthrough`; or make another change.',
    },
  ],
};

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

const listFiles = (dir, base = dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).replaceAll('\\', '/'));
  }
  return out.sort();
};
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const lines = (file) => fs.readFileSync(file, 'utf8').split('\n');

ok(fs.existsSync(SKILL), 'stella/skills/stella-build exists');
ok(fs.existsSync(FIXTURE), 'tests/fixtures/bmad-build-6.12.2 exists');

const skillFiles = listFiles(SKILL).filter((f) => !SKILL_ONLY.has(f));
const fixtureFiles = listFiles(FIXTURE).filter((f) => !FIXTURE_ONLY.has(f));

ok(fixtureFiles.length === 16, `fixture holds the 16 official files (${fixtureFiles.length})`);
for (const required of ['SKILL.md', 'workflow.md', 'customize.toml', 'step-05-present.md']) {
  ok(fixtureFiles.includes(required), `fixture has ${required}`);
}
ok(fs.existsSync(path.join(SKILL, 'CHANGES.md')), 'skill has CHANGES.md');
ok(fs.existsSync(path.join(FIXTURE, 'SOURCE.md')), 'fixture has SOURCE.md');

const missing = fixtureFiles.filter((f) => !skillFiles.includes(f));
const extra = skillFiles.filter((f) => !fixtureFiles.includes(f));
ok(missing.length === 0, `no official file missing from the skill (${missing.join(', ')})`);
ok(extra.length === 0, `no unlisted extra file in the skill (${extra.join(', ')})`);

// ---- unlisted files: byte-identical ----
const drifted = fixtureFiles.filter(
  (f) =>
    !ALLOWED[f] &&
    skillFiles.includes(f) &&
    sha(path.join(SKILL, f)) !== sha(path.join(FIXTURE, f)),
);
ok(drifted.length === 0, `every unlisted file identical to the fixture (${drifted.join(', ')})`);

// ---- listed files: fixture + rules === skill, nothing else ----
for (const [file, rules] of Object.entries(ALLOWED)) {
  const a = lines(path.join(FIXTURE, file));
  const b = lines(path.join(SKILL, file));
  const byLine = new Map(rules.map((r) => [r.line, r]));
  const expected = [];
  for (const [i, text] of a.entries()) {
    const r = byLine.get(i + 1);
    if (!r) {
      expected.push(text);
      continue;
    }
    ok(text === r.from, `${file}:${r.line} fixture reads "${r.from.slice(0, 60)}"`);
    if (r.to === null) continue;
    expected.push(...(Array.isArray(r.to) ? r.to : [r.to]));
  }
  const firstDiff = expected.findIndex((l, i) => l !== b[i]);
  ok(
    expected.length === b.length && firstDiff === -1,
    `${file}: equals the fixture with only the agreed changes applied (first difference at skill line ${
      firstDiff === -1 ? b.length + 1 : firstDiff + 1
    })`,
  );
}

// ---- the git prohibition and the Stella settings are really in place ----
const step05 = fs.readFileSync(path.join(SKILL, 'step-05-present.md'), 'utf8');
const oneshot = fs.readFileSync(path.join(SKILL, 'step-oneshot.md'), 'utf8');
for (const [name, text] of [
  ['step-05', step05],
  ['oneshot', oneshot],
]) {
  ok(
    !/create a local commit|commit with a conventional|pull request \(|create a PR/.test(text),
    `${name}: no commit or PR instruction left`,
  );
  ok(text.includes(NO_COMMIT), `${name}: carries the no-commit sentence`);
  ok(!/commit hash/i.test(text), `${name}: no commit hash in the summary`);
}
const toml = fs.readFileSync(path.join(SKILL, 'customize.toml'), 'utf8');
ok(/^activation_steps_append = \[\]$/m.test(toml), 'toml: activation_steps_append untouched');
ok(/^open_spec = ""$/m.test(toml), 'toml: open_spec untouched');
ok(
  (toml.match(/^\[\[workflow\.review_layers\]\]$/gm) || []).length === 3,
  'toml: three review layers, none added',
);
ok(!/stella-security/.test(toml), 'toml: no security review layer (skipped by decision)');

// ---- CHANGES.md names every listed file ----
const changes = fs.readFileSync(path.join(SKILL, 'CHANGES.md'), 'utf8');
for (const file of Object.keys(ALLOWED)) {
  ok(changes.includes(`### ${file}`), `CHANGES.md has a section for ${file}`);
}
ok(!/none yet/.test(changes), 'CHANGES.md no longer says "none yet"');

const crlf = [
  ...fixtureFiles.map((f) => path.join(FIXTURE, f)),
  ...skillFiles.map((f) => path.join(SKILL, f)),
]
  .filter((f) => fs.readFileSync(f, 'utf8').includes('\r\n'))
  .map((f) => path.relative(REPO, f));
ok(crlf.length === 0, `no CRLF line endings (${crlf.join(', ')})`);

const ignore = fs.readFileSync(path.join(REPO, '.prettierignore'), 'utf8');
ok(
  ignore.includes('stella/skills/stella-build/') && ignore.includes('tests/fixtures/'),
  '.prettierignore excludes the skill copy and the fixture',
);

console.log(
  `stella-build drift: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
