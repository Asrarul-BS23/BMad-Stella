<!-- Powered by BMAD™ Core -->

# Recall Context

Used by `/scribe *recall <question>`. Query the ledger, answer with synthesis grounded in stored entries.

## Input

User-provided free-form question or topic. Examples:

- "what auth decisions have we made?"
- "JIRA-451"
- "open questions about caching"

## Steps

1. Read `bmad-ledger/index.yaml`. Parse all entries.

2. Filter entries by relevance to question:
   - Match keywords/IDs/tickets in question against entry `tags`, `tickets`, `title`.
   - Default scope: `status: active` AND `location` under `sessions/` (active tier).

3. If matches found:
   - Read entry bodies from their `location` files.
   - Pass to LLM (you) for synthesis.
   - Compose answer: synthesis on top, references at bottom.

4. If no matches in active tier:
   - Respond: `"No entries found in active sessions. Closest tags: {top 3 tag suggestions}. Search archive too? (Y/n)"`
   - On user `Y` → repeat step 2 with `location` under `archive/` included.
   - On user `n` → end.

## Response format

### Synthesis (top)

LLM-judged length. Match question scope:

- Specific question → 1-2 sentence answer.
- Broad question → coherent paragraph summary.
- Vague question → ask for clarification, do not dump.

No bullet flood. No verbose dumps. Trust your intelligence.

### References (bottom)

List relevant entries used in synthesis. Format per line:

```
{title} — {ID} · {session} · {agent} · {ticket-or-—}
```

Example:

```
References:
• Auth: JWT
    DEC-2026-04-30-001 · session 2026-04-30-0915 · planner · JIRA-451
• Refresh: 7d cadence
    DEC-2026-04-30-002 · session 2026-04-30-0915 · planner · JIRA-451
```

## Style

- No fluff. No "Based on the ledger...".
- No marketing language ("interesting findings").
- Match user's question register.
- LLM judges entry count to cite. No fixed cap.

## Persona handling

`/scribe *recall` does NOT switch user out of their active persona (planner/dev/qa/etc). After answering, control returns to whichever agent was active. Sam = lightweight utility, not a takeover.

## Failure handling

| Case                        | Response                                               |
| --------------------------- | ------------------------------------------------------ |
| `index.yaml` missing        | "Ledger not initialized. Run installer."               |
| `index.yaml` malformed      | "Ledger index corrupted. Manual repair needed."        |
| Entry location file missing | Skip that entry. Note in references: "[file missing]". |

## Path scope — STRICT

Read-only operation. Never write to ledger or anywhere else from `*recall`.
