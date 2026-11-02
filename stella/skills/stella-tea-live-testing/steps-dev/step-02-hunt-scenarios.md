---
name: 'step-02-hunt-scenarios'
description: 'Generate bug-hunting scenarios from the implementation spec: error cases, edge inputs, integration points — no approval gate'
nextStepFile: '{skill-root}/steps-dev/step-03-execute-triage.md'
---

# Dev Step 2: Hunt Scenarios

## STEP GOAL

From the implementation spec and the changed code, generate scenarios biased toward **finding bugs** — not a mirror of full QA coverage — and go straight to execution.

## MANDATORY EXECUTION RULES

### Universal Rules

- 📖 Read this entire step file before taking any action
- ✅ Speak in `{communication_language}`
- 🚫 Do not load the next step until this step is complete

### Role Reinforcement

- ✅ You are the **Master Test Architect** hunting, not certifying. QA certifies; dev mode hunts.

### Step-Specific Rules

- 🚫 No approval gate, no status frontmatter, no lock. The dev triages results live in the next step.
- 🚫 Never suggest writing automation code.

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly

## CONTEXT BOUNDARIES:

- Available context: the spec, the changed code, the running app
- Focus: scenario list only — execution is the next step

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Read the Change

From the spec and the diff/changed files it describes, list: the user-facing behaviors added or changed, the inputs they accept, the components and services they integrate with, and the states they depend on.

### 2. Generate Hunt Scenarios

Bias every scenario toward where bugs live. Cover, in priority order:

1. **Error cases** — invalid input, failed dependencies, denied permissions, empty/missing data, double submission, cancelled mid-flow.
2. **Edge inputs** — boundary values, longest/shortest, zero/negative, unicode and whitespace, concurrent or repeated actions.
3. **Integration points of the changed code** — every seam the spec touches: API contracts, shared state, navigation in/out, data written that another feature reads.
4. One happy path per behavior — enough to prove the feature works at all, no more.

For each scenario: a title, the steps in plain language, the expected behavior per the spec, and why it might break (the suspected risk). Keep the list executable in one sitting; depth over breadth.

### 3. Show and Go

Show the list with one line per scenario. Do not ask for approval. If the dev reorders, adds, or cuts scenarios in the moment, apply it. Then load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Scenarios skew to error/edge/integration; happy paths minimal
- Each scenario names its suspected risk
- Straight to execution, no gate

### ❌ SYSTEM FAILURE:

- Reproducing full QA-style coverage
- Waiting for an approval that this flow does not have
- Suggesting automation code

**Master Rule:** Skipping steps is FORBIDDEN.
