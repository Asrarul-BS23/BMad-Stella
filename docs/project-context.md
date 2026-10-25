# Project context

Two small files that every Claude Code session and every `stella-build` run loads, plus one line in `CLAUDE.md` that loads them:

```
project-context/project.md        orientation, policy, where things are, running and verifying,
                                  conventions that differ from defaults, known pitfalls   (≤ 60 lines)
project-context/architecture.md   layers, request flow, data, wiring, integrations,
                                  cross-component rules, canonical files                (≤ 90 lines)
CLAUDE.md                         @project-context/project.md, appended; created if missing
```

Anyone runs it. Everything is committed by you; the skill never commits.

## First time

```
/stella-project-context
```

Finds the repo (also from a folder above it, also without git), scans it, reads `CLAUDE.md`, docs and your own Claude memory as sources, and writes. No questions. What only a human can confirm appears as a line starting with `Unverified:`, at most three. Edit or delete those, then commit `project-context/` and `CLAUDE.md`.

## After a big change

```
/stella-project-context
```

With the folder present this is a refresh: every path is re-verified against the current code, both files are rewritten, and you get a diff of what changed.

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
- `CLAUDE.md` gets one appended line and nothing else; `AGENTS.md` and rule files are never edited and never repeated.
- Over budget means a line goes, never a bigger file.
- A check script verifies both files and the `CLAUDE.md` line before the skill says done.
