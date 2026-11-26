---
name: stella-investigate
description: 'Answers a question, finds the cause of a problem, or compares two environments, from the code and evidence of a named environment (dev, staging, production). Read-only on the code; enforced by the guard hook. Use only when the user invokes /stella-investigate or clearly asks to investigate a problem or to check how a named environment behaves. Never start it during other work. Not for fixing code (stella-build) and not for questions about the domain docs (stella-domain-expert).'
---

Run the following command exactly once without changing the current working directory. Replace `{project-root}` with the absolute path to the project root and `{skill-root}` with the absolute path to this skill's directory:

```bash
uv run --no-cache "{project-root}/_bmad/scripts/render_skill.py" --project-root "{project-root}" --skill "{skill-root}"
```

- On success, read and follow the one absolute `workflow.md` instruction printed to stdout.
- On failure (including `uv` being unavailable), report the command output and HALT. Do not run any workflow source directly. When the project has no `_bmad/` folder, BMad-Stella is not set up there: also tell the user to run `/stella-init`.
