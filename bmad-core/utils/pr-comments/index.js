'use strict';

// pr-comments — post review findings as line comments on a GitHub PR.
//
//   node .bmad-core/utils/pr-comments <bmad-docs/reviewer/<folder>/findings.json>            preview only
//   node .bmad-core/utils/pr-comments <findings.json> --post                 pending review (only you see it)
//   node .bmad-core/utils/pr-comments <findings.json> --post --submit        posted as a "Comment" review
//
// Safety by construction:
//   - exactly ONE write call exists in this file: POST /repos/{o}/{r}/pulls/{n}/reviews
//   - event is omitted (pending) or "COMMENT"; APPROVE / REQUEST_CHANGES are impossible
//   - every other gh call is a read (pr view, pr diff, GET reviews/comments, GET user)
//   - the agent passes only the findings file path; the payload is built here from it
//   - head SHA must still match the live PR, else nothing is posted
//   - all comments go in one review: all or nothing

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  validateFindings,
  parseDiffRanges,
  buildReview,
  extractMarkers,
  MAX_COMMENT_CHARS,
} = require('./lib/build');

const EXIT = Object.freeze({
  OK: 0,
  USAGE: 2,
  LONG: 3,
  PENDING_EXISTS: 4,
  SHA_MISMATCH: 5,
  GH: 6,
  NOTHING: 7,
});

const GH = process.env.BMAD_GH_BIN || 'gh';

function gh(args, { input } = {}) {
  // BMAD_GH_BIN may point at a .js mock (tests); real installs use the gh executable.
  const res = GH.endsWith('.js')
    ? spawnSync(process.execPath, [GH, ...args], { encoding: 'utf8', input, windowsHide: true })
    : spawnSync(GH, args, { encoding: 'utf8', input, windowsHide: true });
  if (res.error) throw new Error(`cannot run gh: ${res.error.message}`);
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || '').trim().split('\n').slice(-3).join(' ');
    throw new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${err}`);
  }
  return res.stdout;
}

function ghJson(args, opts) {
  const out = gh(args, opts);
  try {
    return JSON.parse(out);
  } catch {
    throw new Error(`gh ${args.slice(0, 3).join(' ')} returned non-JSON output`);
  }
}

function parseArgs(argv) {
  const a = { file: null, post: false, submit: false, allowLong: false, help: false };
  for (const arg of argv) {
    switch (arg) {
      case '--post': {
        a.post = true;
        break;
      }
      case '--submit': {
        a.submit = true;
        break;
      }
      case '--allow-long': {
        a.allowLong = true;
        break;
      }
      case '--help':
      case '-h': {
        a.help = true;
        break;
      }
      default: {
        if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`);
        else if (a.file) throw new Error('only one findings file is accepted');
        else a.file = arg;
      }
    }
  }
  return a;
}

function usage() {
  return [
    'Usage: node .bmad-core/utils/pr-comments <bmad-docs/reviewer/<folder>/findings.json> [--post] [--submit]',
    '',
    '  (no flag)   preview the comments, post nothing',
    '  --post      create a PENDING review on the PR (visible only to you until you press Submit)',
    '  --submit    with --post: submit immediately as a "Comment" review',
    '',
    `Each comment is "what — why", ≤ ${MAX_COMMENT_CHARS} chars, 2 sentences. Longer ones are flagged LONG and block --post.`,
  ].join('\n');
}

function findingsPathOk(file) {
  const p = path.resolve(file).replaceAll('\\', '/');
  return /\/bmad-docs\/reviewer\/(?!\.scratch\/)[^/]+\/findings\.json$/.test(p);
}

