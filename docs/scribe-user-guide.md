# Scribe — Memory Ledger User Guide

Cross-session memory for BMAD. Captures decisions and actions automatically. Recall anytime via one command.

---

## What it does

While you work with any BMAD agent (planner, dev, qa, reviewer, etc.), the scribe protocol captures key items to a local ledger. Survives session restarts, persona switches, and context-window compaction.

---

## What gets captured

| Type                                 | Example                         |
| ------------------------------------ | ------------------------------- |
| **Decision**                         | "Use JWT not sessions for auth" |
| **Action** (persistent state change) | "Migrated user table to UUIDs"  |

Skipped: acknowledgements, status reads, repeats, ephemeral actions (read/test/search).

---

## Where it lives

```
your-project/
└── bmad-ledger/         (gitignored — local to your machine)
    ├── decisions.md     append-only DEC entries
    ├── actions.md       append-only ACT entries
    ├── index.yaml       metadata for fast filter
    └── .meta/version.yaml
```

---

## Capture (automatic)

Just work with any BMAD agent. Captures happen silently. After a captured turn, you'll see one line:

```
📝 captured: DEC-2026-04-30-183215-422 — Auth: JWT
```

No setup. No commands. Just works.

---

## Recall (automatic)

Just ask. Any BMAD agent (planner, dev, qa, reviewer, etc.) auto-consults the ledger when your question references info from past sessions.

Examples — these work in **any** active agent (no `/scribe` needed):

```
You: what auth decisions have we made?
You: did we already implement caching?
You: why did we choose JWT?
You: remind me about JIRA-451
```

Agent silently checks the ledger, answers with citations. No persona switch. Your current task continues.

### When auto-recall fires

- Past tense about past decisions/actions ("what did we", "why did we", "have we")
- Reference to ticket / file / concept not from current session
- Explicit "check ledger" / "look up" / "remember"

When current-task questions, code/debug, or already-discussed-this-session → no consult (saves cost).

### Manual fallback (if auto-recall misses)

```
/BMad:agents:scribe *recall <question>
```

Tip to type fast: `/scribe` → pick `/BMad:agents:scribe` from suggestions → press **Tab**.

---

## Stop capturing for sensitive content

Tell any agent: "stop capturing" or "this is sensitive". Captures pause for the rest of the session.

---

## Commands

Tip: type `/scribe` → pick `/BMad:agents:scribe` from the suggestion list → press **Tab** to autocomplete.

| Command                           | What it does              |
| --------------------------------- | ------------------------- |
| `/BMad:agents:scribe`             | Show help + ledger status |
| `/BMad:agents:scribe *recall <q>` | Query the ledger          |
| `/BMad:agents:scribe *help`       | Show commands             |

---

## FAQ

**Will it slow down my agent?**
No. Capture is part of the agent's normal turn. Zero extra API calls.

**Does it write to JIRA?**
No. Local files only.

**Can I edit ledger entries manually?**
Yes. They're plain markdown in `bmad-ledger/decisions.md` and `bmad-ledger/actions.md`.

**What if I delete `bmad-ledger/`?**
Re-run `npx bmad-stella install`. Skeleton recreated. Past entries lost.

**Is it shared across team?**
No. `bmad-ledger/` is gitignored. Each developer has their own.

---

## Troubleshooting

| Problem                                    | Fix                                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `*recall` returns "Ledger not initialized" | Run `npx bmad-stella install`                                                                                                           |
| Typing `/scribe` says "Unknown command"    | Use full command `/BMad:agents:scribe` (Claude Code namespaces all BMAD agents). Tip: type `/scribe`, pick from suggestions, press Tab. |
| Permission prompt on every capture         | Re-run installer, accept permissions when prompted                                                                                      |
| Captures stopped happening                 | Check if you said "stop capturing" earlier; re-enable explicitly                                                                        |
| Index says entry exists but file missing   | Manual edit `bmad-ledger/index.yaml` to remove the orphan entry                                                                         |

For deeper issues, inspect `bmad-ledger/index.yaml` directly.
