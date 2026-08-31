# BMad Memory

## What it does

Agents remember your project across sessions — what was built, what failed, which utilities to reuse, and how you like to work. Fully automatic, no commands.

## How it works

Once a day, your first prompt spawns a silent background job that scans recently completed plan files and updates memory:

| Memory          | What it holds                                               | Who reads it                             |
| --------------- | ----------------------------------------------------------- | ---------------------------------------- |
| **Domain map**  | Business context, core entities, invariants                 | All agents, injected at activation       |
| **Patterns**    | Verified reusable base classes / utilities, ranked by usage | All agents, injected at activation       |
| **Episodes**    | Compressed history of past plans, per module area           | Planner, for the relevant module         |
| **Semantic**    | Distilled current-state knowledge, per domain               | Planner, for the relevant domain         |
| **Lessons**     | Rules learned from past agent failures, per module          | Planner, for the relevant module         |
| **Constraints** | Active temporary constraints (e.g. "migration in progress") | All agents, until the constraint expires |

Separately, a user-wide hook watches for your corrections ("don't do X", "I said before…") and updates your developer profile at `~/.claude/personalization.md` — applied in every session, in every project.

**You are never interrupted.** Everything runs detached in the background — nothing waits, nothing prints into your chat.

## Where it lives

- `bmad-docs/memory/` — project memory, git-ignored, **per developer** (yours only)
- `bmad-docs/memory/MEMORY.md` — the index; open it to see what the agents know
- `~/.claude/personalization.md` — your cross-project developer profile

**Moving to a new PC?** Copy `bmad-docs/memory/` and `~/.claude/personalization.md` to the same paths.

## Troubleshooting

Every action and skip reason is logged to:

```
~/.claude/bmad-hooks/bmad_hooks_debug.log
```