function printPreview(result, doc, mode) {
  const lines = [];
  lines.push(
    `PR #${doc.number} (${doc.owner}/${doc.repo}) · head ${doc.headSha.slice(0, 7)} · mode: ${mode}`,
    '',
  );
  for (const p of result.preview) {
    lines.push(`${String(p.id).padStart(2)}. ${p.where}`, `    ${p.text}`);
    if (p.status !== 'ok') lines.push(`    [${p.status}]`);
  }
  lines.push(
    '',
    `${result.counts.lineComments} line comment(s), ${result.counts.inSummary} in the review summary, ${result.counts.skipped} already posted.`,
  );
  process.stdout.write(lines.join('\n') + '\n');
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`);
    return EXIT.USAGE;
  }
  if (args.help || !args.file) {
    process.stdout.write(usage() + '\n');
    return args.help ? EXIT.OK : EXIT.USAGE;
  }
  if (!findingsPathOk(args.file)) {
    process.stderr.write(
      'findings file must be bmad-docs/reviewer/<review-folder>/findings.json\n',
    );
    return EXIT.USAGE;
  }

  let doc;
  try {
    doc = validateFindings(JSON.parse(fs.readFileSync(args.file, 'utf8')));
  } catch (error) {
    process.stderr.write(`invalid findings file: ${error.message}\n`);
    return EXIT.USAGE;
  }

  const prRef = `${doc.owner}/${doc.repo}`;
  const n = String(doc.number);

  try {
    // 1. the PR must not have moved since the review
    const live = ghJson(['pr', 'view', doc.pr, '--json', 'headRefOid,state']);
    if (
      !String(live.headRefOid || '')
        .toLowerCase()
        .startsWith(doc.headSha.toLowerCase())
    ) {
      process.stderr.write(
        `PR head changed since the review (reviewed ${doc.headSha.slice(0, 7)}, now ${String(live.headRefOid).slice(0, 7)}). Re-run *pr-review first.\n`,
      );
      return EXIT.SHA_MISMATCH;
    }

    // 2. which lines can carry a comment
    const diffRanges = parseDiffRanges(gh(['pr', 'diff', doc.pr]));

    // 3. what is already on the PR (dedup) and whether a pending review of mine exists
    const me = ghJson(['api', 'user', '--jq', '{login: .login}']).login;
    const reviews = ghJson([
      'api',
      `repos/${prRef}/pulls/${n}/reviews`,
      '--paginate',
      '--slurp',
    ]).flat();
    const bodies = [];
    let pendingExists = false;
    for (const r of reviews) {
      if (r.state === 'PENDING' && r.user && r.user.login === me) pendingExists = true;
      bodies.push(r.body);
      const cs = ghJson([
        'api',
        `repos/${prRef}/pulls/${n}/reviews/${r.id}/comments`,
        '--paginate',
        '--slurp',
      ]).flat();
      for (const c of cs) bodies.push(c.body);
    }
    const posted = extractMarkers(bodies, doc.headSha);

    const result = buildReview(doc, diffRanges, posted, { submit: args.submit });
    printPreview(
      result,
      doc,
      args.post ? (args.submit ? 'POST + SUBMIT' : 'POST (pending)') : 'PREVIEW',
    );

    if (result.nothingToPost) {
      process.stdout.write('Nothing new to post.\n');
      return EXIT.NOTHING;
    }
    if (!args.post) return EXIT.OK;

    if (result.hasLong && !args.allowLong) {
      process.stderr.write(
        `Some comments are LONG (> ${MAX_COMMENT_CHARS} chars or > 2 sentences). Shorten "what"/"why" in the findings JSON, then run again.\n`,
      );
      return EXIT.LONG;
    }
    if (pendingExists) {
      process.stderr.write(
        'You already have a pending review on this PR. Open the PR on GitHub and Submit or Cancel it first.\n',
      );
      return EXIT.PENDING_EXISTS;
    }

    // 4. the single write: one review, all comments, pending unless --submit
    const tmp = path.join(os.tmpdir(), `bmad-pr-comments-${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify(result.payload));
    let created;
    try {
      created = ghJson([
        'api',
        '--method',
        'POST',
        `repos/${prRef}/pulls/${n}/reviews`,
        '--input',
        tmp,
      ]);
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }

    const url = created.html_url || doc.pr;
    if (args.submit) {
      process.stdout.write(
        `Posted ${result.counts.lineComments} line comment(s) as a review: ${url}\n`,
      );
    } else {
      process.stdout.write(
        `Pending review created with ${result.counts.lineComments} line comment(s): ${url}\nOpen the PR → "Review changes" → check, edit, then "Submit review".\n`,
      );
    }
    return EXIT.OK;
  } catch (error) {
    process.stderr.write(`${error.message}\nNothing was posted.\n`);
    return EXIT.GH;
  }
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { main, EXIT };
