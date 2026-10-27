# Project context

One short file of facts, per machine, that every `stella-build` run loads:

```
_bmad-output/stella/project-context/context.md   where things are, layers, files to copy the shape from   (≤ 60 lines)
```

It holds facts only, never rules, so it cannot contradict your team's `CLAUDE.md` or your own memory. It leaves out what the memory files already say: `stella-build` loads `_bmad-output/stella/memory/domain-map.md` and `_bmad-output/stella/memory/patterns.md` beside it.

The file lives under `_bmad-output`, git-ignored: generated on your machine, edited by you, never committed.

## After install

The installer starts the generation in the background and returns. A few minutes later the file exists. Progress and the final report are in `_bmad-output/stella/project-context/.state/worker.log`. If the installer said `claude command not found`, run it yourself:

```
/stella-project-context
```

## After a big change

```
/stella-project-context
```

With the file present this is a refresh: every path is re-verified against the current code, the file is rewritten, and you get a diff of what changed.

## What the skill checks

- Every path exists. Code beats any doc.
- No line states a rule: no never, always, must, should, don't.
- Nothing already in `CLAUDE.md`, rule files, the memory files or the domain docs is repeated.
- At most 60 lines. A check script verifies all of this before the skill says done.
