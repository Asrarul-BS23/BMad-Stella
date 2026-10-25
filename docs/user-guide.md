# User guide

Open Claude Code at the project root first.

## Project context (lead, once)

```
/stella-project-context
```

Better done first, by the project lead. It writes `project-context/`, git tracked, and every `stella-build` run loads it before reading the ticket. `stella-build` works fine without it. Details: [project-context.md](project-context.md).

## Standard dev flow

```
/stella-build LEADRSC-4901
```

Fetches the ticket, writes a spec, implements it, reviews the diff. The changes are in your working tree, the spec under `_bmad-output/implementation-artifacts/`. Nothing is committed: review, then commit by hand before the next ticket. Details: [stella-build.md](stella-build.md).

## Security check (optional)

```
/stella-security _bmad-output/implementation-artifacts/spec-leadrsc-4901-....md
```

`stella-build`'s review already covers most of it. Run this when the task touches input handling, auth, permissions or data access, or whenever you want a security check. Details: [stella-security.md](stella-security.md).

## Reviewing a pull request

```
/stella-pr-review https://github.com/org/repo/pull/123
```

After opening your PR, or when reviewing someone else's. Checks the PR against its ticket, writes findings under `_bmad-output/stella/reviewer/`, and offers to post them to GitHub. Details: [pr-review.md](pr-review.md).

## Other skills

```
/stella-domain-expert
```

Ask how the project works, from its domain docs. Details: [domain-expert.md](domain-expert.md).

```
/caveman
```

Terse replies for the rest of the session. `/caveman stop` turns it off.

## What happens on its own

- After a build session ends, a friction log is written: [friction-logger.md](friction-logger.md).
- Desktop notification when Claude needs a permission or stops.
