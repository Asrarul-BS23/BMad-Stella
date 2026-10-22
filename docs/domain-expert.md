# Domain expert

Sage answers questions about the project from its domain docs, always naming the source file.

## Run

```
/stella-domain-expert
```

Loads every file under `_bmad-output/stella/domain-knowledge/` (fetched by the installer from the project's Confluence page) and shows the command list.

## Commands

```
*ask How is a case reopened?
```

Answer from the docs, with the source.

```
*explain signing workflow
```

Longer explanation of a component, API or concept.

```
*decide Should the new export go through the queue?
```

Recommendation aligned with the project's existing patterns.

```
*onboard
```

Guided introduction for a new developer.

```
*search retention
```

Every mention of a term across the loaded docs.

```
*status
```

Which files are loaded.

```
*exit
```

Leaves Sage. A message without `*` is treated as `*ask`.

## Good to know

- Knowledge base only. Sage does not scan the code unless you allow it explicitly.
- No domain docs: Sage says so. Delete `_bmad-output/stella/domain-knowledge/` and re-run the installer to fetch them again.
- Chat is in caveman style.
