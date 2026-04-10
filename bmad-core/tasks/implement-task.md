<!-- Powered by Stella Development Team -->

# Implement Task

## Purpose

Execute an approved implementation plan by running tasks sequentially with automatic context discovery, session continuity, and type-aware validation.

Behavioral profiles by ticket type:
- **Feature** — pattern enforcement, reuse checking, standard validation
- **Bug** — minimal change, reproduce-first, targeted then full regression
- **Migration** — mandatory build/test per task, health tracking, rollback notes, migration checklist gates

## Inputs

```yaml
required:
  - plan_file_path: 'Path to the approved implementation plan (.md file)'
optional:
  - session_mode: 'new (default) or resume'
  - migration_guide: 'URL or file path to official migration guide (stack version migrations)'
  - pre_migration_snapshot: 'Baseline test/build results file (auto-generated if not provided)'
```

## Dependencies

```yaml
config:
  - core-config.yaml
data:
  - devLoadAlwaysFiles (from core-config: coding-standards.md, tech-stack.md, project-structure.md)
checklists:
  - task-dod-checklist.md
  - migration-checklist.md  # Migration tickets only
tasks:
  - execute-checklist.md
```

---

## Critical Rules (ALL Ticket Types)

### Plan File Updates — Authorized Sections ONLY

- CRITICAL: Only update sections listed below. DO NOT modify any other sections.
- CRITICAL: Do not ask user permission for plan file updates.
- CRITICAL: Always update `Agent Model Used` and `File List` in `Dev Agent Record`.
- CRITICAL: Authorized sections — Tasks/Subtasks Checkboxes, Dev Agent Record (Agent Model Used, Pre-Implementation Baseline, Debug Log, Completion Notes, File List), Deviation Record, Change Log, Status, Feedback (checkboxes only — mark resolved items).
- CRITICAL: DO NOT modify Ticket Information, Requirements, Acceptance Criteria, Technical Approach, Migration Details, Bug Fix Details, Feature Details, Planner Notes, Dependencies and Risks.

### Coding Standards

- Extract Jira ticket ID from plan "Ticket Information" at session start
- Get developer name from Atlassian MCP. If fails → HALT and prompt user
- Apply coding-standards.md to ALL modifications including file modification history
- Add/update modification history header in every modified file using developer name

### Interaction Rules

- Do NOT auto-run DB migrations or manual tests — ask user and wait
- Ask user before building (unless Migration mode where builds are mandatory)
- Ask user if model properties are unclear in plan
- Ask questions instead of failing silently

### Context Management

- Only load cited architecture sections via `[Source: architecture/filename.md#section]`, never full docs
- For files over 500 lines, load only the relevant function/class
- Plan has all needed info. Never load PRD/architecture/other docs unless plan notes or user directs it

---

## SEQUENTIAL Execution (Do not proceed until current step is complete)

### Step 0: Context Bootstrap

**Runs EVERY session (new or resume).**

#### 0.1 — Load Configuration

- Read `core-config.yaml` → extract `devLoadAlwaysFiles`, `architecture.*`, `devStoryLocation`, `devDebugLog`
- Read all `devLoadAlwaysFiles`
- Get developer name from Atlassian MCP (fails → HALT, prompt user)

#### 0.2 — Parse Plan

- Read plan file fully. Extract:
  - **Ticket type** (Feature/Bug/Migration) and **subtype** (Stack Version/Architecture Pattern/etc.)
  - **Ticket ID** from Ticket Information
  - **All file paths** from Technical Approach and Tasks/Subtasks
  - **Architecture citations** (`[Source: architecture/filename.md#section]`)
  - **Task list** with completion status (`[x]` vs `[ ]`)
  - **Dev Agent Record** contents (Baseline, File List, Debug Log, Completion Notes)
- **Freshness check:** Get Change Log last-modified date. Check git log for commits to referenced files after that date. If found → show diff summary. User decides: proceed, update plan, or abort.

