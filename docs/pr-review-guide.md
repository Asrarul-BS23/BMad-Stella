# PR Review Guide

Review a teammate's GitHub PR against its JIRA ticket. One command. Nothing changes on the PR, in JIRA, or in your code unless you say yes to posting comments at the end.

## Before you start

After BMad is installed in your project (permissions step accepted):

- `gh` installed and logged in: [cli.github.com](https://cli.github.com), then `gh auth login`
- Atlassian MCP connected: `/mcp` in Claude Code

## Run it

**Way 1 — through the reviewer agent**

```
/BMad:agents:reviewer
*pr-review https://github.com/{org}/{repo}/pull/123
```

**Way 2 — direct command**

```
/BMad:tasks:review-pr https://github.com/{org}/{repo}/pull/123
```

Same result. The JIRA ticket is read from the PR title (e.g. `LEADRSC-4699: ...`). No key in the title → you are asked for it.

## What you get

`bmad-docs/reviewer/{repo}-pr{number}-review-{date}.md`

- **Summary** — verdict in two sentences
- **Test coverage** — `OK`, or what is missing
- **Ripple check** — same problem elsewhere, or none
- **🔴 Blockers** / **🟡 Minor** — each with `File:LINE`, What, Why, Fix

## Post comments to the PR

After the file is written:

```
Post these N comments as a pending review on PR #123? (y/n)
```

You see every comment first. Each is one or two plain sentences at the exact line: the problem only, no fix.

- `y` → a **pending** review, visible only to you. On GitHub: **Review changes** → edit or delete anything → **Submit review**. Nothing reaches the author until you press Submit.
- `n` → nothing is posted.

## Safety

While a review runs, a hook blocks every edit, write, and non-read-only command, in every permission mode. Your code, your branch, and the PR cannot change. Small pure-logic checks (math, dates, regex) may run as throwaway scripts in `bmad-docs/reviewer/.scratch/`, which is deleted when the review ends.

## If something goes wrong

| Message                           | Do this                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `gh: not logged in`               | `gh auth login`                                                                    |
| Atlassian MCP not connected       | `/mcp` → Atlassian → authenticate                                                  |
| Ticket not found                  | Paste the ticket key or URL when asked                                             |
| PR too large                      | Over 300 files: reviewed from local git. Over 1000: ask the author to split the PR |
| PR head changed since the review  | Run `*pr-review` again                                                             |
| You already have a pending review | On GitHub: Submit or Cancel it, then post again                                    |
| Permission prompt on `gh`/`git`   | Re-run the BMad installer and accept the permissions step                          |
