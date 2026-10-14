# stella-build — changes against official bmad-build 6.12.2

Base: `bmad-build` from `bmad-method@6.12.2` (pristine copy in `tests/fixtures/bmad-build-6.12.2/`).
Every difference between this folder and the fixture must be listed here. `tests/stella-build/test-drift.js` enforces it: a file not listed below must be byte-identical to the fixture, and a listed file may differ only in the lines described.

## Changes

### SKILL.md

- Line 2: `name: bmad-build` → `name: stella-build`. Makes the copy a second, distinct skill in Claude Code. (Task 6b-1, 2026-10-14)
