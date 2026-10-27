# Project context

Two small files, per machine, that every `stella-build` run loads:

```
_bmad-output/stella/project-context/project.md        orientation, policy, where things are, running and verifying,
                                                      conventions that differ from defaults, known pitfalls   (≤ 60 lines)
_bmad-output/stella/project-context/architecture.md   layers, request flow, data, wiring, integrations,
                                                      cross-component rules, canonical files                (≤ 90 lines)
```

They live under `_bmad-output`, git-ignored: generated on your machine, edited by you, never committed.

## After install

The installer starts the generation in the background and returns. A few minutes later both files exist. Progress and the final report are in `_bmad-output/stella/project-context/.state/worker.log`. If the installer said `claude command not found`, run it yourself:

```
/stella-project-context
```

No questions. What only a human can confirm appears as a line starting with `Unverified:`, at most three. Edit or delete those.

## After a big change

```
/stella-project-context
```

With the files present this is a refresh: every path is re-verified against the current code, both files are rewritten, and you get a diff of what changed.

## When an agent gets something wrong

```
/stella-project-context the agent used BeginTransactionAsync in a handler, it must use the transaction factory
```

Records one observed mistake as one line and names a lint rule or test that would catch it, when one exists.

## Once in a while

```
/stella-project-context audit
```

Re-checks every line. Only removes or fixes. The files end smaller or equal.

## Rules the skill follows

- Every path is verified. Code and architecture tests beat any doc.
- Pitfalls come only from observed mistakes, never from guesses.
- No git rules in Policy: developers commit by hand.
- Several repos in one folder: the main one is described, the others get one line each.
- `CLAUDE.md`, `AGENTS.md` and rule files are never edited and never repeated.
- Over budget means a line goes, never a bigger file.
- A check script verifies both files before the skill says done.
