<!-- Powered by Stella Development Team -->

# Implement Task

## Purpose

Transform an approved implementation plan into working code by executing tasks sequentially with automatic context discovery, session continuity, and type-aware validation.

Three ticket types with distinct behavioral profiles:
- **Feature** — pattern enforcement, reuse checking, standard validation
- **Bug** — minimal change enforcement, reproduce-first, targeted then full regression
- **Migration** — mandatory build/test per task, health score tracking, rollback notes, migration checklist gates

## Inputs

```yaml
required:
  - plan_file_path: 'Path to the approved implementation plan (.md file)'
optional:
  - session_mode: 'new (default) or resume — explicitly signal session intent'
  - migration_guide: 'URL or file path to official migration guide (for stack version migrations)'
  - pre_migration_snapshot: 'File with baseline test/build results (auto-generated if not provided)'
```

## Dependencies

```yaml
config:
  - core-config.yaml
data:
  - devLoadAlwaysFiles (from core-config: coding-standards.md, tech-stack.md, project-structure.md)
checklists:
  - task-dod-checklist.md
  - migration-checklist.md  # Only for Migration ticket types
tasks:
  - execute-checklist.md
```

---

## Critical Rules (Apply to ALL Ticket Types)

### Plan File Updates — ONLY Authorized Sections

- CRITICAL: ONLY UPDATE THE IMPLEMENTATION PLAN FILE WITH UPDATES TO SECTIONS INDICATED BELOW. DO NOT MODIFY ANY OTHER SECTIONS.
- CRITICAL: Don't ask for user permission for plan file update.
- CRITICAL: MUST UPDATE `Agent Model Used` and `File List` IN `Dev Agent Record`
- CRITICAL: Authorized sections: Tasks/Subtasks Checkboxes, Dev Agent Record (Agent Model Used, Pre-Implementation Baseline, Debug Log, Completion Notes, File List), Deviation Record, Change Log, Status
- CRITICAL: DO NOT modify Ticket Information, Requirements, Acceptance Criteria, Technical Approach, Migration Details, Bug Fix Details, Feature Details, Planner Notes, Dependencies and Risks, Feedback, or any other sections

### Coding Standards Enforcement

- CRITICAL: Extract Jira ticket ID from plan file "Ticket Information" section at session start
- CRITICAL: Get developer name from Atlassian MCP. If MCP fails, HALT and prompt user for their full name
- CRITICAL: Apply coding standards from coding-standards.md to ALL code modifications including file modification history format
- CRITICAL: Add/update modification history header in every modified file. Use developer name as author

### Interaction Rules

- Do NOT perform DB Migrations automatically — ask user and wait for confirmation
- Do NOT run manual tests automatically — ask user
- Ask user before building the project (unless Migration mode where builds are mandatory)
- Ask user if a new model creation is required and properties are not clearly mentioned in plan
- Ask questions instead of failing silently

### Context Management

- Never load full architecture documents — only load cited sections via `[Source: architecture/filename.md#section]`
- If a single file exceeds 500 lines, load only the relevant function/class
- Plan has ALL info needed. NEVER load PRD/architecture/other docs unless directed in plan notes or by user

---

## SEQUENTIAL Task Execution (Do not proceed until current step is complete)

### Step 0: Context Bootstrap

**Runs EVERY session (new or resume).**

#### 0.1 — Load Core Configuration

- Read `core-config.yaml` → extract `devLoadAlwaysFiles`, `architecture.*`, `devStoryLocation`, `devDebugLog`
- Read all `devLoadAlwaysFiles` (coding-standards.md, tech-stack.md, project-structure.md)
- Get developer name from Atlassian MCP (if fails → HALT and prompt user)

#### 0.2 — Parse Implementation Plan

- Read plan file completely. Extract and store:
  - **Ticket type** (Feature/Bug/Migration) and **subtype** (Stack Version/Architecture Pattern/etc.)
  - **Ticket ID** from Ticket Information section
  - **All file paths** from Technical Approach and Tasks/Subtasks
  - **Architecture citations** (pattern: `[Source: architecture/filename.md#section]`)
  - **Task list** with completion status (`[x]` vs `[ ]`)
  - **Dev Agent Record** contents (Baseline, File List, Debug Log, Completion Notes)
- **Freshness check:** Extract Change Log last-modified date. For each referenced file, check git log for commits after that date. If files changed → present diff summary to user. User decides: proceed, update plan, or abort.

#### 0.3 — Session Continuity Check

- Count completed `[x]` vs total tasks
- If completed > 0 (resuming): read File List, Debug Log, Completion Notes from Dev Agent Record. Present resume summary: "Resuming from Task N. Tasks 1-M completed. Files modified: [list]. Known issues: [list]. Proceed?" → HALT for user confirmation
- If completed = 0 (fresh start): proceed directly

