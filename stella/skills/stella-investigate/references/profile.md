# Profile

The profile tells this skill which environments the project has, where each one's code is, and how to reach its database. It is one personal file, never committed:

`{project-root}/_bmad/custom/stella-investigate.user.toml`

The file may already hold other settings. Add to it; never remove what is there.

## First run

Read first, ask second. Do steps 1 and 2 before any question.

1. **Environments and their code.** Read three things: the remote branches (`git branch -r`), the tags (`git tag --list --sort=-v:refname`), and the CI and deploy files (pipeline definitions, Dockerfiles, deploy scripts), which say what branch or tag each environment is deployed from. From them, write one line per environment, for example: dev = this checkout, staging = `origin/staging`, production = highest tag matching `release-*`. Where the files do not say, write "unknown" for that environment; never guess a branch.
2. **SQL dialect.** Read it from the code: connection strings, the ORM provider, migration files. Not found → "unknown".
3. Show the proposal as text. Then ask in one message, and HALT until answered:
   - is each line right, and what replaces each "unknown";
   - which environments are production;
   - is any environment's code in another folder, and where.
4. Write the file with exactly what was confirmed. Tell the user its path in one line.

Do not ask about a database during the first run. Ask when a run first needs one for an environment, and then ask for all of it in one message: the client (`sqlcmd`, `psql` or `mysql`), server, database, login, how it signs in, and the name of the password variable. For a production database also ask if the login can only read.

## Fields

The block below shows the shape. Every value in `<angle brackets>` is a placeholder: never copy one into a real profile. Write only what the project and the user gave you.

```toml
[workflow.defaults]
environment = "dev"        # used when the user names none; leave out to be asked each time
sql_dialect = "tsql"       # tsql | postgresql | mysql | mariadb — the language queries are written in
# mode = "ask"             # optional: ask | investigate | compare

# Limits and rules for every query. All optional.
[workflow.db]
row_limit = 100            # rows returned at most
timeout_seconds = 30       # a query is stopped after this
pii_columns = ["<Column>", "<Column>"]   # personal-data columns, never read on production

# ---- one table per environment; the name is free (dev, qa, uat, staging, production) ----

[workflow.environments.dev]
[[workflow.environments.dev.sources]]
kind = "working-tree"      # this checkout, with uncommitted changes

[workflow.environments.staging]
layout = "<where the business logic, validation, screens and endpoints are>"
[[workflow.environments.staging.sources]]
kind = "branch"
ref = "origin/staging"     # always the remote name
[workflow.environments.staging.db]
tool = "sqlcmd"            # sqlcmd | psql | mysql
server = "<server name>"
# port = 1433
database = "<database name>"
auth = "password"          # sqlcmd only: windows | entra | password
user = "<login>"
password_env = "<NAME_OF_VARIABLE>"   # a NAME; the value goes in the secrets file

[workflow.environments.production]
production = true          # turns on the production rules; see below
[[workflow.environments.production.sources]]
kind = "tag"
pattern = "<tag pattern>"  # highest version that matches, e.g. release-*; or  tag = "<exact tag>"
[[workflow.environments.production.sources]]
kind = "path"              # code kept in other folders, for example a second repository
roots = ["<absolute folder>"]
# no [db] table: nobody here can reach the production database
```

- A source of kind `working-tree`, `branch` or `tag` may carry `repo = "<folder>"` when that repository is not the project folder, for example when the project folder holds several repositories.
- An environment may have several sources, of different kinds.
- `layout` is free text: where the business logic, the validation, the screens and the endpoints are in that environment's code. Fill it in the first time you learn it.
- `production`: an environment named `prod`, `production`, `prd` or `live` (alone or as one part of the name, like `prod-eu`) is production also without this line. Write `production = true` for any other production-like environment, and `production = false` only when the user says such a name is not production.
- A production `[db]` table must also say `read_only = true`. Write that line only after the user confirms the login can only read. Without it the helper refuses to run.
- `trust_server_certificate = true` is available for `sqlcmd` when the server uses a self-signed certificate.

## Secrets

`{project-root}/_bmad/custom/stella-investigate.secrets.env`, one line per password:

```
<NAME_OF_VARIABLE>=<password>
```

The helper reads this file, then the OS environment variable of the same name. The user adds the line themselves; that keeps the password out of the chat. Write a value here only when the user chooses to give it to you for that purpose. Never print the file, and never put a secret in the profile or in a case file.
