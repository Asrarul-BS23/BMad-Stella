# Create a GitHub Token for BMad (GitHub MCP)

The GitHub MCP server (used by the PR-reviewer) authenticates with a **fine-grained Personal Access Token**. This guide walks you through creating one.

**⏱️ ~2 minutes. The token is read-only — it cannot change your code.**

---

## 1. Open the token page

1. Go to → **https://github.com/settings/personal-access-tokens**
2. Click **Fine-grained tokens**
3. Click **Generate new token**

_(full path: GitHub → your avatar → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**)_

## 2. Name + expiry

- **Token name:** `<your preferred name>` (e.g. `bmad-github-mcp`)
- **Expiration:** 90 days (pick what you like)

## 3. Resource owner

Pick whoever **owns the repo** you'll review:

- If the repo is under **your personal account**, select **yourself**.
- If the repo is under an **organization** you have access to, select that **organization**.

## 4. Repository access

Choose **"Only select repositories"** → pick the repo(s) you'll do PR reviews in.

## 5. Permissions → Repository permissions (the important part)

Set exactly these two to **Read-only**:

| Permission        | Set to    |
| ----------------- | --------- |
| **Contents**      | Read-only |
| **Pull requests** | Read-only |

_("Metadata: Read" turns on by itself — leave it. Everything else: "No access".)_

> ⚠️ **Don't skip Contents: Read.** Without it, PR review fails with a **403** when fetching the diff (metadata works, the diff doesn't).

## 6. Generate + copy

Click **Generate token** → **copy it now** (GitHub shows it only once). It starts with `github_pat_…`.

## 7. Give it to BMad

- **During install:** paste it when the installer asks for the **GitHub Personal Access Token**.
- **Already installed, or changing the token later:** open `bmad-docs/.bmad-tokens/.env` in your project and paste your token there:

  ```
  GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_xxxxxxxx
  ```

## ✅ Done

In Claude Code: `/mcp` → GitHub should show **connected**.

---

**Security note:** the token is stored in a git-ignored file (`bmad-docs/.bmad-tokens/.env`) and is read-only — it can't push, merge, or modify anything. Rotate it by editing that file.
