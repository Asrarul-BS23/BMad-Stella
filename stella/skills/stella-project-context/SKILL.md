---
name: stella-project-context
description: >
  Writes and maintains the project context that every stella-build run loads:
  _bmad-output/stella/project-context/project.md and architecture.md, per machine.
  Anyone runs it; the installer runs it once in the background. Modes setup, refresh,
  record, audit (optional, detected when omitted). Works with or without git, scans the
  repo from evidence, asks nothing, verifies every path, writes and then shows what it
  wrote, never commits. Use when the user invokes /stella-project-context, asks to
  create, refresh or audit the project context, or reports a mistake an agent made in
  this repo.
disable-model-invocation: true
---

# Stella Project Context

Produces and maintains two files, per machine, that `stella-build` loads as persistent facts:

| File                            | Budget     | Holds                                                                                                               |
| ------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `{context-dir}/project.md`      | ≤ 60 lines | orientation, policy, where things are, running and verifying, conventions that differ from defaults, known pitfalls |
| `{context-dir}/architecture.md` | ≤ 90 lines | layers, request flow, data, wiring, background and integrations, cross-component rules, canonical files             |

Shapes and section rules: `references/template.md`. What is admitted, excluded and retired: `references/best-practices.md`. **Read both before anything else.** Every decision below is made against them.

Anyone runs it, and the installer runs it once in the background. It asks nothing, writes from evidence, checks the result with `scripts/check-context.js`, then shows what it wrote. The files live under `_bmad-output`, git-ignored, so they are this machine's and the runner edits them freely. The skill never commits.

## Resolution

- `{skill-root}` → this skill's installed folder. Bare paths such as `references/template.md` resolve from it.
- The runner → the person who invoked this skill.
- `{project-root}` → the working directory, always. `{repo}` is the folder git commands and the scan start from:
  1. The working directory is a git repository root → `{repo}` is the working directory.
  2. Several git roots one level down: `{repo}` is the main repo, the one named like the project in `_bmad-output/stella/project.json`, else the one the others depend on. Say which and why. The context describes the main repo; each other repo gets one line under Background and integrations. Paths carry the repo folder.
  3. No git anywhere → `{repo}` is the working directory; say "no version control, provenance by date only".
- `{context-dir}` → `{project-root}/_bmad-output/stella/project-context/`.
- `{sha}` → `git rev-parse --short HEAD` in `{repo}`, or `none` without git.
- Project name → `name` in `{project-root}/_bmad-output/stella/project.json` when present, otherwise the folder name.
- Ignore list for every scan and count: `node_modules`, `bin`, `obj`, `dist`, `build`, `.git`, `.venv`, `_bmad`, `_bmad-output`, `.claude`, vendored folders.

## Style

Plain, short chat. File paths, commands and quoted lines exact. The two context files follow `references/template.md`.

## Guardrails (absolute, every mode)

1. **Two writes only:** `project.md` and `architecture.md` under `{context-dir}`. `CLAUDE.md`, `AGENTS.md`, rule files, docs and source are read only. Nothing else is created.
2. **Every path cited exists.** Verify by listing before it enters a file. Every claim about what a command does is read from the script, manifest or CI config that runs it.
3. **Code and tests beat docs.** When a README, `CLAUDE.md`, rule file or memory note disagrees with the code or an architecture test, the code wins: the claim is dropped, logged in the ledger as `contradicts`, and Orientation flags the doc. The claim is logged, not copied.
4. **Pitfalls come only from observed mistakes** with evidence: a recorded lesson, a fixed-twice commit pattern, a memory note, or a mistake an agent made. A scan finding that looks like a trap is not a line.
5. **No git workflow rules in Policy.** Developers handle branches, commits and PRs by hand; `stella-build` never commits. Policy holds secrets, frozen and dead areas, generated files, approval areas, external systems and same-PR obligations only.
6. **Nothing already in an auto-loaded file is repeated.** A rule that lives in `CLAUDE.md`, `AGENTS.md` or a rule file is paid every session already; `project.md` points at the file once in Orientation instead.
7. **Budgets hold.** Over budget means the weakest line goes, never the budget up.
8. **No questions.** What the evidence cannot settle becomes a marked line (`references/template.md`, "Marked lines"), at most three across both files. The only question this skill ever asks is in `record`: a missing mistake or correct form.
9. **Git is read only:** `git log`, `git rev-parse`, `git ls-files`. No `git add`, `git commit` or any other state-changing command.

