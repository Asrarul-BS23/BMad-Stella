# PR Review Guide

Review a teammate's GitHub PR against its JIRA ticket. One command. Nothing is changed — not the PR, not JIRA, not your code.

## Before you start

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

Both do the same thing. The JIRA ticket is read from the PR title (e.g. `LEADRSC-4699: ...`). If the title has no ticket key, you are asked for it.

## What you get

A file: `bmad-docs/reviewer/{repo}-pr{number}-review-{date}.md`

- **Summary** — verdict in two sentences
- **Test coverage** — `OK`, or what is missing
- **Ripple check** — same problem elsewhere, or none
- **🔴 Blockers** — must fix
- **🟡 Minor** — should fix

Each finding: `File:LINE`, What, Why, Fix.

## Post comments to the PR

After the file is written, you are asked:

```
Post these N comments as a pending review on PR #123? (y/n)
```

You see every comment first: the file, the line, and the text. Each comment is one or two plain sentences, the problem only, no fix.

`y` → a **pending** review is created. Only you can see it. Open the PR on GitHub → **Review changes** → edit or delete anything → **Submit review**. Nothing reaches the author until you press Submit.

`n` → nothing is posted. The findings stay in your local file.

## Safety

While a review runs, a hook blocks every edit, write, and command that is not read-only — in every permission mode, including auto. Your code, your branch, and the PR cannot change.

The only exception: small pure-logic checks (math, dates, regex) may run as throwaway scripts in `bmad-docs/reviewer/.scratch/`. They cannot touch files, run programs, or reach the network. The folder is deleted when the review ends.

## If something goes wrong

| Message                         | Do this                                              |
| ------------------------------- | ---------------------------------------------------- |
| `gh: not logged in`             | `gh auth login`                                      |
| Atlassian MCP not connected     | `/mcp` → Atlassian → authenticate                    |
| Ticket not found                | Paste the ticket key or URL when asked               |
| PR too large                    | Ask the author to split the PR                       |
| Permission prompt on `gh`/`git` | Re-run `npx bmad-stella install`, accept permissions |
