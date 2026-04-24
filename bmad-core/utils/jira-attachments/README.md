<!-- Powered by Stella Development Team -->

# jira-attachments

Zero-dependency Node helper that fetches a Jira ticket's text **and** downloads all of its attachments (including images embedded inline in descriptions/comments) to a local cache directory. Produces a structured `manifest.json` the planner agent consumes to incorporate visual context.

Complements — does not replace — the Atlassian MCP server. The MCP handles agent ↔ Jira interactive flows; this helper handles binary attachments because MCP returns text only.

## Requirements

- Node.js 20.10+ (uses built-in `fetch` and `stream/promises`)
- Atlassian Cloud account with an API token (create one at <https://id.atlassian.com/manage-profile/security/api-tokens>)

No npm dependencies — the helper uses Node built-ins only, so it runs from any user project without adding packages.

## Configuration

Credentials are loaded from environment variables, with fallback to a project-root `.env`. Precedence: process env > `.env`.

| Variable          | Required | Description                                           |
| ----------------- | -------- | ----------------------------------------------------- |
| `JIRA_BASE_URL`   | yes      | e.g. `https://yourtenant.atlassian.net`               |
| `JIRA_EMAIL`      | yes      | Atlassian account email                               |
| `JIRA_API_TOKEN`  | yes      | API token (not a password)                            |
| `BMAD_JIRA_CACHE_DIR` | no   | Override cache root (default `bmad-docs/cache/jira`)      |

The BMad-Stella installer prompts for and writes these during setup. Keep `.env` out of git — the repo template already ignores it.

## Usage

```bash
# Basic fetch
node .bmad-core/utils/jira-attachments PROJ-123

# Accept a full URL
node .bmad-core/utils/jira-attachments https://tenant.atlassian.net/browse/PROJ-123

# Verify credentials without downloading
node .bmad-core/utils/jira-attachments --self-test

# Preview what would be fetched
node .bmad-core/utils/jira-attachments PROJ-123 --dry-run

# Ignore cache and re-download
node .bmad-core/utils/jira-attachments PROJ-123 --force-refresh
```

## Output

**stderr** — progress logs (human-readable).
**stdout** — JSON result with `manifestPath`, attachment count, and cache status. This is what agents parse.

```json
{
  "ok": true,
  "manifestPath": "bmad-docs/cache/jira/PROJ-123/manifest.json",
  "ticketKey": "PROJ-123",
  "attachmentCount": 3,
  "failedCount": 0,
  "skippedCount": 0,
  "cacheHit": false,
  "fetchDurationMs": 2341
}
```

## Manifest schema (v1)

```json
{
  "manifestVersion": "1.0.0",
  "ticket": {
    "key": "PROJ-123",
    "url": "https://tenant.atlassian.net/browse/PROJ-123",
    "title": "Add dark mode toggle",
    "status": "In Progress",
    "type": "Story",
    "updated": "2026-04-20T14:22:00.000Z"
  },
  "description": "Plain-text rendering of the ticket description...",
  "comments": [
    { "id": "10001", "author": "...", "created": "...", "text": "..." }
  ],
  "attachments": [
    {
      "id": "12345",
      "filename": "mockup.png",
      "localPath": "bmad-docs/cache/jira/PROJ-123/attachments/12345__mockup.png",
      "mimeType": "image/png",
      "sizeBytes": 245678,
      "checksum": "sha256:abc...",
      "source": "attachment+inline",
      "referencedInline": true,
      "downloadedAt": "2026-04-20T14:30:17.123Z"
    }
  ],
  "skipped": [],
  "failures": [],
  "cache": { "hit": false, "reason": "ticket-updated" },
  "summary": { "total": 3, "downloaded": 3, "failed": 0, "skipped": 0 }
}
```

## Exit codes

| Code | Meaning                                     |
| ---- | ------------------------------------------- |
| 0    | Success                                     |
| 10   | Configuration / missing credentials         |
| 20   | Authentication failure (401/403)            |
| 30   | Ticket not found (404)                      |
| 40   | Network / retryable failure exhausted       |
| 50   | Parse failure (malformed Jira response)     |
| 1    | Unknown error                               |

## Production characteristics

- **Retry with jitter** on 408/425/429/500/502/503/504; honors `Retry-After` header
- **Bounded concurrency** (default 5) for parallel attachment downloads
- **Streaming downloads** — no in-memory buffering, safe for large files (cap at 50 MB by default)
- **Atomic manifest writes** — temp file + rename to avoid half-written JSON
- **SHA-256 checksums** recorded per attachment for integrity verification
- **Cache freshness** — compares ticket `updated` timestamp and attachment set; re-runs are near-instant when the ticket is unchanged
- **MIME allowlist** — images, PDFs, text, JSON by default; everything else is recorded under `skipped` with reason
- **Filename sanitization** — path-traversal safe, control chars stripped, length capped

## Troubleshooting

- **`Missing credentials`** → check `.env` or export env vars. Run `--self-test` to verify.
- **`Authentication failed (401)`** → regenerate the API token. Tokens are per-account, not per-project.
- **`Resource not found (404)`** → confirm ticket key spelling and that your account has Browse permission.
- **Repeated timeouts** → check VPN or corporate proxy; the client respects `HTTPS_PROXY`/`HTTP_PROXY` through Node's `fetch` agent.
