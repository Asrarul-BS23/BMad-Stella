---
name: 'step-07-report'
description: 'Write the timestamped run report, merge live-verification records into the root trace file, and publish only on request'
checkpointFile: '{test_artifacts}/stella/{key}/progress.md'
reportFile: '{test_artifacts}/{key}/test-execution-{env}-{datetime}.md'
issuesFile: '{test_artifacts}/{key}/issues-{env}-{datetime}' # extension from report_format
reportTemplate: '{skill-root}/templates/test-execution-template.md'
liveResultsFile: '{test_artifacts}/live-verification-results.json'
casesFile: '{test_artifacts}/{key}/test-cases.md'
evidenceDir: '{test_artifacts}/stella/{key}/evidence/{datetime}/'
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

Fill `{reportTemplate}` into `{reportFile}` (`{env}` and `{datetime}` from step-06's run setup): frontmatter (`mode: qa`), the per-case results table — including its Expected Results column, copied verbatim from the case, never reworded, and an Evidence/Comments column carrying **notes only, never a path or link** — a Failure Detail subsection for every `Fail` / `Partly Pass` case (steps to reproduce, expected vs actual, per-step results), an `## Evidence — Passed Cases` section (one subsection per `Pass` case), the Blocked / Not Run table with reasons, and the summary line `Pass x, Fail y, Partly Pass z, Blocked b, Not Run n` whose counts sum to the total. **Every screenshot of every executed case appears embedded as a rendered markdown image** — `![...](../stella/{key}/evidence/{datetime}/...)`, one line per file, never a bare link. `{casesFile}` stays untouched. **Scoped run (step-06 ran only a subset):** the report covers only the executed cases — the total is the subset's size, not the full case count; unexecuted cases are not listed as `Not Run` filler, they simply are not part of this report. Run history is append-only: never delete or overwrite a previous run's report. Format reference: `{skill-root}/resources/test-execution.example.md` — a worked example of a filled report.

### 1b. Formatted Reports and the Issues Report (`report_format`)

Resolve the preference: `{workflow.defaults.report_format}` (`md` | `html` | `pdf`). When absent, ask once (interactive, per the `SKILL.md` convention — options: HTML / PDF / None) — "Besides markdown, which format do you want run reports in?" — and offer to save the answer to `[workflow.defaults] report_format` in the `.user.toml` (§6 ask-fallback; §9 stops any re-ask). One preference covers both the execution report and the issues report. On `md`, skip this whole section.

1. **Build the HTML**: write a single self-contained HTML file next to `{reportFile}` with the same base name (`.html`) — inline CSS only, every evidence screenshot inlined as a base64 `data:` URI, no external references — so the file is a standalone document deliverable to anyone. Content mirrors the markdown report one-to-one.
2. **PDF (when preference is `pdf`)**: open that HTML via its `file://` URL in the Playwright MCP browser and save it with `browser_pdf_save` to the same base name (`.pdf`); then delete the intermediate `.html`. When `browser_pdf_save` is not available on the connected server, keep and deliver the `.html` instead and say so in one line — **never block the run on format export**.
3. **Issues report — only when the run has `Fail` / `Partly Pass` cases**: build `{issuesFile}.{html|pdf}` the same way (self-contained, preferred format, no `.md` twin). Content: one section per failed case — ID + title, numbered reproduce steps exactly as driven, expected vs actual, per-step results, every evidence screenshot embedded full-width. Nothing else: no passed cases, no summary table beyond a count line.

### 2. Merge the Trace Record

Every QA run emits live coverage evidence into `{liveResultsFile}` — the root-level path TEA's `trace` reads by default (contract: `docs/reference/live-verification-results.md` in the TEA repo, schema `0.1.0`).

1. Read `{liveResultsFile}` if it exists; otherwise start `{ "schema_version": "0.1.0", "results": [] }`.
2. **Full run:** remove every existing record whose `id` starts with `{key}-LIVE-` — a full re-run replaces this key's records; other keys' records stay. **Scoped run:** remove and replace only the records whose `NNN` (below) matches an executed case this run; records for cases outside this run's scope are left exactly as they were from the last run that covered them.
3. Append one record per case **in this run's scope** (full run: every case; scoped run: only the chosen subset) — including `Blocked` and `Not Run` cases:
   - `id`: `{key}-LIVE-{NNN}`, zero-padded, `NNN` = the case's position in `{casesFile}`'s full file order (not the scoped subset's own order) — so a case's record id stays stable whether it was covered by a full or a scoped run.
   - `requirement_id`: the `AC-n` the case verifies (from its Description); when the case verifies no numbered AC (module runs), use the `SC-n` scenario id the case's Description names.
   - `status`: map `Pass`→`pass`, `Fail`→`fail`, `Partly Pass`→`fail` (a partly failing requirement is not verified), `Blocked`→`blocked`, `Not Run`→`skipped`. When viewports ran, a case still gets **one** record: its status is the worst of its combinations (worst to best: `fail`, `blocked`, `skipped`, `pass`), with the per-combination outcomes named in `evidence`.
   - `title`: the case title. `evidence`: one line of what was observed, plus the evidence path for failures.
   - `source_sha`: the sha under which **that case** was executed, **per record** (not top-level — records from different keys and commits coexist in this file, and a resumed run may span two commits). `observed_at`: run time, ISO 8601.
4. Set top-level `observed_at` to now and `producer` to `stella-tea-live-testing qa run {key} {datetime}`. Do not write a top-level `source_sha`.
5. Write the file back. Tell the user: a requirement covered only by live records caps trace's gate at CONCERNS by design.

**Dev runs never write this file.**

### 3. Show and Open the Report

Display the report to the user, ending with the count summary line. When a formatted file was produced (§1b), open it in the **OS default browser** — the execution report's `.html`/`.pdf`, and the issues report when one exists — via an OS open command on the `file://` URL (`Start-Process` on Windows, `open` on macOS, `xdg-open` on Linux). Never open it in the Playwright test browser, and never force a new browser window — a file URL lands as a new tab of the user's existing window. Preference `md` → nothing opens.

### 4. Offer Publication (On Request Only)

- **Ticket run:** offer one thing — a Jira comment on `{key}` via the Atlassian MCP containing the summary counts and the report's project-relative path. Post only on a yes.
- **Module run:** when step-05 already ran its own pre-run publish offer for this key (checkpoint carries `confluencePageId` or `jiraCaseTicketKey`), do not re-offer — just **update** that saved page/ticket with the current case sheet, silently, as part of this step. Otherwise ask the destination interactively (per the `SKILL.md` convention — options: Confluence page / new Jira ticket / files only, the saved `{workflow.defaults.module_publish}` first as the recommended default when it exists). On an answer, save it back to `[workflow.defaults] module_publish` in the `.user.toml`.
  - **Published content is the case sheet, not the report:** the sectioned test-case tables with ID, Title, Description, Precondition, Steps, Expected Results — verdict columns empty. Results stay in run reports. One H2 per section, table under each, mirroring `test-cases.md` one-to-one. No scenarios (open item 7).
  - **Published IDs drop the module prefix (open item 7):** render case IDs on the published page/ticket as `TC-01 … TC-NN` — strip the `{key}-` prefix, continuous numbering, no section scoping — because the page/ticket header already names the module. `{casesFile}`, run reports, and trace records are unaffected: they keep the full `TC-{key}-NN` always. The number itself is identical; only the prefix is stripped on publish.
  - **Confluence:** first publish asks `space_key` and `parent_page_id`, then saves them to `[workflow.confluence]` in the `.user.toml`. Each module gets its own page under that parent; save the created page id as `confluencePageId` in the checkpoint so a re-publish **updates** the same page instead of creating a duplicate.
  - **Jira ticket:** ask the Jira project key once (save it as `[workflow.defaults] jira_publish_project` in the `.user.toml`). Create **one** ticket titled `Test Cases — {module name}` with the case sheet as its description (same H2-per-section structure, verdict columns empty, IDs prefix-stripped). Save the created ticket key as `jiraCaseTicketKey` in the checkpoint; a re-publish **updates** that ticket's description instead of creating a new ticket.

### 5. Save Progress and Complete

Update `{checkpointFile}`: append `step-07-report` to `stepsCompleted`, set `lastStep: 'step-07-report'`, `nextStep: ''`, `workflowStatus: 'completed'`, `lastSaved: '{date}'`, and `confluencePageId` / `jiraCaseTicketKey` when one was created. Record report path, trace-record count, and publication outcome.

## On Complete

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting. If it fails, returns no output, or resolves an empty value, skip the hook and exit normally.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Report written with full failure detail, embedded evidence images for every executed case (passed ones included), and a summary whose counts sum to the total
- Preferred-format report (and issues report, when failures exist) produced self-contained and opened in the OS default browser; `report_format` asked at most once and saved
- Root `{liveResultsFile}` merged: full run replaces this key's records, scoped run replaces only the executed subset's, other keys' preserved, per-record `source_sha`
- Nothing posted to Jira/Confluence without an explicit yes this run
- Re-publish updated the saved Confluence page instead of duplicating
- Published case IDs drop the module prefix; `{casesFile}`/reports/trace keep the full `TC-{key}-NN`

### ❌ SYSTEM FAILURE:

- Auto-posting anywhere
- Overwriting other keys' records in `{liveResultsFile}`, or writing it from a dev run
- A scoped run erasing trace records for cases outside its own scope
- Publishing verdict columns or results to Confluence/Jira
- Deleting or overwriting a previous run's report
- Evidence rendered as a bare link/path anywhere in a report instead of an embedded image
- Blocking the run because `browser_pdf_save` is unavailable, or opening reports in the Playwright test browser
- Re-offering a module publish destination step-05 already asked and saved

**Master Rule:** The report states only what was observed. Skipping steps is FORBIDDEN.
