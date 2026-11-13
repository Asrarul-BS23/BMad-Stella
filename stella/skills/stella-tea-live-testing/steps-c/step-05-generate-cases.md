---
name: 'step-05-generate-cases'
description: 'Generate sectioned tabular test cases from the approved scenarios only; refine/approve loop; staleness propagation on re-entry'
nextStepFile: '{skill-root}/steps-c/step-06-execute.md'
checkpointFile: '{test_artifacts}/stella/{key}/progress.md'
scenariosFile: '{test_artifacts}/stella/{key}/scenarios.md'
casesFile: '{test_artifacts}/{key}/test-cases.md'
casesTemplate: '{skill-root}/templates/test-cases-template.md'
attachmentsDir: '{test_artifacts}/stella/{key}/attachments/'
---

# Step 5: Generate Test Cases

## STEP GOAL

From the **approved** scenarios only, generate the team's tabular test cases into `{casesFile}`, run the same show → refine → approve loop, and lock the file.

## MANDATORY EXECUTION RULES

### Universal Rules

- 📖 Read this entire step file before taking any action
- ✅ Speak in `{communication_language}`
- 🚫 Do not load the next step until this step is complete

### Role Reinforcement

- ✅ You are the **Master Test Architect**

### Step-Specific Rules

- 🛑 **Gate:** read `{scenariosFile}` frontmatter first. If `status` is not `approved`, refuse: "Scenarios for `{key}` are still `draft`. Approve them (step-04) before test cases can be generated." **Halt.** This refusal has no override.
- 🚫 Verdict columns (`Actual Results`, `Status`, `Evidence/Comments`) stay empty in this file, always. Runs write reports, never this file.

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: approved `{scenariosFile}`, `{casesTemplate}`, environment users
- Focus: case generation and its lock only — no execution here

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Gate Check

Apply the Step-Specific gate rule above. Also compare the scenarios file's `approved` timestamp (full `{date}T{HH:mm}`, not day granularity) with the timestamp in `generated_from` of an existing `{casesFile}`: if cases exist and the scenarios were re-approved later, run section 2 (propagation) instead of regenerating from scratch.

### 2. Staleness Propagation (re-entry only)

When `{casesFile}` already exists and `{scenariosFile}` changed since it was generated:

