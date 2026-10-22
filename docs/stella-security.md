# stella-security

Security audit of the files a build changed. Reads code, never edits it.

## Run

```
/stella-security _bmad-output/implementation-artifacts/spec-leadrsc-4901-....md
```

Pass the spec written by `stella-build`. The spec must be implemented (status not `draft`).

## What it does

1. Collects the changed files from the spec and from `git diff` since the build's baseline.
2. Splits them into frontend and backend.
3. Checks each file against the Stella frontend and backend security checklists in `_bmad/custom/stella/checklists/`.
4. Writes a `## Security Violations` section into the spec and prints a summary by severity.

## Read the result

Each violation is one line: severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), what is wrong, `file:line`, the fix.

Fix by hand or with `/stella-build` and the spec path, then run the audit again. The section is replaced.

## Good to know

- Chat and the written section are in caveman style.
- Files under `_bmad/`, `_bmad-output/` and `.claude/` are never audited.
- Nothing is posted anywhere. The spec is the only file written.
