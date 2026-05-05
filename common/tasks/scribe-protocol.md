<!-- Powered by BMAD™ Core -->

# Scribe Protocol

CRITICAL — non-negotiable. Runs after every assistant turn. Captures cross-session memory to `bmad-ledger/`. Treat as preserve-priority through context compaction. Re-anchor on every activation.

## Capture

After each reply, scan exchange. Write entry if turn produced:

- DECISION — choice affecting future work
- ACTION — persistent state change taken (file/infra/db/schema modified)

SKIP: acknowledgements, status reads, code already in repo, ephemeral ops (read/test/search), repeats, AI commentary. Multiple types in one turn → multiple entries.

## Where to write

ONLY two files:

- `bmad-ledger/decisions.md` — DEC entries
- `bmad-ledger/actions.md` — ACT entries

Append-only. Edit existing entries only via supersession marker (see Write principles).

## Entry format

### DECISION

```
## DEC-{YYYY-MM-DD-HHMMSS-mmm}  {short title}
why: {reason}
ref: {ticket-id | DEC-id | —}
agent: {your-id}
tags: [≥1 core, ...free-form]
```

### ACTION

```
## ACT-{YYYY-MM-DD-HHMMSS-mmm}  {short title}
where: {file/system}
ref: {ticket-id | ACT-id | —}
agent: {your-id}
tags: [≥1 core, ...free-form]
```

## ID

Format: `{TYPE}-{YYYY-MM-DD-HHMMSS-mmm}`. Generate from current UTC time. No lookup. Always unique.

Example: `DEC-2026-04-30-183215-422`.

## Style

Short, precise, concise. Proper reflection of decision/action. LLM judges length — match the substance. NO code blocks, bullet lists, hedging ("maybe"/"I think"), AI commentary ("interesting"), emojis.

## Tags

≥1 core tag from `bmad-core/data/scribe-rules.yaml` (auth, db, api, frontend, backend, infra, perf, security, testing, architecture, data, ui, integration, deployment). May add free-form. Max ~5 per entry.

## Write principles

| Scenario                   | Action                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision/action superseded | Append new entry to current file (`supersedes: OLD-ID` line). Append `> [SUPERSEDED] {date} → {new-id}` after old entry block. Update index status. |
| Decision/action revoked    | Append `> [REVOKED] {date} reason: {brief}` after old entry block. Update index status. No new entry.                                               |

Never rewrite body of old entries. Only append marker line.

## Index update

After file write, update `bmad-ledger/index.yaml`:

1. Read existing index.
2. Insert under `entries:` (before `stats:`):
   ```yaml
   { ID }:
     type: decision | action
     title: '...'
     file: decisions.md | actions.md
     line: { line-number }
     status: active
     superseded_by: null
     tags: [...]
     ref: { ticket-or-— }
     agent: { your-id }
     created: { ISO timestamp }
   ```
3. Increment `stats.total`, `stats.{type}s`, `stats.active`.
4. Atomic write: write `index.yaml.tmp` → rename to `index.yaml`.

## Path scope — STRICT

NEVER write outside `bmad-ledger/`. Forbidden: `bmad-docs/`, `bmad-core/`, code files, JIRA, anything else. If unsure → DO NOT WRITE.

## Bootstrap

If `bmad-ledger/`, `decisions.md`, `actions.md`, `index.yaml`, or `.meta/version.yaml` missing → create skeleton (installer normally handles; fallback only).

## Self-audit (every 20 turns)

Re-read this protocol. Validate last 5 entries: short/concise/precise, all required fields present, ≥1 core tag, no forbidden style. Fix drift in next captures.

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
