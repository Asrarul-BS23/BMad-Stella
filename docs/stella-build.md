# stella-build

The official BMad `bmad-build` skill with Stella behaviour. Builds one ticket: plan, implement, review. Never commits.

## Start

```
/stella-build LEADRSC-4901
```

Or paste the Jira URL. The ticket, its comments and attachments (images included) are fetched and become the intent.

```
/stella-build _bmad-output/implementation-artifacts/spec-leadrsc-4901-....md
```

Resumes an existing spec.

```
/stella-build add a cancel button to the export dialog
```

Plain text also works. Nothing is fetched from Jira.

## What it does

1. Clarifies the intent. Asks only when something is unclear.
2. Writes a spec under `_bmad-output/implementation-artifacts/` and shows it for approval.
3. Implements it with a subagent that reads only the spec.
4. Reviews the diff with three review subagents. Fixes go back to the implementer.
5. Shows a short summary and offers to post a comment on the Jira ticket. Answer `y` or `n`.

Chat and the spec are in caveman style. Code, tests and the diff are normal.

## After it ends

- The changes are in your working tree, uncommitted. Review them.
- Run [stella-security](stella-security.md) on the spec if the ticket touches input, auth or data.
- Commit by hand before the next ticket. A dirty tree at the next start triggers a question.

## Good to know

- Project context from `project-context/` is loaded on every run when the lead has created it: [project-context.md](project-context.md).
- A dirty `.gitignore` or `project-context/` does not count as a dirty tree.
- No Atlassian connector: the run stops and asks you to connect it or paste the ticket text.
- The official `/bmad-build` is also installed. Use `/stella-build` for Stella projects; it is the one that posts to Jira and never commits.
