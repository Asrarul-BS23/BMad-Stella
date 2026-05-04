<!-- Powered by BMAD™ Core -->

# Compact Ledger

Move session files older than 10 days from `bmad-ledger/sessions/` to `bmad-ledger/archive/`.

## Triggers

- `/scribe *compact` (manual)
- Auto on agent activation (lightweight check, see scribe-protocol.md)

## Steps

1. List all files in `bmad-ledger/sessions/*.md`.

2. For each file:
   - Read `mtime` (last modification time).
   - Compute age in days = `(now - mtime) / 86400`.
   - If age > 10 days:
     - Move file → `bmad-ledger/archive/{filename}`.
     - Update `bmad-ledger/index.yaml`:
       - For every entry where `session` matches this file's session_id → set `location: archive/{filename}`.
   - Else: skip.

3. Atomic write of updated index.yaml (write `.tmp`, rename).

4. Report summary:
   ```
   Compacted: N files moved to archive.
   Active sessions: M.
   ```

## Skip rules

Skip files where:

- `mtime` is within last 10 days.
- File is currently being written (mtime within last 60 seconds — guard against mid-write).

## No deletion

Never delete archived files. Never delete index entries. Compaction = relocation only.

## Path scope — STRICT

Operates only inside `bmad-ledger/`. Move sources from `sessions/`. Move targets to `archive/`. No other paths touched.

## Failure handling

| Case                    | Response                               |
| ----------------------- | -------------------------------------- |
| `bmad-ledger/` missing  | "Ledger not initialized." Skip.        |
| Move fails (permission) | Log warning, skip file, continue rest. |
| Index update fails      | Roll back move (move file back), skip. |

## Output

One-line summary on success:

```
✓ Compacted N file(s) → archive/
```

Silent if zero files moved.
