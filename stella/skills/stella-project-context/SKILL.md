---
name: stella-project-context
description: >
  Lead-run skill that writes and maintains the project context stella-build loads on every
  run: project-context/project.md and project-context/architecture.md. Modes setup, refresh,
  record, audit (optional, detected when omitted). Scans the repo with read-only subagents,
  verifies every path, shows every write before making it, never commits. Use when the user
  invokes /stella-project-context, asks to create, refresh or audit the project context, or
  reports a mistake an agent made in this repo.
---

# Stella Project Context

Produces and maintains two committed files that `stella-build` loads as persistent facts:

| File                            | Budget     | Holds                                                                                                               |
| ------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `{context-dir}/project.md`      | ≤ 60 lines | orientation, policy, where things are, running and verifying, conventions that differ from defaults, known pitfalls |
| `{context-dir}/architecture.md` | ≤ 90 lines | layers, request flow, data, wiring, background and integrations, cross-component rules, canonical files             |

Shapes and section rules: `references/template.md`. What is admitted, excluded and retired: `references/best-practices.md`. **Read both before anything else.** Every decision below is made against them.

Conversational. The lead sees every write before it happens and approves it. The skill never commits.

## Resolution

- `{skill-root}` → this skill's installed folder. Bare paths such as `references/template.md` resolve from it.
- `{project-root}` → the working directory. If it is not a git repository root, say so and ask for the repo path.
- `{context-dir}` → `{project-root}/project-context/`.
- Project name → `name` in `{project-root}/_bmad-output/stella/project.json` when present, otherwise the repo folder name, confirmed with the lead.

## Style

Caveman full for chat output: drop articles, filler, pleasantries, hedging; fragments OK; file paths, commands, quoted lines and the two context files exact, never compressed. The two context files follow `references/template.md`, not caveman. Normal language for the Auto-Clarity cases of the caveman skill.

## Guardrails (absolute, every mode)

1. **Only two files are ever written:** `project.md` and `architecture.md` under `{context-dir}`. `CLAUDE.md`, `AGENTS.md`, rule files, docs and source are read, never edited. Never create any other file.
2. **Every path cited exists.** Verify by listing before it enters a file. Every claim about what a command does is read from the script, manifest or CI config that runs it.
3. **Code and tests beat docs.** When a README, `CLAUDE.md` or rule file disagrees with the code or an architecture test, the contradiction becomes a question for the lead. Never copy the doc's claim, never drop it silently.
4. **Pitfalls come only from observed mistakes** with evidence: a recorded lesson, a fixed-twice commit pattern, the lead's recollection, or a mistake an agent made. A scan finding that looks like a trap is a question, not a line.
5. **No git workflow rules in Policy.** Developers handle branches, commits and PRs by hand; `stella-build` never commits. Policy holds secrets, frozen and dead areas, generated files, lead-approval areas, external systems and same-PR obligations only.
6. **Nothing already in an auto-loaded file is repeated.** A rule that lives in `CLAUDE.md` or `AGENTS.md` is paid every session already; `project.md` points at the file once in Orientation instead.
7. **Budgets hold.** Over budget means the weakest line goes, never the budget up.
8. **No write without approval**, and never `git add`, `git commit` or any git command that changes state. `git log`, `git rev-parse`, `git ls-files` are fine.

## Input and mode

`/stella-project-context [setup | refresh | record | audit] [free text]`

The mode is optional. When omitted:

| Situation                                                                           | Mode    |
| ----------------------------------------------------------------------------------- | ------- |
| `{context-dir}` has no `project.md`                                                 | setup   |
| `{context-dir}/project.md` exists and the message describes a mistake an agent made | record  |
| `{context-dir}/project.md` exists, nothing else said                                | refresh |

`audit` is never auto-picked; it runs only by name. A supplied mode that contradicts detection (for example `setup` while the folder exists) is surfaced: state what was found and what was asked, confirm, then proceed.

## Setup

No writes until step 5.

### 1. Assess

Read `CLAUDE.md`, `AGENTS.md`, `.claude/` rule files, `README.md`, contribution and PR template files, `docs/` folders and any lessons or notes file. Report in at most six lines what exists and how it measures up against `best-practices.md`.

If any instruction file has content, open a **ledger**: one entry per independently meaningful instruction, each settled as

- `pointer` — already loaded every session by the harness; `project.md` points at the file, does not repeat it
- `carry` — enters `project.md` or `architecture.md` (name the section), because `stella-build` needs it and no auto-loaded file holds it
- `contradicts` — the code or an architecture test disagrees; asked in step 4
- `skip` — not a rule `stella-build` acts on, or excluded by `best-practices.md`; reason given

The existing files are never modified. The ledger exists so the lead sees where every instruction they wrote went.

If the repo contains separable units (a workspace manifest listing members, directories carrying their own build manifest), name them and ask whether the context covers the root only or includes them. Without that evidence, do not ask.

### 2. Ask what the lead brings

Policy the code cannot show: secrets locations, frozen and dead areas, generated and binary files, lead-approval areas, what agents may do with Jira, Confluence, databases and external APIs, docs or logs that must change in the same PR. Also outside documents: handbooks, wikis, architecture pages. Note paths; do not read them yet.

### 3. Scan with read-only subagents

