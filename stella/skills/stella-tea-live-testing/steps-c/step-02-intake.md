---
name: 'step-02-intake'
description: 'Fetch the Jira ticket into a brief (ticket runs) or confirm module scope; check environment config with ask-fallback'
nextStepFile: '{skill-root}/steps-c/step-03-scenarios.md'
checkpointFile: '{test_artifacts}/stella/{key}/progress.md'
briefFile: '{test_artifacts}/stella/{key}/ticket-brief.md'
attachmentsDir: '{test_artifacts}/stella/{key}/attachments/'
executionRules: '{skill-root}/resources/execution-rules.md'
userConfigExample: '{skill-root}/config/stella-tea-live-testing.user.toml.example'
secretsExample: '{skill-root}/config/stella-tea-live-testing.secrets.env.example'
---

# Step 2: Intake

## STEP GOAL

Produce the scenario-design input for this `{key}`: a `ticket-brief.md` from Jira for a ticket run, or a confirmed module scope for a module run. Verify environment config exists, asking for anything missing.

## MANDATORY EXECUTION RULES

### Universal Rules

- 📖 Read this entire step file before taking any action
- ✅ Speak in `{communication_language}`
- 🚫 Do not load the next step until this step is complete

### Role Reinforcement

- ✅ You are the **Master Test Architect**

### Step-Specific Rules

- 🚫 Never invent ticket content. The brief contains only what Jira returned, marked by field.
- 🚫 Never write a credential value into the brief or any artifact.

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: `{key}`, `input_type`, merged workflow block, checkpoint
- Focus: intake and config readiness only — no scenario design here
- Limits: do not explore the app or read code in this step

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. TEA Knowledge Base Check

If `{tea-knowledge}/tea-index.csv` does not exist, the TEA knowledge base is not installed. The installer runs this automatically (`npx skills add bmad-code-org/bmad-method-test-architecture-enterprise@v3.6.0`, right after the BMad step), so this should only happen on a pre-existing project that hasn't re-run the installer. Tell the user, offer to install it by hand with `npx skills add bmad-code-org/bmad-method-test-architecture-enterprise --skill bmod-tea`, run that on a yes, and **halt** until it is there. Step 3 invokes `bmad-tea-test-design`, which requires it. This check lives here, not in activation, so the dev flow — which never uses the knowledge base — cannot die on it.

### 2. Ticket Run: Fetch and Write the Brief

Run this section only when `input_type = ticket`; a module run skips to section 3.

1. Fetch the ticket `{key}` via the Jira (Atlassian) MCP: summary, description, acceptance criteria, comments, issue type, status, and linked issues. If the MCP is unavailable or the ticket is not found, report the exact failure and **halt** — do not continue with invented content. Comments: fetch every comment the connected account can see — Jira's own access control already scopes this; apply no further filtering by visibility or recency.
2. Fetch attachments: run `node {project-root}/_bmad/custom/stella/utils/jira-attachments {key}`. On failure, note it in the brief's Context section and continue — attachment fetch never halts intake, unlike the ticket fetch itself. On success, copy every file the tool's manifest lists → `{attachmentsDir}`.
3. If the ticket has no explicit acceptance criteria, derive candidate ACs from the description, **label the section "Acceptance Criteria (derived — confirm)"**, show them to the user, and **halt** for confirmation before writing the final brief (interactive verdict per the `SKILL.md` convention: "Confirmed" / "Refine" — refinements collected in chat).
4. Write `{briefFile}` — when the ticket has no explicit acceptance criteria, write it only after item 3's confirmation; derived ACs never land on disk unconfirmed:

   ```markdown
   ---
   key: '{key}'
   fetched: '{date}'
   source: 'jira'
   ---

   # Ticket Brief — {key}: {summary}

   ## Summary

   {summary verbatim}

   ## Description

   {description verbatim, converted to markdown}

   ## Acceptance Criteria

   <!-- Number them AC-1, AC-2, ... in source order. These IDs become the
        requirement_ids in scenarios, cases, and live-verification records. -->

   - **AC-1:** {criterion}
   - **AC-2:** {criterion}

   ## Context

   {issue type, status, linked issues — facts from Jira only}

   <!-- List every fetched attachment by filename. A format the agent can read (images,
        PDF, text, JSON) feeds business understanding directly; an unparsed format is
        still downloaded and listed here with "not parsed". Omit this block when the
        ticket has no attachments. -->

   **Attachments:** {filename} — {parsed | not parsed}, ...

   ## Comments

   <!-- One entry per comment, chronological, Jira fields only — never invented or
        paraphrased beyond markdown conversion. Omit this section when there are none. -->

   - **{author}, {date}:** {comment text verbatim}
   ```

