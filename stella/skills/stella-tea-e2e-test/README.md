# stella-tea-testing

A custom TEA skill for the Stella QA team. One run takes one Jira ticket or one system module through: scenario design (via `bmad-tea-test-design`, unmodified) → human lock → tabular test cases → human lock → live execution via Playwright MCP → evidence-backed report and trace coverage record. A second flow, dev mode, is a shift-left bug hunt for an implemented ticket before QA handoff.

Design source of truth: `rnd_docs/qa-custom-skill-design-decision.md` in the TEA fork.

## Requirements

In the target project:

- TEA installed and set up (`_bmad/` present, `bmad setup tea` done), including the `bmod-tea` knowledge base and `bmad-tea-test-design`
- **Playwright MCP** connected (execution and UI exploration refuse to run without it)
- **Atlassian MCP** connected — required for ticket runs (Jira fetch) and for publication

## Install

```bash
npx skills add <internal-repo-url>   # or the path to this skill folder
```

Then attach it to Murat's menu — add to `{project-root}/_bmad/custom/bmad-tea.toml` (team) or `bmad-tea.user.toml` (personal):

```toml
[[agent.menu]]
code = "SQ"
description = "Stella QA Testing — ticket/module scenarios, locked test cases, live Playwright execution with evidence"
skill = "stella-tea-testing"

[[agent.menu]]
code = "SD"
description = "Stella Dev Bug Hunt — test your implemented ticket from its spec before QA handoff"
skill = "stella-tea-testing"
```

`SQ` presets the QA flow, `SD` the dev flow; both point at the same skill (`flow_mode` routing). Start a fresh chat so `bmad-tea` picks up the menu.

## Configure

Copy the two templates from this skill's `config/` folder into `{project-root}/_bmad/custom/` and fill them in:

- `stella-tea-testing.user.toml` — environments (base URLs, role-keyed users), defaults. Gitignored; non-secret only.
- `stella-tea-testing.secrets.env` — password values, referenced by name (`password_env`) from the TOML. Gitignored.

Secret resolution order at run time: `secrets.env` → OS environment variable → ask. Any missing config value is asked for, never fatal; the skill offers to rewrite a wiped config from these templates.

## Artifacts

Everything for one `{key}` lands under `{test_artifacts}/stella/{key}/`: `ticket-brief.md`, `scenarios.md` + `exploration/`, `test-cases.md`, timestamped `test-execution-{env}-{datetime}.md` reports, `evidence/{datetime}/`, and `progress.md` (resume checkpoint). QA runs also merge coverage records into `{test_artifacts}/live-verification-results.json`, which TEA's `trace` reads; dev runs never do.

## Entry Points

- **Create** starts a fresh run; **Resume** continues an interrupted QA run from the key's checkpoint — later phases (case generation, execution) are re-entered through Resume, not extra menu codes.
- **Edit** revises scenarios or cases with change propagation; **Validate** checks a key's artifacts against `checklist.md`.
