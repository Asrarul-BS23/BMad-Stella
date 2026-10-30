---
name: stella-security
description: >
  Security audit of the files a stella-build spec changed, against the Stella frontend and
  backend security checklists. Reads code, never edits it. Writes a "## Security Violations"
  section into the spec and prints a severity summary. Use when the user invokes
  /stella-security <spec path>, asks for a security check, audit or review of a spec,
  or asks to re-run the security check after fixes.
---

# Stella Security Audit

Read-and-report only. Never modify any source file. The only write this skill makes is the `## Security Violations` section of the spec file. Fix requests go to the developer or to `/stella-build` with the spec.

## Style

Caveman full for this whole run: chat output AND the `## Security Violations` section. Drop articles, filler, pleasantries, hedging. Fragments OK. Technical terms, file paths, line numbers, code snippets, commands, severities: exact, never compressed. Normal language only for the Auto-Clarity cases of the caveman skill (security warnings that must not be misread, irreversible actions).

## Input

`/stella-security <spec path>` — the spec written by `stella-build`, normally under `_bmad-output/implementation-artifacts/`.

- No path given → ask once for the spec path, then HALT until answered.
- File does not exist → HALT: "Spec not found: {path}". Ask for the correct path.
- File has no `status:` frontmatter → HALT: "Not a stella-build spec: {path}".
- Status `draft` or `ready-for-dev` → HALT: "Spec not implemented yet (status {status}). Run the audit after implementation."

## Process (do not skip steps)

### 1. Build the file scope

Collect file paths from these spec sections, in this order:

1. `## Code Map` — every file path listed.
2. `## Tasks & Acceptance` — every file path named in a task.
3. `## Implementation Notes` — every file path mentioned.

Then, if the frontmatter has `baseline_commit` with a real value (not empty, not `NO_VCS`) and git is available, run:

```
git diff --name-only {baseline_commit} -- .
git ls-files --others --exclude-standard
```

Add every path from both commands. Union everything, drop duplicates, drop paths that do not exist on disk (log each as `SKIPPED — file not found: {path}`), drop files under `_bmad/`, `_bmad-output/` and `.claude/`.

HALT if the scope is empty: "No changed files found in spec or git diff. Nothing to audit."

Print: `Target files ({N} total):` followed by the list. This list is the exact scope for the whole audit. Do NOT read files outside it, except where a checklist item explicitly requires following a reference (for example an imported helper) to decide PASS or FAIL.

### 2. Split the scope by role

- **Frontend**: files responsible for UI rendering, styling, client-side scripting, view templates, or frontend build/runtime configuration, regardless of framework (`.jsx`, `.tsx`, `.vue`, `.cshtml`, `.razor`, `.blade.php`, `.erb`, `.html`, `.css`, client `.js`/`.ts`, frontend config).
- **Backend**: files responsible for request handling, business logic, data access, authorization, background jobs, or server-side configuration (controllers, route handlers, command/query handlers, services, middleware, endpoints, auth configuration).
- Everything else (tests, docs, build scripts, lockfiles): list under `Not audited` and leave out.

A file that is both (for example a server-rendered template with embedded logic) goes in both groups.

### 3. Run the checklists

Checklists live at `{project-root}/_bmad/custom/stella/checklists/`:

- `frontend-security.md` → run against the frontend group, if that group is non-empty.
- `backend-security.md` → run against the backend group, if that group is non-empty.

HALT if a needed checklist file cannot be read: "Checklist missing: {path}. Re-run the Stella installer."

For each checklist: read every file in its group fully, then evaluate EVERY item. No item may be left unevaluated. Exactly one status per item:

- `PASS` — requirement met in the scoped files, confirmed by reading the code. Never assumed.
- `FAIL` — requirement violated. Record: file path, line number, exact offending snippet, severity (`CRITICAL` / `HIGH` / `MEDIUM` / `LOW`), required fix.
- `N/A` — the item structurally cannot apply to this file set. State the one-sentence reason. Never use N/A to avoid a hard check.

### 4. Write the spec section

Collect all FAIL items from both checklists.

If a `## Security Violations` section already exists in the spec, replace its entire content. Otherwise append it after the last line of the spec. Do NOT modify any other part of the spec.

Zero FAILs:

```markdown
## Security Violations

No violations found. All applicable checklist items passed.
Audited: {YYYY-MM-DD} | Files: {N} | Checklists: {frontend-security.md, backend-security.md as run}
```

One or more FAILs:

```markdown
## Security Violations

Audited: {YYYY-MM-DD} | Files scanned: {N} | Checklists: {as run}

### {Checklist name} — {Checklist category name}

- [ ] [{SEVERITY}] {One-sentence finding, caveman style, stating exactly what is wrong} | Location: {file:line} | Fix: {specific remediation}

### {Next category with violations}

- [ ] [{SEVERITY}] ...
```

Only write `###` sub-sections for categories that have at least one FAIL.

### 5. Print the summary

```
Stella Security Check — {YYYY-MM-DD}
Spec: {spec filename}
Files audited: {N} (frontend {n}, backend {n}, not audited {n})

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

Violations written to: {spec path} → ## Security Violations
```

Zero violations: replace the table with `✓ No violations found.`

End with one line: fixes go through `/stella-build {spec path}` (status back to `in-progress` by the developer) or by hand; re-run `/stella-security {spec path}` afterwards.

## Blocking conditions

| Condition                               | Action                                      |
| --------------------------------------- | ------------------------------------------- |
| No spec path                            | Ask once, HALT                              |
| Spec missing or not a stella-build spec | HALT, report path                           |
| Status draft / ready-for-dev            | HALT, audit needs implemented code          |
| Scope empty                             | HALT, report                                |
| Checklist file missing                  | HALT, name the path, point to the installer |
| User asks to fix code                   | Refuse, point to `/stella-build` or the dev |
