'use strict';

/**
 * github-mcp-auth.js — dynamic auth header provider for the GitHub MCP server.
 *
 * Claude Code runs this as a server's `headersHelper` on every connection. It must
 * print a JSON object of header name→value pairs to stdout and nothing else
 * (Claude parses stdout as JSON). The GitHub remote MCP server authenticates with a
 * Personal Access Token sent as `Authorization: Bearer <token>`.
 *
 * The token is read from (in order):
 *   1. process.env.GITHUB_PERSONAL_ACCESS_TOKEN   (if exported in the environment)
 *   2. GITHUB_PERSONAL_ACCESS_TOKEN in <projectRoot>/.env   (git-ignored, mode 0600)
 *
 * <projectRoot> is resolved from this file's location: the helper is installed at
 * <projectRoot>/.bmad-core/utils/github-mcp-auth.js, so the root is two levels up.
 *
 * On success: writes {"Authorization":"Bearer <token>"} to stdout, exits 0.
 * On failure: writes a diagnostic to stderr, exits 1 (Claude marks the connection
 * as needing authentication rather than sending an empty header).
 */

const fs = require('node:fs');
const path = require('node:path');

const TOKEN_KEY = 'GITHUB_PERSONAL_ACCESS_TOKEN';

/** Read a single key from a .env file without pulling in a dotenv dependency. */
function readEnvFileValue(envPath, key) {
  let contents;
  try {
    contents = fs.readFileSync(envPath, 'utf8');
  } catch {
    return null; // file missing/unreadable — caller handles
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() !== key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return null;
}

function resolveToken() {
  const fromEnv = process.env[TOKEN_KEY];
  if (fromEnv && fromEnv.trim()) return { token: fromEnv.trim(), source: 'environment' };

  // <root>/.bmad-core/utils/github-mcp-auth.js → <root>
  const projectRoot = path.resolve(__dirname, '..', '..');
  // Tokens live in <root>/bmad-docs/.bmad-tokens/.env (kept in sync with the installer).
  const envPath = path.join(projectRoot, 'bmad-docs', '.bmad-tokens', '.env');
  const fromFile = readEnvFileValue(envPath, TOKEN_KEY);
  if (fromFile && fromFile.trim()) return { token: fromFile.trim(), source: envPath };

  return { token: null, source: envPath };
}

function main() {
  const { token, source } = resolveToken();
  if (!token) {
    process.stderr.write(
      `github-mcp-auth: ${TOKEN_KEY} not found in the environment or ${source}.\n` +
        `Add it to .env or run the BMad-Stella installer to (re)configure the GitHub MCP server.\n`,
    );
    process.exit(1);
  }
  // ONLY the JSON object goes to stdout.
  process.stdout.write(JSON.stringify({ Authorization: `Bearer ${token}` }));
}

main();
