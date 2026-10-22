# Maintaining BMad-Stella

For whoever changes this repo. Read before touching `stella/skills/stella-build/`.

## The design

- BMad v6.12.2 is installed unchanged by the official installer. We never edit its files.
- Stella adds: five plain skills under `stella/skills/`, project hooks under `stella/hooks/project/`, helpers and checklists copied to `_bmad/custom/stella/`, and the installer in `tools/installer/`.
- `stella-build` is a byte-for-byte copy of the official `bmad-build` skill. The pristine original is in `tests/fixtures/bmad-build-6.12.2/`. Every difference is listed in `stella/skills/stella-build/CHANGES.md` and locked by `tests/stella-build/test-drift.js`. Settings go in the skill's `customize.toml`; step files are edited only for what a setting cannot express.

## Change stella-build

1. Make the change. Prefer `customize.toml`.
2. Add a rule to `ALLOWED` in `tests/stella-build/test-drift.js` (fixture line, `from`, `to`).
3. Add the line to `CHANGES.md` with the reason and date.
4. `npm test` must be green. The drift test fails on any unlisted change.

## Bump BMad

1. Run the official installer for the new version into a temp folder and copy its `bmad-build` skill over `tests/fixtures/bmad-build-<version>/`. Update `SOURCE.md`.
2. Copy the same files over `stella/skills/stella-build/`, then re-apply every line in `CHANGES.md`.
3. Update `BMAD_VERSION` in `tools/installer/lib/constants.js` and the fixture path in the drift test.
4. `npm test`, then a real install into a temp folder.

## Tests

```
npm test
```

Runs every `tests/*/test-*.js`. Lint and format:

```
npx eslint . && npx prettier --check .
```

Real install end to end (needs network and a token):

```
STELLA_INSTALL_E2E=1 JIRA_EMAIL=... JIRA_API_TOKEN=... STELLA_PROJECT=... npm test
```

## Release

Developers install from the branch tip: `npx github:Asrarul-BS23/BMad-Stella#v6 install`. Merge to the branch they use, then tag:

```
git tag v2.x.y && git push --tags
```

## Rules

- Never commit from a skill or hook. Developers commit by hand.
- Hooks never throw or print into a session. Failures go to `_bmad-output/stella/bmad-logs/.hook-debug.log`.
- Hook commands are anchored to `${CLAUDE_PROJECT_DIR}`. Relative paths break after a `cd`.
- Project hooks and helpers are CommonJS. The installer writes a `package.json` with `"type": "commonjs"` next to them for projects that use ES modules.
