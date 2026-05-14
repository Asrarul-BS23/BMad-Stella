<!-- Powered by BMAD™ Core -->

# Scribe Protocol

CRITICAL — non-negotiable. Runs at end of every assistant turn. Captures cross-session notes to `bmad-docs/bmad-notes/notes.md`. Survive context compaction. Re-anchor on every activation.

---

## 1. When to capture

Capture a NOTE if the turn produced ANY of:

1. **Choice / approach** — picked X over Y, methodology, strategy, sequence
2. **Adoption** — pattern, library, tool, framework, convention, standard
3. **Rejection / deferral** — option dismissed, postponed, parked for later
4. **Constraint / trade-off / risk** — limitation, balance, known risk accepted
5. **Scope** — what's IN vs OUT of current work
6. **Status change** — plan/ticket lifecycle (Draft → Approved → Complete, etc.)
7. **Lesson / gotcha / finding** — non-obvious finding worth remembering
8. **Acceptance criteria** — definition of "done" agreed upon

### SKIP

- Mid-work edits without unit-boundary signal
- Pure exploration / brainstorm without resolution
- Reads, searches, tests, ephemeral ops
- Acknowledgements, status reads, repeats, AI commentary

When uncertain → lean toward CAPTURE.

---

## 2. How to capture (mandatory order)

If eligible per Section 1, execute IN ORDER:

1. **Append entry** to `bmad-docs/bmad-notes/notes.md`. Format per Section 3.

2. **Verify on disk** — read the last ~30 lines of `notes.md` from disk (open and inspect, never mentally assume). Confirm new entry block visible AND ID present.

3. ONLY after step 2 confirmed → append `📝 captured: {ID} — {title}` at END of reply.

Notification without verified-on-disk write = **CRITICAL FAILURE**.

---

## 3. Entry format

```
## NOTE-{YYYY-MM-DD-HHMMSS-mmm}  {short title}
{1-3 line body — explain what / why / where as relevant}
ref: {ticket | NOTE-id | —}
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

Section 2 step 1 or 2 fails → retry once. Second failure → SILENT skip. Do NOT print `📝 captured`.

Printing `📝 captured` without successful Write+Read = CRITICAL FAILURE.

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
