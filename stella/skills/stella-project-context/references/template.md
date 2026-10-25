# File shapes

Contents: Marked lines · Provenance line · project.md (Orientation, Policy, Where things are, Running and verifying, Conventions that differ from defaults, Known pitfalls) · architecture.md (Layers, Request flow, Data, Wiring, Background and integrations, Cross-component rules, Canonical files) · Worked fragment.

Two files under `{project-root}/project-context/`. Sections in the order given. **Omit any section with nothing that passes its rule; never write an empty one.** Admission rules: `best-practices.md`.

Style for both: terse imperative lines under plain headings. No prose beyond Orientation, no introduction, no summary. A bare fact appears only as the justification clause of an instruction: "Exclude `vendor/` from searches, it is 60% of tracked files", never "`vendor/` is 60% of tracked files". A prohibition names the alternative in the same line. At most two emphasis markers per file. Every path exists at the verified SHA.

## Marked lines

What the evidence suggests but only the runner can confirm. One line, in the section it belongs to, in this shape:

```
- Unverified: <the claim>. Edit this line or delete it.
```

At most three across both files. Refresh keeps an edited one as written and reports an untouched one as still open.

Line 1 of each file is the provenance line:

```
<!-- Verified YYYY-MM-DD against <short sha>. Managed by stella-project-context; refresh re-verifies every line. -->
```

Without git, `<short sha>` is `none`.

## project.md (≤ 60 lines)

```
# <Project name>

## Orientation
```

Three or four sentences: what the system is and for whom, the stack, where planning and deeper docs live, and where the team's auto-loaded rules are (`CLAUDE.md`, `AGENTS.md`) when they exist. If a doc is known to be stale, say which. End with "Code and architecture tests beat any doc; flag the doc."

```
## Policy
```

What humans require and no linter, test or config enforces. Each line from a source file, an enforcing config, a memory note or a marked line, never inferred from code. Six kinds, nothing else:

- Secrets: files that hold credentials and must never be staged, printed or copied.
- Frozen and dead areas: folders never edited, revived or referenced, and where new work goes instead.
- Generated and binary files: never hand-edited, and the command or owner that changes them.
- Approval areas: where the agent stops and asks before editing.
- External systems: what the agent may do with Jira, Confluence, databases, APIs.
- Same-PR obligations: docs or logs that must change with the code.

No branch, commit, push or PR rules. Developers do git by hand and `stella-build` never commits.

```
## Where things are
```

One line per area: entry points and the folder each kind of thing lives in. Only what an agent would otherwise search for. Not a directory tree.

```
## Running and verifying
```

Only where the obvious guess is wrong: the real test gate, what CI does not cover, services that must be up first, how to read a misleading failure, required tool versions read from the project files that declare them. A command whose obvious invocation is already right lives in the manifest and gets no line.

```
## Conventions that differ from defaults
```

How this repo deviates from the framework or ecosystem norm. An agent follows the norm unless told, so only the divergences earn a line.

```
## Known pitfalls
```

Observed mistakes only, each with its evidence in the justification clause. Never "this looks dangerous".

## architecture.md (≤ 90 lines)

```
# Architecture — <Project name>
```

One line under the title: where decisions with evidence live, and that code and architecture tests beat this file.

```
## Layers
```

A table: layer, project or folder path, what it may reference, what it owns. Enforced by which test or manifest, when one exists.

```
## Request flow
```

Numbered steps from entry point to response: middleware order, controller or handler base, auth resolution, pipeline behaviours in order, the handler's allowed dependencies, the save path and what it does on the way, result mapping. Each step names its file.

```
## Data
```

Contexts or databases and what each owns, transaction rules, how schema changes are made, legacy or secondary stores and the only way to reach them.

```
## Wiring
```

How things get registered: the DI entry point, module flags, markers, what is auto-registered and what is by hand, what is silently skipped when a marker is missing.

```
## Background and integrations
```

Jobs, queues, consumers, external APIs, reporting: one line each with its entry file.

```
## Cross-component rules
```

What must stay true across parts the agent cannot see from one file: who may depend on whom, how data must flow, what order a pipeline runs in, where labels, cache keys or constants may live. Admitted only when breaking it in one file breaks something elsewhere.

```
## Canonical files
```

One existing path per thing to add: endpoint, command, query, DTO, mapper, config, schema script, service, background job, test. "Copy the shape from this file, not from older neighbours." Pointers only, never pasted code.

## Worked fragment

```markdown
<!-- Verified 2026-10-16 against c32c6dd. Managed by stella-project-context; refresh re-verifies every line. -->

# acme-billing

## Orientation

Payment processing for Acme storefronts. TypeScript/Node, pnpm, Postgres. Planning in `docs/planning/`; team rules in `CLAUDE.md`. Code and architecture tests beat any doc; flag the doc.

## Policy

- Never stage `.env*` or `config/secrets/`; values come from the vault at deploy time.
- Never edit `legacy/`, it is frozen and being replaced; new work goes in `src/`.
- Never hand-edit `src/generated/`; run `pnpm codegen`.
- Ask before touching `src/auth/` or any migration.
- Unverified: `legacy-import/` has no commits since 2024 and may be dead. Edit this line or delete it.

## Running and verifying

- Integration tests need `docker compose up -d` first; without it they fail with a connection error that looks like a code bug.
- CI also runs `pnpm typecheck`, which `pnpm test` does not cover.

## Known pitfalls

- Use vitest matchers, not jest; agents added jest syntax in three PRs (`docs/lessons.md` §2).
```
