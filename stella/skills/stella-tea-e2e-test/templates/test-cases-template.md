---
status: draft
key: '{key}'
generated_from: 'scenarios.md @ {scenarios_approved_timestamp}'
date: '{date}'
---

# Test Cases — {key}

<!--
Template rules (delete this comment block in the generated file):
- One `## Section` heading per scenario group (sub-feature / user flow), table under each.
- IDs are continuous across the whole key: TC-{key}-01, TC-{key}-02, ... — numbering does
  NOT restart per section.
- Status values: Pass | Fail | Partly Pass | Blocked | Not Run.
- Actual Results, Status, Evidence/Comments stay EMPTY in this file. Runs never write here;
  results live in the timestamped test-execution report. These columns exist so the table
  can be printed/published as the team's standard case sheet.
- Test Steps: a numbered inline list in one cell ("1. ... 2. ... 3. ..."), one action per
  number, plain language, executor-agnostic. No HTML (no <br>). Address users by role
  ("login as admin"), never by literal credential.
- Precondition: state required data, role, and app state. A case must be runnable from
  its own row without reading other cases.
-->

## {Section Name}

| ID          | Title   | Description | Precondition | Test Steps              | Expected Results | Actual Results | Status | Evidence/Comments |
| ----------- | ------- | ----------- | ------------ | ----------------------- | ---------------- | -------------- | ------ | ----------------- |
| TC-{key}-01 | {title} | {what/why}  | {state}      | 1. {action} 2. {action} | {observable}     |                |        |                   |

## {Next Section Name}

| ID          | Title   | Description | Precondition | Test Steps  | Expected Results | Actual Results | Status | Evidence/Comments |
| ----------- | ------- | ----------- | ------------ | ----------- | ---------------- | -------------- | ------ | ----------------- |
| TC-{key}-02 | {title} | {what/why}  | {state}      | 1. {action} | {observable}     |                |        |                   |
