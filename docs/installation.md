# Installation

## Requirements

One-time setup on your machine. Nothing here is repeated per project.

- Node 20.10+, Python 3.11+, `uv`, `git`. `gh` if you will use PR review.
- Claude Code, with the Atlassian connector connected in your Claude account.
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

Your Atlassian email and API token. Verified, then saved in `_bmad-output/stella/.bmad-tokens/.env` (git-ignored).

```
│ ◇ Select your project: LEADRS
```

Your project, from the list. This selects the domain docs that are fetched.

```
└ Ready.  LEADRS is set up in LEADRS_CORE_SR
```

Done. Open Claude Code in the same folder and start with [user-guide.md](user-guide.md).

## Re-run

Run the same command again to update. Credentials: "Use them as is?" The project list is shown every time. Everything under `_bmad-output/` is kept.

## Problems

- `uv is required`: install it from https://docs.astral.sh/uv/getting-started/installation/ and re-run.
- Install fails in the BMad step: re-run with `--verbose` to see BMad's own output.
- Always open Claude Code at the project root, not in a subfolder. Hooks are registered there.
