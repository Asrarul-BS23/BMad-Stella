# BMad-Stella

A thin Stella layer on top of the official [BMad Method](https://github.com/bmad-code-org/BMAD-METHOD) v6.12.2 for Claude Code: one install command, Jira-driven builds, security and PR review skills, a project domain expert, and a friction log of every build session.

## Install

Run in the project folder, with Claude Code already installed:

```
npx bmad-stella@latest install
```

`@latest` makes npx re-check the registry instead of reusing a stale cached copy. Installing from the repository (`npx github:<owner>/BMad-Stella install`) needs no suffix — npm re-resolves the branch's current commit on every run. The installer also cleans the npm cache itself before fetching BMad and the TEA skills.

Two questions (Atlassian credentials, project), about a minute. Details: [Installation Guide](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1649147911/Installation-Guide).

## Install once per machine

```
npx bmad-stella@latest setup
```

Sets the machine up under `~/.claude/` (credentials, skills, hooks, a master copy of `_bmad/`) and asks whether to install the plugin for Claude Desktop. After that, run `/stella-init` once in each project: it copies `_bmad/` from the master copy and creates `_bmad-output/`, with no download. The per-project `install` above keeps working.

## Plugin (skills and hooks, once per machine)

The skills and hooks also ship as a Claude Code plugin. One install covers the Claude Code CLI, the VS Code extension, and the Claude Desktop Code tab on that machine:

```
claude plugin marketplace add Asrarul-BS23/BMad-Stella
claude plugin install bmad-stella@stella
```

`stella` is the marketplace name, declared in this repo's `.claude-plugin/marketplace.json`. The marketplace is read from the repository's default branch.

For Cowork, add the same marketplace on your claude.ai account instead: Customize > Plugins > Add marketplace > `Asrarul-BS23/BMad-Stella`, then enable `bmad-stella`. Machine installs never reach Cowork.

The plugin does not replace the project install above: skills run against the project's `_bmad/` tree, which only `npx bmad-stella install` creates. Invoke plugin skills by their namespaced name, e.g. `/bmad-stella:stella-build`.

## Skills

| Command                      | What it does                                           |
| ---------------------------- | ------------------------------------------------------ |
| `/stella-build <JIRA key>`   | Plans, implements and reviews a ticket. Never commits. |
| `/stella-pr-review <PR url>` | Reviews a pull request against its ticket. Read-only.  |
| `/stella-domain-expert`      | Answers questions from the project's domain docs.      |
| `/stella-project-context`    | Redo the project context the installer generates.      |
| `/stella-init`               | Set up a project from the machine install.             |
| `/caveman`                   | Terse chat mode.                                       |

## Docs

- [Installation](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1649147911/Installation-Guide)
- [Atlassian token](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1544486919/Atlassian-Token-Guide)
- [User guide](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1167622152/BMAD+Stella+User+Guide), the daily loop from ticket to PR
- [stella-build](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1650950184/Stella+Build)
- [PR review](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1609760769/PR+Review+Guide)

## Requirements

Node 20.10+, `git`, Claude Code. `gh` for PR review. uv and Python are installed for you if missing.

## License

MIT
