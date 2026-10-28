# stella-build — changes against official bmad-build 6.12.2

Base: `bmad-build` from `bmad-method@6.12.2` (pristine copy in `tests/fixtures/bmad-build-6.12.2/`).
Every difference between this folder and the fixture must be listed here. `tests/stella-build/test-drift.js` enforces it: a file not listed below must be byte-identical to the fixture, and a listed file may differ only in the lines described.

Rule: copy exactly, change only where a requirement demands it. Settings go in `customize.toml` (this folder's own file); step files are edited only for what a setting cannot express.

## Changes

### SKILL.md

- Line 2: `name: bmad-build` → `name: stella-build`. Makes the copy a second, distinct skill in Claude Code. (Task 6b-1, 2026-10-14)

### workflow.md

- Lines 7–8: "Subagents, when the capability is available, are an important part of this workflow…" and the line asking for permission to run them are replaced by one line: "Subagents run only the review layers. Everything else (planning, epic context, spec review, implementation, review fixes) runs in this session." This is the only place in the skill that says when subagents are allowed; every other step says "yourself, in this session". The AIL-552 run launched three search subagents in step 02 and an implementer subagent in step 03 because the official text still pointed there (user decision 2026-10-28).

### customize.toml

Three official keys filled, nothing else touched. The `_bmad/custom/stella-build.toml` override file is never created; these are the defaults. (Task 6b-2, 2026-10-16)

- Line 17 `activation_steps_prepend`: one step, the Jira intent. A Jira key or URL becomes `{jira_key}`; the ticket (text, comments, parent, links, attachments: images, PDF, text) is fetched with the `jira-attachments` helper and its manifest is the intent for step 01. Exit 20 (token expired): the helper's message is printed, then the Atlassian MCP is the fallback for the text, or the run halts with the `/mcp` line. Any other failure: message, halt. `jira_key` is kept in the spec frontmatter on every write. After spec approval the cached attachments of every ticket fetched in the run are purged with the helper's `--purge`; nothing reads them after step 01 (2026-10-27). A Jira parent is never a BMad epic. A spec path or raw text changes nothing and prints nothing. Helper commands use the project-relative path (`node _bmad/custom/stella/utils/...`) so they match the installed permission rules and never prompt (2026-10-27). (Token-first rewrite 2026-10-23.)
- Line 27 `persistent_facts`: three entries. `file:_bmad-output/stella/project-context/context.md` (the per-machine facts from `stella-project-context`, written by the installer in the background) and the memory file `file:_bmad-output/stella/memory/patterns.md`; the context repeats nothing the memory files hold, and missing files load nothing (2026-10-27). `domain-map.md` is not listed: the memory hook's `UserPromptExpansion` injects it with `MEMORY.md` on `/stella-build`, so listing it here loaded it twice (removed 2026-10-27). No caveman: the spec is the implementer's only input, so it stays in normal language (removed 2026-10-25). The fact "Step 02 investigation runs in this session, no subagents" (2026-10-26) is removed: workflow.md line 7 now says it, so the fact and the official text no longer disagree (2026-10-28). The fact "Review patches are applied in this session, the same way the implementation was." (2026-10-26) is removed: step 04 now says "Apply the patches yourself", and "the same way the implementation was" would follow a subagent if one were ever used (2026-10-28). Step 01 reads the ticket and the artifact listing only, so code reading happens once, in step 02 (a pilot run spent three minutes in step 01 reading views; 2026-10-26).
- Line 32 `on_complete`: `{jira_key}` from the run or the spec frontmatter; none → nothing. Compose a short comment, write it to `_bmad-output/stella/cache/jira/{key}/comment.md`, show it, ask y/n in the same message as the summary. On y the `jira-comment` helper posts it (token). Exit 20: message, then the Atlassian MCP as fallback, else "Comment not posted." Never change status, assignee, labels or attachments. (Token-first rewrite 2026-10-23.)
- Line 68 `implementation_handoff`: the session implements the spec itself after loading its `context:` files, and reports in the official shape. No implementer subagent: the coder is the planner that read the code (dev feedback, 2026-10-26).

- Lines 63–64, the comment above `implementation_handoff`: "implementation subagent" → "implementation" and "a subagent by default, but an override may run it any other way" → "an override may run it any other way". Comment only; the render step never shows it to the model (2026-10-28).

Skipped by decision: a fourth security review layer. Security stays with `/stella-security`.

### step-01-clarify-and-route.md

Lines 61–63: the epic-context compile ("Preferred — subagent" with an inline fallback) becomes one line: produce `epic-<N>-context.md` yourself, in this session, by reading `compile-epic-context.md` and following it. Same file, same verify step; no subagent (workflow.md line 7, 2026-10-28). Only runs for BMad epic stories, never for a Jira ticket.

Line 80: the version-control sanity check is replaced by "No version-control check: the developer manages branches and the working tree. Continue." No halt on a dirty tree or an odd branch, no allow-list fact; the review diff stays the official one, everything since HEAD (user decision 2026-10-27).

### step-02-plan.md

- Line 12: "Investigate the codebase. When you can, send deep searches to subagents…" becomes "Find the code to change. Start from what is already loaded: CLAUDE.md, auto memory, Stella memory, project context. Then read only: the files you will change, their tests, one existing example of the same pattern, and the types they use." The rest of the line is official. A bounded list in the session itself, after the pre-task reading list of addyosmani/agent-skills `context-engineering`; the planner that writes the Code Map is the one that read the code (dev feedback: unnecessary searching, 2026-10-28).
- Line 14: "Keep looking until you know, or until those sources have nothing more to say." is removed; it had no stopping point (2026-10-28).
- Line 56, the "Review spec" checkpoint option: "use a subagent if available" is removed; the spec is reviewed in this session (workflow.md line 7, 2026-10-28).

### step-03-implement.md

Lines 33–35: the paragraph about what not to put "in the dispatch", "the subagent's sole source of truth", "if no subagents are available, implement directly" and "keep the subagent available for re-engagement", and the paragraph "The handoff directs the subagent to load the spec's `context:` files itself…", are replaced by one line: "Implement it yourself, in this session. The spec is the source of truth." Both paragraphs assumed a subagent does the work, so the AIL-552 run read our handoff ("Implement {spec_file} in this session, now…") as the subagent's prompt and launched an implementer subagent. Loading the `context:` files is in the handoff itself (workflow.md line 7, 2026-10-28).

Line 41 (39 after the deletions above): only its last sentence changes, "Judge against the diff, not against the implementation subagent's report." → "Judge against the diff, not against what you remember implementing." The rest of the line is official (2026-10-28).

### step-04-review.md

Lines 65–75, the `patch` bullet, deletions only: the sentences "Re-engage the step-03 implementation subagent … Send it one message, exactly this, with the findings filled in:", the message block addressed to that subagent (lines 66–74), and "If it cannot be continued, " are removed. What remains is the official text: "Auto-fix. These are the only findings that survive loopbacks." then "Apply the patches yourself. Then re-run the checks …" (workflow.md line 7, 2026-10-28).

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
