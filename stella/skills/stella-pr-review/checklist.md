# PR Review Checklist

Runs between Review the Change Set and Write Outputs. Mark each item PASS or FAIL with one sentence. Any FAIL: go back, fix, run this again.

- [ ] Requirements source recorded; scope drift checked both ways; "Acceptance criteria missing" flagged if the ticket has none.
- [ ] Every changed hunk reviewed; surrounding code read at the head SHA, never from the working tree.
- [ ] All 10 universal criteria evaluated, including dependencies (5), the inverted-condition test check (9) and the structural smells (8, 10); criterion 11 only where the stack has the concept.
- [ ] Test coverage stated as `OK` or `MISSING — {what}`; ripple check done with `git grep -e` at the head SHA.
- [ ] Every finding has `File:LINE` from the new-file numbers (or `File (missing)`), What / Why / Fix, sits in Blockers or Minor, numbered continuously; no nits, open questions or praise.
- [ ] Report is short: two-sentence summary, at most 8 Checked names, one-line ripple, at most 5 Minor; `findings.json` and `reproduce.md` use the same numbers.