1. Diff the current scenarios against the **generation baseline recorded in the checkpoint body** (section 6 writes it: the `SC-n` → case-ID map with each scenario's title): identify edited, added, and removed scenarios by their `SC-n` ids. Never guess the baseline from memory; if the checkpoint lacks the map (legacy run), say so and ask the user whether to regenerate in full instead.
2. Propagate **only** the changed scenarios: edit the matching cases, add cases for new scenarios, remove cases for removed scenarios. Untouched scenarios' cases stay byte-identical. Removed case IDs are never reused; new cases continue the ID sequence.
3. Refresh `generated_from` to `'scenarios.md @ {new scenarios approved timestamp}'` — every propagation updates it, not only a fresh generation. This stops a stale timestamp from re-triggering this section's diff on the next entry once nothing has changed since.
4. Report a change summary: per change in `{casesFile}`, which scenario change caused it.
5. Continue at section 4 (the loop) — a propagated file needs re-approval.

### 3. Generate (fresh)

Using `{casesTemplate}` (read its embedded rules, then delete the comment block from the output):

1. One `## Section` per scenario section, same names, same order.
2. One or more cases per scenario. IDs `TC-{key}-01`, `TC-{key}-02`, … continuous across the whole file — numbering never restarts per section.
3. Each case: Title; Description (what/why, naming the `SC-n` scenario and, where present, the `AC-n` it verifies); Precondition (data, role, app state — runnable from its own row); numbered plain-language Test Steps addressing users by role; observable Expected Results. Verdict columns empty.
4. Frontmatter: `status: draft`, `key`, `generated_from: 'scenarios.md @ {scenarios approved timestamp}'` (the full `{date}T{HH:mm}` value from the scenarios frontmatter), `date`.

### 4. Show → Refine → Approve Loop

Show a summary (sections, case count, IDs and titles per section; full rows on request). Ask the verdict interactively (per the `SKILL.md` convention): "Review the test cases." Options: **"Approved"** (lock) / **"Refine"** / **"Show full rows first"** — on "Refine", collect the changes in normal chat. Apply the same loop discipline as step-04: apply each change, keep `status: draft`, re-show marked changes, **halt** between iterations, and flip to `status: approved` + `approved: '{date}T{HH:mm}'` only on an explicit approval.

Case-level edits here do not touch `{scenariosFile}`. If a requested change contradicts an approved scenario, say so and ask whether to edit the scenario instead (that re-opens step-04 for the changed scenario, then propagates per section 2).

### 5. On Approval

**Formatted copy of the case sheet:** resolve `{workflow.defaults.report_format}` (`md` | `html` | `pdf`); when absent, ask once (interactive, per the `SKILL.md` convention — options: HTML / PDF / None) — "Besides markdown, which format do you want run reports and case sheets in?" — and offer to save the answer to `[workflow.defaults] report_format` in the `.user.toml` (§6 ask-fallback; §9 stops any re-ask — step-07 asks the same question only when it was never asked). On `html`/`pdf`, write `test-cases.{html|pdf}` beside `{casesFile}` as a single self-contained file (inline CSS; PDF via Playwright MCP `browser_pdf_save` on the intermediate `file://` HTML, HTML kept instead when the tool is unavailable — never block on it). Regenerate this copy **only here, at the approval flip** — never per propagation iteration.

**Ticket runs — attachment cleanup:** run `node {project-root}/_bmad/custom/stella/utils/jira-attachments {key} --purge`, then delete `{attachmentsDir}` (the copy made at intake). Attachments are scenario-design input only; once cases are locked, they serve no further purpose. The brief's Context section keeps the text record that they existed — only the files are removed.

**Module runs — pre-run publish offer:** ask the publish destination exactly as step-07 §4 does (Confluence page / Jira ticket / files only), using the saved `module_publish` default when one exists; save the answer the same way on a first ask. Publish the case sheet as `{casesFile}` now reads (verdict columns empty) — identical content to what step-07 would publish later. Save the created `confluencePageId` / `jiraCaseTicketKey` to the checkpoint. This offer runs **once** per key, here; step-07 does not repeat it — its own publish step later just updates the same saved page/ticket.

### 6. Save Progress

Update `{checkpointFile}`: append `step-05-generate-cases` to `stepsCompleted`, set `lastStep`, `nextStep: '{nextStepFile}'`, `lastSaved: '{date}'`. Record in the checkpoint body: case count per section; the **generation baseline** — a map of every `SC-n` (with its title) to the case IDs generated from it — which section 2 diffs against on re-entry; on re-entry, the change summary; and, on approval, the attachment-cleanup outcome (ticket runs) or the publish outcome (module runs). Rewrite the map on every generation or propagation so it always reflects the current `{casesFile}`.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Generation ran only against an `approved` scenarios file
- Continuous IDs, sectioned tables, empty verdict columns
- Re-entry propagated only changed scenarios, with a cause-linked change summary; `generated_from` refreshed on every propagation
- Lock flipped only on explicit approval
- Ticket-run approval purges fetched attachments; module-run approval offers publish once, consistent with step-07's defaults

### ❌ SYSTEM FAILURE:

- Generating from a `draft` scenarios file
- Restarting ID numbering per section, or reusing a removed ID
- Writing anything into the verdict columns
- Regenerating unchanged cases on re-entry
- Leaving a stale `generated_from` after propagation
- Leaving attachments in place after a ticket run's cases are approved

**Master Rule:** The approval gates are real halts. Skipping them is FORBIDDEN.
