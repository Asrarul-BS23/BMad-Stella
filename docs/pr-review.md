# PR review

Reviews a GitHub pull request against its Jira ticket. Read-only on the codebase, enforced by a hook.

## Before

`gh` installed and logged in:

```
gh auth login
```

## Run

```
/stella-pr-review https://github.com/org/repo/pull/123
```

Reads the PR, the ticket and the diff, checks ten universal criteria plus one for the stack, and writes the findings.

## Read the result

```
_bmad-output/stella/reviewer/<repo>-pr<number>/review.md
```

Blockers first, then minor items, each with file, line and what to change.

At the end the skill offers to post the findings as a pending GitHub review. Answer `y` or `n`.

## Leave the review

```
*exit
```

Or start another skill. Until then every edit and most commands are blocked by the guard.

## Good to know

- Same PR, same commit: the saved report is shown again. Type `again` for a fresh review.
- Guard message "PR review active: edits are disabled": expected. Finish or `*exit`.
- The guard only runs inside a review session. Outside it nothing is blocked.
