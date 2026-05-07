<!-- Powered by BMAD™ Core -->

# Scribe Protocol

CRITICAL — non-negotiable. Runs at end of every assistant turn. Captures cross-session memory to `bmad-ledger/`. Survive context compaction. Re-anchor on every activation.

---

## 1. When to capture

### 1.1 DECISION — if turn produced ANY of:

1. **Choice / approach** — picked X over Y, methodology, strategy, sequence
2. **Adoption** — pattern, library, tool, framework, convention, standard
3. **Rejection / deferral** — option dismissed, postponed, parked for later
4. **Constraint / trade-off / risk** — limitation, balance, known risk accepted
5. **Scope** — what's IN vs OUT of current work
6. **Status change** — plan/ticket lifecycle (Draft → Approved → Complete, etc.)
7. **Lesson / gotcha / finding** — non-obvious finding worth remembering
8. **Acceptance criteria** — definition of "done" agreed upon

### 1.2 ACTION — at coherent unit boundary (NOT per file edit):

- Plan task completed (checkbox flipped, section marked done)
- User transitions ("next", "done", "moving on", switches persona)
- Agent self-summarizes completion ("implemented X", "refactored Y", "migration applied")
- Multi-edit sequence finishes with all related files done + tests pass

ACTION captures the WORK UNIT, not the edits. Bad: "Edited middleware.ts". Good: "Implemented JWT auth middleware".

### 1.3 SKIP

- Mid-work edits without unit-boundary signal
- Pure exploration / brainstorm without resolution
- Reads, searches, tests, ephemeral ops
- Acknowledgements, status reads, repeats, AI commentary

When uncertain → lean toward CAPTURE.

---

## 2. How to capture (mandatory tool-call order)

If eligible per Section 1, execute IN ORDER:

1. **Write tool** → append entry to `bmad-ledger/decisions.md` (DEC) or `bmad-ledger/actions.md` (ACT). Format per Section 3.
2. **Edit tool** → update `bmad-ledger/index.yaml` per Section 4.
3. **Read tool** → read last ~30 lines of target `.md` AND `entries:` section of `index.yaml`. Confirm new entry block visible AND entry ID present in index.
4. ONLY after step 3 confirmed → append `📝 captured: {ID} — {title}` at END of reply.

Notification without preceding Write+Read tool calls = **CRITICAL FAILURE**.

---

## 3. Entry format

### 3.1 DECISION

```
## DEC-{YYYY-MM-DD-HHMMSS-mmm}  {short title}
why: {reason}
ref: {ticket | DEC-id | —}
agent: {your-id}
tags: [≥1 core, ...]
```

### 3.2 ACTION

```
## ACT-{YYYY-MM-DD-HHMMSS-mmm}  {short title}
where: {file/system}
ref: {ticket | DEC-id | —}
agent: {your-id}
tags: [≥1 core, ...]
```

### 3.3 ID

`{TYPE}-{YYYY-MM-DD-HHMMSS-mmm}` from current UTC time. Generate inline. No lookup.

### 3.4 Tags

≥1 from core list in `bmad-core/data/scribe-rules.yaml`: `auth, db, api, frontend, backend, infra, perf, security, testing, architecture, data, ui, integration, deployment`. Free-form additions OK. Max 5 per entry.

### 3.5 Style

Short, precise, concise. NO code blocks, bullet lists, hedging ("maybe"/"I think"), AI commentary ("interesting"), emojis.

---

## 4. Index update

Within Step 2 of Section 2:

1. Read existing `bmad-ledger/index.yaml`.
2. Insert under `entries:` (before `stats:`):
   ```yaml
   { ID }:
     type: decision | action
     title: '...'
     file: decisions.md | actions.md
     line: { n }
     status: active
     superseded_by: null
     tags: [...]
     ref: { ticket-or-— }
     agent: { your-id }
     created: { ISO timestamp }
   ```
3. Increment `stats.total`, `stats.{type}s`, `stats.active`.
4. Atomic write: write `index.yaml.tmp` → rename to `index.yaml`.

---

## 5. Supersession / revoke

| Scenario                   | Action                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision/action superseded | New entry in current file (`supersedes: OLD-ID` line). Append `> [SUPERSEDED] {date} → {new-id}` after old entry. Index: old `status: superseded`, `superseded_by: NEW-ID`. |
| Decision/action revoked    | Append `> [REVOKED] {date} reason: {brief}` after old entry. Index: old `status: revoked`. No new entry.                                                                    |

Never rewrite body of old entries. Only append marker.

---

## 6. Failure handling

Section 2 step 1, 2, or 3 fails → retry once. Second failure → SILENT skip. Do NOT print `📝 captured`.

Printing `📝 captured` without successful Write+Read = CRITICAL FAILURE.

---

## 7. Path scope — STRICT

Write ONLY inside `bmad-ledger/`. Forbidden: `bmad-docs/`, `bmad-core/`, code files, JIRA, anything else. If unsure → DO NOT WRITE.

---

## 8. Bootstrap fallback

If `bmad-ledger/` or any required file missing on first capture → create skeleton:

- `bmad-ledger/decisions.md` (with header comment)
- `bmad-ledger/actions.md` (with header comment)
- `bmad-ledger/index.yaml` (seed: version 2, empty entries, zero stats)
- `bmad-ledger/.meta/version.yaml` (`version: 2`)

Installer normally handles this. Bootstrap is fallback only.

---

## 9. Sensitive opt-out

User says "stop capturing" / "this is sensitive" / similar → skip captures rest of session. Resume only on explicit re-enable.

---

## 10. Self-audit (every 20 turns)

Re-read this protocol. Validate last 5 entries: short/concise/precise, all required fields, ≥1 core tag, no forbidden style. Fix drift in next captures.

---

## 11. PRESERVE

This protocol's content MUST survive context compaction. If shortened in active context → reload from `common/tasks/scribe-protocol.md` before next capture. Re-anchor on every agent activation.
