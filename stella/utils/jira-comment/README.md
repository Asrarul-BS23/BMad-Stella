<!-- Powered by Stella Development Team -->

# jira-comment

Zero-dependency Node helper that posts **one comment on one Jira issue**. The body comes from a fixed file the agent writes, `_bmad-output/stella/cache/jira/<KEY>/comment.md`, is converted from Markdown to Atlassian Document Format here, and the file is deleted after a successful post.

Nothing else is possible through this helper: no edits, no transitions, no deletes, no other file, no other host than `*.atlassian.net`.

## Usage

```bash
node _bmad/custom/stella/utils/jira-comment LEADRSC-4901
node _bmad/custom/stella/utils/jira-comment LEADRSC-4901 --dry-run   # print the converted body, post nothing
node _bmad/custom/stella/utils/jira-comment LEADRSC-4901 --keep      # post, keep the file
```

Credentials: same as `jira-attachments` (`_bmad-output/stella/.bmad-tokens/.env`, env vars win).

## Markdown supported

Paragraphs, `#`–`###` headings, `-` bullets, `1.` numbered lists, fenced code blocks, inline `code`, **bold**, `[label](https://url)`. Anything else is plain text. Max 32,000 characters.

## Output

stdout, one JSON object:

```json
{
  "ok": true,
  "key": "LEADRSC-4901",
  "commentId": "10234",
  "url": "https://…/browse/LEADRSC-4901?focusedCommentId=10234",
  "file": "_bmad-output/stella/cache/jira/LEADRSC-4901/comment.md",
  "deleted": true
}
```

On failure:

```json
{
  "ok": false,
  "code": 20,
  "message": "Jira token expired. Put a new token in _bmad-output/stella/.bmad-tokens/.env (JIRA_API_TOKEN)."
}
```

## Exit codes

| Code | Meaning                                    | Message                                                  |
| ---- | ------------------------------------------ | -------------------------------------------------------- |
| 0    | Posted                                     |                                                          |
| 10   | Missing credentials, bad key, file missing | `Jira token file missing. Run the installer again.` etc. |
| 20   | Token rejected (401/403)                   | `Jira token expired. Put a new token in …`               |
| 30   | Issue not found                            |                                                          |
| 40   | Network or unexpected Jira reply           |                                                          |
| 50   | Comment too long                           |                                                          |
