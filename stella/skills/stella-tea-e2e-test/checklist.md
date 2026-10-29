# Validation Checklist — stella-tea-testing

Criteria for Validate mode (`steps-v/step-01-validate.md`). Evaluate each item that applies to the artifacts present; mark PASS / WARN / FAIL per section.

## 1. Layout and Identity

- [ ] Every artifact for the key lives under `{test_artifacts}/stella/{key}/`; no stray files in other keys' folders
- [ ] `{key}` is a verbatim uppercase ticket key or a valid slug (lowercase, `a-z0-9-`, ≤64 chars)
- [ ] `progress.md` (when present) carries `key`, `flowMode: qa`, and a `nextStep` that names an existing step file or is empty with `workflowStatus: completed`

## 2. Ticket Brief (ticket runs only)

- [ ] Frontmatter has `key`, `fetched`, `source: jira`
- [ ] Acceptance criteria numbered `AC-1 … AC-n`; derived ACs are labeled as derived
- [ ] Content is Jira-sourced fields only — no invented requirements

## 3. Scenarios

- [ ] Frontmatter has `status` (`draft` or `approved`), `key`, `source` naming the test-design run
- [ ] An `approved` file also carries `approved: <full timestamp, {date}T{HH:mm}>`
- [ ] Scenarios grouped under `##` section headings, each carrying a unique `SC-n` id; ids are never reused — gaps (from removals) and out-of-order ids (from later additions) are valid, duplicates are not
- [ ] Image links point into this key's `exploration/`, and the referenced files exist
- [ ] Where the input had numbered ACs, each scenario names the `AC-n` it verifies

## 4. Test Cases

- [ ] Generated only from an `approved` scenarios file (`generated_from` names it with its full approval timestamp)
- [ ] Each case's Description names the `SC-n` scenario it comes from (and the `AC-n`, where ACs exist)
- [ ] One `## Section` per scenario section; same names and order
- [ ] All 9 columns present: ID, Title, Description, Precondition, Test Steps, Expected Results, Actual Results, Status, Evidence/Comments
- [ ] IDs `TC-{key}-NN` continuous across the whole file — no restart per section, no gaps from reuse
- [ ] Verdict columns (Actual Results, Status, Evidence/Comments) are empty in this file
- [ ] Steps are numbered, plain-language, executor-agnostic; users addressed by role; no credential values anywhere

## 5. Run Reports

- [ ] Filename matches `test-execution-{env}-{YYYY-MM-DD-HHmm}.md`; one file per run, none overwritten
- [ ] Frontmatter carries `mode` (`qa` or `dev`), `environment`, `datetime`, `executed_as` (role, not credential), `source_sha` or an explicit unresolved note
- [ ] Every case has a status from: Pass, Fail, Partly Pass, Blocked, Not Run
- [ ] Every Fail / Partly Pass case has Failure Detail: steps to reproduce, expected vs actual, per-step results, evidence links that resolve to files in `evidence/{datetime}/`
- [ ] Evidence filenames match `tc-{n}.png` / `tc-{n}-step-{m}.png`; with viewports, `tc-{n}-{viewport}.png` / `tc-{n}-{viewport}-step-{m}.png` (viewport before step)
- [ ] Blocked vs Not Run semantics respected: precondition/env failure = Blocked; never attempted = Not Run; dependents of a blocker name the blocking case
- [ ] Summary counts sum to the total case count (× combinations when viewports ran)

## 6. Trace Record (QA runs only)

- [ ] This key's records in `{test_artifacts}/live-verification-results.json` exist for the latest QA run, with ids `{key}-LIVE-NNN`, unique, zero-padded
- [ ] Each record has `requirement_id`, a valid `status` (`pass`/`fail`/`blocked`/`skipped`), per-record `source_sha`, and `observed_at`
- [ ] Statuses map correctly: Pass→pass, Fail and Partly Pass→fail, Blocked→blocked, Not Run→skipped
- [ ] File has `schema_version: 0.1.0`, no top-level `source_sha`, and other keys' records were preserved
- [ ] No record originates from a `mode: dev` run

## 7. Secrets and Publication Hygiene

- [ ] No credential value in any file under `{test_artifacts}` (search for the configured usernames' password env names and obvious password strings)
- [ ] Published case sheets (when Confluence/Jira publication happened) contain empty verdict columns and no run results
- [ ] `confluencePageId` saved in `progress.md` when a Confluence page was created
- [ ] `jiraCaseTicketKey` saved in `progress.md` when a Jira case ticket was created
