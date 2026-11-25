# stella-investigate

Answers from the code and evidence of one named environment: dev, staging, production, or any other you define. Says which environment and which commit the answer comes from. Read-only on the codebase, enforced by a hook.

## Start

```
/stella-investigate how does production check a duplicate order?
```

A plain question gets a cited answer in chat. No file is written.

```
/stella-investigate LEADRSC-4901
```

A ticket key, an error text, a log or an image starts an investigation with a case file. Paste what the client sent: a short message is enough.

```
/stella-investigate export works on staging but fails on production
```

A problem that shows in one environment and not in another is still an investigation; the comparison goes into the case file.

```
/stella-investigate what differs between staging and production in the export module?
```

No problem, two environments: the skill compares them and answers in chat.

Add `ask`, `investigate` or `compare` after the command to choose the mode yourself.

## What it does

1. On first run, proposes your environments from the remote branches, tags and deploy files, asks you to confirm, and saves them to `_bmad/custom/stella-investigate.user.toml`.
2. Picks the mode and the environment from what you typed, and says so in one line. Asks only when it cannot tell.
3. Pins the environment to one commit and prints it, for example `production = tag release-2.3.1 → a1b2c3d (2026-11-20)`. Check that line.
4. Reads the code at that commit, and what you gave: a client message, an image, a log, a Jira ticket.
5. When the answer depends on data, writes a query in your project's SQL dialect and runs it read-only. On production you confirm each query.
6. Answers with `path:line` for every claim. Each finding is marked Confirmed, Deduced or Hypothesized, with its environment and commit.

In `investigate` mode it confirms the problem and the environment with you before it reads code.

## After it ends

- Nothing in your code is changed. The skill stops at the cause.
- Case files are under `_bmad-output/stella/investigations/<ticket or name>/case.md`. Start the skill again with the same ticket or name to continue a case.
- To edit code again, type `*exit` or start `/stella-build`. Only a line you type ends the read-only state. The skill offers `/stella-build` for the fix; it never starts it.

## Good to know

- An environment's code can be your checkout, a remote branch like `origin/staging`, a tag (one exact tag or the highest version matching a pattern), or a folder. One environment can mix several.
- The skill runs `git fetch origin` to get current commits. This only updates the remote copies. It never pulls, merges or switches a branch.
- A fact read in staging is only a guess for production until it is read there.
- Queries run through `sqlcmd`, `psql` or `mysql`; install the client for your database. Only one `SELECT` statement runs, with a row limit of 100 and a time limit of 30 seconds. Both can be changed in the profile.
- Passwords go in `_bmad/custom/stella-investigate.secrets.env`, never in the profile. When one is missing, the skill names the variable: add the line to that file yourself, so the password never enters the chat. You can also give it in chat and the skill writes the line.
- An environment named `prod`, `production`, `prd` or `live` is treated as production, also without `production = true` in the profile. Write `production = false` to turn that off.
- Production: the database entry must say `read_only = true`, and a query cannot use `SELECT *` or a column listed as personal data. Use a login that can only read.
- No access to a database, usual for production: the skill gives you the checked query for a person who has access. Paste the result back.
- The skill runs no project code: no tests, no build, no app start. It proves a cause from the code and, where it can, from a read-only query. Each case ends with steps to reproduce that you can follow in the product; tell the skill what you saw.
- The skill starts no subagents. All reading happens in your session.
- The profile and the secrets file are personal and never committed.
