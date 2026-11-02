---
name: 'step-01b-resume'
description: 'Resume an interrupted QA run from its own per-key checkpoint'
outputFile: '{test_artifacts}/stella/{key}/progress.md'
progressGlob: '{test_artifacts}/stella/*/progress.md'
---

# Step 1b: Resume Workflow

## STEP GOAL

Resume an interrupted QA run by selecting the checkpoint that belongs to the key being resumed, loading its progress, displaying it, and routing to the next incomplete step.

## MANDATORY EXECUTION RULES

- 📖 Read the entire step file before acting
- ✅ Speak in `{communication_language}`

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: progress checkpoints written by previous QA runs
- Focus: select the correct key's checkpoint, load its progress, route
- Limits: do not re-execute completed steps; do not resume another key's checkpoint; the dev flow has no checkpoints and cannot be resumed
- Dependencies: a checkpoint must exist from a previous QA run

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Select the Run to Resume

Each key's checkpoint lives at `{test_artifacts}/stella/{key}/progress.md`. Build the candidate list from `{progressGlob}`.

- **No candidates:** display "⚠️ **No previous progress found.** There is no checkpoint to resume from. Use **[C] Create** to start a fresh run." **Halt.**
- **The user named a key in this invocation:** select `{outputFile}` for that key. If it does not exist, display "⚠️ **No progress found for `{key}`.** Checkpoints exist for: {list of candidate keys}. Use **[C] Create** for `{key}`, or name one of the listed keys." **Halt.** Never fall back to another key's checkpoint.
- **Exactly one candidate and no key named:** select it and state which key it belongs to before continuing.
- **More than one candidate and no key named:** list each candidate with its `key`, `lastStep`, and `lastSaved`, and ask which to resume. **Halt** until the user answers.

### 2. Load the Selected Checkpoint

Read the checkpoint and parse YAML frontmatter for: `key`, `inputType`, `flowMode`, `workflowStatus`, `totalSteps`, `stepsCompleted`, `lastStep`, `nextStep`, `lastSaved`, `confluencePageId`, `jiraCaseTicketKey`.

- **Key identity check.** When the user named a key, the checkpoint's `key` must equal it; otherwise display "⚠️ **Checkpoint belongs to a different key** (`{checkpoint key}`, not `{key}`). Refusing to resume." **Halt.**
- **Flow-mode check.** `flowMode` must be `qa`. Anything else: refuse with "⚠️ This checkpoint is not a resumable QA run." **Halt.**
- Adopt `key`, `inputType`, and `flowMode` from the checkpoint as this run's identity when the user named none.

### 3. Display Progress Dashboard

Display:

"📋 **Workflow Resume — Stella Ticket & Module Testing**

**Key:** {key} ({inputType})
**Flow:** {flowMode}
**Workflow status:** {workflowStatus}
**Last saved:** {lastSaved}
**Last completed step:** {lastStep}
**Next step:** {nextStep || 'None'}
**Steps completed:** {stepsCompleted.length} of {totalSteps}"

### 4. Route to Next Step

If `workflowStatus` is `'completed'`, display:
"✅ **All steps completed.** Use **[V] Validate** to review outputs, **[E] Edit** to revise, or say 're-execute' to run the approved cases again (routes to step-06)."
If the user asks to re-execute, load `{skill-root}/steps-c/step-06-execute.md`. Otherwise **halt**.

If `nextStep` is one of the known QA step files below, load it, read completely, and execute:

- `{skill-root}/steps-c/step-02-intake.md`
- `{skill-root}/steps-c/step-03-scenarios.md`
- `{skill-root}/steps-c/step-04-approve-scenarios.md`
- `{skill-root}/steps-c/step-05-generate-cases.md`
- `{skill-root}/steps-c/step-06-execute.md`
- `{skill-root}/steps-c/step-07-report.md`

**If `nextStep` is empty or unknown**, display:
"⚠️ **Unknown progress state** (`workflowStatus`: {workflowStatus}, `lastStep`: {lastStep}, `nextStep`: {nextStep}). Use **[C] Create** to start fresh."
**Halt.**

The checkpoint's body provides context from completed steps. Every later step keeps writing to this same checkpoint; `key` and `flowMode` stay unchanged for the rest of the run.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS

### ✅ SUCCESS:

- The checkpoint belonging to the requested key was selected; ambiguity resolved by asking
- Dashboard displayed accurately, including key and flow identity
- Routed to the exact next incomplete step

### ❌ SYSTEM FAILURE:

- Resuming a checkpoint whose `key` or `flowMode` differs from the run being resumed
- Silently picking one checkpoint when several exist
- Re-executing completed steps

**Master Rule:** Resume MUST route to the exact next incomplete step of the run it was asked to resume. Never continue another run's checkpoint.
