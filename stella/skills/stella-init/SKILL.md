---
name: stella-init
description: >
  Sets up BMad-Stella in the current project: creates _bmad/ and _bmad-output/, picks the
  project and fetches the domain docs. Uses this machine's user-level install when there is
  one, and works without it too (Cowork, or the plugin added by hand). Use when the user
  invokes /stella-init, when a session-start message says BMad-Stella is not set up in this
  folder, or when the user asks for the setup status (/stella-init status).
---

# stella-init

Sets up one project.

## Resolution

- `{app}` → `<home>/.claude/stella/app/tools/installer/bin/bmad.js`, with `<home>` the absolute path of the user's home folder. `bmad-stella install` puts it there.
- `{run}` → how every command below is started:
  - `{app}` exists → `node "{app}"`. This is the **machine path**: a few seconds, no download.
  - `{app}` does not exist → `npx -y bmad-stella@latest`. This is the **Cowork path**: the machine was never set up with `bmad-stella install`. It downloads BMad into the project, about 90 seconds.
- Run every command from the session's working directory, unchanged. The command finds the project root itself: the working directory, a parent that holds `_bmad/`, or the one direct child that does.

## Guardrails

- Run only the commands below. Do not copy, create or edit `_bmad/`, `_bmad-output/`, `.claude/` or `.gitignore` by hand.
- The commands under "Cowork path only" are yours to run. Never ask the user to run them.
- A command fails → show its output as it is and stop. Do not retry with other arguments.

## Status

Invoked as `/stella-init status`: run `{run} init --status`, show its lines as a short table, stop.

## Setup

1. Run `{run} init --status`.
   - It prints an `update pending:` line → the project's `_bmad/` comes from an older install than the one on this machine. Say so, then run `{run} init` (no `--project`; the saved project is kept) to bring it up to date now, and relay the result. Stop.
   - It prints the project and a `_bmad` line with a version id → the project is already set up. Show the table, say so, stop. Continue only when the user asked to set it up again, to change the project, or to fetch the domain docs again.
   - It says several folders hold `_bmad/` → ask the user which folder, and add `--root "<folder>"` to every command below.
2. **Cowork path only — Atlassian credentials.** Run `{run} init --check-credentials`.
   - `credentials: saved` → nothing to ask.
   - `credentials: missing` or `rejected` → ask the user, in one interactive question, whether to enter the Atlassian email and API token now or to save the file themselves later. The question must show this exact URL, unchanged, as the place to create the token: https://id.atlassian.com/manage-profile/security/api-tokens — never a shortened link, another Atlassian page or a description of where to click. It must also say that a token typed here stays in this conversation.
     - Entered → run `{run} init --save-credentials --email "<email>" --token "<token>"`. It verifies the pair and saves the file; do not ask where to save. `credentials: rejected` → say so and ask once more, or let the user skip.
     - Skipped → show the file path and the lines the check printed, and add `--no-credentials` to the command in step 4.
3. Project name. Use the one the user gave in the invocation. Otherwise, when the status in step 1 already shows a project, keep that one. Otherwise:
   - **Cowork path only**, with credentials saved: run `{run} init --suggest-project`. A `suggestion:` other than `none` → ask the user one yes/no question, "Use <name>?". No, or `none` → ask the user to pick from the `projects:` line.
   - Machine path: run `{run} init --list-projects` and ask the user to pick one of the printed names.
   - No credentials → ask the user for the project name.
   - `Other` means the project has no domain docs page; then ask for the name to use.
4. Run `{run} init --project "<name>"`. It prints one line per step.
5. Relay the result in a few lines: the project root, what was set up, and which jobs still run in the background (memory, project context). Tell the user that `stella-build` works right away and that `/stella-init status` shows the background jobs. Without credentials, say that the domain docs were not fetched and repeat how to add the credentials file.