#### 0.4 — Smart Selective Context Loading

- For each architecture citation in Technical Approach: load ONLY the cited section (not full doc)
- If a citation references a nonexistent file → log as context gap

#### 0.5 — Codebase Verification & Gap Report

- Check current folder structure before starting. Don't create working directory if it exists.
- For each file in plan: **existing files** → verify path via Glob, HALT if not found. **New files** → verify parent directory exists.
- For referenced patterns/frameworks: quick Grep to confirm usage in codebase
- If ANY gaps detected (missing files, broken citations, unresolvable patterns): present numbered list → HALT for user resolution

#### 0.6 — Context Budget

- **Tier 1 (always keep):** current task + its files + coding standards
- **Tier 2 (keep if room):** session history (Completion Notes, Debug Log) + architecture citations
- **Tier 3 (load on demand):** previous tasks' files + full debug log
- Rule: before each task in Step 2, drop Tier 3 and hold only Tier 1 + 2. For plans with 8+ tasks: load only current task's files, not all upfront.

#### 0.7 — Type-Specific Bootstrap

**Features — Pattern Discovery & Reuse Detection:**
- Scan codebase areas the plan references: naming conventions, helper/utility functions, service patterns, error handling. Store as "Implementation Patterns" context.
- For each task creating something new: Grep for similar existing implementations. Present findings.

**Bugs — Impact Analysis & Reproduce Verification:**
- Read files from Bug Fix Details / Affected Code Path. Trace the failing data flow.
- Ask user: "Can you confirm the reproduction steps? [steps from plan]. Should I reproduce first, or proceed with the fix?"

**Migrations** — no additional bootstrap (setup happens in Step 1).

---

### Step 1: Migration Detection (ONLY if Ticket Type = Migration)

**Skip entirely for Feature and Bug tickets → proceed to Step 2.**

#### 1.1 — Classify Migration Type

Confirm sub-type from plan's Migration Details: Stack Version / Architecture Pattern / Infrastructure / Data / Hybrid. Present to user for confirmation.

#### 1.2 — Capture Pre-Migration Baseline

- Run build → record success/failure, warning count
- Run full test suite → record pass/fail/skip counts
- Capture folder structure for affected areas
- Store in `Pre-Implementation Baseline` section of Dev Agent Record
- If `pre_migration_snapshot` provided, use that instead

#### 1.3 — Migration-Specific Context

**Stack Version:** Read `migration_guide` if provided → extract breaking changes. If not → HALT and ask user. Create "Deprecated API Tracker" in Debug Log.

**Architecture Pattern:** Read Reference Implementation from plan. Scan current folder structure. Present "Current → Target" structural mapping → HALT for user confirmation.

**Infrastructure:** Identify config files that will change. Flag env-specific concerns (env vars, connection strings, deployment configs).

**Data:** HALT and ask user about test data/staging environment. Never auto-run data migrations — present script for review first. Track data migration status separately in Debug Log.

#### 1.4 — Set Migration Validation Mode

- Activate migration mode: mandatory build + test after every task, health score tracking ON
- Run `execute-checklist` with `migration-checklist.md` for "Pre-Migration" checkpoint

---

### Step 2: Task Execution Loop

#### 2.0 — Load Type Profile

| Behavior | Feature | Bug | Migration |
|---|---|---|---|
| Pattern enforcement | ON | OFF | OFF |
| Reuse check | ON | OFF | OFF |
| Minimal change enforcement | OFF | ON | OFF |
| Reproduce-first | OFF | ON | OFF |
| Mandatory builds per task | OFF | OFF | ON |
| Health score tracking | OFF | OFF | ON |
| Per-task rollback notes | OFF | OFF | ON |

#### 2.1 — Read Next Task

- Identify first unchecked `[ ]` task. Read description and subtasks. Identify files to modify.

#### 2.2 — Per-Task Context Refresh

- Re-read each file this task will modify (may have changed since last task)
- Verify prior dependent tasks are marked `[x]`
- Drop Tier 3 context from prior tasks (per Step 0.6)

#### 2.3 — Implement Task

**Common (ALL types):** Apply coding standards and modification history headers per Critical Rules. Follow Interaction Rules.

**Features — Pattern Enforcement:** Verify new code follows discovered patterns (Step 0.7). New files must mirror structure of equivalent existing files. Additions to existing files must match surrounding style.

