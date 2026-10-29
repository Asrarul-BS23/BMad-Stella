---
key: 'STEL-123'
mode: 'qa'
environment: 'staging'
base_url: 'https://staging.example.com'
executed_as: 'admin'
datetime: '2026-10-29-1430'
viewports: ''
cases_file: 'test-cases.md @ 2026-10-29T14:05'
source_sha: '9f2c41d8b7e35a06c1d4f8e29b7a3c5d6e081f42'
---

# Test Execution Report — STEL-123 — staging — 2026-10-29-1430

## Results

| ID             | Title                               | Status      | Actual Results                                                    | Evidence/Comments                                    |
| -------------- | ----------------------------------- | ----------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| TC-STEL-123-01 | Create supplement with valid data   | Pass        | Supplement saved; appears in list with correct name and dosage    |                                                      |
| TC-STEL-123-02 | Reject empty supplement name        | Fail        | Form submitted; row created with blank name                       | evidence/2026-10-29-1430/tc-2.png — no validation    |
| TC-STEL-123-03 | Edit supplement as customer role    | Partly Pass | Edit form opens and saves text fields; dosage field not persisted | evidence/2026-10-29-1430/tc-3-step-4.png             |
| TC-STEL-123-04 | Delete supplement with confirmation | Blocked     | Delete button missing on staging — feature flag off               | Precondition failed: `supplements_delete` flag off   |
| TC-STEL-123-05 | Audit log lists supplement deletion | Not Run     |                                                                   | Depends on TC-STEL-123-04 (Blocked); user chose skip |

## Failure Detail

### TC-STEL-123-02 — Reject empty supplement name (Fail)

- **Steps to reproduce:** 1. Login as admin. 2. Open Supplements → Add. 3. Leave Name empty, fill Dosage `10mg`. 4. Click Save.
- **Expected:** Validation error on Name; nothing saved.
- **Actual:** Save succeeded; list shows a row with an empty name.
- **Per-step results:** step 1 pass, step 2 pass, step 3 pass, step 4 fail (no validation, row created).
- **Evidence:** evidence/2026-10-29-1430/tc-2.png

### TC-STEL-123-03 — Edit supplement as customer role (Partly Pass)

- **Steps to reproduce:** 1. Login as customer. 2. Open an owned supplement. 3. Change Name to `Vitamin D3`. 4. Change Dosage to `20mg`. 5. Save and reopen.
- **Expected:** Both fields persist.
- **Actual:** Name persisted; Dosage reverted to `10mg` on reopen.
- **Per-step results:** steps 1–3 pass, step 4 pass (input accepted), step 5 fail (dosage not persisted).
- **Evidence:** evidence/2026-10-29-1430/tc-3-step-4.png

## Blocked / Not Run

| ID             | Status  | Reason                                                       |
| -------------- | ------- | ------------------------------------------------------------ |
| TC-STEL-123-04 | Blocked | `supplements_delete` feature flag off on staging             |
| TC-STEL-123-05 | Not Run | Depends on TC-STEL-123-04; user chose to skip the dependents |

## Summary

Pass 1, Fail 1, Partly Pass 1, Blocked 1, Not Run 1 — total 5.
