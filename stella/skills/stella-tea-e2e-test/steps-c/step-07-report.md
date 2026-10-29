---
name: 'step-07-report'
description: 'Write the timestamped run report, merge live-verification records into the root trace file, and publish only on request'
checkpointFile: '{test_artifacts}/stella/{key}/progress.md'
reportFile: '{test_artifacts}/stella/{key}/test-execution-{env}-{datetime}.md'
reportTemplate: '{skill-root}/templates/test-execution-template.md'
liveResultsFile: '{test_artifacts}/live-verification-results.json'
casesFile: '{test_artifacts}/stella/{key}/test-cases.md'
---

# Step 7: Report, Trace Record, Publication

## STEP GOAL

Turn the execution notes into the timestamped run report, merge this run's records into the root `live-verification-results.json` that TEA's `trace` reads, and offer — never auto-run — publication.

## MANDATORY EXECUTION RULES

### Universal Rules

- 📖 Read this entire step file before taking any action
- ✅ Speak in `{communication_language}`

### Role Reinforcement

- ✅ You are the **Master Test Architect**

### Step-Specific Rules

- 🚫 Everything publishes **on request only**. The report is handed to the human QA; you offer, never auto-post.
- 🚫 The report carries exactly what step-06 observed. No softening, no rounding, no inferred detail.

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Write the report before any publication offer

## CONTEXT BOUNDARIES:

- Available context: step-06 execution notes, checkpoint, merged workflow block
- Dependencies: step-06 complete for this run

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Write the Run Report

Fill `{reportTemplate}` into `{reportFile}` (`{env}` and `{datetime}` from step-06's run setup): frontmatter (`mode: qa`), the per-case results table, a Failure Detail subsection for every `Fail` / `Partly Pass` case (steps to reproduce, expected vs actual, per-step results, evidence links), the Blocked / Not Run table with reasons, and the summary line `Pass x, Fail y, Partly Pass z, Blocked b, Not Run n` whose counts sum to the total. `{casesFile}` stays untouched. Run history is append-only: never delete or overwrite a previous run's report. Format reference: `{skill-root}/resources/test-execution.example.md` — a worked example of a filled report.

### 2. Merge the Trace Record

Every QA run emits live coverage evidence into `{liveResultsFile}` — the root-level path TEA's `trace` reads by default (contract: `docs/reference/live-verification-results.md` in the TEA repo, schema `0.1.0`).

1. Read `{liveResultsFile}` if it exists; otherwise start `{ "schema_version": "0.1.0", "results": [] }`.
2. Remove every existing record whose `id` starts with `{key}-LIVE-` — a re-run replaces this key's records; other keys' records stay.
3. Append one record per case in the run — including `Blocked` and `Not Run` cases:
   - `id`: `{key}-LIVE-{NNN}`, zero-padded, numbered in case order.
   - `requirement_id`: the `AC-n` the case verifies (from its Description); when the case verifies no numbered AC (module runs), use the `SC-n` scenario id the case's Description names.
   - `status`: map `Pass`→`pass`, `Fail`→`fail`, `Partly Pass`→`fail` (a partly failing requirement is not verified), `Blocked`→`blocked`, `Not Run`→`skipped`. When viewports ran, a case still gets **one** record: its status is the worst of its combinations (worst to best: `fail`, `blocked`, `skipped`, `pass`), with the per-combination outcomes named in `evidence`.
   - `title`: the case title. `evidence`: one line of what was observed, plus the evidence path for failures.
   - `source_sha`: the sha under which **that case** was executed, **per record** (not top-level — records from different keys and commits coexist in this file, and a resumed run may span two commits). `observed_at`: run time, ISO 8601.
4. Set top-level `observed_at` to now and `producer` to `stella-tea-testing qa run {key} {datetime}`. Do not write a top-level `source_sha`.
5. Write the file back. Tell the user: a requirement covered only by live records caps trace's gate at CONCERNS by design.

**Dev runs never write this file.**

### 3. Show the Report

Display the report to the user, ending with the count summary line.

### 4. Offer Publication (On Request Only)

- **Ticket run:** offer one thing — a Jira comment on `{key}` via the Atlassian MCP containing the summary counts and the report's project-relative path. Post only on a yes.
- **Module run:** ask the destination — Confluence page, new Jira ticket, or files only — phrasing the question with `{workflow.defaults.module_publish}` as the default when saved ("post to the module's Confluence page like last time?"). On an answer, save it back to `[workflow.defaults] module_publish` in the `.user.toml`.
  - **Published content is the case sheet, not the report:** the sectioned test-case tables with ID, Title, Description, Precondition, Steps, Expected Results — verdict columns empty. Results stay in run reports. One H2 per section, table under each, mirroring `test-cases.md` one-to-one. No scenarios (working default of open item 7).
  - **Confluence:** first publish asks `space_key` and `parent_page_id`, then saves them to `[workflow.confluence]` in the `.user.toml`. Each module gets its own page under that parent; save the created page id as `confluencePageId` in the checkpoint so a re-publish **updates** the same page instead of creating a duplicate.
  - **Jira ticket:** ask the Jira project key once (save it as `[workflow.defaults] jira_publish_project` in the `.user.toml`). Create **one** ticket titled `Test Cases — {module name}` with the case sheet as its description (same H2-per-section structure, verdict columns empty). Save the created ticket key as `jiraCaseTicketKey` in the checkpoint; a re-publish **updates** that ticket's description instead of creating a new ticket.

### 5. Save Progress and Complete

Update `{checkpointFile}`: append `step-07-report` to `stepsCompleted`, set `lastStep: 'step-07-report'`, `nextStep: ''`, `workflowStatus: 'completed'`, `lastSaved: '{date}'`, and `confluencePageId` / `jiraCaseTicketKey` when one was created. Record report path, trace-record count, and publication outcome.

## On Complete

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting. If it fails, returns no output, or resolves an empty value, skip the hook and exit normally.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Report written with full failure detail and a summary whose counts sum to the total
- Root `{liveResultsFile}` merged: this key's records replaced, other keys' preserved, per-record `source_sha`
- Nothing posted to Jira/Confluence without an explicit yes this run
- Re-publish updated the saved Confluence page instead of duplicating

### ❌ SYSTEM FAILURE:

- Auto-posting anywhere
- Overwriting other keys' records in `{liveResultsFile}`, or writing it from a dev run
- Publishing verdict columns or results to Confluence/Jira
- Deleting or overwriting a previous run's report

**Master Rule:** The report states only what was observed. Skipping steps is FORBIDDEN.
