# What belongs in the project context

Rules for deciding what goes into `project.md` and `architecture.md`, for judging what a repo already has, and for explaining both to the runner.

## The test

Not _could an agent derive this_ but _what does it cost when it doesn't_: how much exploration finding it takes, whether the agent is likely to search the right place in time rather than guess, whether it is available at the point of use or only after the mistake, what a retrieval failure costs, and whether it is a rule that must hold or a detail the code already shows.

A line that stops the same rediscovery on every `stella-build` run earns its place, derivable or not. A stored copy of what the agent reads more accurately first-hand does not: it rots, and it is charged on every run.

## Speed of change decides the layer

| Changes             | Examples                                                                                                                                                                  | Goes                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Rarely (years)      | stack, layers, data-flow direction, module ownership, frozen paths, security policy, cross-component invariants, conventions that differ from defaults, test-gate caveats | the two files                                           |
| Sometimes (months)  | canonical files, tool versions, CI steps, observed pitfalls                                                                                                               | the two files, with a SHA, re-verified on refresh       |
| Often (weeks, days) | file lists, function and endpoint names, schema, dependency versions, feature flags, what is in progress                                                                  | never stored; `stella-build` reads the code at run time |

Rules age well, inventories rot. "All DB access goes through `src/repos/`" holds for years; "`src/repos/` has 14 repositories" is wrong next week. Pointers age well, copies rot: "follow `src/api/orders.ts` for a new endpoint" survives edits to that file; a pasted copy does not.

## Admit

- **Policy the code cannot express**: secrets locations, frozen and dead areas, generated files, approval areas, external-system limits, same-PR obligations. Read off an enforcing config, a source file or a memory note; otherwise a marked line, never an inference written as fact.
- **What a manifest cannot say about running the project**: the root test script does nothing in this workspace, integration tests need a service up first, the suite takes eleven minutes so iterate on single files, CI runs a check the test script does not, CI targets the wrong runtime so the local run is the real gate. The obvious invocation that is already right lives in the manifest and earns no line; the correction, the caveat and the right command do.
- **Conventions that differ from ecosystem defaults.** Command invocations count: when the obvious command is wrong here, the exact working invocation earns a line without any observed mistake.
- **Pitfalls with observed evidence**: a recorded lesson, a memory note, the same mistake fixed repeatedly in history, or one an agent made and the runner reported. A repo yields hundreds of trap-looking facts and none of them predict real mistakes; only observed behaviour does. A surprising scan finding is a question, not a line.
- **Runtime behaviour invisible from the repo** once the runner confirms it, a marked line until then: replaying queues, lying health endpoints, environment quirks, exceptions swallowed into a log file.
- **Cross-component rules**, when getting one wrong in one file breaks something elsewhere.
- **Required tool and runtime versions**, read from the project files that declare them, never from the session's environment.
- **Entry points, canonical files and pointers** to where work lands.

Prefer prohibitions to advice, and name the permitted alternative in the same line.

## Exclude

|                                                                                 | Why                                                                                             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Git workflow rules: branches, commit format, push, PR                           | developers do git by hand; `stella-build` never commits, so the line changes no agent behaviour |
| Repo overviews, directory trees, stack lists, controller or feature inventories | derived fresh, more accurately; stored copies rot                                               |
| Anything already in an auto-loaded file (`CLAUDE.md`, `AGENTS.md`)              | paid every session already; point at it once instead                                            |
| People: lead names, module owners, reviewers                                    | people change; the rule ("ask before X") stays, the name goes                                   |
| Style rules an agent self-enforces                                              | belongs in a formatter, linter, hook or CI check; propose the check                             |
| Platitudes                                                                      | already the default                                                                             |
| Transcribed command lists whose obvious invocation is right                     | read from the manifest; a copy drifts the moment a script is renamed                            |
| Pasted code, changelog content, fast-changing facts                             | stale immediately                                                                               |
| Aspirational state, migration plans, history                                    | describe what is; intent belongs in specs, history in git                                       |
| Process documents (gates, review flows, card lifecycle)                         | they live in the team's own rule files; point, do not copy                                      |

## Retire

A policy or pitfall goes only when the thing it guards is gone, or the runner deletes it in the file. Nothing failing lately is not evidence; a working rule erases its own evidence. Any other line faces one question at each write: would removing it change agent behaviour? If no, cut it.

Four grounds for removing a line on refresh or audit, each named in the diff:

1. **Stale or incorrect**: the referent is gone, or the claim was never true; the evidence is named.
2. **Mechanically enforced**: a hook, linter, architecture test or CI check now fails the violation the line names. A tool that only covers the same files does not count.
3. **Harmful or contradictory**: it points agents at the wrong thing, or contradicts another live instruction and loses the reconciliation.
4. **The runner retired it** by deleting the line in the file; refresh does not bring it back.

"It is discoverable somewhere in the repository" is never, alone, a ground.

## Size

Every line is paid on every `stella-build` run, and instruction-following degrades as the loaded set grows. `project.md` ≤ 60 lines, `architecture.md` ≤ 90. Over budget means cut the weakest lines or route them to a check; never raise the budget. Ten lines of evidence means ten lines. A pitfall section that keeps growing is a signal the project needs more enforcement, not a bigger file; say so.

## Accuracy

- Every path is checked to exist before it enters a file.
- Every claim about a command is read from the script, manifest or CI config that runs it.
- Code and architecture tests beat any doc. A doc that disagrees with the code loses: a `contradicts` ledger row and a flag in Orientation, never a copied claim.
- Tool versions come from the project's declaring files, never from the session's environment.
- Both files carry the date and SHA they were verified against. Refresh diffs renames and deletions since that SHA against every line.

## Judging existing instruction files

`CLAUDE.md`, `AGENTS.md`, rule files and docs are the team's testimony: someone paid for every line, usually by watching an agent fail. They are sources, never targets: read, never edited. Every instruction in them gets a ledger entry so the runner sees where it went:

- `pointer`: already loaded every session; `project.md` points at the file, does not repeat it.
- `carry`: enters one of the two files, section named, because `stella-build` needs it and no auto-loaded file holds it.
- `contradicts`: the code or an architecture test disagrees; the code wins, the evidence is shown, the doc is flagged in Orientation, never copied, never dropped silently.
- `skip`: not a rule `stella-build` acts on, or excluded above; reason given.

Report, in this order: what is unverifiable or stale, what is missing against the sections in `template.md`, what is already good, then the ledger.

## Repo or home directory

The two files are committed: shared by the team, consistent across machines, versioned with the code they describe. Rules repeating across all of a developer's projects, or personal preferences, belong in that developer's global agent config, not here.
