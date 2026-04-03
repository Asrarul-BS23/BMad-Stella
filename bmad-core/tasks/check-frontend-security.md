<!-- Powered by Stella AI Team -->

# check-frontend-security

Audit frontend files touched by an implementation plan against the frontend security checklist, record violations in the plan file, and print a severity summary.

## Inputs

```yaml
required:
  - implementation_plan: 'Path to the implementation plan file (e.g., bmad-docs/impl-plan/PROJ-123-plan.md)'

derived_from_plan:
  - file_list: 'Dev Agent Record → File List section — all files added/modified by this plan'
```

## Purpose

- Identify the exact set of frontend files created or modified by the given implementation plan
- Run every item in `frontend-security-checklist.md` against those files only
- Append all FAIL items as structured violation entries under a `## Security Violations` section in the plan file
- Print a severity-grouped summary table to the terminal

## Process (Do not skip steps)

### 0. Load & Validate Inputs

- Read the implementation plan file at the provided path.
- HALT if the file does not exist — report the path checked and ask for the correct path.
- HALT if the plan file contains no `Dev Agent Record → File List` section or the list is empty — report: "No files found in Dev Agent Record → File List. Ensure the plan has been implemented before running security check."

### 1. Extract Target File Scope

- Read `Dev Agent Record → File List` from the plan file.
- From that list, identify all frontend files — frontend files are any files responsible for UI rendering, styling, client-side scripting, view templates, or frontend build/runtime configuration, regardless of extension or framework (e.g., `.jsx`, `.tsx`, `.vue`, `.cshtml`, `.razor`, `.blade.php`, `.erb`, `.html`, `.css`, `.js`, `.ts`, frontend config files, etc.).
- HALT if no frontend files are identified — report: "No frontend files identified in File List. This check applies to frontend files only."
- Log the identified file list: "Target files ({N} total): {list}" — this is the exact scope for the entire audit.

### 2. Read Target Files

- Read every file from the filtered list in Step 1.
- For each file that no longer exists at its listed path, log: "SKIPPED — file not found: {path}" and exclude it from the audit.
- Do NOT read any files outside the filtered list. Scope is strictly bounded to what the plan modified.

### 3. Execute Frontend Security Checklist

- Load and execute `{root}/checklists/frontend-security-checklist.md` against the file set from Step 2.
- Evaluate every checklist item. No item may be left unevaluated.
- Assign each item exactly one of three statuses:
  - `PASS` — requirement is met in the scoped files.
  - `FAIL` — requirement is violated; record as a violation entry (see Step 4).
  - `N/A` — item is not applicable to this file set; state the specific reason (e.g., "N/A — no `<iframe>` elements in scoped files").
- Do not mark an item N/A simply because it is inconvenient to check. Only use N/A when the item structurally cannot apply.

### 4. Record Violations in Implementation Plan

- Collect all FAIL items from Step 3.
- If there are zero FAILs, append the following to the plan file and proceed to Step 5:
  ```
  ## Security Violations
  No violations found. All applicable checklist items passed.
  Audited: {YYYY-MM-DD} | Files: {N} | Checklist: frontend-security-checklist.md
  ```
- If FAILs exist:
  - Check whether a `## Security Violations` section already exists in the plan file.
    - If it exists: replace its entire content with the new output below.
    - If it does not exist: append it after the last line of the plan file.
  - Write the section using this exact structure:

```markdown
## Security Violations

Audited: {YYYY-MM-DD} | Files scanned: {N} | Checklist: frontend-security-checklist.md

### {Checklist Category Name}

- [ ] [{SEVERITY}] {One-sentence finding stating exactly what is wrong} | Location: {file:line} | Fix: {Specific remediation action}

### {Next Category With Violations}

- [ ] [{SEVERITY}] ...
```

- Group violation entries by their checklist category — one `###` sub-section per category that has at least one FAIL. Omit categories with zero FAILs.
- Each violation entry must contain all four fields: SEVERITY, Finding, Location (exact `file:line` — no vague references), Fix.
- SEVERITY must be one of: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` as classified by the checklist.
- Do NOT modify any other section of the plan file. Only the `## Security Violations` section is written by this task.

### 5. Print Summary to Terminal

Print the following to the terminal after the plan file is saved:

```
Frontend Security Check — {YYYY-MM-DD}
Plan: {implementation_plan filename}
Files audited: {N}

Checklist Results:
  PASS : {n}
  FAIL : {n}
  N/A  : {n}

Violations by Severity:
┌──────────┬───────┐
│ Severity │ Count │
├──────────┼───────┤
│ CRITICAL │  {n}  │
│ HIGH     │  {n}  │
│ MEDIUM   │  {n}  │
│ LOW      │  {n}  │
└──────────┴───────┘

Violations written to: {plan_file_path} → ## Security Violations
```

If zero violations: replace the violations table with: `✓ No violations found.`

## Blocking Conditions

| Condition                                         | Action                                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Plan file path does not exist                     | HALT — report path, ask for correct one                      |
| Plan has no `Dev Agent Record → File List`        | HALT — report, ask user to complete implementation first     |
| No frontend files in File List                    | HALT — report, confirm this task targets frontend files only |
| `frontend-security-checklist.md` cannot be loaded | HALT — report missing checklist path                         |

## Key Principles

- Scope is strictly bounded to files listed in the plan's `Dev Agent Record → File List` — never audit files outside this list.
- Every checklist item must be evaluated — no silent skips.
- Every violation entry must have an exact `file:line` location — reject vague references like "somewhere in src/".
- This task is read-and-report only — never modify source files, only write to the `## Security Violations` section of the plan file.
- Replacing an existing `## Security Violations` section on re-run ensures the plan always reflects the latest audit state.
