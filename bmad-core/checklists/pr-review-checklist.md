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

- [ ] JIRA key taken from the PR title (or given by the user) and the ticket fetched: summary, description, acceptance criteria, comments. Thin ticket → parent used, else the user asked once; requirements source recorded in the header.
- [ ] PR fetched via `gh` only; head SHA captured; `git fetch origin pull/{N}/head` done and the SHA resolves locally. Diff from `gh pr diff`, or from `git diff {base} {head}` only when GitHub refused (over 300 files).
- [ ] Only the Guard's allowed commands were run; no Edit/MultiEdit, no Write outside `bmad-docs/reviewer/`, no `gh api`, no other `gh pr` subcommand, no git write command.
- [ ] Verification scripts, if any, were pure computation under `bmad-docs/reviewer/.scratch/` or inline `node -e` / `python -c` — no file, process, or network access, no PR code with side effects.
- [ ] Every changed file reviewed; surrounding code read with `git show {sha}:{path}` at the head SHA, never from the working tree.
- [ ] Domain knowledge accessed by targeted Grep only — no bulk-read of `bmad-docs/domain-knowledge/`.
- [ ] All 10 universal criteria evaluated; criterion 11 (wiring & registration) applied only where the stack has the concept, skipped silently otherwise.
- [ ] Scope drift checked both ways: PR changes not in the ticket, and AC with no matching code/test. "Acceptance criteria missing" flagged if the ticket has none.
- [ ] Test coverage stated as `OK` or `MISSING — {exactly what}`.
- [ ] Ripple check done with `git grep -e` at the head SHA; result stated.
- [ ] Every finding has `File:LINE` from the diff's new-file numbers (or `File (missing)`), What / Why / Fix, grouped 🔴 Blockers / 🟡 Minor, numbered continuously. No nits, no open questions, no praise.
- [ ] One folder per review under `bmad-docs/reviewer/` with `review.md`, `findings.json` (matching ids, paths, lines; `fix` present but never posted) and `reproduce.md`.
- [ ] `reproduce.md`: header says steps are derived from code, not executed; behavior findings have Preconditions / Steps / Expected / Actual; non-behavior findings have the one-line `No runtime repro`; no invented steps.
- [ ] Post to PR: preview shown, no `LONG` lines left, user asked once and answered `y` before `--post`; never `gh api` directly, never `--submit` without the user typing "submit".
- [ ] `review.md` printed in chat verbatim, followed by the folder path — no separate prose version.
- [ ] Report is short: two-sentence summary, Checked list ≤ 8 bare names, one-line Ripple, one line per What / Why / Fix, repeated issues merged into one finding, Minor capped at 5, plain words.

## Final Confirmation

- [ ] I, the Reviewer Agent, confirm that every item above was evaluated and findings are ready to be written.