**Bugs — Minimal Change & Root Cause:** ONLY modify what's necessary. Flag adjacent "improvements" in Completion Notes instead of touching them. Before marking task complete, verify fix addresses root cause from Bug Fix Details. If it feels like a workaround → HALT: "This appears to address the symptom, not root cause [X]. Proceed or investigate deeper?"

**Migrations — Behavioral Preservation:** Preserve all business logic exactly. Drop patterns from "Do Not Migrate" list. Flag original code issues with `// TODO:` comments instead of fixing them.

#### 2.4 — Update Plan File

Only authorized sections (see Critical Rules):
- Mark task checkbox `[x]`
- Update File List, Agent Model Used in Dev Agent Record
- Add session note to Completion Notes (what was done, deviations, decisions)
- Update Change Log if significant
- If implementation deviated from Technical Approach → write Deviation Record entry: **Planned** / **Actual** / **Reason**

#### 2.5 — Post-Task Validation

**Features:** HALT → "Proceed to next task, build project, or stop?" If build: run, report, ask "Proceed or stop?"

**Bugs:** Run targeted tests on modified code path first. If fail → HALT before full suite. If pass → run full regression. If all pass → HALT: "Fix verified. Proceed to next task, or stop?"

**Migrations:** Run build + tests automatically. Health score = `(current passing / baseline passing) × 100`. If health drops or new errors → HALT: "Health degraded. Tests: X→Y. Warnings: A→B." If OK → report and ask proceed/stop. Update Deprecated API Tracker (stack version). Record per-task rollback notes.

#### 2.6 — Failure Recovery

- First failure: analyze error. Context gap → self-resolve via codebase search. Code error → attempt fix.
- Second failure (same issue): HALT with diagnostic + add Debug Log entry.
- No third attempt — escalate to user.

#### 2.7 — Cross-Task Verification (every 3rd task or on shared files)

- If completed task modified a file changed in a prior task: re-verify prior changes still work. Conflict → HALT and report.

---

### Step 3: Completion

#### 3.1 — Standard Completion (ALL ticket types)

- Verify all Tasks and Subtasks marked `[x]`
- Run full test suite — ALL tests, execute and confirm (DON'T BE LAZY, RUN ALL TESTS)
- Ensure Dev Agent Record → File List is complete
- Run `execute-checklist` with `task-dod-checklist.md`
- Set plan status: "Ready for Review"

#### 3.2 — Migration Completion (ONLY if Migration mode)

- Run `execute-checklist` with `migration-checklist.md` for "Post-Migration" checkpoint
- Compare final vs baseline: test pass/fail/skip delta, build warning delta, folder structure changes
- Write "Migration Summary" in Completion Notes: type, baseline vs final health, deprecated APIs replaced, remaining warnings, rollback notes

#### 3.3 — Implementation Summary (ALL ticket types)

Write in Completion Notes: approach taken, deviations from plan, key decisions, limitations/tech debt, follow-up recommendations. Then HALT.

---

## Bug-Fix-Plan-Update

**Trigger:** ALWAYS execute after fixing ANY bug reported by user following implementation.

**Flow:** Identify root cause → Fix bug → Update plan → HALT and report what was fixed, sections updated, final file list.

**Required plan updates:**
- **Tasks/Subtasks:** Add subtask noting correction (e.g., "- [x] Bug fix - corrected X"). Do NOT uncheck prior tasks.
- **File List:** Update to final accurate state (new files, reverted changes, deleted files)
- **Debug Log:** Add entry: bug description, root cause, fix applied
- **Change Log:** Add row: date, version, fix description, developer name

**DO NOT modify:** Ticket Information, Requirements, Acceptance Criteria, Technical Approach, Migration Details, Bug Fix Details, Feature Details, Planner Notes, Dependencies and Risks, Feedback.

---

## Blocking Conditions

HALT for: unapproved dependencies | ambiguous requirements | 2 consecutive failures on same issue | missing configuration | failing regression tests | migration health degradation | context gaps (missing files, broken citations) | file path mismatches | plan staleness (files changed since plan written)

---

## Validation Checklist

- [ ] All plan tasks and subtasks marked [x]
- [ ] All tests pass (full regression, not just affected)
- [ ] Coding standards applied to all modified files
- [ ] Modification history headers updated in all modified files
- [ ] Dev Agent Record → File List is complete
- [ ] Dev Agent Record → Agent Model Used is set
- [ ] Dev Agent Record → Completion Notes has implementation summary
- [ ] Change Log is updated
- [ ] Deviation Record populated (if any deviations occurred)
- [ ] task-dod-checklist passed
- [ ] (Migration only) migration-checklist passed for Post-Migration checkpoint
- [ ] (Migration only) Pre vs post migration comparison documented
- [ ] Plan status set to "Ready for Review"
