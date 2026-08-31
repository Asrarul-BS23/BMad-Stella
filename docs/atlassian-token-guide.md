# Create an Atlassian API Token for BMad

BMad uses your Atlassian API token to download JIRA ticket attachments and fetch architecture / domain docs from Confluence.

**⏱️ ~1 minute.**

---

## 1. Open the token page

1. Go to → **https://id.atlassian.com/manage-profile/security/api-tokens**
2. Click **Create API token**

## 2. Name + expiry

- **Name:** anything (e.g. `bmad-jira`)
- **Expires:** pick what you like (max 1 year)

## 3. Create + copy

Click **Create** → **copy it now** (Atlassian shows it only once).

## 4. Give it to BMad

- **During install:** paste it when the installer asks for the **Atlassian API token**, along with:
  - **Site URL:** `https://stellaint.atlassian.net`
  - **Email:** your Stella account email
- **Already installed, or changing the token later:** open `bmad-docs/.bmad-tokens/.env` in your project and update:

  ```
  JIRA_BASE_URL=https://stellaint.atlassian.net
  JIRA_EMAIL=you@stellainternational.com
  JIRA_API_TOKEN=your-token-here
  ```

## ✅ Done

Verify: `node .bmad-core/utils/jira-attachments --self-test`

---

**Note:** this token is separate from the Atlassian **MCP server** login — that one authenticates via browser OAuth (`/mcp` → Atlassian), no token needed.

**Security note:** the token is stored in a git-ignored file (`bmad-docs/.bmad-tokens/.env`, mode 0600). Rotate it by editing that file.
