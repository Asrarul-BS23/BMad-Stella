---
name: 'step-03-scenarios'
description: "Invoke bmad-tea-test-design on the brief or module scope; copy its output to this key's scenarios.md with status: draft"
nextStepFile: '{skill-root}/steps-c/step-04-approve-scenarios.md'
checkpointFile: '{test_artifacts}/stella/{key}/progress.md'
scenariosFile: '{test_artifacts}/stella/{key}/scenarios.md'
explorationDir: '{test_artifacts}/stella/{key}/exploration/'
testDesignSkill: '{skill-root}/../bmad-tea-test-design'
---

# Step 3: Design Scenarios (via test-design)

## STEP GOAL

Run `bmad-tea-test-design` as a sub-step against this key's input, then copy its output into this key's folder as `scenarios.md` with `status: draft`, including its exploration images with rewritten links.

## MANDATORY EXECUTION RULES

### Universal Rules

- 📖 Read this entire step file before taking any action
- ✅ Speak in `{communication_language}`
- 🚫 Do not load the next step until this step is complete

### Role Reinforcement

- ✅ You are the **Master Test Architect**

### Step-Specific Rules

- 🚫 `bmad-tea-test-design` stays unmodified. Never edit its files; never write into its output folder.
- 🚫 Never suggest writing automation code. Scenario output is for manual live execution only.

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly
- 💾 Record outputs before proceeding
- 📖 Load the next step only when instructed

## CONTEXT BOUNDARIES:

- Available context: `{key}`, brief or module scope, environment config
- Focus: scenario production and the copy only — no approval loop here
- Dependencies: step-02 output

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Invoke test-design as a Sub-Step

Load `{testDesignSkill}/SKILL.md`, read it completely, and execute its activation and epic-level Create flow **as a sub-step of this run**, with these bindings:

- **Input document:** this key's `ticket-brief.md` for a ticket run, or the confirmed module scope statement for a module run. test-design accepts arbitrary docs/scopes as context; a module run uses its native module-level scope.
- **Run identity:** let test-design derive its own `run_key` from the input per its step-01 slug rules. Record which `run_key` it used.
- **Exploration:** when Playwright MCP is connected, test-design's UI exploration runs against `{workflow.environments.{environment}.base_url}`. Login during exploration uses the role-keyed users per `{skill-root}/resources/execution-rules.md` section 5.
- **Code reading:** when the project's code is accessible, carry the ticket's code paths as additional context (the `persistent_facts` surface in `_bmad/custom/bmad-tea-test-design.toml` is the supported hook for standing code-path globs). When no code access exists, scenarios come from UI exploration and docs only — that is test-design's default behavior, not an error.
- When it finishes, return to **this** step. Do not run test-design's on_complete chain into another workflow.

### 2. Copy the Output to This Key's Folder

test-design writes `test-design-epic-{epic_num}.md` (its `run_key` is `epic-{epic_num}`, or `epic-{slug}` for an unnumbered input — the filename carries the part after `epic-`) plus exploration images under its own `{test_artifacts}/test-design/` folder. That folder stays untouched. Copy:

1. The scenario document → `{scenariosFile}`.
2. Every exploration image the document references → `{explorationDir}`, keeping filenames.
3. In the copy only, rewrite every image link to the `exploration/` relative path.

### 3. Stamp the Copy's Frontmatter

Prepend (or merge into existing frontmatter of the copy):

```yaml
---
status: draft
key: '{key}'
source: 'bmad-tea-test-design {its run_key} @ {date}'
---
```

`status: draft` is the approval gate (flipped only by step-04). Group scenarios under `##` headings by sub-feature/user flow — these groupings become the test-case sections in step-05. Number every scenario `SC-01, SC-02, …` in file order — these ids are stable handles for cases (`generated from SC-n`) and for module-run trace records. **Id stability rule:** ids are assigned here and never change afterward; a later addition takes the next free number wherever it sits in the file, and a removal leaves a gap. Never renumber or reuse an id — case Descriptions, the baseline map, and trace records all reference them. Where the input carried numbered acceptance criteria, each scenario also names the `AC-n` it verifies.

### 4. Save Progress

Update `{checkpointFile}`: append `step-03-scenarios` to `stepsCompleted`, set `lastStep`, `nextStep: '{nextStepFile}'`, `lastSaved: '{date}'`. Record the test-design `run_key` and the number of scenarios and sections copied.

Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- test-design ran unmodified as a sub-step and its own folder is untouched
- `scenarios.md` + `exploration/` exist under this key with links rewritten and `status: draft`
- Scenarios grouped under section headings; AC references carried where they exist

### ❌ SYSTEM FAILURE:

- Editing test-design files or its output folder
- Writing scenarios without copying (pointing at test-design's file directly)
- Setting any status other than `draft`
- Suggesting automation code

**Master Rule:** Skipping steps is FORBIDDEN.
