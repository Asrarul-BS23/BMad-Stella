# Installation

## Requirements

One-time setup on your machine. Nothing here is repeated per project.

- Node 20.10+, `git`. `gh` if you will use PR review. uv and Python are installed for you if missing.
- Claude Code.
- An Atlassian API token: [Atlassian Token Guide](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1544486919/Atlassian-Token-Guide).

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

Done.

## Install once per machine (user-level)

Instead of installing in every project, set the machine up once:

```
npx github:Asrarul-BS23/BMad-Stella#v6 setup
```

It asks for your Atlassian email and token (only when none is saved). Then it checks whether the `bmad-stella` plugin is already installed.

Not installed: one question.

```
│ ◇ Do you want plugins for Claude Desktop? (y/N)
```

- **Yes**: adds the marketplace and installs the `bmad-stella` plugin. Skills and hooks then load in the Claude Code CLI, the VS Code extension and the Claude Desktop Code tab.
- **No**: skills and hooks are copied to `~/.claude/` instead. No plugin is installed.

Already installed: nothing is asked. The plugin is uninstalled and installed again, so it is updated together with this BMad-Stella version.

About 90 seconds. Everything goes under `~/.claude/`; no project is touched.

Then, once in each project, open Claude Code in the project folder and run:

```
/stella-init
```

It asks for the project, copies `_bmad/` from the machine's master copy and creates `_bmad-output/`. A few seconds, no download. Memory and project context are collected in the background; `/stella-init status` shows where they are.

- A new session in a git repository that is not set up prints one line: run `/stella-init`.
- `_bmad/` already in a parent folder, or in one direct child folder: that folder is the project root. No second `_bmad/` is created.
- Run `setup` again to update. Each project's `_bmad/` is then refreshed by itself at the next session start. Files in `_bmad/custom/` and everything under `_bmad-output/` are kept.
- A project installed with `install` (above) keeps working. `/stella-init` switches it to the user-level install.

## Plugin (optional, once per machine)

The Stella skills and hooks are also available as a Claude Code plugin. Installed once, they load in every session on this machine — Claude Code CLI, the VS Code extension, and the Claude Desktop Code tab:

```
claude plugin marketplace add Asrarul-BS23/BMad-Stella
claude plugin install bmad-stella@stella
```

- `bmad-stella@stella` means plugin `bmad-stella` from the marketplace named `stella` (the name in the repo's `.claude-plugin/marketplace.json`).
- The marketplace is read from the repository's default branch. Private repo: your git credentials must clone it without prompting (`gh auth setup-git` works).
- Cowork does not read machine installs. Use the claude.ai steps in the next section instead.
- The plugin does not replace the project install above. Skills run the project's `_bmad/` scripts, so a project without `npx ... install` halts with a clear error.
- Plugin skills are namespaced: `/bmad-stella:stella-build`. The bare `/stella-build` form works too.
- Install the plugin first, then run the project install. The installer detects the plugin and skips its own project-level skill and hook copies; on a project installed before the plugin existed, re-running the installer removes the old copies.

## Cowork

Cowork ignores plugins installed with the `claude plugin` commands. Add the plugin on claude.ai:

1. Open claude.ai > **Customize** > **Plugins**.
2. **+ Add** > **Add marketplace**, enter `Asrarul-BS23/BMad-Stella`, confirm.
3. Go to the **Discover** tab, find **Bmad stella**, and click the **+** button on its card. This enables the plugin; it then appears under the **Yours** tab. The **Try** button only opens a chat with it and does not enable it.
4. In the Cowork session, run the project install at the project root:

```
npx github:Asrarul-BS23/BMad-Stella#v6 install
```

Step 4 is still needed. The plugin ships only the skills and hooks; they run the project's `_bmad/` scripts.

## Re-run

Run the same command again to update. Credentials are checked silently; you are asked only when the token no longer works. The project list is shown every time. Everything under `_bmad-output/` is kept.

## Problems

- `uv could not be installed`: no network or a blocked download. Install it by hand from https://docs.astral.sh/uv/getting-started/installation/ and re-run.
- `Atlassian MCP not registered — claude command not found`: the `claude` command is not on your PATH. Install the Claude Code CLI and re-run.
- `Jira token expired`: put a new token in `~/.claude/stella/credentials.env` (`JIRA_API_TOKEN`). Until then builds fall back to the Atlassian MCP, without attachments.
- `Jira token file missing`: run the installer again.
- Install fails in the BMad step: re-run with `--verbose` to see BMad's own output.
- Install fails in the TEA skills step (version/network issue): nothing is changed; re-run once
  the issue is resolved, or install the skill by hand per
  `stella/skills/stella-tea-live-testing/SKILL.md`.
- Always open Claude Code at the project root, not in a subfolder. Hooks are registered there.
