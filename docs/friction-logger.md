# Friction logger

Writes a log of every `stella-build` session: where the agent struggled, what the developer had to correct, how long things took. Nothing to do as a developer.

## When it fires

At the end of a Claude Code session in which you ran `/stella-build` and a spec reached `status: 'done'`.

## Where the log goes

```
_bmad-output/stella/bmad-logs/<ticket>/friction.md
```

Human-readable. `friction.json` next to it holds the same data for tools.

## Settings

`_bmad/custom/stella/friction.json`, written by the installer:

```json
{ "triggerStatuses": ["done"] }
```

Add a status to log sessions for specs that end in another state.

## Problems

```
_bmad-output/stella/bmad-logs/.hook-debug.log
```

Every hook run writes one line here. "no stella-build activation in session" means the session had no `/stella-build` call. Hooks never interrupt a session; all failures land in this file.
