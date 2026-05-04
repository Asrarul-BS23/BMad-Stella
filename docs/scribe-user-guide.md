# Scribe — Memory Ledger User Guide

Cross-session memory for BMAD. Captures decisions, actions, and open questions automatically. Recall anytime via one command.

---

## What it does

While you work with any BMAD agent (planner, dev, qa, reviewer, etc.), the scribe protocol captures key items to a local ledger. Survives session restarts, persona switches, and context-window compaction.

---

## What gets captured

| Type                                 | Example                         |
| ------------------------------------ | ------------------------------- |
| **Decision**                         | "Use JWT not sessions for auth" |
| **Action** (persistent state change) | "Migrated user table to UUIDs"  |
| **Open question**                    | "Refresh token cadence?"        |

Skipped: acknowledgements, status reads, repeats, ephemeral actions (read/test/search).

---

## Where it lives

```
your-project/
└── bmad-ledger/         (gitignored — local to your machine)
    ├── sessions/        active session files (≤10 days)
    ├── archive/         older sessions (>10 days)
    └── index.yaml       master metadata
```

---

## Capture (automatic)

Just work with any BMAD agent. Captures happen silently. After a captured turn, you'll see one line:

```
📝 captured: DEC-2026-04-30-001 — Auth: JWT
```

No setup. No commands. Just works.

---

## Recall (on demand)

```
/scribe *recall <question or topic>
```

Examples:

```
/scribe *recall what auth decisions have we made?
/scribe *recall JIRA-451
/scribe *recall open questions about caching
```

Sam (the scribe utility) answers with a synthesis grounded in the ledger, with references to specific entries. Your active agent (planner/dev/etc.) is **not** disrupted — control returns to it after.

---

## Compaction

**Automatic.** Every time you activate any BMAD agent, files older than 10 days are silently moved to `bmad-ledger/archive/`. No action needed. Recall still finds archived entries.

Manual trigger (rarely needed — only if you want to force compaction immediately):

```
/scribe *compact
```

---

## Stop capturing for sensitive content

Tell any agent: "stop capturing" or "this is sensitive". Captures pause for the rest of the session.

---

## Commands

| Command               | What it does                                                                      |
| --------------------- | --------------------------------------------------------------------------------- |
| `/scribe`             | Show help + ledger status                                                         |
| `/scribe *recall <q>` | Query the ledger                                                                  |
| `/scribe *compact`    | Force-run compaction now (compaction is also automatic on every agent activation) |
| `/scribe *help`       | Show commands                                                                     |

---

## FAQ

**Will it slow down my agent?**
No. Capture is part of the agent's normal turn. Zero extra API calls.

**Does it write to JIRA?**
No. Local files only.

**Can I edit ledger entries manually?**
Yes. They're plain markdown in `bmad-ledger/sessions/*.md`.

**What if I delete `bmad-ledger/`?**
Re-run `npx bmad-stella install`. Skeleton recreated. Past entries lost.

**Is it shared across team?**
No. `bmad-ledger/` is gitignored. Each developer has their own.

---

## Troubleshooting

| Problem                                    | Fix                                                              |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `*recall` returns "Ledger not initialized" | Run `npx bmad-stella install`                                    |
| Permission prompt on every capture         | Re-run installer, accept permissions when prompted               |
| Captures stopped happening                 | Check if you said "stop capturing" earlier; re-enable explicitly |
| Index says entry exists but file missing   | Manual edit `bmad-ledger/index.yaml` to remove the orphan entry  |

For deeper issues, inspect `bmad-ledger/index.yaml` directly.
