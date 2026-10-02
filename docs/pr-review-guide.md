# PR Review Guide

Review a teammate's GitHub PR against its JIRA ticket in one command. Read-only — nothing is changed on the PR, in JIRA, or in your code.

## Setup (once)

```bash
gh auth login
```

Installs: [GitHub CLI](https://cli.github.com). Atlassian MCP must already be connected (`/mcp`).

## Run

```
/reviewer
*pr-review https://github.com/{org}/{repo}/pull/123
```

The JIRA key is taken from the PR title (e.g. `LEADRSC-4699: ...`). No key in the title → you are asked for it.

## What you get

`bmad-docs/reviewer/{repo}-pr{number}-review-{date}.md`

- **Summary** — verdict + biggest concern
- **Checked, no issues** — areas verified, names only
- **Test coverage** — `OK` or `MISSING — what`
- **Ripple check** — same issue elsewhere, or none
- **🔴 Blockers / 🟡 Minor** — each with `File:LINE`, What / Why / Fix

Send the findings to the PR author. They fix and push.

## What it checks

Requirements & scope drift · logic & data integrity · security (auth, permissions, injection, secrets) · performance · API contracts · observability · coding style · architecture · tests · code smells · wiring & registration (only where your stack has it).

Style and architecture are judged against the **existing codebase**, not docs.

## How it reads the PR

| Need                            | Command                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| PR details, head SHA            | `gh pr view`                                                 |
| Diff                            | `gh pr diff`                                                 |
| CI status                       | `gh pr checks`                                               |
| Whole file / callers at PR head | `git fetch origin pull/N/head`, then `git show` / `git grep` |

`git fetch` only downloads objects into `.git`. Your branch and files are untouched.

## Safety

- Never edits source, never comments on the PR, never touches JIRA.
- Installer adds deny rules: `gh api` and every PR-mutating `gh pr` command are hard-blocked.

## Troubleshooting

| Problem                         | Fix                                                               |
| ------------------------------- | ----------------------------------------------------------------- |
| `gh: not logged in`             | `gh auth login`                                                   |
| Ticket not found                | Check the key in the PR title, or paste the ticket URL when asked |
| `bad object` after fetch        | PR was force-pushed — re-run the command                          |
| Permission prompt on `gh`/`git` | Re-run `npx bmad-stella install` and accept the permissions step  |
