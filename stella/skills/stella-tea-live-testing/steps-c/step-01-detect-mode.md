---
name: 'step-01-detect-mode'
description: 'Resolve flow_mode and {key}, handle an existing checkpoint, and route to the QA or dev flow'
nextStepFile: '{skill-root}/steps-c/step-02-intake.md'
devFlowFile: '{skill-root}/steps-dev/step-01-spec-intake.md'
resumeStepFile: '{skill-root}/steps-c/step-01b-resume.md'
outputFile: '{test_artifacts}/stella/{key}/progress.md'
---

# Step 1: Detect Flow Mode & Resolve Key

## STEP GOAL

Resolve `flow_mode` (`qa` or `dev`) and this run's `{key}`, decide fresh-vs-resume for that key, and route to the correct flow.

## MANDATORY EXECUTION RULES

### Universal Rules

- 📖 Read this entire step file before taking any action
- ✅ Speak in `{communication_language}`
- 🚫 Do not load the next step until this step is complete

### Role Reinforcement

- ✅ You are the **Master Test Architect**
- ✅ You never guess when a decision rule gives no answer — you ask

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: config and the merged workflow block from activation
- Focus: mode and key resolution only — no intake, no scenario work here
- Limits: do not execute future steps

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

## 1. Resolve `flow_mode` (Priority Order)

This list is the **single source** of the flow-mode priority order; SKILL.md and instructions.md point here. Apply these rules **in order**; the first rule that fires wins. Do not apply a later rule once one has fired.

1. **Menu code preset.** Invoked via menu code `SQ` → `flow_mode = qa`. Via `SD` → `flow_mode = dev`.
2. **Existing QA checkpoint.** When the input names a ticket or module whose `{test_artifacts}/stella/{key}/progress.md` exists with `flowMode: qa` (resolve the candidate `{key}` with section 3's rules), `flow_mode = qa` — a QA-started key never silently continues as a dev run. Tell the user when this rule overrode a dev-looking input or a dev personal default, and that a dev run on the same ticket needs a different input (its implementation spec) plus the `SD` menu code.
3. **Input auto-detect.** Inspect what the user supplied with the invocation:
   - A Jira ticket key (pattern `[A-Z][A-Z0-9]+-[0-9]+`, e.g. `STEL-123`) → `flow_mode = qa`.
   - A module name (a named area of the system, no ticket pattern, no spec file) → `flow_mode = qa`. The dev flow's input is always an implementation spec, so a module name always means `qa`.
   - A bmad-builder implementation spec (a path to it, or words like "my implementation", "the spec", "before handoff") → `flow_mode = dev`.
4. **Personal default.** `{workflow.defaults.flow_mode}` is set and the input does not contradict it → use it.
5. **Ask.** Display exactly one question and **halt** until answered:

   > "Is this (A) a **QA run** — design, lock, and execute test cases for a ticket or module — or (B) a **dev bug hunt** — test your own implemented ticket from its spec before handoff?"

State the resolved `flow_mode` and which rule resolved it.

## 2. Route Dev Flow Now

**If `flow_mode = dev`:** first re-verify rule 2 of section 1 — **unless rule 1 (menu preset `SD`) resolved the mode**: the `SD` preset is the deliberate escape hatch for dev-testing a key that already has a QA checkpoint, so it is never overridden. When a later rule resolved `dev` and the input names a ticket or module whose `{test_artifacts}/stella/{key}/progress.md` exists with `flowMode: qa`, do **not** route to dev; set `flow_mode = qa` and run section 4 instead. Otherwise load `{devFlowFile}`, read it completely, and execute it. Do **not** run sections 3–5 below — the dev flow resolves its own key from the spec and writes no checkpoint by design.

**If `flow_mode = qa`:** continue with section 3.

## 3. Resolve `{key}` (QA flow)

1. **Ticket input:** `{key}` = the ticket key verbatim, uppercase (e.g. `STEL-123`).
2. **Module input:** `{key}` = the module name slugified: lowercase; replace every run of characters outside `a-z0-9` with a single `-`; trim leading/trailing `-`; truncate to 64 characters. Record the original module name alongside the slug — later steps and published pages use the human name, paths use the slug.
3. **No input supplied:** ask "Which Jira ticket key or module name is this run for?" and **halt**. Apply rule 1 or 2 to the answer.

Carry `flow_mode`, `{key}`, and `input_type` (`ticket` | `module`) forward through every remaining step.

## 4. Check for an Existing Checkpoint

Check whether `{outputFile}` exists.

- **Does not exist:** fresh run. Proceed to section 5.
- **Exists with `workflowStatus: 'in-progress'`:** display its `lastStep` and `lastSaved`, then ask:

  > "An unfinished run for `{key}` was last saved {lastSaved} at step {lastStep}. Resume it, or start over? Starting over replaces the checkpoint but keeps existing artifacts on disk."

  **Halt** until answered. Resume → load `{resumeStepFile}`, read it completely, execute it. Start over → replace `{outputFile}` entirely in section 5.

- **Exists with `workflowStatus: 'completed'`:** a finished run for this key. Tell the user the key already has artifacts (list which of `scenarios.md`, `test-cases.md`, reports exist) and ask whether to start over (new scenario design) or jump to a later phase via **Resume** (e.g. re-execute approved cases). **Halt** until answered.

**Flow-mode guard:** when a checkpoint exists, its `flowMode` must be `qa`. If it reads `dev` (it should never — dev writes no checkpoint), refuse it: "Checkpoint for `{key}` carries flowMode `dev`, which this flow cannot continue. Start over or delete it." **Never merge two runs into one checkpoint.**

## 5. Save Progress

Create `{test_artifacts}/stella/{key}/` if it does not exist. Write `{outputFile}` with YAML frontmatter, replacing prior content as decided above:

```yaml
---
key: '{key}'
inputType: '{input_type}'
flowMode: 'qa'
workflowStatus: 'in-progress'
totalSteps: 7
stepsCompleted: ['step-01-detect-mode']
lastStep: 'step-01-detect-mode'
nextStep: '{nextStepFile}'
lastSaved: '{date}'
confluencePageId: ''
jiraCaseTicketKey: ''
---
```

Write this step's resolution notes (input, rule that fired, original module name when applicable) below the frontmatter.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- `flow_mode` resolved by the priority order, with the deciding rule stated
- Dev flow routed out before any checkpoint was written
- `{key}` resolved before the first save; checkpoint written to the path it names
- Any pre-existing checkpoint reported to the user and resumed or replaced on their answer

### ❌ SYSTEM FAILURE:

- Guessing `flow_mode` when the rules gave no answer
- Writing a checkpoint for a dev run
- Saving progress before `{key}` is resolved
- Appending this run's progress to a previous run's checkpoint

**Master Rule:** Skipping steps is FORBIDDEN.
