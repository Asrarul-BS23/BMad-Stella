<!-- Powered by BMAD™ Core -->

# Scribe Protocol

## CRITICAL — NON-NEGOTIABLE

Runs after every assistant turn. Captures cross-session memory to `bmad-ledger/`.

MUST follow this protocol verbatim. Do not abbreviate, summarize, or skip steps. Do not let format drift over long sessions. Re-anchor on every agent activation.

Violations of this protocol = data loss for the user. Treat with same priority as user's primary task.

## Capture triggers

After answering user, scan exchange for ONE OR MORE of:

- **DECISION** — choice made affecting future work (X over Y, with reasoning)
- **ACTION** — persistent state change you took (file/infra/db/schema modified)
- **QUESTION** — unresolved problem flagged or deferred

Skip silently if exchange contains only:

- acknowledgements ("got it", "thanks", "ok")
- status reads ("looking at file", "let me check")
- code already in repo
- ephemeral actions (read, run tests, search)
- repeats of already-captured info
- personal commentary ("interesting", "good idea")

If multiple types in one turn → write multiple entries.

## Entry format

Strict. No deviation.

### DECISION

```
## DEC-{YYYY-MM-DD}-{NNN}  {title ≤8 words}
why: {one-line reason}
ref: {ticket-id or DEC-id, or "—"}
agent: {your-agent-id}
tags: [≥1 core, optional free-form]
```

### ACTION

```
## ACT-{YYYY-MM-DD}-{NNN}  {what-done ≤8 words}
where: {file path / system}
ref: {ticket-id or DEC-id, or "—"}
agent: {your-agent-id}
tags: [≥1 core, optional free-form]
```

### QUESTION

```
## OQ-{YYYY-MM-DD}-{NNN}  {question ≤8 words}
context: {brief}
agent: {your-agent-id}
tags: [≥1 core, optional free-form]
```

### ID rules

- TYPE = DEC | ACT | OQ
- DATE = today UTC, YYYY-MM-DD
- NNN = zero-padded sequence per-day per-type, starts 001, resets midnight
- Read `bmad-ledger/index.yaml` to find next NNN

## Style

- title ≤ 8 words
- lines ≤ 80 chars
- body ≤ 3 lines (excluding header)
- NO code blocks
- NO bullet lists (single-line fields only)
- NO hedging ("maybe", "I think", "perhaps")
- NO AI commentary ("interesting", "good idea")
- NO emojis

## Tags

≥1 from core list. May add free-form.

Core list (read from `bmad-core/data/scribe-rules.yaml`):
`auth, db, api, frontend, backend, infra, perf, security, testing, architecture, data, ui, integration, deployment`

Max ~5 tags per entry.

## Write principles

| Scenario                   | Action                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Same-session edit          | Overwrite original entry in place. No marker.                                                                          |
| Same-session delete        | Remove entry. Drop from index.                                                                                         |
| Cross-session supersession | New entry in current file (`supersedes: OLD-ID`). Append `> [SUPERSEDED] {date} → {new_id}` to old file. Update index. |
| Cross-session revoke       | Append `> [REVOKED] {date} reason: {brief}` to old file. Update index. No new entry.                                   |

Never rewrite body of old entries. Only append marker line.

## Where to write

ONLY `bmad-ledger/sessions/{session_id}.md`.

`session_id` = current Claude Code session identifier.

If file missing for current `session_id` → create with frontmatter, then append entry.

### Session file frontmatter (on first write)

```markdown
---
session_id: { session_id }
started: { ISO timestamp }
last_activity: { ISO timestamp }
agents_active: [{ your-agent-id }]
tickets: []
entry_count: 0
---

# Session {session_id}

## Decisions

## Actions

## Questions
```

Append entries under matching section. Update `last_activity`, `agents_active`, `tickets`, `entry_count` on each write.

## Index update

After writing entry to session file:

1. Read existing `bmad-ledger/index.yaml`.
2. Append entry metadata under `entries:` (insert before `stats:` block):
   ```yaml
   { ENTRY-ID }:
     type: decision | action | question
     title: '...'
     session: { session_id }
     location: sessions/{session_id}.md
     line: { line-number }
     status: active
     superseded_by: null
     tags: [...]
     tickets: [...]
     agent: { your-agent-id }
     created: { ISO timestamp }
   ```
3. Increment `stats.total` and `stats.active` (and `stats.{type}` if tracked).
4. Write index back atomically:
   - Write to `bmad-ledger/index.yaml.tmp`.
   - Rename `.tmp` → `index.yaml` (atomic on same filesystem).

This pattern prevents partial-write corruption. No lockfile required for single-developer workflow. If multi-window concurrent writes corrupt index → recovery via rebuild from session files (future utility).

## Bootstrap

Before first write of session, ensure exists:

- `bmad-ledger/sessions/`
- `bmad-ledger/archive/`
- `bmad-ledger/.meta/version.yaml` (version: 1)
- `bmad-ledger/index.yaml`

If missing → create with seed content. Installer normally handles this; bootstrap is fallback.

## Path scope — STRICT

NEVER write outside `bmad-ledger/`.

Forbidden paths:

- `bmad-docs/**`
- `bmad-core/**`
- code files
- JIRA / external services
- any path not under `bmad-ledger/`

If unsure → DO NOT WRITE.

## Compaction trigger

On every agent activation (start of session), check `bmad-ledger/sessions/`:

- For each file with mtime > 10 days → move to `bmad-ledger/archive/`.
- Update `location` field in `index.yaml` accordingly.

If compactor logic in `compact-ledger.md` available → invoke it. Else inline check.

## Resume protection

If `session_id` matches file in `archive/` → move file back to `sessions/` before writing. Update index `location`.

## Self-audit

Every 20 turns, silently re-read this protocol. Then validate last 5 entries against:

- Title ≤ 8 words
- Body ≤ 3 lines
- All required fields present (why/where/context, ref, agent, tags)
- ≥1 core tag
- No code blocks, no bullet lists, no hedging, no AI commentary, no emojis

If any drift detected → fix format on next captures. Do not retroactively edit old entries unless same-session.

## User notification

Per turn, at end of reply, append ONE line if entry written:

```
📝 captured: {ID} — {title}
```

If multiple entries: one line per. If nothing captured: silent.

## Sensitive opt-out

If user says "stop capturing", "don't write that down", "this is sensitive", or similar → skip captures rest of session. Resume only on explicit re-enable.

## Failure handling

On write error (permission, disk, lock timeout):

- Skip this turn's capture silently.
- Do not retry mid-turn.
- Do not surface error to user.

## PRESERVE — context compaction guard

This protocol is CRITICAL. When Claude Code's auto-compaction summarizes older messages, this protocol's instructions MUST survive intact. Treat the entire content of this file as preserve-priority equivalent to the system prompt.

If protocol contents appear missing or shortened in your active context → reload from `common/tasks/scribe-protocol.md` immediately before next capture decision.

Re-anchor on every agent activation by re-reading this file in full.