#### 0.3 — Session Continuity

- Count completed `[x]` vs total tasks
- If resuming (completed > 0): read File List, Debug Log, Completion Notes. Show: "Resuming Task N. Tasks 1-M done. Files: [list]. Issues: [list]. Proceed?" → HALT for confirmation
- If fresh (completed = 0): proceed

#### 0.4 — Selective Context Loading

- Load ONLY cited sections from architecture docs, not full files
- Nonexistent citation target → log as context gap

#### 0.5 — Codebase Verification & Gap Report

- Verify folder structure before starting — don't recreate existing directories
- **Existing files** in plan → verify via Glob. Not found → HALT, ask user
- **New files** in plan → verify parent directory exists
- Grep for referenced patterns/frameworks to confirm codebase usage
- Any gaps found → present numbered list → HALT for resolution

#### 0.6 — Context Budget

- **Tier 1 (always):** current task + its files + coding standards
- **Tier 2 (if room):** session history + architecture citations
- **Tier 3 (on demand):** prior tasks' files + full debug log
- Before each task: drop Tier 3, keep Tier 1+2. Plans 8+ tasks: load only current task's files.

#### 0.7 — Type-Specific Bootstrap

**Features — Pattern Discovery:** Scan plan-referenced codebase areas for naming conventions, helpers, service patterns, error handling. Store as "Implementation Patterns." Grep for similar implementations before creating new components.

**Bugs — Impact Analysis:** Read files from Affected Code Path. Trace failing data flow. Ask user to confirm reproduction steps before any code change.

**Migrations** — no additional bootstrap; setup in Step 1.

---

### Step 1: Migration Detection (ONLY if Migration)

**Feature/Bug tickets → skip to Step 2.**

#### 1.1 — Classify Migration Type

Confirm sub-type from Migration Details: Stack Version / Architecture Pattern / Infrastructure / Data / Hybrid. User confirms.

#### 1.2 — Capture Baseline

- Run build → record success/failure, warnings
- Run full test suite → record pass/fail/skip
- Capture affected folder structure
- Store in `Pre-Implementation Baseline` of Dev Agent Record
- Use `pre_migration_snapshot` if provided

#### 1.3 — Migration Context

**Stack Version:** Read `migration_guide` → extract breaking changes. No guide → HALT and ask. Create "Deprecated API Tracker" in Debug Log.

**Architecture Pattern:** Read Reference Implementation from plan. Present "Current → Target" mapping → HALT for confirmation.

**Infrastructure:** Identify affected config files. Flag env-specific concerns.

**Data:** HALT — ask about test data/staging. Never auto-run data migrations; present script for review. Track data migration separately in Debug Log.

#### 1.4 — Activate Migration Mode

- Mandatory build + test after every task. Health tracking ON.
- Run `execute-checklist` with `migration-checklist.md` — "Pre-Migration" checkpoint.

---

### Step 2: Task Execution Loop

#### 2.0 — Type Profile

| Behavior | Feature | Bug | Migration |
|---|---|---|---|
| Pattern enforcement | ON | OFF | OFF |
| Reuse check | ON | OFF | OFF |
| Minimal change | OFF | ON | OFF |
| Reproduce-first | OFF | ON | OFF |
| Mandatory builds | OFF | OFF | ON |
| Health tracking | OFF | OFF | ON |
| Rollback notes | OFF | OFF | ON |

#### 2.1 — Read Next Task

Identify first unchecked `[ ]` task. Read description, subtasks, and target files.

#### 2.2 — Context Refresh

- Re-read files this task modifies (may have changed)
- Verify dependent prior tasks are `[x]`
- Drop Tier 3 context (per 0.6)

#### 2.3 — Implement

**All types:** Apply coding standards and modification headers per Critical Rules. Follow Interaction Rules.

**Features:** Verify new code matches discovered patterns (0.7). New files mirror equivalent existing files. Additions match surrounding style.

