<!-- Powered by Stella Development Team -->

# Implement Task

## Purpose

Execute an approved implementation plan by running tasks sequentially with automatic context discovery, resume support across sessions, and type-aware validation.

## Inputs

```yaml
required:
  - plan_file_path: 'Path to the approved implementation plan (.md file)'
optional:
  - migration_guide: 'URL or file path to official migration guide (stack version migrations)'
  - pre_migration_snapshot: 'Baseline test/build results file (auto-generated if not provided)'
```

## Dependencies

```yaml
config:
  - .bmad-core/core-config.yaml
data:
  - devLoadAlwaysFiles (from core-config: coding-standards.md, tech-stack.md, project-structure.md)
checklists:
  - task-dod-checklist.md
  - migration-checklist.md # Migration tickets only
tasks:
  - execute-checklist.md
```

---

## Critical Rules (ALL Ticket Types)

### Plan File Updates

- Do not ask user permission for plan-file updates.
- Always update `Agent Model Used` and `File List` in `Dev Agent Record`.
- Plan-file edit permissions are defined by the template's per-section `editors:` field. Only modify sections where you are listed as an editor.

### Coding Standards

- Apply coding-standards.md to ALL modifications including file modification history
- Add/update modification history header in every modified file using developer name (from Developer Identity step)

### Interaction Rules

- Do NOT auto-run DB migrations or manual tests — ask user and wait
- Ask user before building (unless Migration mode where builds are mandatory)
- Ask user if model properties are unclear in plan
- Ask questions instead of failing silently

- CRITICAL: Never load full architecture documents. Only load cited sections. If a single file exceeds 500 lines, load only the relevant function/class.

---

## SEQUENTIAL Execution (Do not proceed until current step is complete)

### Step 0: Context Bootstrap

**Runs EVERY session (new or resume).**

#### 0.1 — Load Configuration

- Read `.bmad-core/core-config.yaml` → extract `devLoadAlwaysFiles`, `architecture.*`, `devStoryLocation`, `devDebugLog`
- Read all `devLoadAlwaysFiles`

#### 0.2 — Parse Plan

- Read plan file fully. Extract:
  - **Ticket type** (Bug/Feature/Migration) and **subtype** (Stack Version/Architecture Pattern/etc.)
  - **Plan ID** from Ticket Information
  - **All file paths** from all plan sections (Technical Approach, Tasks/Subtasks, Bug Fix Details, Feature Details, Migration Details)
  - **Architecture citations** (`[Source: architecture/filename.md#section]`)
  - **Task list** with completion status (`[x]` vs `[ ]`)
  - **Dev Agent Record** contents (Baseline, File List, Debug Log, Completion Notes)
- **Freshness check:** Get Change Log last-modified date. Check git log for commits to referenced files after that date. If found → show diff summary. User decides: proceed, update plan, or abort.

#### 0.3 — Session Continuity

- Count completed `[x]` vs total tasks
- If resuming (completed > 0): read File List, Debug Log, Completion Notes. Show: "Resuming Task N. Tasks 1-M done. Files modified: [list or none]. Known issues: [list or none]. Proceed?" → HALT for confirmation
- If fresh (completed = 0): set status to "In Progress"; proceed

#### 0.4 — Selective Context Loading

- Load ONLY cited sections from architecture docs, not full files
- Nonexistent citation target → log as context gap

#### 0.5 — Codebase Verification & Gap Report

- Verify folder structure before starting — don't recreate existing directories
- **Existing files** in plan → verify via Glob. Not found → HALT, ask user
- **New files** in plan → verify parent directory exists
- Grep for referenced patterns/frameworks to confirm codebase usage
- Any gaps found → present numbered list → HALT for resolution

#### 0.6 — Type-Specific Bootstrap

**Features — Pattern Discovery:** Scan plan-referenced codebase areas for naming conventions, helpers, service patterns, error handling. Store as "Implementation Patterns." Grep for similar implementations before creating new components.

