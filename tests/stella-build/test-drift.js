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

  // 2026-10-26 — no version-control check: the developer manages git (one place, no fact).
  'step-01-clarify-and-route.md': [
    {
      line: 80,
      from: '3. Version control sanity check. Is the working tree clean? Does the current branch make sense for this intent — considering its name and recent history? If the tree is dirty or the branch is an obvious mismatch, HALT and ask the human before proceeding. If version control is unavailable, skip this check.',
      to: '3. No version-control check: the developer manages branches and the working tree. Continue.',
    },
  ],

  // Task 6b-2 — settings only; every official key keeps its place.
  'customize.toml': [
    {
      line: 17,
      from: 'activation_steps_prepend = []',
      to: [
        'activation_steps_prepend = [',
        '  """',
        'Jira intent (Stella). If the invocation text is a Jira key or URL: set `{jira_key}`; run `node _bmad/custom/stella/utils/jira-attachments {jira_key}` and read its stdout JSON.',
        '- Exit 0: read the manifest it names and its attachments (images, PDF, text); that is the intent for step 01. A Jira parent or epic is not a BMad epic.',
        '- Exit 20: print its `message`, then fetch the issue through the Atlassian MCP if it responds and say "Continuing with the Atlassian MCP. Attachments are skipped until the token is fixed."; if it does not respond, say "Run /mcp and authenticate atlassian, or fix the token, then re-run." and HALT.',
        '- Any other failure: print its `message` and HALT.',
        'Keep `jira_key: {jira_key}` in the spec frontmatter whenever the spec is written or rewritten. After the spec is approved, run `node _bmad/custom/stella/utils/jira-attachments <KEY> --purge` for every ticket fetched in this run. A spec path or anything else: say nothing, continue as normal.',
        '""",',
        ']',
      ],
    },
    {
      line: 27,
      from: 'persistent_facts = []',
      to: [
        'persistent_facts = [',
        '  "file:_bmad-output/stella/project-context/context.md",',
        '  "file:_bmad-output/stella/memory/patterns.md",',
        '  "Step 02 investigation runs in this session, no subagents: start from memory and project-context, then read the code yourself.",',
        '  "Review patches are applied in this session, the same way the implementation was.",',
        '  "Step 01 reads the ticket and the artifact listing only; code reading starts in step 02.",',
        ']',
      ],
    },
    {
      line: 32,
      from: 'on_complete = ""',
      to: [
        'on_complete = """',
        'Jira comment (Stella). If `{jira_key}` is empty, read `jira_key` from the spec frontmatter; none → do nothing. Compose a short comment (what changed, verification, review result, anything deferred, spec path), write it to `{project-root}/_bmad-output/stella/cache/jira/{jira_key}/comment.md`, show it, and ask "Post to {jira_key}? (y/n)" in the same message as the completion summary. On y: run `node _bmad/custom/stella/utils/jira-comment {jira_key}` and read its stdout JSON. Exit 20: print its `message`, then post the same text through the Atlassian MCP if it responds, else say "Comment not posted." Any other failure: print its `message`. Never change status, assignee, labels or attachments.',
        '"""',
      ],
    },
    // 2026-10-26 — implementation in the main session (dev feedback: slow, lost knowledge).
    {
      line: 69,
      from: 'Launch a subagent with no prior conversation context, with this prompt:',
      to: 'Implement {spec_file} in this session, now. Load every file in its frontmatter `context:` first; the spec is the source of truth. Then report what you changed, how you verified it, and anything left incomplete or risky.',
    },
    { line: 70, from: '', to: null },
    {
      line: 71,
      from: '> Read {spec_file} fully and implement it — the spec is the sole source of truth. Load every file listed in its frontmatter `context:` before you start.',
      to: null,
    },
    { line: 72, from: '>', to: null },
    {
      line: 73,
      from: '> When done, report what you changed, how you verified it, and anything left incomplete or risky.',
      to: null,
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
