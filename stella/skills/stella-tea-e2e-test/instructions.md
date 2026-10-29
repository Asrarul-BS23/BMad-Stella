<!-- Powered by BMAD-CORE™ -->

# Stella Ticket & Module Testing

**Version**: 1.0 (Step-File Architecture, two routed flows)

---

## Overview

Takes one Jira ticket or one system module through a complete manual-testing lifecycle with a live browser:

- **QA flow**: intake → scenario design (via `bmad-tea-test-design`, unmodified) → human approval lock → tabular test cases → human approval lock → per-case execution via Playwright MCP → evidence-backed run report + trace coverage record.
- **Dev flow**: a shift-left bug filter. The dev tests their own implemented ticket before handoff: spec intake → bug-hunting scenarios → execute-and-triage loop. No approval gates; the report is the default artifact, bugs fixed before QA is the success measure.

One run owns exactly one `{key}` — a Jira ticket key or a slugified module name.

---

## WORKFLOW ARCHITECTURE

This workflow uses **step-file architecture** for disciplined execution:

### Core Principles

- **Micro-file Design**: Each step is a self-contained instruction file
- **Just-In-Time Loading**: Only the current step file is in memory
- **Sequential Enforcement**: Execute steps in order without skipping
- **State Tracking**: Write outputs only when instructed, then proceed

### Step Processing Rules (Non-Negotiable)

1. **READ COMPLETELY**: Read the entire step file before taking any action
2. **FOLLOW SEQUENCE**: Execute all numbered sections in order
3. **WAIT FOR INPUT**: Halt when user input is required — approval locks are real halts
4. **LOAD NEXT**: Only load the next step file when directed

### Shared Execution Rules

Both flows execute test cases under one rulebook: `{skill-root}/resources/execution-rules.md`. It defines the execution integrity rule, every status, evidence naming, blocked semantics, viewport handling, and the config ask-fallback. The execution steps (`steps-c/step-06-execute.md`, `steps-dev/step-03-execute-triage.md`) load it before driving the browser. QA and dev execution behavior never drifts apart because it lives in one file.

---

## INITIALIZATION SEQUENCE

### 1. Configuration Loading

From `workflow.yaml`, resolve:

- `flow_mode`, `environment`, `user`, `viewports`, `date` (`test_artifacts`, `user_name`, `communication_language` and `document_output_language` come from activation)

### 2. First Step

Load, read completely, and execute:
`{skill-root}/steps-c/step-01-detect-mode.md`

It resolves `flow_mode` (the priority order lives in that step file's section 1 — the single source) and routes:

- `qa` → continue in `{skill-root}/steps-c/`
- `dev` → load `{skill-root}/steps-dev/step-01-spec-intake.md`

### 3. Resume Support

If the user selects **Resume** mode, load, read completely, and execute:
`{skill-root}/steps-c/step-01b-resume.md`

Checkpoints live at `{test_artifacts}/stella/{key}/progress.md`, one per `{key}`. Resume reads `flowMode` back from the checkpoint; a QA-started key never silently continues as a dev run. The dev flow writes no checkpoint and has no resume by design — dev runs are short, and loop speed is the point.

---

## FLOW SUMMARY

### QA flow (steps-c/)

| Step | File                         | Produces                                                                                                  |
| ---- | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| 01   | step-01-detect-mode.md       | `flow_mode`, `{key}`, checkpoint handling                                                                 |
| 02   | step-02-intake.md            | `ticket-brief.md` (ticket runs) or confirmed module scope; config/credential check                        |
| 03   | step-03-scenarios.md         | `scenarios.md` (status: draft) + `exploration/`, copied from `bmad-tea-test-design` output                |
| 04   | step-04-approve-scenarios.md | `scenarios.md` flipped to status: approved, by in-chat loop                                               |
| 05   | step-05-generate-cases.md    | `test-cases.md` (sectioned 9-column tables), approved by the same loop; staleness propagation             |
| 06   | step-06-execute.md           | Per-case Playwright MCP execution; `evidence/{datetime}/`                                                 |
| 07   | step-07-report.md            | `test-execution-{env}-{datetime}.md`, root `live-verification-results.json` merge, on-request publication |

### Dev flow (steps-dev/)

| Step | File                      | Produces                                                              |
| ---- | ------------------------- | --------------------------------------------------------------------- |
| 01   | step-01-spec-intake.md    | Located bmad-builder spec, `{key}`, saved app-run commands            |
| 02   | step-02-hunt-scenarios.md | Bug-hunting scenarios (error cases, edges, integration points)        |
| 03   | step-03-execute-triage.md | Execute → triage loop; report with `mode: dev`; cases file on request |

### Edit mode (steps-e/)

Edits scenarios or test cases after the fact and propagates scenario changes to matching case changes (edits, additions, removals), reporting a change summary of what changed and which scenario change caused it. An edit to an approved scenarios file re-triggers case generation rules **for the changed scenarios only**.

### Validate mode (steps-v/)

Validates a key's artifacts against `{skill-root}/checklist.md`.
