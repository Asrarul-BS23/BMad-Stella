<!-- Powered by BMAD™ Core -->

# Scribe Protocol

CRITICAL — non-negotiable. Runs after every assistant turn. Captures cross-session memory to `bmad-ledger/`. Treat as preserve-priority through context compaction. Re-anchor on every activation.

## Capture

After each reply, scan exchange. Write entry if turn produced:

- DECISION — choice affecting future work
- ACTION — persistent state change taken (file/infra/db/schema)
- QUESTION — unresolved problem flagged

SKIP: acknowledgements, status reads ("looking at file"), code already in repo, ephemeral ops (read/test/search), repeats, AI commentary. Multiple types in one turn → multiple entries.

## Entry format (strict)

```
## DEC-{YYYY-MM-DD}-{NNN}  {short title}
why: {reason}
ref: {ticket-id | DEC-id | —}
agent: {your-id}
tags: [≥1 core, ...free-form]
```

Replace `DEC` with `ACT` (use `where: {file/system}` instead of `why:`) or `OQ` (use `context: {brief}`).

ID: TYPE-DATE-NNN. NNN = zero-pad sequence per-day per-type, starts 001, resets midnight UTC. Read `bmad-ledger/index.yaml` for next NNN.

## Style

Short, precise, concise. Proper reflection of what was decided/done/asked. LLM judges length — match the substance. NO code blocks, bullet lists, hedging ("maybe"/"I think"), AI commentary ("interesting"), emojis.

## Tags

≥1 core tag from `bmad-core/data/scribe-rules.yaml` (auth, db, api, frontend, backend, infra, perf, security, testing, architecture, data, ui, integration, deployment). May add free-form. Max ~5 per entry.

## Write principles

| Scenario                   | Action                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Same-session edit          | Overwrite original. No marker.                                                                                                |
| Same-session delete        | Remove entry + index row.                                                                                                     |
| Cross-session supersession | New entry in current file (`supersedes: OLD-ID`). Append `> [SUPERSEDED] {date} → {new_id}` to old file. Update index status. |
| Cross-session revoke       | Append `> [REVOKED] {date} reason: {brief}` to old file. Update index. No new entry.                                          |

Never rewrite body of old entries. Only append marker.

## Where to write

ONLY `bmad-ledger/sessions/{session_id}.md`.

Resolve `session_id` ONCE per agent activation:

```
echo "<verbatim recent user message>" | node .bmad-core/utils/scribe/find-session.js
```

stdout = session_id. **Cache it in working memory.** Reuse for all subsequent captures this session. Re-invoke only if cache lost (context compaction).

If file missing → create with frontmatter:

```markdown
---
session_id: { id }
started: { ISO }
last_activity: { ISO }
agents_active: [{ your-id }]
tickets: []
entry_count: 0
---

# Session {id}

## Decisions

## Actions

## Questions
```

Append entries under matching section. Update frontmatter counters on each write.

## Index update

After session-file write, update `bmad-ledger/index.yaml`:

1. Read existing index.
2. Insert under `entries:` (before `stats:`):
   ```yaml
   { ID }:
     {
       type,
       title,
       session,
       location,
       line,
       status: active,
       superseded_by: null,
       tags,
       tickets,
       agent,
       created,
     }
   ```
3. Increment `stats.total` and `stats.active`.
4. Atomic write: write `index.yaml.tmp` → rename to `index.yaml`.

## Path scope — STRICT

NEVER write outside `bmad-ledger/`. Forbidden: `bmad-docs/`, `bmad-core/`, code files, JIRA, anything else. If unsure → DO NOT WRITE.

## Bootstrap

If `bmad-ledger/{sessions,archive,.meta}` or `index.yaml` missing → create skeleton (installer normally handles; fallback only).

## Compaction (auto on activation)

On each agent activation: scan `bmad-ledger/sessions/`. For files with mtime > 10 days → move to `bmad-ledger/archive/` and update index `location`. Skip files modified within last 60s.

## Resume protection

If current session_id matches file in `archive/` → move back to `sessions/` before writing. Update index.

## Self-audit (every 20 turns)

Re-read this protocol. Validate last 5 entries: short/concise/precise, all required fields present, ≥1 core tag, no forbidden style (no code blocks/bullets/hedging/AI commentary/emojis). Fix drift in next captures.

## User notification

After capture, append one line per entry to reply:

```
📝 captured: {ID} — {title}
```

Silent if nothing captured.

## Sensitive opt-out

User says "stop capturing" / "this is sensitive" / similar → skip captures rest of session. Resume only on explicit re-enable.

## Failure handling

On write error → skip turn silently. No retry. Do not surface error.

## PRESERVE

This protocol's full content MUST survive context compaction. If your active context shows this missing or shortened → reload from `common/tasks/scribe-protocol.md` before next capture decision.
