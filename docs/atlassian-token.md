# Atlassian API token

The installer and the Jira helper use an Atlassian API token to read tickets and download attachments.

## Create one

1. Open https://id.atlassian.com/manage-profile/security/api-tokens
2. **Create API token**, give it a label such as `bmad-stella`.
3. Copy the token. It is shown once.

## Where it goes

The installer asks for your email and the token, verifies them against Jira, and writes:

```
~/.claude/stella/credentials.env
```

The file is git-ignored. It holds `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN`.

## Replace it

Run the installer again and answer **No** to "Use them as is?". Enter the new token.

Or edit the `.env` file by hand and change `JIRA_API_TOKEN`.

## Non-interactive (CI)

Set `JIRA_EMAIL`, `JIRA_API_TOKEN` and `STELLA_PROJECT` in the environment. Nothing is asked.
