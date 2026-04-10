<!-- Powered by Stella Development Team -->

# Migration Validation Checklist

This checklist is used by the dev agent during migration ticket implementation. It has three checkpoints: Pre-Migration (before implementation starts), Mid-Migration (at the halfway mark), and Post-Migration (at completion). Each checkpoint is run via `execute-checklist` at the appropriate phase.

[[LLM: INITIALIZATION INSTRUCTIONS - MIGRATION VALIDATION

Before proceeding, ensure you have access to:

1. The implementation plan with Migration Details section populated
2. The Pre-Implementation Baseline data (test counts, build state, folder structure)
3. The migration sub-type classification (Stack Version / Architecture Pattern / Infrastructure / Data / Hybrid)

IMPORTANT: This checklist is called at three points during migration implementation:
- Pre-Migration: Called in implement-task Step 1.4 (before any code changes)
- Mid-Migration: Called at the halfway mark of the task list
- Post-Migration: Called in implement-task Step 3.2 (after all tasks complete)

When invoked, the caller specifies which checkpoint to run. Execute ONLY that checkpoint's section plus the applicable per-type section. Skip the other checkpoints.]]

---

## PRE-MIGRATION CHECKPOINT

[[LLM: Run this checkpoint BEFORE implementation begins. All items must pass before proceeding to task execution. If any item fails, HALT and resolve before continuing.]]

- [ ] Baseline build captured (success/fail, warning count)
- [ ] Baseline test results captured (pass count, fail count, skip count)
- [ ] Current folder structure documented for affected areas
- [ ] Migration sub-type classified and confirmed with user
- [ ] Reference implementation identified and studied
- [ ] Rollback strategy identified (overall approach documented in plan)
- [ ] (Stack Version) Breaking changes document reviewed or user confirmed none available
- [ ] (Stack Version) Deprecated API tracker initialized in Debug Log
- [ ] (Architecture Pattern) Both source and target architecture documents accessible
- [ ] (Architecture Pattern) Current→Target structural mapping confirmed by user
- [ ] (Architecture Pattern) Dependency direction rules of target pattern understood
- [ ] (Data) Data volume and downtime constraints confirmed
- [ ] (Data) Migration script reviewed by user before execution

---

## MID-MIGRATION CHECKPOINT

[[LLM: Run this checkpoint at the halfway mark of the task list. This is a health check — if the migration is going off track, catch it here rather than at the end.]]

- [ ] Health score maintained or improved vs baseline (passing tests >= baseline)
- [ ] No new build errors introduced
- [ ] All completed tasks' changes verified to still work (no regressions from earlier tasks)
- [ ] Dev Agent Record → File List is current and accurate
- [ ] Completion Notes document key decisions made so far
- [ ] (Stack Version) Deprecated API tracker is up to date
- [ ] (Architecture Pattern) Folder structure changes consistent with target pattern so far
- [ ] (Architecture Pattern) No dependency direction violations introduced
- [ ] (Data) Data migration status tracked separately from code migration status

---

## POST-MIGRATION CHECKPOINT

[[LLM: Run this checkpoint after ALL tasks are complete. This is the final validation before marking the plan as Ready for Review.]]

- [ ] All tests pass (pass count >= baseline pass count)
- [ ] Build succeeds with no new warnings vs baseline
- [ ] Pre vs post migration comparison documented in Completion Notes
- [ ] Migration summary written in Completion Notes (type, baseline vs final, issues, rollback notes)
- [ ] Rollback notes documented (what to revert if issues found later)
- [ ] (Stack Version) No deprecated APIs remain — tracker shows all replaced
- [ ] (Stack Version) All dependency versions updated to target
- [ ] (Stack Version) Configuration format changes applied
- [ ] (Architecture Pattern) Target folder structure fully realized
- [ ] (Architecture Pattern) Dependency direction follows target rules — no violations
- [ ] (Architecture Pattern) No circular dependencies introduced
- [ ] (Architecture Pattern) Layer boundaries respected (no cross-layer shortcuts)
- [ ] (Infrastructure) All configuration files updated for target environment
- [ ] (Infrastructure) Connection strings/endpoints point to correct targets
- [ ] (Infrastructure) Environment-specific configurations isolated
- [ ] (Data) Data integrity verified post-migration
- [ ] (Data) No data loss — record counts match expectations

---

## CHECKPOINT RESULT

[[LLM: Generate a concise checkpoint result:

1. Checkpoint: Pre-Migration / Mid-Migration / Post-Migration
2. Status: PASS / FAIL / PASS WITH CONCERNS
3. Health Score: (current passing tests / baseline passing tests) × 100
4. Build Delta: baseline warnings → current warnings
5. Failed Items: list any items that did not pass
6. Action Required: what must be resolved before continuing

If FAIL: HALT and present failed items to user for resolution.
If PASS WITH CONCERNS: present concerns but allow user to decide whether to continue.
If PASS: proceed to next phase.]]

| Metric | Baseline | Current | Delta |
|---|---|---|---|
| Tests Passing | _TBD_ | _TBD_ | _TBD_ |
| Tests Failing | _TBD_ | _TBD_ | _TBD_ |
| Build Warnings | _TBD_ | _TBD_ | _TBD_ |
| Build Status | _TBD_ | _TBD_ | _TBD_ |

**Checkpoint Status:** PASS / FAIL / PASS WITH CONCERNS

**Action Required:** [Specify what needs resolution, or "None — proceed"]
