<!-- Powered by Stella Development Team -->

# review-pr

The pr-reviewer reviews the code changes in a GitHub PR against its requirements (JIRA ticket or raw requirements) using the 9 review criteria, and records the findings in a review summary under `bmad-docs/reviewer/`.

## Inputs

```yaml
required:
  - pr_url: 'GitHub pull request link (e.g., https://github.com/{org}/{repo}/pull/123)'
  - requirements: 'JIRA ticket (key or URL) OR raw requirements (quoted text, or path to a .md/.txt file)'
```

HALT if `pr_url` is missing or the pull request cannot be reached. HALT if `requirements` cannot be resolved (ticket not retrievable, or the text/file is empty).

## Context Gain

Before reviewing, gather the context the review depends on:

- **Requirements** — the intent the PR is checked against. Resolve from the `requirements` input:
  - JIRA ticket (key or URL) → fetch via Atlassian MCP: title, description, acceptance criteria, relevant comments.
  - Raw requirements → read the quoted text or the `.md`/`.txt` file as given.

  Capture the acceptance criteria and business intent — this is the yardstick for the review.

- **Pull request** — fetch via GitHub MCP from `pr_url`: title, description, and the diff (changed files + hunks). The diff is the implementation under review.
- **Architecture docs** — `coding-standards.md`, `tech-stack.md`, `project-structure.md` are already loaded at agent activation. Treat them as the rule book.
- **Domain knowledge** — extract 3-5 key terms from the requirements (module, entity, action, feature area). For each term, `Grep` over `domainKnowledge.location` from core-config.yaml — `output_mode=content, context=5`. Capture only relevant snippets. Never bulk-read `bmad-docs/domain-knowledge/`.

The developer's implementation plan is intentionally NOT consulted — the reviewer judges the PR against the requirements and the implementation itself, not against how the dev planned it.

## Review the Change Set

Change set = the PR diff fetched during Context Gain — the files and hunks GitHub reports as changed. Review each added or modified hunk in context; when a hunk needs surrounding code to judge it, fetch that file at the PR's head ref via GitHub MCP (do not assume a local checkout). For deletions, judge the removal from the diff and flag any regression or lost validation/tests it causes.

For each file, evaluate against the 9 criteria below. Collect only findings the dev actually needs to fix — no cosmetic nits, no open questions, no theoretical concerns.

If a specific change touches a business rule that wasn't picked up during Context Gain, re-grep `domainKnowledge.location` with a new term — same targeted pattern (`output_mode=content, context=5`). Never bulk-read.

1. **Requirements coverage & business correctness** — implements every acceptance criterion (nothing silently dropped) and nothing out of scope (no unrequested gold-plating); aligned with the requirements and domain rules; does not break other or previous business contexts (no regression of established behavior).
2. **Logical correctness** — edge cases; null checking; error paths; off-by-one; async ordering; no dead branches. Plus data & concurrency integrity: transaction/atomicity boundaries (steps all succeed or all roll back); idempotency (running it twice equals once — safe under retries); race conditions (two operations on the same data at once corrupting the result).
3. **Security & hidden bugs** — input validation; authentication (who you are) & authorization (what you may do) checks; secrets/PII not logged; no injection vectors (untrusted input executed as code/SQL); timeouts; resources closed (files/connections released).
4. **Performance & scalability** — no N+1 or inefficient queries (one query per row in a loop instead of one batched query); no unbounded work over external/user-controlled input (work that grows with no cap); no blocking I/O on a hot path (slow call freezing frequently-run code); pagination and indexes where the data volume needs them.
5. **API & data contracts** — no unintended breaking changes (renaming/removing/retyping fields existing callers depend on) to public APIs, response shapes, enums, event payloads, or shared types; DB migrations are safe, additive-first (add new before removing old), and reversible (can be undone).
6. **Observability** — logs at appropriate levels; errors with context; metrics/spans (counters + request-timing traces) for new behavior; no noisy logs; no sensitive data in logs.
7. **Coding standards** — `coding-standards.md` rule book (naming, formatting, structure, comments, error handling); modification-history headers updated.
8. **Project architecture** — does not violate the project's architecture style: file location, dependency direction (which layer may call which), layering, tech stack, pattern reuse per `project-structure.md` and `tech-stack.md`.
9. **Test adequacy** — the right levels are present (unit, plus integration where behavior crosses a boundary); tests assert the acceptance criteria / actual behavior (not smoke calls — running without checking the result); edge and error paths covered; existing tests updated for changed behavior; tests are deterministic (same result every run — no real clock/network/randomness). Skip when the change genuinely doesn't warrant a test — e.g., UI markup, CSS, simple DOM wiring, trivial passthroughs.

## Validate

Run `execute-checklist` with `pr-review-checklist.md`. On any FAIL, return to the relevant section, fix, and re-run the checklist before proceeding.

## Write Outputs

Write the review to a summary file at `bmad-docs/reviewer/{repo}-pr{number}-review-{YYYY-MM-DD}.md`. Create the `bmad-docs/reviewer/` folder if it does not exist.

Format:

```markdown
# PR Review: {repo}#{number} — {pr_title}

**Reviewed:** {YYYY-MM-DD} by Morgan
**PR:** {pr_url}
**Requirements:** {ticket key/URL, or "raw"}

## What was reviewed

- Files reviewed: {N}
- Criteria covered: requirements coverage & business correctness, logical correctness, security & hidden bugs, performance & scalability, API & data contracts, observability, coding standards, project architecture, test adequacy
- Findings: {n}

## Findings

- [ ] {one-sentence finding} | Location: {file:line} | Fix: {specific action}

(One checkbox per finding. No severity tags, no praise, no commentary. If there are no findings, write "No actionable findings.")

## Key takeaways

- {1-line bullet}
- {1-line bullet}
```
