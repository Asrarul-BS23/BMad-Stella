# User guide

Open Claude Code at the project root first. New project: run `/stella-init` once.

## Standard dev flow

```
/stella-build LEADRSC-4901
```

Fetches the ticket, writes a spec, implements it, bug-hunts the change live in a browser, reviews the diff. Security checks are part of the review. The changes are in your working tree, the spec under `_bmad-output/implementation-artifacts/`. Nothing is committed: review, then commit by hand before the next ticket. Details: [Stella Build](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1650950184/Stella+Build).

## QA testing

```
/stella-tea-live-testing LEADRSC-4901
```

For QA, on a ticket or a module name. Designs scenarios, writes test cases, runs them in a real browser, and reports with a screenshot for every case. You approve the scenarios and the test cases before anything runs. Test cases and reports are under `_bmad-output/test-artifacts/`. Details: [stella-tea-live-testing](stella-tea-live-testing.md).

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
