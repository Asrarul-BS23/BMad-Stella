---
name: 'step-04-approve-scenarios'
description: 'In-chat show -> refine -> approve loop; on approval flip scenarios.md frontmatter to status: approved'
nextStepFile: '{skill-root}/steps-c/step-05-generate-cases.md'
checkpointFile: '{test_artifacts}/stella/{key}/progress.md'
scenariosFile: '{test_artifacts}/stella/{key}/scenarios.md'
---

# Step 4: Lock Scenarios

## STEP GOAL

Run the human approval loop on `{scenariosFile}` until QA approves, then flip its frontmatter `status: draft` → `status: approved`.

## MANDATORY EXECUTION RULES

### Universal Rules

- 📖 Read this entire step file before taking any action
- ✅ Speak in `{communication_language}`
- 🚫 Do not load the next step until this step is complete

### Role Reinforcement

- ✅ You are the **Master Test Architect** — you advise on coverage gaps, but the human QA decides

### Step-Specific Rules

- 🚫 Approval is explicit. Only a clear user statement of approval ("approved", "looks good, lock it", an unambiguous yes to "approve?") flips the status. Silence, a question, or partial feedback never does.
- 🚫 The skill flips the status, not the user by hand — but only after that explicit approval.

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: `{scenariosFile}` from step-03
- Focus: refinement and the lock only — no test-case generation here
- Limits: scenario-level edits only; sections may be renamed, merged, or split on request

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Show

Display the scenario list from `{scenariosFile}`, grouped by its `##` sections: per scenario its title, the `AC-n` it verifies (when present), and a one-line gist. Offer the full text of any scenario on request.

### 2. Refine Loop

Ask: "Review the scenarios. Reply with changes (edit, add, remove, rename/merge/split sections), or say **approved** to lock them."

On each reply that is not an approval:

1. Apply the requested changes to `{scenariosFile}` — edit, add, or remove scenarios; rename, merge, or split `##` sections. SC ids follow step-03's stability rule: an added scenario takes the **next free** `SC-n` wherever it sits, a removed one leaves a gap, and existing ids are never renumbered or reused.
2. Keep `status: draft` while refining.
3. Show the updated list (changed items marked) and repeat the question.

**Halt** for the user between every iteration. Never approve on the user's behalf; never time out the loop.

### 3. Lock on Approval

On an explicit approval:

1. Edit `{scenariosFile}` frontmatter: `status: draft` → `status: approved`, and add `approved: '{date}T{HH:mm}'` (full timestamp — step-05's staleness check compares it against `generated_from`, and day granularity would hide a same-day re-approval).
2. Confirm: "Scenarios for `{key}` locked ({n} scenarios in {m} sections). Test-case generation runs only from this approved file."

### 4. Save Progress

Update `{checkpointFile}`: append `step-04-approve-scenarios` to `stepsCompleted`, set `lastStep`, `nextStep: '{nextStepFile}'`, `lastSaved: '{date}'`. Record the refinement rounds and final scenario/section counts.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Every user change applied and re-shown before asking again
- Status flipped by the skill, only after an explicit approval, with the approval date stamped

### ❌ SYSTEM FAILURE:

- Flipping to `approved` without an explicit user approval
- Proceeding to case generation on a `draft` file
- Dropping a requested change without saying so

**Master Rule:** The approval gate is a real halt. Skipping it is FORBIDDEN.
