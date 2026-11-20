# Installation

BMad-Stella is installed once per machine. Each project then needs one short command inside Claude Code.

## Requirements

- Node 20.10+, `git`. `gh` if you will use PR review. uv and Python are installed for you if missing.
- Claude Code.
- An Atlassian API token. Create it at exactly this address: https://id.atlassian.com/manage-profile/security/api-tokens (steps with pictures: [Atlassian Token Guide](https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1544486919/Atlassian-Token-Guide)).

## 1. Install (once per machine)

Open a terminal in any folder. The folder does not matter; everything goes under `~/.claude/` and no project is touched.

```
npx github:Asrarul-BS23/BMad-Stella#v6 install
```

```
│ ◇ Atlassian account email: you@stellainternational.com
│ ◇ Atlassian API token (https://id.atlassian.com/manage-profile/security/api-tokens): ****
```

Your Atlassian email and API token. Verified, then saved in `~/.claude/stella/credentials.env`. Already saved and still valid: nothing is asked.

Then the installer checks whether the `bmad-stella` plugin is already installed.

Not installed: one question.

```
│ ◇ Do you want plugins for Claude Desktop? (y/N)
```

- **Yes**: adds the marketplace and installs the `bmad-stella` plugin. Skills and hooks then load in the Claude Code CLI, the VS Code extension and the Claude Desktop Code tab.
- **No**: the skills are copied to `~/.claude/skills/` instead. No plugin is installed. The project hooks then go into each project, with `/stella-init`.

Already installed: nothing is asked. The plugin is uninstalled and installed again, so it is updated together with this BMad-Stella version.

```
└ Ready.  This machine is set up. In each project, open Claude Code and run /stella-init
```

About 90 seconds.

## 2. Set up a project (once per project)

Start a new Claude Code session in the project folder and run:

```
/stella-init
```

It asks for the project, copies `_bmad/` from the machine's master copy, creates `_bmad-output/`, puts the project hooks in `.claude/stella/hooks/` and fetches the domain docs. A few seconds, no download.

The project hooks (friction log, PR review guard, memory) live in the project and are registered in its `.claude/settings.local.json`. With the plugin enabled they come from the plugin instead, and the project gets no copy. Memory and project context are collected in the background; `/stella-init status` shows where they are.

- With the plugin, the command is also available as `/bmad-stella:stella-init`.
- A new session in a git repository that is not set up prints one line: run `/stella-init`.
- `_bmad/` already in a parent folder, or in one direct child folder: that folder is the project root. No second `_bmad/` is created.
- Open Claude Code in the folder that holds `_bmad/`, or below it. Skills and hooks do not look into child folders.

## Update

Run the install command again. Each project's `_bmad/` is then refreshed by itself at its next session start. Files in `_bmad/custom/` and everything under `_bmad-output/` are kept.

## Projects from an older BMad-Stella

Older versions installed into every project. Such a project keeps working. After the install above, its session start prints one line: run `/stella-init` to switch it over.

`/stella-init` then replaces `_bmad/` with the master copy and removes the project's own copies of the skills, which now come from `~/.claude/`. The project hooks stay in the project and are replaced by the current ones. Kept: `_bmad/custom/`, everything under `_bmad-output/`, and your own skills in `.claude/skills/`.

Until a project is switched, its skills show twice.

## Plugin by hand (optional)

The installer does this for you when you answer yes. The commands, for reference:

```
claude plugin marketplace add Asrarul-BS23/BMad-Stella
claude plugin install bmad-stella@stella
```

- `bmad-stella@stella` means plugin `bmad-stella` from the marketplace named `stella` (the name in the repo's `.claude-plugin/marketplace.json`).
- The marketplace is read from the repository's default branch. Private repo: your git credentials must clone it without prompting (`gh auth setup-git` works).
- Plugin skills are namespaced: `/bmad-stella:stella-build`. The bare `/stella-build` form works too.
- The plugin ships only the skills and hooks. A project still needs `/stella-init`.

## Cowork

Cowork ignores plugins installed with the `claude plugin` commands, and no terminal command can add them. Add the plugin on claude.ai:

1. Open claude.ai > **Customize** > **Plugins**.
2. **+ Add** > **Add marketplace**, enter `Asrarul-BS23/BMad-Stella`, confirm.
3. Go to the **Discover** tab, find **Bmad stella**, and click the **+** button on its card. This enables the plugin; it then appears under the **Yours** tab. The **Try** button only opens a chat with it and does not enable it.
4. In the Cowork session, run `/stella-init` in the project. The install command is not needed.

An organization owner can do steps 1 to 3 once for everyone: Organization settings > Plugins & skills.

What `/stella-init` does there, where the install command never ran:

- It downloads BMad into the project, about 90 seconds, instead of copying it from a master copy.
- Atlassian credentials: saved ones are used. None saved: it asks once for your email and API token (create the token at https://id.atlassian.com/manage-profile/security/api-tokens) and saves them to `~/.claude/stella/credentials.env`. You can skip the question; it then shows the file path and the two lines to put in it, and sets the project up without domain docs. A token typed in the chat stays in that conversation, so skip and save the file yourself if you do not want that.
- Project: it suggests the project that fits the folder name, the git repository name or the solution file, and asks you to confirm. No clear match: you pick from the list.

The same applies to a machine where the plugin was added by hand and the install command never ran.

## Problems

- `uv could not be installed`: no network or a blocked download. Install it by hand from https://docs.astral.sh/uv/getting-started/installation/ and re-run.
- `Atlassian MCP not registered — claude command not found`: the `claude` command is not on your PATH. Install the Claude Code CLI and re-run.
- `/stella-init` is not found: start a new Claude Code session. Skills are loaded when a session starts.
- `/stella-init` takes about 90 seconds and downloads BMad: the install command has not run on this machine, so there is no master copy. Run the install command once to make later projects fast.
- `Jira token expired`: put a new token in `~/.claude/stella/credentials.env` (`JIRA_API_TOKEN`). Until then builds fall back to the Atlassian MCP, without attachments.
- `Jira token file missing`: run the installer again.
- Install fails in the BMad or TEA step: nothing on the machine is replaced. Re-run with `--verbose` to see the full output.
