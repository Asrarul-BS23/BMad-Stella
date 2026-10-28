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

  // 2026-10-28 — subagents only for the review layers; stated once, here (AIL-552 run used subagents for search and implementation).
  'workflow.md': [
    {
      line: 7,
      from: 'Subagents, when the capability is available, are an important part of this workflow. Use them as directed by the workflow steps.',
      to: 'Subagents run only the review layers. Everything else (planning, epic context, spec review, implementation, review fixes) runs in this session.',
    },
    {
      line: 8,
      from: 'If you need an explicit user instruction to run them, ask once now for the whole workflow run.',
      to: null,
    },
  ],

  // 2026-10-26 — no version-control check: the developer manages git (one place, no fact).
  'step-01-clarify-and-route.md': [
    // 2026-10-28 — epic context compiled in this session; subagents only for review (workflow.md line 7).
    {
      line: 61,
      from: '     3. **Compile epic context.** Produce `{{.implementation_artifacts}}/epic-<N>-context.md` by following `[[bmad-snapshot:compile-epic-context.md]]`, in order of preference:',
      to: '     3. **Compile epic context.** Produce `{{.implementation_artifacts}}/epic-<N>-context.md` yourself, in this session: read `[[bmad-snapshot:compile-epic-context.md]]` and follow its instructions.',
    },
    {
      line: 62,
      from: '        - **Preferred — subagent:** spawn a subagent synchronously (wait for it to return in this turn) with `[[bmad-snapshot:compile-epic-context.md]]` as its prompt. Pass it the epic number, the epics file path, the `{{.planning_artifacts}}` directory, and the output path `{{.implementation_artifacts}}/epic-<N>-context.md`.',
      to: null,
    },
    {
      line: 63,
      from: '        - **Fallback — inline** (for runtimes without subagent support, e.g. Copilot, Codex, local Ollama, older Claude): if your runtime cannot spawn subagents, or the spawn fails/times out, read `[[bmad-snapshot:compile-epic-context.md]]` yourself and follow its instructions to produce the same output file.',
      to: null,
    },
    {
      line: 80,
      from: '3. Version control sanity check. Is the working tree clean? Does the current branch make sense for this intent — considering its name and recent history? If the tree is dirty or the branch is an obvious mismatch, HALT and ask the human before proceeding. If version control is unavailable, skip this check.',
      to: '3. No version-control check: the developer manages branches and the working tree. Continue.',
    },
  ],

  // 2026-10-28 — step 02 reads a bounded set of files instead of open-ended investigation (dev feedback: unnecessary searching).
  'step-02-plan.md': [
    // 2026-10-28 — spec review in this session; subagents only for review layers (workflow.md line 7).
    {
      line: 56,
      from: '- **Review spec** — review the spec, use a subagent if available, and discuss the findings and revisions with the user until the user is ready to approve, then either stop or continue.',
      to: '- **Review spec** — review the spec yourself and discuss the findings and revisions with the user until the user is ready to approve, then either stop or continue.',
    },
    {
      line: 12,
      from: '2. Investigate the codebase. When you can, send deep searches to subagents and wait for them in this turn. Tell them to return short summaries only, so this session does not fill up with their notes. Keep only what the work needs: the specific files, symbols or lines, what to reuse, and what not to change. Write that into the Code Map. Do not retell the investigation when implementation starts — the spec already has it.',
      to: '2. Find the code to change. Start from what is already loaded: CLAUDE.md, auto memory, Stella memory, project context. Then read only: the files you will change, their tests, one existing example of the same pattern, and the types they use. Keep only what the work needs: the specific files, symbols or lines, what to reuse, and what not to change. Write that into the Code Map. Do not retell the investigation when implementation starts — the spec already has it.',
    },
    {
      line: 14,
      from: '   Do not ask the human during investigation. When something is unclear, look in the repository, planning artifacts, or history first. Keep looking until you know, or until those sources have nothing more to say. Leave any remaining choice for the next step.',
      to: '   Do not ask the human during investigation. When something is unclear, look in the repository, planning artifacts, or history first. Leave any remaining choice for the next step.',
    },
  ],

  // 2026-10-28 — implementation in this session; the dispatch and subagent lines go (AIL-552 run launched an implementer subagent).
  'step-03-implement.md': [
    {
      line: 33,
      from: "Do not add goal restatements, file lists, ownership boundaries, investigation detail, acceptance criteria, or CLAUDE.md/house-style rules to the dispatch — the spec is the subagent's sole source of truth, and that material already lives in it (investigation findings in its Code Map, the rest in the spec body). One line of sanctioned hedging belongs in the spec at planning time, not in the dispatch. If no subagents are available, implement directly from the spec. If the platform allows, keep the subagent available for re-engagement after it returns — step-04 may send it review fixes.",
      to: 'Implement it yourself, in this session. The spec is the source of truth.',
    },
    { line: 34, from: '', to: null },
    {
      line: 35,
      from: "The handoff directs the subagent to load the spec's `context:` files itself, so never pre-load and paste those files into the dispatch. Only when you implement directly (no subagent available) do you load a non-empty `context:` list yourself before starting.",
      to: null,
    },
    {
      line: 41,
      from: "Stage the diff and read it first: using the repository's version-control tooling, write a unified diff of all changes since `{baseline_commit}` (from `{spec_file}` frontmatter) — untracked files included — to a uniquely-named file in the system temp directory, set `{diff_file}` to its absolute path, and read that file into your own context. Judge against the diff, not against the implementation subagent's report.",
      to: "Stage the diff and read it first: using the repository's version-control tooling, write a unified diff of all changes since `{baseline_commit}` (from `{spec_file}` frontmatter) — untracked files included — to a uniquely-named file in the system temp directory, set `{diff_file}` to its absolute path, and read that file into your own context. Judge against the diff, not against what you remember implementing.",
    },
  ],

  // 2026-10-28 — review patches applied in this session: the subagent re-engagement and its message are removed (deletions only).
  'step-04-review.md': [
    {
      line: 65,
      from: '   - **patch** — Auto-fix. These are the only findings that survive loopbacks. Re-engage the step-03 implementation subagent — the same one, addressed by the name or id its launch returned; a fresh launch is not re-engagement. Send it one message, exactly this, with the findings filled in:',
      to: '   - **patch** — Auto-fix. These are the only findings that survive loopbacks.',
    },
    { line: 66, from: '', to: null },
    { line: 67, from: '     ```text', to: null },
    {
      line: 68,
      from: '     Review of your implementation found problems. Fix each one below with the smallest change that does the job.',
      to: null,
    },
    { line: 69, from: '', to: null },
    {
      line: 70,
      from: '     Run only the tests that cover the files you edit — nothing wider. Full verification runs on my side after you return. Reply with what you changed.',
      to: null,
    },
    { line: 71, from: '', to: null },
    {
      line: 72,
      from: '     - <file> — <what is wrong> — <what the smallest fix must do>',
      to: null,
    },
    { line: 73, from: '     ```', to: null },
    { line: 74, from: '', to: null },
    {
      line: 75,
      from: "     If it cannot be continued, apply the patches yourself. Then re-run the checks in `{spec_file}`'s `## Verification` section, if present; if verification fails and the failure cannot be fixed, HALT and escalate to the human. Rewrite `{diff_file}` so it reflects the patched tree.",
      to: "     Apply the patches yourself. Then re-run the checks in `{spec_file}`'s `## Verification` section, if present; if verification fails and the failure cannot be fixed, HALT and escalate to the human. Rewrite `{diff_file}` so it reflects the patched tree.",
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
    // 2026-10-28 — comment only: subagent words removed (the run never sees it; kept consistent for maintainers).
    {
      line: 63,
      from: '# Handoff for the implementation subagent in step 03. The whole execution',
      to: '# Handoff for the implementation in step 03. The whole execution',
    },
    {
      line: 64,
      from: '# recipe — a subagent by default, but an override may run it any other way',
      to: '# recipe — an override may run it any other way',
    },
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