**Bugs — Impact Analysis:** Read files from Affected Code Path. Verify paths match actual code — if not, HALT and report mismatch. Trace failing data flow. Ask user to confirm reproduction steps before any code change.

**Migrations** — see Step 1.

#### 0.7 — Developer Identity

- Get developer name from Atlassian MCP
- If MCP fails → check plan file for developer name in Ticket Information
- If plan has no developer name → HALT and prompt user for their full name
- Store for use in modification history headers and change log entries

---

### Step 1: Migration Detection (ONLY if Migration)

**Bug/Feature tickets → skip to Step 2.**

#### 1.1 — Classify Migration Type

Confirm sub-type from Migration Details: Stack Version / Architecture Pattern / Infrastructure / Data / Hybrid. User confirms.

#### 1.2 — Capture Baseline

- Ask user to confirm baseline capture → on approval, run build (record success/failure, warnings) and full test suite (record pass/fail/skip)
- Capture affected folder structure
- Store in `Pre-Implementation Baseline` of Dev Agent Record
- If `pre_migration_snapshot` was provided as input, use that instead

#### 1.3 — Migration Context

**Stack Version:** Read `migration_guide` → extract breaking changes. No guide → HALT and ask. Create "Deprecated API Tracker" in Debug Log.

**Architecture Pattern:** Read Reference Implementation files listed in plan's Migration Details — study their structure as the canonical target pattern. Verify "Current → Target" mapping against actual codebase structure — if mismatches found, present both planned and actual state. HALT for user confirmation.

**Infrastructure:** Identify affected config files. Flag env-specific concerns.

**Data:** HALT — ask about test data/staging. Never auto-run data migrations; present script for review. Track data migration separately in Debug Log.

#### 1.4 — Activate Migration Mode

- Mandatory build + test after every task. Health tracking ON.
- Run `execute-checklist` with `migration-checklist.md` — "PRE-MIGRATION CHECKPOINT".

---

### Step 2: Task Execution Loop

#### 2.0 — Type Profile

Reuse check applies to all ticket types — use items listed in the plan's Reuse Opportunities section instead of creating new components.

| Behavior            | Bug | Feature | Migration |
| ------------------- | --- | ------- | --------- |
| Pattern enforcement | OFF | ON      | OFF       |
| Minimal change      | ON  | OFF     | OFF       |
| Reproduce-first     | ON  | OFF     | OFF       |
| Mandatory builds    | OFF | OFF     | ON        |
| Health tracking     | OFF | OFF     | ON        |
| Rollback notes      | OFF | OFF     | ON        |

#### 2.1 — Read Next Task

Identify first unchecked `[ ]` task. Read description, subtasks, and target files.

#### 2.2 — Context Refresh

- Re-read files this task modifies (may have changed)
- Verify dependent prior tasks are `[x]`
- Drop Tier 3 context (per Context Management rules)

#### 2.3 — Implement

**All types:** Apply coding-standards.md and modification history headers per Critical Rules. Follow Interaction Rules.

**Features:** Verify new code matches discovered patterns (from Type-Specific Bootstrap). New files mirror equivalent existing files. Additions match surrounding style. Mismatch found → refactor to match existing patterns. Exception: if the plan's Technical Approach explicitly calls for a different pattern, keep it and document why in Deviation Record.

**Bugs:** Only modify what's necessary. Flag adjacent improvements in Completion Notes (format: "Adjacent: [file path] — [what could be improved]") — don't touch them. Verify fix addresses root cause, not symptom. Workaround → HALT: "Addresses symptom, not root cause [X]. Proceed or investigate?"

**Migrations:** Preserve all business logic exactly. Intentionally exclude patterns listed in the plan's "Do Not Migrate" section — do not carry them to target. Flag original code issues with `// TODO:` — don't fix them.

#### 2.4 — Update Plan

Authorized sections only (Critical Rules):

- Mark task `[x]`
- Update File List, Agent Model Used
- Add Completion Notes entry (what, deviations, decisions)
- Update Change Log if significant
- Deviation from Technical Approach (different pattern, file structure, API design, or library used) → write Deviation Record: **Planned** / **Actual** / **Reason**. Minor style or naming differences are not deviations.

