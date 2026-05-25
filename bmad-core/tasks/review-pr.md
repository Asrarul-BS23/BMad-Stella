<!-- Powered by Stella Development Team -->

# review-pr

The pr-reviewer reviews code changes (from the plan's File List) against the 7 review criteria, writes actionable feedback to the plan's PR Review Feedback subsection, and saves a short summary under `bmad-docs/reviewer/`.

## Inputs

```yaml
required:
  - plan_file: 'Path to implementation plan (e.g., bmad-docs/impl-plan/PROJ-123-plan.md)'
```

HALT if `plan_file` does not exist. HALT if `Dev Agent Record → File List` is missing or empty in the plan.

## Context Gain

Before reviewing, gather the context the review depends on:

- **Architecture docs** — `coding-standards.md`, `tech-stack.md`, `project-structure.md` are already loaded at agent activation. Treat them as the rule book.
- **Plan file** — read in full. This captures what planner, dev, and qa have already established: Requirements, Acceptance Criteria, Technical Approach, Tasks/Subtasks (with completion status), Dev Agent Record (File List, Deviation Record, Completion Notes), Testing, prior Feedback.
- **Domain knowledge** — extract 3-5 key terms from the plan title and Requirements (module, entity, action, feature area). For each term, `Grep` over `domainKnowledge.location` from core-config.yaml — `output_mode=content, context=5`. Capture only relevant snippets. Never bulk-read `bmad-docs/domain-knowledge/`.

## Review the Change Set

Change set = `MODIFIED` + `NEW` entries from the plan's `Dev Agent Record → File List` (skip `DELETED`). Read each file's current state.

For each file, evaluate against the 7 criteria below. Collect only findings the dev actually needs to fix — no cosmetic nits, no open questions, no theoretical concerns.

If a specific change touches a business rule that wasn't picked up during Context Gain, re-grep `domainKnowledge.location` with a new term — same targeted pattern (`output_mode=content, context=5`). Never bulk-read.

1. **Business correctness** — implementation aligned with the business intent expressed in the plan and domain rules; does not break other or previous business contexts (no regression of established behavior).
2. **Logical correctness** — edge cases; null checking; error paths; off-by-one; async ordering; no dead branches.
3. **Security & hidden bugs** — input validation; auth checks; secrets/PII not logged; no injection vectors; timeouts; resources closed.
4. **Observability** — logs at appropriate levels; errors with context; metrics/spans for new behavior; no noisy logs; no sensitive data in logs.
5. **Coding standards** — `coding-standards.md` rule book (naming, formatting, structure, comments, error handling); modification-history headers updated.
6. **Project architecture** — does not violate the project's architecture style: file location, dependency direction, layering, tech stack, pattern reuse per `project-structure.md` and `tech-stack.md`.
7. **Unit test coverage** — new business logic has unit tests; tests exercise actual behavior (not smoke calls); `[x]` test tasks match test files that exist. Skip this requirement when the implementation genuinely doesn't warrant a test — e.g., UI markup, CSS, simple DOM wiring, trivial passthroughs.

## Validate

Run `execute-checklist` with `pr-review-checklist.md`. On any FAIL, return to the relevant section, fix, and re-run the checklist before proceeding.

## Write Outputs

### Write to the plan

Locate `## Feedback → ### PR Review Feedback` in the plan file.

- If it has prior content → replace entirely.

Write each finding on its own line:

```
- [ ] {one-sentence finding} | Location: {file:line} | Fix: {specific action}
```

No headers, no metadata, no severity tags, no praise, no commentary. Only checkbox items. No other plan section is touched.

### Create the summary file

Write the file at `bmad-docs/reviewer/{plan_id}-review-{YYYY-MM-DD}.md`. Create the `bmad-docs/reviewer/` folder if it does not exist.

Format:

```markdown
# PR Review: {plan_id} — {plan_title}

**Reviewed:** {YYYY-MM-DD} by Morgan
**Plan:** {plan_file_path}

## What was reviewed

- Files: {N modified, M new}
- Criteria covered: business correctness, logical correctness, security & hidden bugs, observability, coding standards, project architecture, unit test coverage
- Findings written: {n}

## Key takeaways

- {1-line bullet}
- {1-line bullet}

(Full actionable items live in {plan_file_path} → ## Feedback → ### PR Review Feedback.)
```
