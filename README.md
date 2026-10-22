# BMad-Stella

A thin Stella layer on top of the official [BMad Method](https://github.com/bmad-code-org/BMAD-METHOD) v6.12.2 for Claude Code: one install command, Jira-driven builds, security and PR review skills, a project domain expert, and a friction log of every build session.

## Install

Run in the project folder, with Claude Code already installed:

```
npx github:Asrarul-BS23/BMad-Stella#v6 install
```

Two questions (Atlassian credentials, project), about a minute. Details: [docs/installation.md](docs/installation.md).

## Skills

| Command                      | What it does                                            |
| ---------------------------- | ------------------------------------------------------- |
| `/stella-build <JIRA key>`   | Plans, implements and reviews a ticket. Never commits.  |
| `/stella-security <spec>`    | Security audit of what a build changed.                 |
| `/stella-pr-review <PR url>` | Reviews a pull request against its ticket. Read-only.   |
| `/stella-domain-expert`      | Answers questions from the project's domain docs.       |
| `/stella-project-context`    | Lead only. Writes the project context that builds load. |
| `/caveman`                   | Terse chat mode.                                        |

## Docs

- [Installation](docs/installation.md)
- [Atlassian token](docs/atlassian-token.md)
- [User guide](docs/user-guide.md), the daily loop from ticket to PR
- [stella-build](docs/stella-build.md)
- [stella-security](docs/stella-security.md)
- [PR review](docs/pr-review.md)
- [Domain expert](docs/domain-expert.md)
- [Friction logger](docs/friction-logger.md)
- [Project context](docs/project-context.md), for leads
- [Maintaining](docs/maintaining.md), for whoever maintains this repo

## Requirements

Node 20.10+, `git`, Claude Code. `gh` for PR review. uv and Python are installed for you if missing.

## License

MIT
