# BMad Semantic Logger

## What it does

Automatically audits your planner/dev sessions and reports every point where an agent failed to act correctly on its own and a human had to step in — classified by failure mode, attribution, and detection, with verbatim evidence. Smooth sessions produce an empty report; approvals and designed workflow gates are never counted as friction.

## How it works

1. When a planner/dev session ends, the session is recorded against the implementation plan it worked on.
2. When the plan reaches **Ready for Review** or **Ready for Done**, the next session start triggers a background analysis of all recorded sessions for that plan.
3. The report is saved locally, then published to your project's page under **BMAD SEMANTIC LOGS** in Confluence (set up automatically at install — no configuration needed).

**You are never interrupted.** All work runs in a detached background process — sessions never wait, and nothing is ever printed into your chat. If Confluence is unreachable, the report stays local and upload retries silently on later sessions (max 3 attempts).

## How to see the logs

- **Confluence (team view):** open [BMAD SEMANTIC LOGS](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1481244674/BMAD+SEMANTIC+LOGS) → click your project → open the page based on your plan file, e.g. `AIL-518 — Chat Sidebar`.
- **Local (your machine):** `bmad-docs/bmad-logs/{PLAN-ID}/friction.md` (readable) and `friction.json` (data).

## Troubleshooting

Every action and skip reason is written to a debug log:

```
bmad-docs/bmad-logs/.hook-debug.log
```

Check it if a report seems missing or a Confluence page didn't appear.
