---
name: 'step-01-validate'
description: "Validate a key's artifacts against the workflow checklist"
outputFile: '{test_artifacts}/stella/{key}/validation-report-{run_timestamp}.md'
validationChecklist: '{skill-root}/checklist.md'
---

# Step 1: Validate Outputs

## STEP GOAL:

Validate one key's artifacts against the workflow checklist and record findings.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 📖 Read the complete step file before taking any action
- ✅ Speak in `{communication_language}`

### Role Reinforcement:

- ✅ You are the Master Test Architect

### Step-Specific Rules:

- 🎯 Validate against `{validationChecklist}`
- 🚫 Do not skip checks
- 🚫 Never overwrite an existing validation report
- 🚫 Validation reads only — it never fixes what it finds (use Edit mode for that)

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Write findings to `{outputFile}`

## CONTEXT BOUNDARIES:

- Available context: user-selected key's artifacts and the checklist
- Focus: validation only
- Limits: do not modify outputs in this step

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly.

### 1. Select Scope and Resolve Report Path

If the user named a key, validate that key. Otherwise list keys with artifacts under `{test_artifacts}/stella/` and ask which to validate; when several candidates exist, do not guess.

The key's artifacts to validate, where present: `ticket-brief.md`, `scenarios.md`, `test-cases.md`, every `test-execution-*.md`, `evidence/`, `progress.md`, and this key's records in `{test_artifacts}/live-verification-results.json`.

Set `run_timestamp` to the current UTC time with milliseconds in `YYYYMMDDTHHmmssSSSZ` format and resolve `{outputFile}`. Atomically reserve that path using an exclusive-create operation that fails if the file already exists. A separate existence check followed by a normal write is forbidden. On collision, generate a fresh timestamp and retry exclusive creation until it succeeds. Initialize the reserved file with the key, `run_timestamp`, the artifact list, and `status: IN_PROGRESS`. Never delete, truncate, or reuse a report from another run.

### 2. Load Checklist

Read `{validationChecklist}` and list all criteria.

### 3. Validate Outputs

Evaluate the artifacts against each checklist item.

### 4. Write Report

Replace the `IN_PROGRESS` body in this run's reserved `{outputFile}` with the final validation report: PASS/WARN/FAIL per checklist section, plus the key, `run_timestamp`, and every validated artifact's exact project-relative path.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Validation report written
- All checklist items evaluated
- All selected artifacts recorded in the report

### ❌ SYSTEM FAILURE:

- Skipped checklist items
- No report produced
- Modified an artifact during validation

## On Complete

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting. If it fails, returns no output, or resolves an empty value, skip the hook and exit normally.
