---
name: 'step-02-apply-edit'
description: 'Apply the confirmed edit plan, propagate scenario changes to cases, report a cause-linked change summary, and reset approval'
scenariosFile: '{test_artifacts}/stella/{key}/scenarios.md'
casesFile: '{test_artifacts}/stella/{key}/test-cases.md'
checkpointFile: '{test_artifacts}/stella/{key}/progress.md'
---

# Edit Step 2: Apply Edit

## STEP GOAL:

Execute the confirmed edit plan exactly, propagate per the rules, report what changed and why, and reset the approval state of every touched file.

## MANDATORY EXECUTION RULES (READ FIRST):

### Universal Rules:

- 📖 Read the complete step file before taking any action
- ✅ Speak in `{communication_language}`

### Role Reinforcement:

- ✅ You are the Master Test Architect

### Step-Specific Rules:

- 🎯 Apply the confirmed plan exactly as assessed
- 🚫 Apply only the confirmed plan — no opportunistic extra edits

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record changes before finishing

## CONTEXT BOUNDARIES:

- Available context: the confirmed edit plan from step-01-assess
- Limits: run reports, evidence, and `live-verification-results.json` are never modified

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Apply to the Primary Target

Apply the plan's edits, additions, and removals to the target file. Keep untouched items byte-identical. In `{scenariosFile}`, SC ids follow step-03's stability rule: an added scenario takes the next free `SC-n`, a removed one leaves a gap, and existing ids are never renumbered or reused.

### 2. Propagate (scenario edits only)

When `{scenariosFile}` changed and `{casesFile}` exists, propagate **only the changed scenarios** to the cases: edit matching cases, add cases for added scenarios (continuing the ID sequence — removed IDs are never reused), remove cases for removed scenarios. Untouched cases stay byte-identical. Verdict columns stay empty.

### 3. Reset Approval

Set `status: draft` in the frontmatter of every file this edit touched, and remove its `approved` date. An edited artifact is unapproved by definition; the QA flow's step-04/step-05 loops re-lock them.

### 4. Report the Change Summary

List every change in every touched file and, for propagated changes, **which scenario change caused it**. State which files are now `draft` and what to run next (Resume for `{key}` → the matching approval step).

### 5. Update the Checkpoint

When `{checkpointFile}` exists, set `workflowStatus: 'in-progress'`, `nextStep` to `{skill-root}/steps-c/step-04-approve-scenarios.md` when scenarios changed (else `{skill-root}/steps-c/step-05-generate-cases.md`), `lastSaved: '{date}'`, and record the change summary below the frontmatter. When propagation ran (section 2), also rewrite the generation baseline map (`SC-n` → case IDs, with each scenario's title) in the checkpoint body to match the propagated `{casesFile}` — step-05's staleness diff reads that map, and a stale map would re-propagate changes already applied.

## On Complete

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow.on_complete`

If the resolver succeeds and returns a non-empty `workflow.on_complete`, execute that value as the final terminal instruction before exiting. If it fails, returns no output, or resolves an empty value, skip the hook and exit normally.

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Only planned items changed; untouched items byte-identical
- Propagation limited to changed scenarios, with a cause-linked summary
- Every touched file reset to `draft`; checkpoint routes to the right re-approval step

### ❌ SYSTEM FAILURE:

- Edits beyond the confirmed plan
- Regenerating unchanged cases
- Leaving an edited file marked `approved`
- Touching run reports, evidence, or the live-verification file

**Master Rule:** Propagate the change, not the whole file.