Fan out in parallel, one subagent per target, each told to ignore `node_modules`, `bin`, `obj`, `dist`, `build`, `.git`, `_bmad`, `_bmad-output`, `.claude`, vendored folders, and to cite one existing path per claim:

| Target                                 | Looks at                                                                                                                       | Feeds                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| layers and wiring                      | solution and project manifests, project references, DI entry points, registration markers                                      | architecture: Layers, Wiring                      |
| request flow and cross-component rules | middleware order, base controllers, pipeline behaviors, auth attributes, result mapping, architecture tests                    | architecture: Request flow, Cross-component rules |
| data                                   | contexts, migrations or schema scripts, transaction helpers                                                                    | architecture: Data                                |
| background and integrations            | jobs, queues, consumers, external clients, reporting                                                                           | architecture: Background and integrations         |
| canonical files                        | the newest complete example of each thing to add (endpoint, command, query, DTO, mapper, config, schema script, service, test) | architecture: Canonical files                     |
| running and verifying                  | CI config, test projects and their settings, scripts, launch settings, README caveats, log paths                               | project: Running and verifying                    |
| conventions                            | what the code does differently from the framework default (auth layers, registration by marker, result types, label placement) | project: Conventions                              |
| recorded lessons                       | lessons files, docs, comments and commit messages that record a mistake                                                        | candidates for Known pitfalls, each with evidence |

Verify every path each subagent returns. A claim without an existing path is dropped. Docs the lead named in step 2 are read now and checked against the code the same way.

### 4. Interview the gaps

Only what no scan reaches: what agents keep getting wrong here, what is off limits, why a constraint exists, each doc-versus-code contradiction from the ledger.

- Never ask what a scan could answer. Asking the lead to confirm a path-checked claim is a defect.
- Ask recall questions ("what do agents get wrong in the importer?"), not review lists.
- Batches of at most eight questions; fewer is better. A batch yielding nothing new means write.
- When the repo contradicts the lead, show the evidence and ask. Never write the claim as given, never drop it silently.

### 5. Show both files, then write them

Compose both files against `references/template.md`. For each pitfall candidate ask first whether a lint rule, architecture test or hook enforces it better than a line; if so propose the check, and the line becomes the fallback if the lead declines.

**Show both files complete, plus the ledger, plus the list of contradictions and how each was settled.** Report each file's line count against its budget. Wait for approval. On approval write the two files, each starting with its provenance line: today's date and `git rev-parse --short HEAD` (or `no VCS`).

### 6. Close

- What went in, what stayed out and why, where each existing instruction landed.
- Line counts against budgets.
- How it loads: `stella-build` reads both files through `persistent_facts` on every run; other sessions do not, unless the lead adds `@project-context/project.md` to their own `CLAUDE.md`.
- Tell the lead to commit `project-context/` themselves. This skill never does.
- Maintenance: re-run after a large change (refresh), run `record` the moment an agent gets something wrong, prefer a check over a new line.

## Refresh

Same steps, step 1 as a diff.

1. Read the provenance line of both files. Run `git log --diff-filter=DR --name-only <sha>..HEAD`. Every cited path that was renamed or deleted is flagged. If `<sha>` is not in history (squash, rebase), say so and fall back to a full re-verification of every line.
2. Re-verify every remaining path and every command claim against the current code. Re-check every caveat still holds (a slow suite that got fast, a workaround for a fixed bug).
3. Rescan with the step 3 subagents for what is new: modules, contexts, integrations, jobs, canonical files that moved.
4. Interview only what changed about how the team works. **Never re-ask what the first run settled.**
5. Show a **diff**, not the full files: lines removed with the reason, lines changed, lines added. Every removal names its ground from `best-practices.md`. Wait for approval, then rewrite both files with the new date and SHA.
6. Close as in setup. The files grow only on new evidence.

## Record

One observed agent mistake becomes at most one line, as it happens.

1. Take the task, the mistake, the correct form, and its evidence (PR, file, log). Ask only for what the message did not give; at most four questions.
2. Check both files for a line already covering it. If one exists, say so and stop, or sharpen it if it was too vague to prevent the mistake.
3. Ask whether a lint rule, architecture test or hook can catch it mechanically. If yes, propose the check first. The line is written only if the lead declines the check.
4. A command error becomes a line under **Running and verifying**; anything else becomes a line under **Known pitfalls**, with its evidence in the justification clause. One occurrence that cost little is noted in the reply, not written; a recurring or costly mistake earns the line now.
5. Show the diff, wait for approval, write with today's date in the provenance line (SHA unchanged unless the files were otherwise re-verified).

## Audit

Re-check every line of both files against the current code and ask of each whether removing it would change agent behaviour.

- Path-check every file, re-verify every command claim and caveat, follow every pointer.
- A line whose referent is gone, that a check now enforces, or that contradicts another live instruction is listed for removal with its ground. A policy or pitfall goes only when the thing it guards is gone or the lead retires it; "nothing failed lately" is not a ground.
- Report contradictions with `CLAUDE.md`, `AGENTS.md` or other instruction files as questions; never edit those files.
- Show the diff, wait for approval, rewrite with the new date and SHA. **Audit ends smaller or equal.**

## Halts

- Not a git repository root and no path given → ask once, HALT.
- `record` with no describable mistake → ask for task, mistake, correct form, evidence; HALT until given.
- Lead declines the proposal → nothing is written; say what was kept unwritten and stop.
