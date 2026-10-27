---
name: stella-project-context
description: >
  Writes and refreshes the project context that every stella-build run loads:
  _bmad-output/stella/project-context/context.md, one short file of facts, per machine.
  Anyone runs it; the installer runs it once in the background. Setup when the file is
  missing, refresh when it exists. Scans the repo from evidence, asks nothing, verifies
  every path, writes and then shows what it wrote, never commits. Use when the user
  invokes /stella-project-context or asks to create or refresh the project context.
disable-model-invocation: true
---

# Stella Project Context

Writes one file, `{context-dir}/context.md`, at most 60 lines, that `stella-build` loads with the memory files `_bmad-output/stella/memory/domain-map.md` and `_bmad-output/stella/memory/patterns.md`.

Shape and sections: `references/template.md`. What is admitted and excluded: `references/best-practices.md`. **Read both before anything else.**

It asks nothing, writes from evidence, checks the result with `scripts/check-context.js`, then shows what it wrote. The file lives under `_bmad-output`, git-ignored, so it is this machine's and the runner edits it freely. The skill never commits.

## Resolution

- `{skill-root}` → this skill's installed folder. Bare paths such as `references/template.md` resolve from it.
- The runner → the person who invoked this skill.
- `{project-root}` → the working directory, always. `{repo}` is the folder git commands and the scan start from:
  1. The working directory is a git repository root → `{repo}` is the working directory.
  2. Several git roots one level down: `{repo}` is the main repo, the one named like the project in `_bmad-output/stella/project.json`, else the one the others depend on. Say which and why. The other repos get one line each under Where things are. Paths carry the repo folder.
  3. No git anywhere → `{repo}` is the working directory; say "no version control, provenance by date only".
- `{context-dir}` → `{project-root}/_bmad-output/stella/project-context/`.
- `{sha}` → `git rev-parse --short HEAD` in `{repo}`, or `none` without git.
- Project name → `name` in `{project-root}/_bmad-output/stella/project.json` when present, otherwise the folder name.
- Ignore list for every scan and count: `node_modules`, `bin`, `obj`, `dist`, `build`, `.git`, `.venv`, `_bmad`, `_bmad-output`, `.claude`, vendored folders.

## Guardrails

1. **One write:** `{context-dir}/context.md`. Everything else is read only.
2. **Facts only.** No line instructs: no "never", "always", "must", "should" or "don't".
3. **Nothing already known.** What `CLAUDE.md`, `AGENTS.md`, rule files, the memory files or the domain-knowledge docs say stays out.
4. **Every path cited exists** and is written in full from `{project-root}`; a bare file name is not a path. A fact with "only", "none", "every" or a specific value is written only after reading the line that proves it.
5. **Budget holds:** at most 60 lines. Over budget means the weakest line goes.
6. **No questions.**
7. **Git is read only:** `git log`, `git rev-parse`, `git ls-files`.

## Mode

`/stella-project-context`. No `context.md` → setup. `context.md` exists → refresh.

## Setup

1. **Read what is already known.** `CLAUDE.md`, `AGENTS.md`, `.claude/` rule files, `_bmad-output/stella/memory/domain-map.md`, `_bmad-output/stella/memory/patterns.md` and the file names in `_bmad-output/stella/domain-knowledge/`. Note what they cover, to leave it out.
2. **Scan.** Count files under `{repo}` outside the ignore list (`git ls-files` with git, a directory walk without). Up to 500 files: read the solution or workspace manifests, project references and folders in this session. More: fan out read-only subagents in parallel, one per section of the template, each told the ignore list and to return facts with one existing path each.
3. **Write** `context.md` against `references/template.md`, line 1 the provenance line with today's date and `{sha}`.
4. **Check.** From `{project-root}`, run (do not read) `node .claude/skills/stella-project-context/scripts/check-context.js`. Do not modify the command. Fix every `FAIL:` line and run it again; the step ends only on `ok`. If the command itself cannot run, report its output and stop: the file is then unverified.
5. **Close.** Show the file, quote the check's `ok` line, give the line count, and say: `stella-build` loads it on every run on this machine; edit it freely.

## Refresh

1. Read the provenance line. With git, run `git log --diff-filter=DR --name-only <sha>..HEAD` in `{repo}`; every cited path renamed or deleted is flagged. If `<sha>` is not in history or there is no git, re-verify every line.
2. Start from the current file: every line is verified and kept, or removed; new facts are added; a line the runner deleted stays deleted.
3. Write with the new date and `{sha}`, run the check as in setup step 4, and show a diff: lines removed with the reason, lines added.
