# BMad-Stella

A thin Stella layer on top of the official [BMad Method](https://github.com/bmad-code-org/BMAD-METHOD) v6.12.2 for Claude Code: one install command, Jira-driven builds, security and PR review skills, a project domain expert, and a friction log of every build session.

## Install

Run in the project folder, with Claude Code already installed:

```
npx github:Asrarul-BS23/BMad-Stella#v6 install
```

Two questions (Atlassian credentials, project), about a minute. Details: [Installation Guide](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1649147911/Installation-Guide).

## Skills

| Command                      | What it does                                           |
| ---------------------------- | ------------------------------------------------------ |
| `/stella-build <JIRA key>`   | Plans, implements and reviews a ticket. Never commits. |
| `/stella-security <spec>`    | Security audit of what a build changed.                |
| `/stella-pr-review <PR url>` | Reviews a pull request against its ticket. Read-only.  |
| `/stella-domain-expert`      | Answers questions from the project's domain docs.      |
| `/stella-project-context`    | Writes the project context every session loads.        |
| `/caveman`                   | Terse chat mode.                                       |

## Docs

- [Installation](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1649147911/Installation-Guide)
- [Atlassian token](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1544486919/Atlassian-Token-Guide)
- [User guide](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1167622152/BMAD+Stella+User+Guide), the daily loop from ticket to PR
- [stella-build](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1650950184/Stella+Build)
- [PR review](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1609760769/PR+Review+Guide)
- [Project context](docs/project-context.md)

## Requirements

Node 20.10+, `git`, Claude Code. `gh` for PR review. uv and Python are installed for you if missing.

## License

MIT
