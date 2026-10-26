# stella-build — changes against official bmad-build 6.12.2

Base: `bmad-build` from `bmad-method@6.12.2` (pristine copy in `tests/fixtures/bmad-build-6.12.2/`).
Every difference between this folder and the fixture must be listed here. `tests/stella-build/test-drift.js` enforces it: a file not listed below must be byte-identical to the fixture, and a listed file may differ only in the lines described.

Rule: copy exactly, change only where a requirement demands it. Settings go in `customize.toml` (this folder's own file); step files are edited only for what a setting cannot express.

## Changes

### SKILL.md

- Line 2: `name: bmad-build` → `name: stella-build`. Makes the copy a second, distinct skill in Claude Code. (Task 6b-1, 2026-10-14)

### customize.toml

Three official keys filled, nothing else touched. The `_bmad/custom/stella-build.toml` override file is never created; these are the defaults. (Task 6b-2, 2026-10-16)

- Line 17 `activation_steps_prepend`: one step, the Jira intent. A Jira key or URL becomes `{jira_key}`; the ticket (text, comments, parent, links, attachments: images, PDF, text) is fetched with the `jira-attachments` helper and its manifest is the intent for step 01. Exit 20 (token expired): the helper's message is printed, then the Atlassian MCP is the fallback for the text, or the run halts with the `/mcp` line. Any other failure: message, halt. `jira_key` is kept in the spec frontmatter on every write. A Jira parent is never a BMad epic. A spec path or raw text changes nothing and prints nothing. (Token-first rewrite 2026-10-23.)
- Line 27 `persistent_facts`: six entries. `file:project-context/project.md` and `file:project-context/architecture.md` (the lead-made context from `stella-project-context`; missing files load nothing). The clean-tree allow-list: `.gitignore` and `project-context/` do not count as dirty in step 01 and are left out of the step 03 diff. No caveman: the spec is the implementer's only input, so it stays in normal language (removed 2026-10-25). Step 02 investigation runs in the session itself, no search subagents, memory and project-context first: the planner that writes the Code Map is the one that read the code (dev feedback, 2026-10-26). Review patches are applied in the session too, since step 04 would otherwise address an implementer subagent that no longer exists. Step 01 reads the ticket, the artifact listing and git state only, so code reading happens once, in step 02 (a pilot run spent three minutes in step 01 reading views; 2026-10-26).
- Line 32 `on_complete`: `{jira_key}` from the run or the spec frontmatter; none → nothing. Compose a short comment, write it to `_bmad-output/stella/cache/jira/{key}/comment.md`, show it, ask y/n in the same message as the summary. On y the `jira-comment` helper posts it (token). Exit 20: message, then the Atlassian MCP as fallback, else "Comment not posted." Never change status, assignee, labels or attachments. (Token-first rewrite 2026-10-23.)
- Line 68 `implementation_handoff`: the session implements the spec itself after loading its `context:` files, and reports in the official shape. No implementer subagent: the coder is the planner that read the code (dev feedback, 2026-10-26).

Skipped by decision: a fourth security review layer. Security stays with `/stella-security`.

### step-05-present.md

Git read-only: developers commit by hand, the skill never does. (Task 6b-2, 2026-10-16)

- Line 19: `### Commit and Complete` → `### Complete`.
- Line 21: the local-commit instruction → "Do not commit, push or open a pull request. The developer reviews the working tree and commits by hand before the next ticket."
- Line 31: `- The commit hash, if one was created.` removed from the summary.
- Line 35: the pull-request offer removed from the next-actions line; `bmad-walkthrough` and "make another change" remain.

Kept on purpose: `baseline_commit` (step 03, a `rev-parse`) and the diff file (step 03). Both are read-only and feed the review layers and `/stella-security`.

### step-oneshot.md

Same four edits as step-05-present.md for the oneshot route. (Task 6b-2, 2026-10-16)

- Line 81: `### Commit` → `### Complete`.
- Line 83: the local-commit instruction → the same no-commit sentence.
- Line 93: `- Commit hash, if you made one.` removed.
- Line 97: the PR offer removed from the next-steps line.
