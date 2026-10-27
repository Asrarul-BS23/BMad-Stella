# stella-build

The official BMad `bmad-build` skill with Stella behaviour. Builds one ticket: plan, implement, review. Never commits.

## Start

```
/stella-build LEADRSC-4901
```

Or paste the Jira URL. The ticket, its comments and attachments (images and PDFs included) are fetched and become the intent. The downloaded attachments are removed once the spec is approved.

```
/stella-build _bmad-output/implementation-artifacts/spec-leadrsc-4901-....md
```

Plain text also works. Nothing is fetched from Jira.

## What it does

1. Clarifies the intent. Asks only when something is unclear.
2. Writes a spec under `_bmad-output/implementation-artifacts/` and shows it for approval.
3. Implements it in the same session, from the spec and its context files.
4. Reviews the diff with three review subagents. Fixes are applied in the same session.
5. Shows a short summary and offers to post a comment on the Jira ticket. Answer `y` or `n`.

## After it ends

- The changes are in your working tree, uncommitted. Review them.
- Run `/stella-security` on the spec if the ticket touches input, auth or data.
- Commit by hand before the next ticket.

## Good to know

- `_bmad-output/stella/project-context/context.md` and the memory files `_bmad-output/stella/memory/domain-map.md` and `_bmad-output/stella/memory/patterns.md` are loaded on every run when they exist. The installer generates the context in the background: [project-context.md](project-context.md).
- The skill never checks the branch or the working tree. Changes already uncommitted before the run appear in the review diff.
- The ticket is fetched with your Jira token. If the token has expired, the run says so and continues through the Atlassian MCP without attachments; if that is not authenticated either, it stops and tells you to run `/mcp` or fix the token.
