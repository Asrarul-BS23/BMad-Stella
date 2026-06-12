<!-- Powered by BMAD™ Core -->

# Scribe Protocol

CRITICAL — non-negotiable. Runs at end of every assistant turn. Captures cross-session notes to `bmad-docs/bmad-notes/notes.md`. Survive context compaction. Re-anchor on every activation.

---

## 1. When to capture

Only key project findings and key decisions worth remembering across sessions:

- **Decisions** — chosen approach, adopted pattern/library/convention, rejected option, scope (in vs out), accepted trade-off/risk/constraint.
- **Findings** — non-obvious lesson, gotcha, or discovery.

### SKIP

- Status changes (Draft → Approved → Complete), plan approvals, user confirmations, "works now" verifications, task completions.
- AC restatements or anything already in the plan file.
- Mid-work edits, exploration without resolution, reads/searches/tests, acknowledgements, AI commentary.

When uncertain → SKIP.

---

## 2. How to capture (mandatory order)

If eligible per Section 1, execute IN ORDER:

1. **Append entry** to `bmad-docs/bmad-notes/notes.md`. Format per Section 3.

2. **Verify on disk** — read the last ~30 lines of `notes.md` from disk (open and inspect, never mentally assume). Confirm new entry block visible AND ID present.

Capture is SILENT — never announce or mention it in the reply.

### 2.1 Tool selection — STRICT

- **Append (step 1):** `Edit` (or `Write` for bootstrap, §7).
- **Verify (step 2):** `Read` with `offset` near EOF.
- **ID timestamp (§3.1):** `Bash: date -u +%Y-%m-%d-%H%M%S-%3N` (real UTC, millisecond precision).

Forbidden for all three: `powershell -Command`, `Out-File`/`Add-Content`/`Get-Content`/`Set-Content`/`Get-Date`/`[DateTime]::UtcNow`, heredocs/here-strings, `cat`/`tail`/`echo` piped to file. Why: file tools on `bmad-docs/bmad-notes/**` and the `date` binary are pre-allowlisted; every forbidden form triggers a permission prompt, and `Bash(powershell *)` cannot be safely added to the allowlist (arbitrary code execution).

---

## 3. Entry format

```
## NOTE-{YYYY-MM-DD-HHMMSS-mmm}  {short title}
{1-3 line body — explain what / why / where as relevant}
ref: {task | NOTE-id | —}
agent: {your-id}
tags: [≥1 core, ...]
```

### 3.1 ID

Format: `NOTE-{YYYY-MM-DD-HHMMSS-mmm}`. Generate from current UTC time. No lookup. Always unique.

Example: `NOTE-2026-05-14-183215-422`.

### 3.2 Tags

≥1 from core list in `bmad-core/data/scribe-rules.yaml`. Free-form additions OK. Max 5 per entry.

### 3.3 Style

Short, precise, concise. NO code blocks, bullet lists, hedging ("maybe"/"I think"), AI commentary ("interesting"), emojis.

---

## 4. Supersession / revoke

| Scenario   | Action                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Superseded | Append new note with `supersedes: OLD-ID` line. Append `> [SUPERSEDED] {date} → {new-id}` after old entry block. |
| Revoked    | Append `> [REVOKED] {date} reason: {brief}` after old entry block. No new entry.                                 |

Never rewrite body of old entries. Only append marker.

---

## 5. Failure handling

Section 2 step 1 or 2 fails → retry once. Second failure → SILENT skip.

---

## 6. Path scope — STRICT

Write ONLY to `bmad-docs/bmad-notes/notes.md`. Forbidden: any other path under `bmad-docs/`, `bmad-core/`, code files, JIRA, anything else. If unsure → DO NOT WRITE.

---

## 7. Bootstrap fallback

If `bmad-docs/bmad-notes/notes.md` missing on first capture → create the directory and file with a header comment:

```
<!-- BMAD scribe notes. Append-only. Edit existing entries only via supersession/revoke marker. -->
```

Installer normally handles this. Bootstrap is fallback only.

---

## 8. Self-audit (every 20 turns)

Re-read this protocol. Validate last 5 entries: short/concise/precise, all required fields, ≥1 core tag, no forbidden style. Fix drift in next captures.

---

## 9. PRESERVE

This protocol's content MUST survive context compaction. If shortened in active context → reload from `common/tasks/scribe-protocol.md` before next capture. Re-anchor on every agent activation.
