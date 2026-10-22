# Project context

For the project lead. Writes two small files that every `stella-build` run loads before reading the ticket:

```
project-context/project.md        orientation, policy, where things are, running and verifying,
                                  conventions that differ from defaults, known pitfalls   (≤ 60 lines)
project-context/architecture.md   layers, request flow, data, wiring, integrations,
                                  cross-component rules, canonical files                (≤ 90 lines)
```

Both are committed. The skill never commits; you do.

## First time

```
/stella-project-context
```

Scans the repo with read-only subagents, reads `CLAUDE.md`, `AGENTS.md` and docs as sources, asks you at most eight questions, shows both files complete, and writes them after your approval. Commit `project-context/`.

## After a big change

```
/stella-project-context
```

With the folder present this is a refresh: every path is re-verified against the current code, and you see a diff before anything is rewritten.

## When an agent gets something wrong

```
/stella-project-context the agent used BeginTransactionAsync in a handler, it must use the transaction factory
```

Records one observed mistake as one line, or proposes a lint rule or test instead. Show, approve, written.

## Once in a while

```
/stella-project-context audit
```

Re-checks every line. Only removes or fixes. The files end smaller or equal.

## Rules the skill follows

- Every path is verified. Code and architecture tests beat any doc.
- Pitfalls come only from observed mistakes, never from guesses.
- No git rules in Policy: developers commit by hand.
- `CLAUDE.md` and `AGENTS.md` are never edited and never repeated.
- Over budget means a line goes, never a bigger file.
