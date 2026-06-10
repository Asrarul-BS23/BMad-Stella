# Project Memory Index

> Auto-managed by BMad memory system. Do not edit manually.

## Always Injected

- **Domain Map** — `domain-map.md` (business context, core entities, invariants)
- **Active Constraints** — `constraints/` (in-progress migrations, policies, blocking work)

## Retrieved On Demand

Injected when `/BMadPlanner`, `/BMadDev`, or `/quick-dev` is invoked for a matching module.

| Type     | Path        | What                                                    |
| -------- | ----------- | ------------------------------------------------------- |
| Episodes | `episodes/` | Feature-area history (one file per specific area)       |
| Semantic | `semantic/` | Distilled current-state knowledge (one file per domain) |
| Lessons  | `lessons/`  | Agent failure rules (never repeat)                      |
| Patterns | `patterns/` | Reference implementations, reuse index                  |

## Notes

- `bmad-docs/memory/` is gitignored — each developer has independent local memory.
- Memory grows automatically. No manual editing required.
- PC migration: copy `~/.claude/personalization.md` + `bmad-docs/memory/` to same paths on new machine.