**Bugs:** Only modify what's necessary. Flag adjacent improvements in Completion Notes — don't touch them. Verify fix addresses root cause, not symptom. Workaround → HALT: "Addresses symptom, not root cause [X]. Proceed or investigate?"

**Migrations:** Preserve all business logic exactly. Drop "Do Not Migrate" patterns. Flag original code issues with `// TODO:` — don't fix them.

#### 2.4 — Update Plan

Authorized sections only (Critical Rules):
- Mark task `[x]`
- Update File List, Agent Model Used
- Add Completion Notes entry (what, deviations, decisions)
- Update Change Log if significant
- Deviation from Technical Approach → write Deviation Record: **Planned** / **Actual** / **Reason**

#### 2.5 — Post-Task Validation

**Features:** HALT → "Next task, build, or stop?" Build → run, report, ask "Next or stop?"

**Bugs:** Run targeted tests first. Fail → HALT before full suite. Pass → run full regression. All pass → HALT: "Fix verified. Next task or stop?"

**Migrations:** Auto-run build + tests. Health = `(current passing / baseline passing) × 100`. Degraded → HALT with delta. OK → report, ask next/stop. Update API Tracker (stack version). Record rollback notes.

#### 2.6 — Failure Recovery

- 1st failure: analyze. Context gap → self-resolve via search. Code error → attempt fix.
- 2nd failure (same issue): HALT with diagnostic. Add Debug Log entry.
- No 3rd attempt — escalate to user.

#### 2.7 — Cross-Task Verification (every 3rd task or shared files)

File changed by current AND prior task → re-verify prior changes work. Conflict → HALT.

---

### Step 3: Completion

#### 3.1 — Standard (ALL types)

- Verify all tasks/subtasks `[x]`
- Run ALL tests — full regression, execute and confirm (DON'T BE LAZY)
- Ensure File List is complete
- Run `execute-checklist` with `task-dod-checklist.md`
- Set status: "Ready for Review"

#### 3.2 — Migration (additional)

- Run `execute-checklist` with `migration-checklist.md` — "Post-Migration" checkpoint
- Compare final vs baseline: test delta, warning delta, structure changes
- Write Migration Summary in Completion Notes: type, health delta, APIs replaced, warnings, rollback notes

#### 3.3 — Summary & HALT (ALL types)

Write in Completion Notes: approach, deviations, key decisions, tech debt, follow-up recommendations. HALT.

---

## Bug-Fix-Plan-Update

**Trigger:** ALWAYS run after fixing ANY user-reported bug post-implementation.

**Flow:** Identify root cause → fix → update plan → HALT with report (what fixed, sections updated, final file list).

**Required updates:**
- **Tasks/Subtasks:** Add subtask noting correction. Don't uncheck prior tasks.
- **File List:** Update to final state (added, reverted, deleted files)
- **Debug Log:** Bug description, root cause, fix applied
- **Change Log:** Date, version, fix description, developer name

**DO NOT modify:** Ticket Information, Requirements, Acceptance Criteria, Technical Approach, Migration Details, Bug Fix Details, Feature Details, Planner Notes, Dependencies and Risks.

---

## Blocking Conditions

HALT for: unapproved dependencies | ambiguous requirements | 2 consecutive failures (same issue) | missing config | failing regression | migration health degradation | context gaps | file path mismatches | plan staleness

---

## Validation Checklist

- [ ] All tasks/subtasks marked [x]
- [ ] All tests pass (full regression)
- [ ] Coding standards applied to all modified files
- [ ] Modification history headers in all modified files
- [ ] File List complete in Dev Agent Record
- [ ] Agent Model Used set
- [ ] Completion Notes has implementation summary
- [ ] Change Log updated
- [ ] Deviation Record populated (if deviations occurred)
- [ ] task-dod-checklist passed
- [ ] (Migration) migration-checklist Post-Migration passed
- [ ] (Migration) Baseline vs final comparison documented
- [ ] Status set to "Ready for Review"
