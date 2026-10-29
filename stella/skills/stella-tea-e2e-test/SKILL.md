---
name: stella-tea-testing
description: 'QA ticket/module testing flow: design scenarios with test-design, lock them, generate tabular test cases, and execute them live via Playwright MCP. Also a dev-mode bug hunt for implemented tickets. Use when the user says "test this ticket", "QA this module", or "bug-hunt my implementation"'
---

# Stella Ticket & Module Testing

**Goal:** Take one Jira ticket or one system module from scenarios to approved tabular test cases to a live Playwright MCP execution report with evidence. In dev mode, bug-hunt an implemented ticket before QA handoff.

**Role:** You are the Master Test Architect.

You will continue to operate with your given name, identity, and communication_style, merged with the details of this role description.

## Conventions

- Bare paths (e.g. `instructions.md`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory (where `customize.toml` lives).
- `{project-root}` is the nearest folder containing `_bmad/`, starting at the project working directory and moving up through its parents.
- `{tea-knowledge}` is the `knowledge/` folder of the `bmod-tea` skill, installed beside this one: `{skill-root}/../bmod-tea/knowledge`. `tea-index.csv` there lists every fragment by a path relative to that folder.
- `{skill-name}` resolves to the skill directory's basename.
- Resolve sibling workflow files such as `instructions.md`, `checklist.md`, `steps-c/...`, `steps-dev/...`, `steps-e/...`, `steps-v/...`, `templates/...`, and `resources/...` from `{skill-root}`.
- `{key}` is this run's subject: a Jira ticket key verbatim (e.g. `STEL-123`), or a module name slugified (lowercase, runs of characters outside `a-z0-9` collapsed to single `-`, trimmed, max 64 chars).
- Every artifact for one `{key}` lives under `{test_artifacts}/stella/{key}/`.
- 🚫 Never suggest writing automation code or an `automate` handoff — in any flow, at any step, including after a report. Automation code writing is not part of the QA or dev flow.

## On Activation

### Step 1: Resolve the Workflow Block

Run: `uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow`

**If the script fails**, resolve the `workflow` block yourself by reading these three files in base → team → user order and applying the same structural merge rules as the resolver:

1. `{skill-root}/customize.toml` — defaults
2. `{project-root}/_bmad/custom/{skill-name}.toml` — team overrides
3. `{project-root}/_bmad/custom/{skill-name}.user.toml` — personal overrides

Any missing file is skipped. Scalars override, tables deep-merge, arrays of tables keyed by `code` or `id` replace matching entries and append new entries, and all other arrays append.

The merged block carries this skill's run configuration: `workflow.defaults` (environment, user, flow_mode, module_publish, spec_path), `workflow.environments.*` (base URLs and role-keyed users), `workflow.confluence`, and `workflow.app`. A missing table is not an error at activation — steps ask for missing values when they first need them (see `{skill-root}/resources/execution-rules.md`, Config fallback).

### Step 2: Execute Prepend Steps

Execute each entry in `{workflow.activation_steps_prepend}` in order before proceeding.

### Step 3: Load Persistent Facts

Treat every entry in `{workflow.persistent_facts}` as foundational context you carry for the rest of the workflow run. Entries prefixed `file:` are paths or globs resolved from `{project-root}` — expand them and load every matching file in lexical path order as facts. All other entries are facts verbatim.

### Step 4: Load Config

Run `uv run {project-root}/_bmad/scripts/resolve_config.py --project-root {project-root} --key core --key modules.tea`. If the script fails, merge `{project-root}/_bmad/config.toml`, `{project-root}/_bmad/custom/config.toml` and `{project-root}/_bmad/custom/config.user.toml` yourself, in that order, with the merge rules above. If `_bmad/config.toml` is missing or has no `modules.tea` table, tell the user TEA is not set up, ask them to run `bmad setup tea` first, and stop.

Each `core` and `modules.tea` key is available as `{<key>}`, and as `config.<key>` in later steps. Replace `{project-root}` inside a value with the project root. Setup answers are strings: read `"true"` and `"false"` as booleans.

If `{tea-knowledge}/tea-index.csv` does not exist, the TEA knowledge base is not installed. Tell the user, offer to install it with `npx skills add bmad-code-org/bmad-method-test-architecture-enterprise --skill bmod-tea`, run that on a yes, and stop until it is there. The QA flow invokes `bmad-tea-test-design`, which requires it.

### Step 5: Verify Required Tools

Check now, not mid-execution:

- **Playwright MCP** must be connected. If no Playwright MCP browser tools are available, tell the user: "Playwright MCP is not connected. Execution and UI exploration cannot run. Connect it and start a fresh chat." Scenario and case **authoring** may continue without it; **execution must refuse** to start without it.
- **Jira (Atlassian) MCP** is required only for ticket runs and for publication. If it is missing when a ticket key is the input, say so at intake and halt rather than inventing ticket content.

### Step 6: Greet the User

Greet `{user_name}`, speaking in `{communication_language}`.

### Step 7: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order.

Activation is complete. Begin the workflow below.

## Workflow Architecture

This workflow uses **tri-modal step-file architecture** with **two routed flows** inside Create mode:

- **Create mode (steps-c/ or steps-dev/)**: primary execution flow for new runs and resume continuation
  - **QA flow (`steps-c/`)**: intake → scenarios (via `bmad-tea-test-design`) → human lock → tabular cases → human lock → live execution → report
  - **Dev flow (`steps-dev/`)**: spec intake → bug-hunt scenarios → execute-and-triage loop. No approval gates, no resume checkpoint — loop speed is the point.
- **Validate mode (steps-v/)**: validation against checklist
- **Edit mode (steps-e/)**: revise existing scenarios or test cases with change propagation

## Initialization Sequence

### 1. Mode Determination

"Welcome to the workflow. What would you like to do?"

- **[C] Create** — Run the workflow from the beginning
- **[R] Resume** — Resume an interrupted QA Create run
- **[V] Validate** — Validate existing outputs
- **[E] Edit** — Edit existing scenarios or test cases

When the invocation already carries an operation or an input (`flow_mode` preset by a menu code, a ticket key, a module name, or a spec path), skip this question and start Create. Do not ask a second mode question.

### 2. Route to First Step

- **If C:** Load `{skill-root}/steps-c/step-01-detect-mode.md` — it resolves `flow_mode` and routes to the QA flow (continue in `steps-c/`) or the dev flow (`{skill-root}/steps-dev/step-01-spec-intake.md`)
- **If R:** Load `{skill-root}/steps-c/step-01b-resume.md` (QA Create-mode continuation; the dev flow has no resume by design)
- **If V:** Load `{skill-root}/steps-v/step-01-validate.md`
- **If E:** Load `{skill-root}/steps-e/step-01-assess.md`

## Flow Mode (`flow_mode`)

`flow_mode` is `qa` or `dev`. The priority order that resolves it lives in exactly one place: `{skill-root}/steps-c/step-01-detect-mode.md`, section 1 (single source — do not restate it elsewhere). In short: menu codes `SQ`/`SD` preset it, an existing QA checkpoint for the named key keeps it `qa`, otherwise the input decides, then the personal default, then one question. A QA-started key never silently continues as a dev run.

## Outputs

Everything for one `{key}` lives under `{test_artifacts}/stella/{key}/`:

```text
{test_artifacts}/stella/{key}/
  ticket-brief.md                        <- Jira fetch (ticket runs only)
  scenarios.md                           <- copied from test-design output, frontmatter status: draft|approved
  exploration/                           <- exploration images copied with scenarios.md, links rewritten
  test-cases.md                          <- locked tabular test cases, one ## Section heading + table per group
  test-execution-{env}-{datetime}.md     <- one report per run (QA and dev), datetime = YYYY-MM-DD-HHmm
  evidence/{datetime}/tc-{n}.png         <- screenshots, only for Fail / Partly Pass; tc-{n}-step-{m}.png for per-step shots
  progress.md                            <- this key's progress checkpoint (stores flowMode and Confluence page id)
```

QA execute runs additionally merge their results into `{test_artifacts}/live-verification-results.json` — the root-level file TEA's `trace` reads. Dev runs never write it: dev runs never count as QA coverage.
