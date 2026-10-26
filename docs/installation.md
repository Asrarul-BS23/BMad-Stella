# Installation

## Requirements

One-time setup on your machine. Nothing here is repeated per project.

- Node 20.10+, `git`. `gh` if you will use PR review. uv and Python are installed for you if missing.
- Claude Code.
- An Atlassian API token: [atlassian-token.md](atlassian-token.md).

## Install

Open a terminal in the project folder

```
npx github:Asrarul-BS23/BMad-Stella#v6 install
```

You are asked for two things.

```
│ ◇ Atlassian account email: you@stellainternational.com
│ ◇ Atlassian API token (https://id.atlassian.com/manage-profile/security/api-tokens): ****
```

Your Atlassian email and API token. Verified, then saved once per machine in `~/.claude/stella/credentials.env`. Already saved and still valid: nothing is asked. Upgrading from the old BMad-Stella: saved credentials that still work are moved there without asking; otherwise email and token are asked, email prefilled.

```
│ ◇ Select your project: LEADRS
```

Your project, from the list. This selects the domain docs that are fetched.

```
└ Ready.  LEADRS is set up in LEADRS_CORE_SR
```

Done. Open Claude Code in the same folder and run `/mcp`. If `atlassian` shows as not authenticated, pick it and finish the browser login.

## Re-run

Run the same command again to update. Credentials are checked silently; you are asked only when the token no longer works. The project list is shown every time. Everything under `_bmad-output/` is kept.

## Problems

- `uv could not be installed`: no network or a blocked download. Install it by hand from https://docs.astral.sh/uv/getting-started/installation/ and re-run.
- `Atlassian MCP not registered — claude command not found`: the `claude` command is not on your PATH. Install the Claude Code CLI and re-run.
- `Jira token expired`: put a new token in `~/.claude/stella/credentials.env` (`JIRA_API_TOKEN`). Until then builds fall back to the Atlassian MCP, without attachments.
- `Jira token file missing`: run the installer again.
- Install fails in the BMad step: re-run with `--verbose` to see BMad's own output.
- Always open Claude Code at the project root, not in a subfolder. Hooks are registered there.