## Input and mode

`/stella-project-context [setup | refresh | record | audit] [free text]`

The mode is optional. When omitted:

| Situation                                                                           | Mode    |
| ----------------------------------------------------------------------------------- | ------- |
| `{context-dir}` has no `project.md`                                                 | setup   |
| `{context-dir}/project.md` exists and the message describes a mistake an agent made | record  |
| `{context-dir}/project.md` exists, nothing else said                                | refresh |

`audit` is never auto-picked; it runs only by name. A supplied mode that contradicts detection (for example `setup` while the folder exists, or `audit` without `project.md`) is surfaced in one line, then the detected mode runs.

## Setup

No writes until step 4.

### 1. Assess

Read, as sources: `CLAUDE.md`, `AGENTS.md`, `.claude/` rule files, `README.md`, contribution and PR template files, `docs/` folders, any lessons or notes file, CI config, and the runner's auto memory (the memory directory named in the system prompt, `MEMORY.md` and the files it indexes) when it exists on this machine. Report in at most six lines what exists and how it measures up against `best-practices.md`.

If any source has content, open a **ledger**: one entry per independently meaningful instruction, each settled as

- `pointer` — already loaded every session by the harness; `project.md` points at the file, does not repeat it
- `carry` — enters `project.md` or `architecture.md` (name the section), because agents need it and no auto-loaded file holds it
- `contradicts` — the code or an architecture test disagrees; the code wins, the doc is flagged in Orientation
- `skip` — not a rule an agent acts on, or excluded by `best-practices.md`; reason given

The sources stay untouched. The ledger exists so the runner sees where every instruction went.

### 2. Scan

Count files under `{repo}` outside the ignore list (`git ls-files` with git, a directory walk without).

- **Up to 500 files:** read the tree, the manifests and the entry points in this session, target by target as in the table.
- **More:** fan out read-only subagents in parallel, one per target, each told the ignore list and to return a short list of facts, one existing path per claim, nothing else.

| Target                                 | Looks at                                                                                                                       | Feeds                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| layers and wiring                      | solution and project manifests, project references, DI entry points, registration markers                                      | architecture: Layers, Wiring                      |
| request flow and cross-component rules | middleware order, base controllers, pipeline behaviors, auth attributes, result mapping, architecture tests                    | architecture: Request flow, Cross-component rules |
| data                                   | contexts, migrations or schema scripts, transaction helpers                                                                    | architecture: Data                                |
| background and integrations            | jobs, queues, consumers, external clients, reporting, the other repos one level down                                           | architecture: Background and integrations         |
| canonical files                        | the newest complete example of each thing to add (endpoint, command, query, DTO, mapper, config, schema script, service, test) | architecture: Canonical files                     |
| running and verifying                  | CI config, test projects and their settings, scripts, launch settings, README caveats, log paths                               | project: Running and verifying                    |
| conventions                            | what the code does differently from the framework default (auth layers, registration by marker, result types, label placement) | project: Conventions                              |
| policy evidence                        | `.gitignore` and secret files, codegen scripts and generated folders, frozen or legacy folders, external clients               | project: Policy, as fact or as a marked line      |
| recorded lessons                       | lessons files, docs, comments, memory notes and commit messages that record a mistake                                          | candidates for Known pitfalls, each with evidence |

Verify every path returned. A claim without an existing path is dropped. Docs the sources point at are read now and checked against the code the same way.

