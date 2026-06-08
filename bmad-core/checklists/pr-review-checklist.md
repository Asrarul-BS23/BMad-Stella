<!-- Powered by Stella Development Team -->

# PR Review Checklist

Validate that the pr-reviewer completed the review correctly and findings are ready to be written. Runs between the Review and Write Outputs sections of `review-pr.md`.

[[LLM: INITIALIZATION INSTRUCTIONS - PR REVIEW VALIDATION

This checklist is for the REVIEWER AGENT (Morgan) to self-validate the PR review before writing outputs.

IMPORTANT: Mark each item PASS, FAIL, or N/A with a one-sentence rationale. Every FAIL must be remediated before writing.

EXECUTION APPROACH:

1. Go through each item in order
2. Verify against the actual review work just completed
3. If any item fails, return to the relevant section of review-pr.md, fix, and re-run this checklist

The goal is dev-actionable output ready to write — not just a finished review.]]

## Validation

- [ ] Requirements resolved (JIRA ticket or raw) and acceptance criteria captured.
- [ ] PR diff fetched and every changed file reviewed.
- [ ] Domain knowledge accessed by targeted Grep only — no bulk-read of `bmad-docs/domain-knowledge/`.
- [ ] All 9 criteria evaluated against the change set: requirements coverage & business correctness, logical correctness, security & hidden bugs, performance & scalability, API & data contracts, observability, coding standards, project architecture, test adequacy.
- [ ] Every finding is actionable: `file:line`, one-sentence finding, concrete fix. No nits, no open questions, no theoretical concerns.

## Final Confirmation

- [ ] I, the Reviewer Agent, confirm that every item above was evaluated and findings are ready to be written.
