---
key: '{key}'
mode: '{flow_mode}' # qa | dev — dev run reports never count as QA coverage
environment: '{environment}'
base_url: '{base_url}'
executed_as: '{role}' # role name only — never a credential value
datetime: '{datetime}' # YYYY-MM-DD-HHmm, same stamp as the evidence folder
viewports: '{viewports}' # empty = desktop default
cases_file: 'test-cases.md @ {cases_approved_timestamp}'
source_sha: '{source_sha}' # git HEAD of the app under test, if resolvable
---

# Test Execution Report — {key} — {environment} — {datetime}

## Results

<!--
One row per executed case (times viewport combination when viewports were requested).
Expected Results: copied verbatim from the case, never reworded. Fill Actual Results for
every attempted case. Evidence/Comments: NOTES ONLY — never a screenshot path or link.
All screenshots appear embedded in the per-case sections below. For a skipped dependent,
name the blocking case here.
-->

| ID          | Title   | Expected Results | Actual Results | Status   | Evidence/Comments |
| ----------- | ------- | ---------------- | -------------- | -------- | ----------------- |
| TC-{key}-01 | {title} | {expected}       | {observed}     | {status} | {notes}           |

## Failure Detail

<!-- One subsection per Fail / Partly Pass case. Delete the section when there are none. -->

### TC-{key}-{n} — {title} ({status})

- **Steps to reproduce:** {numbered, exactly as driven}
- **Expected:** {from the case}
- **Actual:** {what the browser showed}
- **Per-step results:** {step m: pass/fail + observation — required for Partly Pass and Fail}
- **Evidence:**
  ![TC-{key}-{n}](../stella/{key}/evidence/{datetime}/tc-{n}.png)
  <!-- Embed EVERY screenshot of the case as a markdown image, one line per file
  (tc-{n}-step-{m}.png for step shots) — never a bare link. This report lives in
  {test_artifacts}/{key}/, the screenshots in {test_artifacts}/stella/{key}/evidence/,
  so the relative path is ../stella/{key}/evidence/{datetime}/... and preview renders
  the picture. -->

## Evidence — Passed Cases

<!-- One subsection per Pass case, embedding its success screenshot(s) — the shot taken
when the expected result (success message/flag/end state) was visible. Same embed rules
and relative paths as Failure Detail. Delete the section when no case passed. -->

### TC-{key}-{n} — {title} (Pass)

![TC-{key}-{n}](../stella/{key}/evidence/{datetime}/tc-{n}.png)

## Blocked / Not Run

<!-- Reason per case; for Not Run dependents, the blocking case ID. Delete when empty. -->

| ID  | Status | Reason |
| --- | ------ | ------ |

## Summary

Pass {x}, Fail {y}, Partly Pass {z}, Blocked {b}, Not Run {n} — total {t}.
