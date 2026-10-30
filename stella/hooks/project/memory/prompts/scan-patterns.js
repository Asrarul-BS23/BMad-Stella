'use strict';

/**
 * Prompt for reuse-pattern distillation — explores the codebase (Glob/Read/Grep) to find
 * things that are ACTUALLY widely reused, verified by reference count, not guessed by folder name.
 * Called by pattern-scanner.js at install time and weekly by daily-job.js.
 */
function buildScanPatternsFromCodePrompt({ cwd, today }) {
  return `You are exploring a software project's source code to find things that are ACTUALLY widely reused —
base classes, wrappers, shared utilities — so they get extended/imported instead of recreated.

PROJECT ROOT: ${cwd}

Use Glob, Read, and Grep. For each candidate (base class, utility, constants pattern, result wrapper,
validation helper, auth pattern, mapper, cache wrapper):
- Grep to count DISTINCT files that import/extend/inherit it. Keep only entries with >= 3 distinct
  referencing files. Discard anything used once or only within its own folder.
- Open the file briefly to confirm the real import/using statement and what it exposes — write the
  exact copy-pasteable line, not a guessed path.
- If you notice the same kind of thing named inconsistently across the codebase (e.g. both
  "Constants" and "Constant" folders, or "Helpers" vs "Extensions"), note it as its own line so
  future greps don't miss half the codebase.

TASK: Produce patterns.md with this exact structure:

---
type: reuse-patterns
project: "[project name from code or root folder]"
last-updated: "${today}"
---

## Reuse these — do not recreate

[One line per entry, ranked by count descending, hard cap 15 entries. Format:]
[exact import/using statement or file path]          # N files
[Add a naming-inconsistency line only where relevant, same list, e.g.:]
Note: both Constants/ and Constant/ exist — check both

Optional grouping if the list is long (use only if it aids scanning, otherwise keep one flat list):
## Base classes — extend
## Shared utilities — import

Rules:
- Copy-pasteable line, zero inference needed at use time
- Count is evidence — only include what you verified via Grep, never estimate
- Threshold >= 3 distinct files, cap 15 entries total
- No file trees, no directory listings
- Keep the whole file under 30 lines
- You have NO file-write access — do not use a Write/Edit tool or attempt to save anything yourself.
  Just return the file content as your final text response; the calling process saves it.
- Output ONLY the file content`;
}

module.exports = { buildScanPatternsFromCodePrompt };
