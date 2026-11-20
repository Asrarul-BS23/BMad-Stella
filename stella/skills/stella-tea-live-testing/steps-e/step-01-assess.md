---
name: 'step-01-assess'
description: "Identify which key and which artifact the user wants to edit, and classify the edit's propagation impact"
nextStepFile: '{skill-root}/steps-e/step-02-apply-edit.md'
---

# Edit Step 1: Assess

## STEP GOAL:

Pin down exactly what to edit — which `{key}`, which artifact (`scenarios.md` or `test-cases.md`), which items — and classify what the edit propagates to, before touching anything.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 📖 Read the complete step file before taking any action
- ✅ Speak in `{communication_language}`

### Role Reinforcement:

- ✅ You are the Master Test Architect

### Step-Specific Rules:

- 🎯 Confirm the edit target and plan before anything changes
- 🚫 Do not modify any file in this step

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: artifacts under `{test_artifacts}/stella/*/`
- Focus: assessment only
- Limits: run reports and evidence are history — they are never edit targets

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Resolve the Target

1. If the user named a key, use it; otherwise list keys that have artifacts under `{test_artifacts}/stella/` and ask which one. **Halt** for the answer when several exist.
2. Ask which artifact to edit when unclear: **scenarios** (`scenarios.md`) or **test cases** (`test-cases.md`). Run reports are never edited.
3. Read the chosen file and restate the requested edit as a concrete list: which scenarios/cases are edited, added, or removed.

### 2. Classify Propagation

- **Scenario edit on an `approved` file:** the edit re-triggers case generation **for the changed scenarios only** — matching case edits, additions, removals. State which cases in `test-cases.md` will be affected and that both files drop back to `draft` and need re-approval.
- **Case edit:** no scenario change. If the requested case edit contradicts an approved scenario, say so and ask whether the scenario should change instead.
- **Section rename/merge/split:** propagates to the matching `## Section` headings in `test-cases.md`; case IDs never change.

### 3. Confirm and Route

Show the edit plan: target file(s), items touched, propagation effects, statuses that will flip to `draft`. Ask "Apply this edit plan?" and **halt**. On a yes, load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Target key, file, and items unambiguous before any change
- Propagation effects stated up front, including re-approval

### ❌ SYSTEM FAILURE:

- Editing anything in this step
- Guessing the key or file when several candidates exist
- Treating a run report as an edit target

**Master Rule:** Assess fully before touching anything.
