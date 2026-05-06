<!-- Powered by BMAD™ Core -->

# Read Protocol

CRITICAL — non-negotiable. Runs at START of every assistant turn. Auto-recalls cross-session memory from `bmad-ledger/`. Treat as preserve-priority through context compaction. Re-anchor on every activation.

## Trigger — strict order

Before composing reply, scan the user's latest message.

**STEP 1 — Already in current session?**

If the answer or info is anywhere in the current session's transcript → SKIP recall. Answer from existing context.

**STEP 2 — Check other skip conditions.** SKIP if ANY:

- Question is about current task / current code / current ticket already in scope
- Pure procedural ("what's next?", "how do I run X?")
- Greeting, acknowledgement, status read
- User just provided new info / instruction (not asking)

**STEP 3 — Trigger.**

Recall fires when ALL true:

- User is seeking information (question, "tell me", "remind me", etc.).
- Answer is NOT in current transcript.
- Topic is the kind ledger holds: prior decisions, actions, plan/ticket history, design rationale.

Tense and phrasing don't matter. Only information-need matters.

Explicit override (always triggers): "check ledger", "look up", "from before", "from previous session".

Else → SKIP.

## Consult procedure (when triggered)

1. Read `bmad-ledger/index.yaml`.
2. Filter entries: match question keywords/IDs/tags against `tags`, `ref`, `title`. Default scope: `status: active`. Include `superseded`/`revoked` only if user asks about history.
3. For matched entries, read body from `bmad-ledger/decisions.md` or `bmad-ledger/actions.md` at `line` position.
4. Use as grounding for reply.

## Response format

Synthesis on top — LLM judges length, match question scope. References at bottom:

```
References:
• {title} — {ID} · {agent} · {ticket-or-—}
```

If no matched entries → answer from session context. State: "no ledger entries on this topic".

## Path scope — STRICT

READ-ONLY. NEVER write to ledger from this protocol. Writing belongs to scribe-protocol.md.

## Failure handling

| Case                             | Response                                                            |
| -------------------------------- | ------------------------------------------------------------------- |
| `bmad-ledger/index.yaml` missing | Answer from session context. Mention "ledger not initialized" once. |
| `index.yaml` malformed           | Skip recall silently. Answer from session context.                  |
| Entry body file missing          | Skip that entry. Note "[file missing]" in references.               |

## PRESERVE

This protocol's full content MUST survive context compaction. Re-anchor on every agent activation.
