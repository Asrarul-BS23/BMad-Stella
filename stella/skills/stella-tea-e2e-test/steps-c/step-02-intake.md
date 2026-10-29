---
name: 'step-02-intake'
description: 'Fetch the Jira ticket into a brief (ticket runs) or confirm module scope; check environment config with ask-fallback'
nextStepFile: '{skill-root}/steps-c/step-03-scenarios.md'
checkpointFile: '{test_artifacts}/stella/{key}/progress.md'
briefFile: '{test_artifacts}/stella/{key}/ticket-brief.md'
executionRules: '{skill-root}/resources/execution-rules.md'
userConfigExample: '{skill-root}/config/stella-tea-testing.user.toml.example'
secretsExample: '{skill-root}/config/stella-tea-testing.secrets.env.example'
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

### 1. Ticket Run: Fetch and Write the Brief

Run this section only when `input_type = ticket`; a module run skips to section 2.

1. Fetch the ticket `{key}` via the Jira (Atlassian) MCP: summary, description, acceptance criteria, issue type, status, and linked issues. If the MCP is unavailable or the ticket is not found, report the exact failure and **halt** — do not continue with invented content.
2. Write `{briefFile}` — but when the ticket has no explicit acceptance criteria, complete item 3's confirmation **first** and write the brief only once the derived ACs are confirmed; derived ACs never land on disk unconfirmed:

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
   ```

3. If the ticket has no explicit acceptance criteria, derive candidate ACs from the description, **label the section "Acceptance Criteria (derived — confirm)"**, show them to the user, and **halt** for confirmation before writing the final brief.

### 2. Module Run: Confirm Scope

Run this section only when `input_type = module`. No Jira fetch, no brief file.

1. Restate the module in one short paragraph: its name, what part of the app it covers, and any sub-areas the user named.
2. Ask one question: "Scenario design will cover this module scope: {restatement}. Anything to add or exclude?" **Halt** for the answer and record the confirmed scope in the checkpoint body.

### 3. Environment Config Check

Read the merged workflow block:

1. Resolve `environment`: the run variable if set, else `{workflow.defaults.environment}`. Missing → ask which environment this key will execute on.
2. For that environment, verify `base_url` and at least one role-keyed user exist under `{workflow.environments.{environment}}`.
3. Any missing value → apply the Config Ask-Fallback in `{executionRules}` (section 6): ask, then offer to write the non-secret answers into `{project-root}/_bmad/custom/stella-tea-testing.user.toml`, creating it from `{userConfigExample}` when absent. Offer secrets into `stella-tea-testing.secrets.env` created from `{secretsExample}`. Do **not** resolve password values now — execution resolves them at step 6; here you only confirm the references exist or are provided.

### 4. Save Progress

Update `{checkpointFile}`: append `step-02-intake` to `stepsCompleted`, set `lastStep: 'step-02-intake'`, `nextStep: '{nextStepFile}'`, `lastSaved: '{date}'`. Record below the frontmatter: brief path or confirmed module scope, resolved `environment`, and which config values were asked for.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Ticket run: brief written from real Jira data, ACs numbered; derived ACs confirmed by the user
- Module run: scope confirmed by the user in chat
- Environment resolved; every missing config value asked for, never silently defaulted

### ❌ SYSTEM FAILURE:

- Brief content invented or paraphrased beyond field conversion
- Continuing without a reachable Jira MCP on a ticket run
- A credential value written to any file under `{test_artifacts}`

**Master Rule:** Skipping steps is FORBIDDEN.
