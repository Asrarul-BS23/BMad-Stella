# Scribe — Notes Capture User Guide

Cross-session notes for BMAD. Every agent automatically captures decisions and findings to a single local file as you work.

---

## What it does

While you work with any BMAD agent (planner, dev, qa, reviewer, etc.), the scribe protocol appends key items to a local notes file. Survives session restarts, persona switches, and context-window compaction.

---

## What gets captured

A NOTE entry is written whenever a turn produces a **decision** — choice/approach, adoption, rejection, constraint, trade-off, scope, status change, lesson, finding, or acceptance criteria.

Skipped: acknowledgements, status reads, repeats, mid-work edits, pure exploration, ephemeral reads/searches/tests.

---

## Where it lives

```
your-project/
└── bmad-docs/
    └── bmad-notes/
        └── notes.md    ← single append-only file
```

The installer creates this on first install. It's gitignored along with the rest of `bmad-docs/` — each developer has their own.

---

## Capture (automatic)

Just work with any BMAD agent. Captures happen silently. After a captured turn, you'll see one line in the agent's reply:

```
📝 captured: NOTE-2026-05-14-183215-422 — Auth: JWT
```

No setup. No commands. Just works.

---

## Recall (manual)

Open `bmad-docs/bmad-notes/notes.md` directly, or grep it:

```
grep "auth" bmad-docs/bmad-notes/notes.md
grep "NOTE-2026-05" bmad-docs/bmad-notes/notes.md
```

Each entry has the ID, title, body, ref, agent, and tags so finding past decisions is straightforward.

---

## Entry format

```
## NOTE-2026-05-14-183215-422  Auth: JWT
Picked JWT over sessions because of stateless requirement.
ref: JIRA-451
agent: planner
tags: [auth, architecture]
```

Supersession and revoke markers are appended (never rewrite old entries):

```
> [SUPERSEDED] 2026-05-20 → NOTE-2026-05-20-091011-001
> [REVOKED] 2026-05-21 reason: scope dropped
```

---

## Stop capturing for sensitive content

Tell any agent: "stop capturing" or "this is sensitive". Captures pause for the rest of the session.

---

## FAQ

**Will it slow down my agent?**
No. Capture is part of the agent's normal turn. Zero extra API calls.

**Does it write to JIRA?**
No. Local file only.

**Can I edit notes manually?**
Yes. It's plain markdown. Use supersession/revoke markers instead of rewriting old entries.

**What if I delete `bmad-docs/bmad-notes/`?**
Either re-run `npx bmad-stella install` or let an agent re-create it via the protocol's bootstrap fallback on the next capture.

**Is it shared across the team?**
No. `bmad-docs/` is gitignored. Each developer has their own.

---

## Troubleshooting

| Problem                            | Fix                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Notes file missing                 | Run `npx bmad-stella install` to recreate it, or trust the agent's bootstrap fallback on next capture |
| Permission prompt on every capture | Re-run installer, accept permissions when prompted                                                    |
| Captures stopped happening         | Check if you said "stop capturing" earlier; re-enable explicitly                                      |
| Notes look duplicated or corrupted | Edit `bmad-docs/bmad-notes/notes.md` directly — it's plain markdown                                   |