### 3. Mark the gaps

What no scan reaches and no source states: approval areas, what agents may do with external systems, why a constraint exists, a frozen folder that only looks frozen. Each becomes one marked line in the section it belongs to, at most three across both files: keep the three that would most change agent behaviour, drop the rest. Nothing is asked.

### 4. Write

Compose both files against `references/template.md`, each starting with its provenance line: today's date and `{sha}`. Write them. For each pitfall, when a lint rule, architecture test or hook would enforce it better than a line, write the line now and name the check in the close.

Then, from `{project-root}`, run (do not read) `node .claude/skills/stella-project-context/scripts/check-context.js`. Do not modify the command. Fix every `FAIL:` line it prints and run it again; the step ends only on `ok`. If the command itself cannot run, report its output and stop: the files are then unverified.

### 5. Close

- Both files complete, the ledger, the marked lines, the contradictions and how each was settled.
- The check script's `ok` line, quoted.
- Line counts against budgets.
- How it loads: `stella-build` reads both files through `persistent_facts` on every run on this machine.
- Tell the runner: review the two files, edit or delete the marked lines. They stay on this machine; nothing to commit.
- Maintenance: refresh after a large change, `record` the moment an agent gets something wrong, prefer a check over a new line.

## Refresh

Same steps, step 1 as a diff.

1. Read the provenance line of both files. With git, run `git log --diff-filter=DR --name-only <sha>..HEAD` in `{repo}`; every cited path that was renamed or deleted is flagged. If `<sha>` is not in history (squash, rebase) or there is no git, say so and fall back to a full re-verification of every line.
2. Re-verify every remaining path and every command claim against the current code. Re-check every caveat still holds (a slow suite that got fast, a workaround for a fixed bug).
3. Rescan as in setup step 2 for what is new: modules, contexts, integrations, jobs, canonical files that moved.
4. Start from the current files, not from scratch: every existing line is verified and kept, or removed with a ground; new evidence is added; a line the runner deleted stays deleted. A line that no longer starts with `Unverified:` is an ordinary line and is verified like one; a line still marked is kept and reported as open. Write both files with the new date and `{sha}`. Run the check script as in setup step 4.
5. Show a **diff**, not the full files: lines removed with the reason, lines changed, lines added, marked lines still open. Every removal names its ground from `best-practices.md`.
6. Close as in setup. The files grow only on new evidence.

## Record

One observed agent mistake becomes at most one line, as it happens.

1. Take the task, the mistake, the correct form, and its evidence (PR, file, log) from the message. If the mistake or the correct form is missing, ask once for both; otherwise ask nothing.
2. Check both files for a line already covering it. If one exists, say so and stop, or sharpen it if it was too vague to prevent the mistake.
3. A command error becomes a line under **Running and verifying**; anything else becomes a line under **Known pitfalls**, with its evidence in the justification clause. One occurrence that cost little is noted in the reply, not written; a recurring or costly mistake earns the line now.
4. Write, with today's date in the provenance line (`{sha}` unchanged unless the files were otherwise re-verified). Run the check script as in setup step 4. Show the diff. When a lint rule, architecture test or hook could catch the mistake mechanically, name the check in the reply; the line stays until the check exists.

## Audit

Re-check every line of both files against the current code and ask of each whether removing it would change agent behaviour.

- Path-check every file, re-verify every command claim and caveat, follow every pointer.
- A line whose referent is gone, that a check now enforces, or that contradicts another live instruction is removed with its ground named. A policy or pitfall goes only when the thing it guards is gone; "nothing failed lately" is not a ground. The runner retires a policy line by deleting it in the file.
- Contradictions with `CLAUDE.md`, `AGENTS.md` or other instruction files are reported, never edited there.
- Rewrite with the new date and `{sha}`. Run the check script as in setup step 4. Show the diff. **Audit ends smaller or equal.**

## Halts

- `record` with no describable mistake → ask once for the mistake and the correct form; HALT until given.
