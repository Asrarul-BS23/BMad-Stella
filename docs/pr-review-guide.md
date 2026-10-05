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

Each finding: `File:LINE`, What, Why, Fix. Send the file to the PR author.

## If something goes wrong

| Message                         | Do this                                              |
| ------------------------------- | ---------------------------------------------------- |
| `gh: not logged in`             | `gh auth login`                                      |
| Atlassian MCP not connected     | `/mcp` → Atlassian → authenticate                    |
| Ticket not found                | Paste the ticket key or URL when asked               |
| PR too large                    | Ask the author to split the PR                       |
| Permission prompt on `gh`/`git` | Re-run `npx bmad-stella install`, accept permissions |