### 3. Module Run: Prepare the Scope Restatement

Run this section only when `input_type = module`. No Jira fetch, no brief file.

Restate the module in one short paragraph: its name, what part of the app it covers, and any sub-areas the user named. Do **not** ask about it yet — the scope question is part of section 4's single scoping bundle.

### 4. Scoping Bundle — One Interactive Ask

Both run types reach here. Gather everything still unresolved, then ask **once**:

1. **Resolve what needs asking.** `environment`: the run variable if set, else `{workflow.defaults.environment}`. For that environment, verify `base_url` and at least one role-keyed user exist under `{workflow.environments.{environment}}`. Per the no-redundant-questions rule, anything already resolved (invocation, config, checkpoint) is settled and never enters the bundle.
2. **State the decision context concisely, first** — enough for the user to decide everything in one turn, no follow-up round:
   - Module run: the section-3 scope restatement.
   - Ticket run: a short digest of the fetched brief — title, AC count, affected areas/screens the ticket names.
3. **Ask one interactive question event** (one `AskUserQuestion` call per the `SKILL.md` convention, up to 4 questions), containing only what is unresolved:
   - **Scope confirm** (always): "Scenario design will cover this scope — anything to add or exclude?" Options: "Scope is right" (recommended) / additions or exclusions via "Other". Ticket run: the question is grounded in the digest.
   - **Environment** (when unresolved): options from the environments configured in the workflow block.
   - **User/role** (when unresolved): options from the environment's configured roles.
   - **Impacted areas/systems** (ticket runs, **only when step-03's commit-driven exploration will be skipped for lack of code access** — no git repo at `{project-root}` and no link to the code): "Which other areas/systems does this change impact?" Options seeded from the brief's linked issues and named screens, plus "No other areas"; free input via "Other". With code access this question never appears — the ripple analysis covers it.
4. **After the answers:** record the confirmed scope (and any impacted-areas answer) in the checkpoint body. Any config value supplied → apply the Config Ask-Fallback save offer in `{executionRules}` (section 6): offer non-secret answers into `{project-root}/_bmad/custom/stella-tea-live-testing.user.toml` (from `{userConfigExample}` when absent), secrets into `stella-tea-live-testing.secrets.env` (from `{secretsExample}`). Do **not** resolve password values now — execution resolves them at step 6; here you only confirm the references exist or are provided.

### 5. Save Progress

Update `{checkpointFile}`: append `step-02-intake` to `stepsCompleted`, set `lastStep: 'step-02-intake'`, `nextStep: '{nextStepFile}'`, `lastSaved: '{date}'`. Record below the frontmatter: brief path or confirmed module scope, resolved `environment`, which config values were asked for, and (ticket runs) the attachment count fetched or the fetch failure note.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Ticket run: brief written from real Jira data, ACs numbered, comments carried verbatim; derived ACs confirmed by the user; an attachment-fetch failure noted, not halted on
- Scope confirmed through the **single** section-4 interactive bundle — never a series of sequential asks; decision context stated before the bundle
- Environment resolved; every missing config value asked for inside the bundle, never silently defaulted
- Impacted-areas question asked only on a ticket run without code access

### ❌ SYSTEM FAILURE:

- Brief content invented or paraphrased beyond field conversion
- Continuing without a reachable Jira MCP on a ticket run
- A credential value written to any file under `{test_artifacts}`

**Master Rule:** Skipping steps is FORBIDDEN.
