---
name: stella-init
description: >
  Sets up BMad-Stella in the current project from this machine's user-level install:
  copies _bmad/ from the master copy, picks the project, creates _bmad-output/ and fetches
  the domain docs. Use when the user invokes /stella-init, when a session-start message
  says BMad-Stella is not set up in this folder, or when the user asks for the setup
  status (/stella-init status).
---

# stella-init

Sets up one project. The machine part (`bmad-stella setup`) is done once per device and is not this skill's job.

## Resolution

- `{app}` → `<home>/.claude/stella/app/tools/installer/bin/bmad.js`, with `<home>` the absolute path of the user's home folder.
- Run every command from the session's working directory, unchanged. The command finds the project root itself: the working directory, a parent that holds `_bmad/`, or the one direct child that does.

## Guardrails

- Run only the commands below. Do not copy, create or edit `_bmad/`, `_bmad-output/`, `.claude/` or `.gitignore` by hand.
- `{app}` does not exist → stop and tell the user to run `npx bmad-stella@latest setup` in a terminal once, then `/stella-init` again. Where no terminal setup is possible on this machine, the project install `npx bmad-stella@latest install` does the same for this one project.
- A command fails → show its output as it is and stop. Do not retry with other arguments.

## Status

Invoked as `/stella-init status`: run `node "{app}" init --status`, show its lines as a short table, stop.

## Setup

1. Run `node "{app}" init --status`.
   - It prints the project and a `_bmad` line with a version id → the project is already set up. Show the table, say so, stop. Continue only when the user asked to set it up again or to change the project.
   - It says several folders hold `_bmad/` → ask the user which folder, and add `--root "<folder>"` to every command below.
2. Project name. Use the one the user gave in the invocation. Otherwise, when the status in step 1 already shows a project (a project being switched from the per-project install), keep that one. Otherwise run `node "{app}" init --list-projects` and ask the user to pick one of the printed names; `Other` means the project has no domain docs page, then ask for the name to use.
3. Run `node "{app}" init --project "<name>"`. It takes a few seconds and prints one line per step.
4. Relay the result in a few lines: the project root, what was set up, and which jobs still run in the background (memory, project context). Tell the user that `stella-build` works right away and that `/stella-init status` shows the background jobs.
