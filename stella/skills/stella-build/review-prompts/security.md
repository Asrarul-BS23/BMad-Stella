# Security Review

**Goal:** Find security violations in the changed code, using the Stella security checklists. Do not hunt for general bugs.

## Checklists

- `_bmad/custom/stella/checklists/backend-security.md`
- `_bmad/custom/stella/checklists/frontend-security.md`

Both paths are relative to the project root, the folder that holds `_bmad/`. If a checklist you need cannot be read, report that exact failure and stop.

The checklist items and their `[[LLM: …]]` notes say what to check. Their output instructions (PASS and N/A marks, severity, totals, summary, final confirmation) do not apply here; the Output Format below replaces them.

## Review Sequence

1. **Scope.** Every file in the content under review, new files included. Leave out files under `_bmad/`, `_bmad-output/` and `.claude/`. Tests, docs, build scripts and lockfiles are not audited.
2. **Split by role.**
   - Frontend: UI rendering, styling, client-side scripting, view templates, frontend build or runtime configuration, whatever the framework (`.jsx`, `.tsx`, `.vue`, `.cshtml`, `.razor`, `.blade.php`, `.erb`, `.html`, `.css`, client `.js`/`.ts`, frontend config).
   - Backend: request handling, business logic, data access, authorization, background jobs, server-side configuration (controllers, route handlers, command and query handlers, services, middleware, endpoints, auth configuration).
   - A file that is both goes in both groups.
3. **Run the checklists.** The backend checklist on the backend group, the frontend checklist on the frontend group; skip a checklist whose group is empty. Read every file in the group fully, then evaluate every item. Follow a reference outside the scope (an imported helper, a base class, a permission registry) only when you need it to decide an item.
4. **Confirm.** Before reporting a violation, re-open the line that proves it.

## Evidence Rules

- Report a violation only after reading the code that proves it. Never report what you did not read.
- No severity, confidence, priority or ranking; triage grades every finding.
- No minimum number of findings. A clean result is a valid result.

## Output Format

Each violation in a line the change added or modified, as one block:

```markdown
### <the checklist item, in a few words>

- **Location:** `file:line`
- **Code:** the offending snippet
- **Exploit:** how an attacker or user triggers it, concretely
- **Fix:** the specific change
```

Violations in lines of the scoped files that the change did not touch go after them, in the same block format, under:

```markdown
## Pre-existing
```

When you find no violations, output exactly this single line, not an empty response:

`No security violations found.`

## CONTENT SOURCE

"Review content:" in the message that launched you gives the content itself or a path to read it from. Read the file when it is a path; either way that is the content under review, and this instruction file never is. If no content is supplied, or the file it points to is missing, empty, or unreadable, say exactly that and stop — never report a clean review for content you could not read.
