# Compare

Answer one question in two environments and report what differs. Used on its own when the user asks what differs, and inside a case when a problem shows in one environment and not in the other.

Both environments are pinned and both lines are in the opening message. Below, A is the one where it works, or the older one, and B is the other. These letters are for this file only: in chat and in a case file use the environment names.

## Same repository in both

Both sources are a branch, a tag or the working tree of one repository. Then read the difference from the version history.

1. List what changed in the affected area: `git log --oneline {shaA}..{shaB} -- {path}`, then the other direction, `{shaB}..{shaA}`. Run both: either side can hold commits the other lacks.
2. Read the change: `git diff {shaA} {shaB} -- {path}`. When `{path}` is a folder, run it with `--stat` first and then read only the files that touch the behavior.
3. Name the commit that brings the difference in behavior, and cite the changed lines. Several commits change those lines → name each one.

A `working-tree` source with uncommitted changes: those changes are in no commit, so `git diff` between two commits does not show them. Read the changed files directly and say that the comparison includes uncommitted work.

## Different layout

The two environments are different folders or different repositories, so a file in one has no twin in the other. Never match files by name.

1. Trace the behavior in each environment on its own, with the steps of ask mode.
2. Put the two results side by side: where they agree, where they differ, each with its own `path:line`.

## Three kinds of difference

Check them in this order. Stop at the first that explains the difference, and say which kind it is.

1. **Code.** The logic differs between the two commits.
2. **Config.** The code is the same; a setting, feature flag, connection or environment variable differs. Read the config files in the repository at each pinned commit. A value set on the server cannot be read: record it as missing evidence and name the setting.
3. **Data.** Code and config are the same; the rows differ. Run the same query in both environments, where each has a database entry. The production rules apply to the production side.

Code and config are the same and the data cannot be read → report exactly that as the result, and give the query that would settle it.

## Report

- One line per environment with its pinned commit.
- The difference, its kind, and the proof for each side.
- What could not be compared, and what would settle it.

Inside an open case, write this under the `## Environment comparison` heading of the case file. On its own, answer in chat only; no file is written.
