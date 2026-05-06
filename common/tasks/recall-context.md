<!-- Powered by BMAD™ Core -->

# Recall Context

Used by `/scribe *recall <question>`. Query the ledger, answer with synthesis grounded in stored entries.

## Input

User-provided free-form question or topic. Examples:

- "what auth decisions have we made?"
- "JIRA-451"
- "what changed about caching"

## Steps

1. Read `bmad-ledger/index.yaml`. Parse all entries.
2. Filter entries by relevance to question (match keywords/IDs/tickets against `tags`, `ref`, `title`).
3. For matched entries: read body from `decisions.md` or `actions.md` at `line` position.
4. Pass matched entries to LLM. Compose answer: synthesis on top, references at bottom.
5. If no matches:
   - Respond: `"No entries found. Closest tags: {top 3 tag suggestions}."`

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
{title} — {ID} · {agent} · {ticket-or-—}
```

Example:

```
References:
• Auth: JWT
    DEC-2026-04-30-183215-422 · planner · JIRA-451
• Refresh: 7d cadence
    DEC-2026-04-30-183520-001 · planner · JIRA-451
```

LLM judges entry count to cite. No fixed cap.

## Persona handling

`/scribe *recall` does NOT switch user out of their active persona. After answering, control returns to whichever agent was active. Sam = lightweight utility, not a takeover.

## Failure handling

| Case                    | Response                                               |
| ----------------------- | ------------------------------------------------------ |
| `index.yaml` missing    | "Ledger not initialized. Run installer."               |
| `index.yaml` malformed  | "Ledger index corrupted. Manual repair needed."        |
| Entry body file missing | Skip that entry. Note in references: "[file missing]". |

## Path scope — STRICT

Read-only operation. Never write to ledger or anywhere else from `*recall`.
