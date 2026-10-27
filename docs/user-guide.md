# User guide

Open Claude Code at the project root first.

## Project context (once per repo)

```
/stella-project-context
```

Better done first, by anyone. It writes `project-context/` and one import line in `CLAUDE.md`, asks nothing, and every session and every `stella-build` run loads it from then on. Review the two files and commit them. `stella-build` still works without it.

## Standard dev flow

```
/stella-build LEADRSC-4901
```

Fetches the ticket, writes a spec, implements it, reviews the diff. The changes are in your working tree, the spec under `_bmad-output/implementation-artifacts/`. Nothing is committed: review, then commit by hand before the next ticket. Details: [Stella Build](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1650950184/Stella+Build).

## Security check (optional)

```
/stella-security _bmad-output/implementation-artifacts/spec-leadrsc-4901-....md
```

`stella-build`'s review already covers most of it. Run this when the task touches input handling, auth, permissions or data access, or whenever you want a security check.

## Reviewing a pull request

```
/stella-pr-review https://github.com/org/repo/pull/123
```

After opening your PR, or when reviewing someone else's. Checks the PR against its ticket, writes findings under `_bmad-output/stella/reviewer/`, and offers to post them to GitHub. Details: [PR Review Guide](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1609760769/PR+Review+Guide).

## Other skills

```
/stella-domain-expert
```

Ask how the project works, from its domain docs.

```
/caveman
```

Terse replies for the rest of the session. `/caveman stop` turns it off.

## What happens on its own

- After a build session ends, a friction log is written under `_bmad-output/stella/bmad-logs/`.
- Desktop notification when Claude needs a permission or stops.
