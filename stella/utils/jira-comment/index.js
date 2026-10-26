'use strict';

// jira-comment — posts ONE comment on ONE Jira issue. The body is read from the
// fixed cache file `_bmad-output/stella/cache/jira/<KEY>/comment.md` (written by
// the agent), converted to Atlassian Document Format here, and the file is deleted
// after a successful post. Zero dependencies. Nothing else is possible through this
// helper: no edits, no transitions, no deletes, no other host, no other file.
//
// Exit codes match jira-attachments: 0 ok, 10 config, 20 auth, 30 not found,
// 40 network, 50 parse, 1 unknown. Every failure prints { ok:false, code, message }
// on stdout; the skills print `message` verbatim.

const fs = require('node:fs');
const path = require('node:path');
const {
  resolveConfig,
  validateConfig,
  CREDENTIALS_FILE_LABEL,
} = require('../jira-attachments/lib/config');
const { markdownToAdf } = require('./lib/markdown-to-adf');

const EXIT_CODES = Object.freeze({
  OK: 0,
  CONFIG: 10,
  AUTH: 20,
  NOT_FOUND: 30,
  NETWORK: 40,
  PARSE: 50,
  UNKNOWN: 1,
});
const KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/;
const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_FILE_LABEL = CREDENTIALS_FILE_LABEL;
const MESSAGES = Object.freeze({
  tokenExpired: `Jira token expired. Put a new token in ${TOKEN_FILE_LABEL} (JIRA_API_TOKEN).`,
  tokenMissing: 'Jira token file missing. Run the installer again.',
});

// eslint-disable-next-line n/no-unsupported-features/node-builtins
const defaultFetch = (...args) => globalThis.fetch(...args);

const HELP = `Usage: node jira-comment <ISSUE-KEY> [--dry-run] [--keep] [--project-root <dir>]

Posts the markdown in _bmad-output/stella/cache/jira/<KEY>/comment.md as a comment
on the issue, then deletes that file. --dry-run prints the converted body and posts
nothing. --keep leaves the file in place after posting.
`;

function parseArgs(argv) {
  const args = { positional: [], dryRun: false, keep: false, help: false, projectRoot: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help':
      case '-h': {
        args.help = true;
        break;
      }
      case '--dry-run': {
        args.dryRun = true;
        break;
      }
      case '--keep': {
        args.keep = true;
        break;
      }
      case '--project-root': {
        args.projectRoot = argv[++i] || null;
        break;
      }
      default: {
        if (a.startsWith('--')) throw new Error(`Unknown option: ${a}`);
        args.positional.push(a);
      }
    }
  }
  return args;
}

function fail(code, message) {
  process.stdout.write(`${JSON.stringify({ ok: false, code, message }, null, 2)}\n`);
  return code;
}

/** Only Atlassian Cloud (or localhost for tests) is ever contacted. */
function trustedBase(baseUrl) {
  try {
    const { hostname } = new URL(baseUrl);
    return (
      hostname.endsWith('.atlassian.net') || hostname === 'localhost' || hostname === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

const commentFile = (config, key) => path.join(config.cacheRoot, key, 'comment.md');

/**
 * POST /rest/api/3/issue/{key}/comment. Never throws anything but {code, message}.
 */
async function postComment({ config, key, adf, fetch = defaultFetch }) {
  const base = config.baseUrl.replace(/\/$/, '');
  const auth = `Basic ${Buffer.from(`${config.email}:${config.token}`, 'utf8').toString('base64')}`;
  let res;
  try {
    res = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: adf }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw { code: EXIT_CODES.NETWORK, message: `Could not reach Jira: ${error.message}` };
  }
  if (res.status === 401 || res.status === 403) {
    throw { code: EXIT_CODES.AUTH, message: MESSAGES.tokenExpired };
  }
  if (res.status === 404) {
    throw { code: EXIT_CODES.NOT_FOUND, message: `Issue ${key} not found (or no permission).` };
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      // ignore
    }
    throw {
      code: EXIT_CODES.NETWORK,
      message: `Jira replied ${res.status}${detail ? `: ${detail}` : ''}`,
    };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    // body optional
  }
  const id = data.id || null;
  return {
    id,
    url: id ? `${base}/browse/${key}?focusedCommentId=${id}` : `${base}/browse/${key}`,
  };
}

async function main(argv, { fetch = defaultFetch } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    return fail(EXIT_CODES.CONFIG, error.message);
  }
  if (args.help) {
    process.stdout.write(HELP);
    return EXIT_CODES.OK;
  }

  const config = resolveConfig({ projectRoot: args.projectRoot });
  const key = String(args.positional[0] || '')
    .trim()
    .toUpperCase();
  if (!KEY_RE.test(key))
    return fail(EXIT_CODES.CONFIG, 'A Jira issue key like ABC-123 is required.');

  const file = commentFile(config, key);
  const rel = path.relative(config.projectRoot, file).replaceAll('\\', '/');
  let markdown;
  try {
    markdown = fs.readFileSync(file, 'utf8');
  } catch {
    return fail(EXIT_CODES.CONFIG, `Comment file not found: ${rel}`);
  }
  if (!markdown.trim()) return fail(EXIT_CODES.CONFIG, `Comment file is empty: ${rel}`);

  let adf;
  try {
    adf = markdownToAdf(markdown);
  } catch (error) {
    return fail(EXIT_CODES.PARSE, error.message);
  }

  if (args.dryRun) {
    process.stdout.write(
      `${JSON.stringify({ ok: true, dryRun: true, key, file: rel, body: adf }, null, 2)}\n`,
    );
    return EXIT_CODES.OK;
  }

  if (config.baseUrlWarning)
    return fail(EXIT_CODES.CONFIG, `Invalid JIRA_BASE_URL — ${config.baseUrlWarning}`);
  if (!validateConfig(config).ok) return fail(EXIT_CODES.CONFIG, MESSAGES.tokenMissing);
  if (!trustedBase(config.baseUrl)) {
    return fail(
      EXIT_CODES.CONFIG,
      `Refusing to contact ${config.baseUrl}: only *.atlassian.net is allowed.`,
    );
  }

  let posted;
  try {
    posted = await postComment({ config, key, adf, fetch });
  } catch (error) {
    return fail(error.code || EXIT_CODES.UNKNOWN, error.message || String(error));
  }

  if (!args.keep) {
    try {
      fs.unlinkSync(file);
    } catch {
      // the comment is posted; a leftover file is harmless
    }
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, key, commentId: posted.id, url: posted.url, file: rel, deleted: !args.keep }, null, 2)}\n`,
  );
  return EXIT_CODES.OK;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stdout.write(
        `${JSON.stringify({ ok: false, code: EXIT_CODES.UNKNOWN, message: error.message || String(error) })}\n`,
      );
      process.exitCode = EXIT_CODES.UNKNOWN;
    });
}

module.exports = { main, postComment, commentFile, trustedBase, EXIT_CODES, MESSAGES, KEY_RE };
