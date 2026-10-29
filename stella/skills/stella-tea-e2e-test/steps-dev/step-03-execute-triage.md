---
name: 'step-03-execute-triage'
description: 'Execute hunt scenarios via Playwright MCP with an in-session triage loop; report with mode: dev'
reportFile: '{test_artifacts}/stella/{key}/test-execution-{env}-{datetime}.md'
reportTemplate: '{skill-root}/templates/test-execution-template.md'
casesFile: '{test_artifacts}/stella/{key}/test-cases.md'
casesTemplate: '{skill-root}/templates/test-cases-template.md'
evidenceDir: '{test_artifacts}/stella/{key}/evidence/{datetime}/'
executionRules: '{skill-root}/resources/execution-rules.md'
---

# Dev Step 3: Execute & Triage

## STEP GOAL

Drive the hunt scenarios through Playwright MCP, triage every failure with the dev in-session (bug vs bad scenario), loop fix → re-run until the dev stops, then write the `mode: dev` report.

## MANDATORY EXECUTION RULES

### Universal Rules

- 📖 Read this entire step file before taking any action
- ✅ Speak in `{communication_language}`

### Role Reinforcement

- ✅ You are the **Master Test Architect** — the dev judges failures; you supply evidence and a fix direction

### Step-Specific Rules

- 📖 **Load `{executionRules}` completely before driving the browser.** The integrity rule, statuses, evidence naming, and blocked semantics apply to dev runs unchanged.
- 🛑 Playwright MCP must be connected; refuse to execute without it.
- 🚫 This step never writes `live-verification-results.json` — dev runs never count as QA coverage.
- 🚫 Never suggest writing automation code.

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record each scenario's result before the next

## CONTEXT BOUNDARIES:

- Available context: hunt scenarios, running app, `{executionRules}`
- Focus: execute, triage, loop, report

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Run Setup

Set `{datetime}` (`YYYY-MM-DD-HHmm`) and `{env}` (saved app config = `local` unless the dev names an environment). Create `{evidenceDir}`. Resolve `source_sha` via `git rev-parse HEAD` for the report header.

### 2. Execute with In-Session Triage

For each scenario, in order:

1. Announce it, drive its steps through Playwright MCP, and assign a status per `{executionRules}` (integrity rule included: unperformed = `Not Run`).
2. On `Pass`: record and move on.
3. On `Fail` / `Partly Pass`: capture evidence per the rules, then **triage with the dev immediately**:

   > "{scenario}: expected {expected}, observed {actual} (evidence: {path}). Is this (A) a real bug, or (B) a wrong scenario?"
   - **(A) Bug accepted:** suggest the fix direction (file/function suspects from the spec's changed code, reasoning in one or two lines — a direction, never a patch dump). The dev fixes; on "re-run", re-execute this scenario (and any the fix could affect) and update its result. The pre-fix failure stays in the run notes as a found bug.
   - **(B) Scenario wrong:** correct the scenario per the dev's reading of the spec, re-run it, and record the corrected result. Note the correction.

4. Keep the loop going — execute, triage, fix, re-run — until every scenario has a final status or the dev says stop.

### 3. Write the Report

Fill `{reportTemplate}` into `{reportFile}` with frontmatter `mode: dev`. Include: final per-scenario results; a **Bugs Found** list (each with steps to reproduce, expected vs actual, evidence, fixed-in-session or still open); scenario corrections made; Failure Detail per `Fail` / `Partly Pass` with per-step results; and the count summary `Pass x, Fail y, Partly Pass z, Blocked b, Not Run n`. Statuses reflect the **final** state after fixes; found-then-fixed bugs live in the Bugs Found list. Dev run reports never count as QA coverage.

### 4. Offer the Cases File (On Request Only)

Ask once: "Want a tabular test-case file to hand to QA?" Only on a yes, write `{casesFile}` from `{casesTemplate}` (the final scenarios as cases, verdict columns empty, continuous `TC-{key}-{NN}` IDs). Otherwise the report is the only artifact.

## On Complete

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting. If it fails, returns no output, or resolves an empty value, skip the hook and exit normally.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Every failure triaged with the dev before moving on; fix directions suggested, dev judged
- Found-then-fixed bugs preserved in the report even when the final status is Pass
- Report carries `mode: dev`; no live-verification record written
- Cases file written only on an explicit yes

### ❌ SYSTEM FAILURE:

- Any status not backed by Playwright MCP execution in this session (integrity-rule violation)
- Writing `live-verification-results.json`
- Auto-generating the cases file, or suggesting automation code
- Erasing a found bug from the report because it was fixed

**Master Rule:** The dev judges; you never overrule a triage decision. Unperformed = `Not Run`.