#### 2.5 — Post-Task Validation

**Features:** HALT → "Next task, build, or stop?" Build → run, report, ask "Next or stop?"

**Bugs:** Run targeted tests first. Fail → HALT before full suite. Pass → run full regression. All pass → HALT: "Fix verified. Next task or stop?"

**Migrations:** Auto-run build + tests. Health = `(current passing / baseline passing) × 100`. Degraded → HALT with delta. OK → report, ask next/stop. Update API Tracker (stack version). Record per-task rollback notes in Completion Notes. **Mid-Migration trigger:** if total tasks ≥ 6 AND completed ≥ total/2 AND Debug Log lacks "Mid-Migration Checkpoint" entry → run `execute-checklist` with `migration-checklist.md` "MID-MIGRATION CHECKPOINT". PASS → add "Mid-Migration Checkpoint passed at Task N" to Debug Log, continue. FAIL → HALT with findings.

#### 2.6 — Failure Recovery

- On failure: analyze first. Context gap → self-resolve via search. Code error → attempt fix.
- If the same fix on the same code fails twice, HALT with diagnostic. Add Debug Log entry. Don't retry the same approach a third time — escalate to user.

#### 2.7 — Cross-Task Verification

- When a task touches a file an earlier task also touched, re-verify the earlier change still works (imports resolve, no regressions).
- On accumulating drift suspicion (multiple recent tasks edited overlapping areas), do a sanity check that prior modifications still work together.
- Conflict detected → HALT.

---

### Step 3: Completion

#### 3.1 — Standard (ALL types)

- Verify all tasks/subtasks `[x]`
- Run ALL tests — full regression, execute and confirm (DON'T BE LAZY). For migrations: this is a final confirmation even though per-task tests already ran.
- Ensure File List is complete
- Run `execute-checklist` with `task-dod-checklist.md`

#### 3.2 — Migration (additional)

- Run `execute-checklist` with `migration-checklist.md` — "POST-MIGRATION CHECKPOINT"
- Compare final vs baseline: test delta, warning delta, structure changes
- Write Migration Summary in Completion Notes using format: "Migration Summary: [sub-type]. Tests: [baseline]→[final]. Warnings: [baseline]→[final]. Deprecated APIs replaced: [count]. Known issues: [list or none]. Rollback: [notes]."

#### 3.3 — Summary & HALT (ALL types)

Write in Completion Notes: approach, deviations, key decisions, tech debt, follow-up recommendations. Set status: "Ready for Review". HALT.

---

## Mid- and Post-Implementation Changes

**Trigger:** ALWAYS run when applying any bug fix or enhancement at any lifecycle stage — during In Progress, after Ready for Review, after Ready for Done, or later. Applies to all ticket types — Bug, Feature, or Migration. Use minimal change with root-cause discipline for bugs and minimal scope for enhancements; write a temporary validation test, run targeted + full regression, then delete the temp test before HALTing.

**Flow:** Identify root cause / scope → apply change → write temporary validation test → run targeted + full regression → delete temp test → update plan → HALT with report (what changed, sections updated, final file list).

**Required updates:**

- **Tasks/Subtasks:** Append the corrective or enhancement subtask under the original task most closely related to the change. Don't uncheck prior tasks.
- **File List:** Update to final state (added, reverted, deleted files).
- **Debug Log:** Change description (bug or enhancement), root cause or rationale, what was applied. Note WHEN the change was made.
- **Change Log:** Date, version, change description, developer name.
- **Deviation Record:** If the change diverged from the planned Technical Approach, add a Planned / Actual / Reason entry referencing the Debug Log entry.
- **Status:** Set back to "Ready for Review" if the plan had already reached that state.

Edit only sections where you are listed in the template's `editors:` field.

---

## Blocking Conditions

HALT for: unapproved dependencies | ambiguous requirements | 2 consecutive failures (same issue) | missing config | failing regression | migration health degradation | context gaps | file path mismatches | plan staleness (referenced files changed since plan was written)

---
