---
name: 'step-06-execute'
description: 'Execute each approved test case one by one via Playwright MCP on the designated environment, capturing evidence under the integrity rule'
nextStepFile: '{skill-root}/steps-c/step-07-report.md'
checkpointFile: '{test_artifacts}/stella/{key}/progress.md'
casesFile: '{test_artifacts}/stella/{key}/test-cases.md'
evidenceDir: '{test_artifacts}/stella/{key}/evidence/{datetime}/'
executionRules: '{skill-root}/resources/execution-rules.md'
---

# Step 6: Execute Test Cases

## STEP GOAL

Drive every approved test case through Playwright MCP on the designated environment, one by one, recording real observed results and evidence under the execution integrity rule.

## MANDATORY EXECUTION RULES

### Universal Rules

- 📖 Read this entire step file before taking any action
- ✅ Speak in `{communication_language}`
- 🚫 Do not load the next step until this step is complete

### Role Reinforcement

- ✅ You are the **Master Test Architect** — a result you did not observe is a result you do not have

### Step-Specific Rules

- 📖 **Load `{executionRules}` completely before driving the browser.** Its integrity rule, status definitions, blocked cascade, evidence naming, credential handling, and viewport rules govern this entire step and may not be overridden.
- 🛑 **Gate:** `{casesFile}` frontmatter `status` must be `approved`; refuse a `draft` file and **halt**.
- 🛑 **Tooling gate:** Playwright MCP must be connected. If not, say so and **halt** — nothing in this step may run without it.
- 🚫 `{casesFile}` is read-only in this step.

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record each case's result immediately after it finishes, before starting the next

## CONTEXT BOUNDARIES:

- Available context: approved cases, environment config, `{executionRules}`
- Focus: execution and evidence only — report assembly is step-07
- Dependencies: steps 2–5 complete for this key

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Run Setup

1. Set `{datetime}` once for this run: current local time as `YYYY-MM-DD-HHmm`. The report and the evidence folder share it. **On a resumed interrupt** (the checkpoint body carries an interrupt record from this step), reuse the `{datetime}` and `environment` recorded there — a resumed execution continues the same run, the same evidence folder, and the same report filename. `source_sha` is **not** reused: it is a fact about the current HEAD, so re-resolve it now. When it differs from the recorded one, tell the user the run now spans two commits, and carry both forward: cases executed before the interrupt keep the recorded sha, cases executed from here use the new one (step-07 writes `source_sha` per record, so the trace file represents this correctly).
2. Resolve `environment` (run variable → `{workflow.defaults.environment}` → ask) and its `base_url`.
3. Resolve credentials for every role the cases use, per `{executionRules}` section 5 — before the first case, so a missing secret blocks the run at the start, not mid-case.
4. Resolve `viewports`: empty = desktop default; otherwise list each combination this run covers (`{executionRules}` section 7).
5. Resolve `source_sha`: run `git rev-parse HEAD` in the project under test. If it fails, record `source_sha` as unresolved and tell the user trace freshness checks will not match.
6. Create `{evidenceDir}`.
7. Announce the run plan: environment, base URL, case count, combinations, evidence folder.

### 2. Execute Case by Case

For each case in `{casesFile}`, in file order (per viewport combination when requested):

1. Announce `TC-{key}-{n} — {title}`.
2. Establish the precondition, including role login **before** the test body.
3. Drive each numbered step through Playwright MCP exactly as written. Observe the result of each step against the expected results.
4. Assign the status per `{executionRules}` section 2. Record per-step results for `Fail` / `Partly Pass`.
5. Capture screenshots per `{executionRules}` section 4 — `Fail` / `Partly Pass` only, into `{evidenceDir}`.
6. On a `Blocked` case with dependents, run the blocked-cascade question (`{executionRules}` section 3) and **halt** for the answer.
7. Record the case's result (status, observed actuals, per-step detail, evidence paths) in working notes for step-07 **before** starting the next case.

If the user interrupts the run, update the checkpoint **without** appending `step-06-execute` to `stepsCompleted`: keep `nextStep: '{skill-root}/steps-c/step-06-execute.md'`, record the last executed case and each finished case's result in the checkpoint body — also record `{datetime}`, `environment`, and `source_sha` there, so the resumed run is the same run — set `lastSaved: '{date}'`, and stop. Resume then re-enters this step and continues from the first unexecuted case — finished cases keep their recorded results; nothing re-runs. Section 3's completion save happens only when every case has a final status.

### 3. Save Progress

Update `{checkpointFile}`: append `step-06-execute` to `stepsCompleted`, set `lastStep`, `nextStep: '{nextStepFile}'`, `lastSaved: '{date}'`. Record `{datetime}`, `environment`, `source_sha`, per-case statuses, and the last executed case.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Every reported status comes from steps actually driven through Playwright MCP in this run
- Evidence captured only for Fail / Partly Pass, named per the rules, under the run's `{datetime}` folder
- Credentials resolved before the first case; none written to any artifact
- Blocked cascades asked, never silently decided

### ❌ SYSTEM FAILURE:

- Any status claimed, inferred, or carried from a previous run (integrity-rule violation — the worst failure)
- Executing against a `draft` cases file, or editing `{casesFile}`
- Running without Playwright MCP, or continuing after it disconnects
- Viewport combinations run without the user requesting them

**Master Rule:** Unperformed = `Not Run`. No exceptions.
