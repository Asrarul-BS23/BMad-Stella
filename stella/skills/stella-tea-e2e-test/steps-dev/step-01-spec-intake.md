---
name: 'step-01-spec-intake'
description: 'Locate the bmad-builder implementation spec, resolve {key}, and get the app running from saved commands'
nextStepFile: '{skill-root}/steps-dev/step-02-hunt-scenarios.md'
executionRules: '{skill-root}/resources/execution-rules.md'
---

# Dev Step 1: Spec Intake & App Up

## STEP GOAL

Locate the implementation spec for the ticket the dev just built, resolve `{key}`, and get the app running — from saved commands when they exist, by confirmed detection otherwise.

## MANDATORY EXECUTION RULES

### Universal Rules

- 📖 Read this entire step file before taking any action
- ✅ Speak in `{communication_language}`
- 🚫 Do not load the next step until this step is complete

### Role Reinforcement

- ✅ You are the **Master Test Architect** in bug-hunt mode: fast loop, zero ceremony

### Step-Specific Rules

- 🚫 No progress checkpoint in the dev flow — dev runs are short; loop speed is the point.
- 🚫 Never run detected app commands without showing them and getting a yes first.

## EXECUTION PROTOCOLS:

- 🎯 Follow the MANDATORY SEQUENCE exactly

## CONTEXT BOUNDARIES:

- Available context: merged workflow block, the project's code
- Focus: spec + running app only — no scenarios yet

## MANDATORY SEQUENCE

**CRITICAL:** Follow this sequence exactly. Do not skip, reorder, or improvise.

### 1. Locate the Implementation Spec

1. If the user gave a spec path, use it.
2. Else, if `{workflow.defaults.spec_path}` is saved, look there for the spec matching the ticket the user named; list candidates when several match.
3. Else ask: "Where does bmad-builder write your implementation specs?" — then offer to save the answer to `[workflow.defaults] spec_path` in `{project-root}/_bmad/custom/stella-tea-testing.user.toml`.
4. Read the spec completely. Resolve `{key}`: the ticket key the spec names, else a slug of the spec's title (same slug rules as the QA flow). Create `{test_artifacts}/stella/{key}/` — reports and evidence go there, same naming as QA runs, **no `dev/` subfolder**.

### 2. Get the App Running

1. If `{workflow.app}` is saved in the merged block, use it: run `depends_on` entries, then `install_command` if dependencies look missing, then `run_command`; wait for `ready_check`; open `url`. **Re-detect only when a saved command fails.**
2. Otherwise detect from the repo how to start the app **including its dependencies**: install step, services such as DB (docker-compose, etc.), env setup, run command, URL, and a readiness check. **Show the user everything identified and ask if they are okay with it.** On a yes, run it and save all of it to `[workflow.app]` in the `.user.toml` (`install_command`, `run_command`, `url`, `ready_check`, `depends_on`). Rediscovery each run would waste the loop speed this mode exists for.
3. Confirm the app answers at its URL before proceeding. If it does not, debug the startup with the user — do not continue to scenarios against a dead app.
4. Resolve login users per `{executionRules}` sections 5–6 when the feature needs authentication (local dev may use the environment config's role-keyed users or app seed users — ask when unclear).

### 3. Hand Off

State: `{key}`, spec path, app URL, and that scenarios come next. Load next step: `{nextStepFile}`

## 🚨 SYSTEM SUCCESS/FAILURE METRICS:

### ✅ SUCCESS:

- Spec read in full; `{key}` resolved
- App confirmed running; detected commands shown and user-approved before first run, then saved
- Saved commands reused without rediscovery

### ❌ SYSTEM FAILURE:

- Running detected commands without approval
- Re-detecting when saved commands work
- Writing a progress checkpoint
- Continuing with an app that is not answering

**Master Rule:** Skipping steps is FORBIDDEN.
