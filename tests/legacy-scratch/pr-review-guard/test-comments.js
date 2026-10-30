'use strict';
// Tests for bmad-core/utils/pr-comments (helper) + guard policy additions.
const fs = require('node:fs'),
  path = require('node:path');
const { spawnSync } = require('node:child_process');
const H = 'C:/Users/BS01602/Desktop/JEMS/BMad-Stella/bmad-core/utils/pr-comments';
const G = 'C:/Users/BS01602/Desktop/JEMS/BMad-Stella/bmad-core/bmad-hooks/project/pr-review-guard';
const B = require(path.join(H, 'lib', 'build.js'));
const { decide, checkBash } = require(path.join(G, 'lib', 'policy.js'));
let fails = 0,
  total = 0;
const ok = (c, m) => {
  total++;
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};

const SHA = 'df26457aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DIFF = [
  'diff --git a/src/A.cs b/src/A.cs',
  '--- a/src/A.cs',
  '+++ b/src/A.cs',
  '@@ -10,3 +10,5 @@',
  ' x',
  '+y',
  '+z',
  ' w',
  '+q',
  '@@ -80,2 +84,3 @@',
  ' a',
  '+b',
  '+c',
  'diff --git a/src/B.cs b/src/B.cs',
  '--- /dev/null',
  '+++ b/src/B.cs',
  '@@ -0,0 +1,2 @@',
  '+one',
  '+two',
].join('\n');

// ================= 1. build.js pure functions =================
const r = B.parseDiffRanges(DIFF);
ok(JSON.stringify(r.get('src/A.cs')) === '[[10,14],[84,86]]', 'diff: hunk ranges for A.cs');
ok(JSON.stringify(r.get('src/B.cs')) === '[[1,2]]', 'diff: new file range');
ok(
  B.lineInDiff(r, 'src/A.cs', 85) &&
    !B.lineInDiff(r, 'src/A.cs', 50) &&
    !B.lineInDiff(r, 'src/C.cs', 1),
  'diff: lineInDiff',
);
ok(B.lineInDiff(r, 'src\\A.cs', 12), 'diff: windows path normalized');

ok(B.parsePrUrl('https://github.com/o/r/pull/12').number === 12, 'url: parse');
ok(B.parsePrUrl('https://github.com/o/r/pull/12/files') === null, 'url: reject /files');
ok(B.parsePrUrl('https://gitlab.com/o/r/pull/12') === null, 'url: reject non-github');

const t1 = B.buildCommentText({
  what: '**Key accepted** from appsettings.json too.',
  why: 'ciphertext and key can share a committed file',
});
ok(
  t1.text ===
    'Key accepted from appsettings.json too — ciphertext and key can share a committed file.' &&
    !t1.tooLong,
  'text: what — why, markdown stripped',
);
const t2 = B.buildCommentText({ what: 'x'.repeat(150), why: 'y'.repeat(100) });
ok(t2.tooLong, 'text: > 220 chars flagged LONG');
const t3 = B.buildCommentText({ what: 'One. Two.', why: 'Three.' });
ok(t3.tooLong, 'text: 3 sentences flagged LONG');
ok(
  B.extractMarkers(
    [
      'hi <!-- bmad:df26457:3 -->',
      'x',
      '<!--bmad:DF26457:7-->',
      '<!-- bmad:0000000:9 -->',
      '<!-- bmad:1 -->',
    ],
    SHA,
  ).size === 2,
  'markers: extracted for this sha only (legacy + other sha ignored)',
);

const base = {
  pr: 'https://github.com/o/r/pull/12',
  owner: 'o',
  repo: 'r',
  number: 12,
  headSha: SHA,
  summary: 'Mergeable. One gap.',
  findings: [
    {
      id: 1,
      group: 'minor',
      criterion: 'Security',
      path: 'src/A.cs',
      startLine: 84,
      line: 85,
      what: 'Key accepted from any source',
      why: 'key and ciphertext may share a file',
      fix: 'enforce env',
    },
    {
      id: 2,
      group: 'minor',
      criterion: 'Scope',
      path: null,
      line: null,
      what: 'No runbook',
      why: 'ops cannot set the key',
      fix: 'add docs',
    },
    {
      id: 3,
      group: 'minor',
      criterion: 'Logic',
      path: 'src/A.cs',
      startLine: null,
      line: 50,
      what: 'Root never disposed',
      why: 'watcher leak',
      fix: 'using',
    },
    {
      id: 4,
      group: 'minor',
      criterion: 'Logic',
      path: 'src/C.cs',
      startLine: null,
      line: 1,
      what: 'Unused',
      why: 'dead code',
      fix: 'remove',
    },
  ],
};
ok(B.validateFindings(base).owner === 'o', 'validate: good doc');
ok(
  (() => {
    try {
      B.validateFindings({ ...base, number: 13 });
      return false;
    } catch (e) {
      return /do not match/.test(e.message);
    }
  })(),
  'validate: owner/repo/number must match url',
);
ok(
  (() => {
    try {
      B.validateFindings({ ...base, headSha: 'zz' });
      return false;
    } catch (e) {
      return /headSha/.test(e.message);
    }
  })(),
  'validate: bad sha',
);
ok(
  (() => {
    try {
      B.validateFindings({ ...base, findings: [{ id: 1, what: 'x' }] });
      return false;
    } catch (e) {
      return /why/.test(e.message);
    }
  })(),
  'validate: why required',
);

const rv = B.buildReview(B.validateFindings(base), r, new Set(), {});
ok(
  rv.payload.comments.length === 1 &&
    rv.payload.comments[0].line === 85 &&
    rv.payload.comments[0].start_line === 84 &&
    rv.payload.comments[0].side === 'RIGHT',
  'review: in-diff finding → line comment with range',
);
ok(
  /<!-- bmad:df26457:1 -->/.test(rv.payload.comments[0].body) &&
    !/enforce env/.test(rv.payload.comments[0].body) &&
    !/Fix/.test(rv.payload.comments[0].body),
  'review: comment has marker, no fix',
);
ok(
  rv.counts.inSummary === 3 &&
    /No runbook/.test(rv.payload.body) &&
    /Root never disposed/.test(rv.payload.body) &&
    /Unused/.test(rv.payload.body),
  'review: null line, out-of-hunk line, unknown file → summary body',
);
ok(/<!-- bmad:df26457:2 -->/.test(rv.payload.body), 'review: summary entries carry markers too');
ok(
  rv.payload.commit_id === SHA && rv.payload.event === undefined,
  'review: pending by default (no event)',
);
ok(
  B.buildReview(B.validateFindings(base), r, new Set(), { submit: true }).payload.event ===
    'COMMENT',
  'review: --submit → COMMENT only',
);
const rv2 = B.buildReview(B.validateFindings(base), r, new Set([1, 2, 3, 4]), {});
ok(rv2.nothingToPost && rv2.counts.skipped === 4, 'review: all already posted → nothing');

// ================= 2. helper source safety =================
// comments stripped: the safety claim is about executable code, not prose
const src = (
  fs.readFileSync(path.join(H, 'index.js'), 'utf8') +
  fs.readFileSync(path.join(H, 'lib', 'build.js'), 'utf8')
).replace(/(^|;)\s*\/\/.*$/gm, '$1'); // line comments only; a /* inside a string (glob "*.json") is not a comment
ok(
  (src.match(/'--method'/g) || []).length === 1 &&
    /'--method',\s*'POST',\s*`repos\/\$\{prRef\}\/pulls\/\$\{n\}\/reviews`/.test(src),
  'source: exactly one write call, to /pulls/{n}/reviews',
);
ok(
  !/APPROVE|REQUEST_CHANGES|DELETE|PATCH|PUT|merge|\/issues\//.test(src),
  'source: no approve/request-changes/merge/delete/patch/issues',
);
ok(!/-f |-F |--raw-field|--field/.test(src), 'source: no field-based gh api calls');

// ================= 3. end-to-end with mock gh =================
const ROOT = path.join(__dirname, 'proj-comments');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, 'bmad-docs', 'reviewer', 'r-pr12-2026-10-06'), { recursive: true });
const FJ = path.join(ROOT, 'bmad-docs', 'reviewer', 'r-pr12-2026-10-06', 'findings.json');
const MOCK = path.join(__dirname, 'mock-gh.js');
const SCEN = path.join(ROOT, 'scenario.json');
const CALLS = path.join(ROOT, 'calls.jsonl');
function run(argv, scenario) {
  fs.writeFileSync(SCEN, JSON.stringify(scenario));
  fs.writeFileSync(CALLS, '');
  const res = spawnSync(process.execPath, [path.join(H, 'index.js'), ...argv], {
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, BMAD_GH_BIN: MOCK, BMAD_GH_MOCK: SCEN, BMAD_GH_CALLS: CALLS },
  });
  const calls = fs
    .readFileSync(CALLS, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  return {
    code: res.status,
    out: res.stdout,
    err: res.stderr,
    calls,
    post: calls.find((c) => c.args.includes('--method')),
  };
}
const good = { headRefOid: SHA, diff: DIFF, me: 'ashik', reviews: [], reviewComments: {} };
fs.writeFileSync(FJ, JSON.stringify(base));

let e = run([FJ], good);
ok(
  e.code === 0 && !e.post && /1 line comment/.test(e.out) && /3 in the review summary/.test(e.out),
  'e2e: preview posts nothing, shows counts',
);
ok(fs.existsSync(FJ), 'cleanup: preview keeps findings.json');
ok(
  /Key accepted from any source — key and ciphertext may share a file\./.test(e.out),
  'e2e: preview shows exact comment text',
);

const REVIEW_MD = path.join(path.dirname(FJ), 'review.md');
fs.writeFileSync(REVIEW_MD, '# PR Review\n\n**Head:** df26457\n');
e = run([FJ, '--post'], good);
ok(
  e.code === 0 && e.post && e.post.input.event === undefined && e.post.input.comments.length === 1,
  'e2e: --post creates pending review with 1 line comment',
);
const firstPost = e;
ok(!fs.existsSync(FJ), 'cleanup: findings.json deleted after successful post');
ok(
  /\*\*Comments:\*\* posted \d{4}-\d{2}-\d{2} → https:\/\/github\.com\/o\/r\/pull\/12#pullrequestreview-999/.test(
    fs.readFileSync(REVIEW_MD, 'utf8'),
  ),
  'cleanup: review.md got the Comments line with the review URL',
);
e = run([FJ, '--post'], good);
ok(
  e.code === 2 && !e.post,
  'cleanup: second --post with findings.json gone → exit 2, nothing posted',
);
fs.writeFileSync(FJ, JSON.stringify(base));
ok(
  /Pending review created/.test(firstPost.out) && /Submit review/.test(firstPost.out),
  'e2e: tells user to Submit on GitHub',
);
ok(
  firstPost.post.args[1] === '--method' &&
    firstPost.post.args[2] === 'POST' &&
    firstPost.post.args[3] === 'repos/o/r/pulls/12/reviews',
  'e2e: POST target is pulls/12/reviews',
);

e = run([FJ, '--post', '--submit'], good);
ok(e.code === 0 && e.post.input.event === 'COMMENT', 'e2e: --submit sends COMMENT event');
fs.writeFileSync(FJ, JSON.stringify(base));

e = run([FJ, '--post'], { ...good, headRefOid: 'ffffffffffffffffffffffffffffffffffffffff' });
ok(e.code === 5 && !e.post && /head changed/.test(e.err), 'e2e: PR moved → exit 5, nothing posted');
ok(fs.existsSync(FJ), 'cleanup: failed post keeps findings.json');

e = run([FJ, '--post'], {
  ...good,
  reviews: [{ id: 1, state: 'PENDING', user: { login: 'ashik' }, body: '' }],
});
ok(
  e.code === 4 && !e.post && /pending review/.test(e.err),
  'e2e: my pending review exists → exit 4',
);

e = run([FJ, '--post'], {
  ...good,
  reviews: [{ id: 1, state: 'PENDING', user: { login: 'someone-else' }, body: '' }],
});
ok(e.code === 0 && e.post, "e2e: someone else's pending review does not block");

fs.writeFileSync(FJ, JSON.stringify(base)); // previous successful post deleted it
e = run([FJ, '--post'], {
  ...good,
  reviews: [{ id: 5, state: 'COMMENTED', user: { login: 'ashik' }, body: 'x' }],
  reviewComments: { 5: [{ body: 'old <!-- bmad:df26457:1 -->' }] },
});
ok(
  e.code === 0 && e.post && e.post.input.comments.length === 0 && /1 already posted/.test(e.out),
  'e2e: dedup skips already-posted finding 1',
);

const longDoc = {
  ...base,
  findings: [
    { id: 1, path: 'src/A.cs', line: 85, what: 'w'.repeat(200), why: 'y'.repeat(100), fix: '' },
  ],
};
fs.writeFileSync(FJ, JSON.stringify(longDoc));
e = run([FJ, '--post'], good);
ok(e.code === 3 && !e.post && /LONG/.test(e.err), 'e2e: LONG comment blocks --post');
e = run([FJ], good);
ok(e.code === 0 && /\[LONG\]/.test(e.out), 'e2e: preview marks LONG');
fs.writeFileSync(FJ, JSON.stringify(base));

e = run([FJ, '--post'], { ...good, postFails: 'line must be part of the diff' });
ok(e.code === 6 && /Nothing was posted/.test(e.err), 'e2e: gh POST error → exit 6, message');

fs.writeFileSync(FJ, JSON.stringify({ ...base, findings: [] }));
e = run([FJ, '--post'], good);
ok(e.code === 7 && !e.post, 'e2e: no findings → exit 7, nothing posted');
fs.writeFileSync(FJ, JSON.stringify(base));

const outside = path.join(ROOT, 'x.json');
fs.writeFileSync(outside, JSON.stringify(base));
e = run([outside, '--post'], good);
ok(
  e.code === 2 && e.calls.length === 0,
  'e2e: file outside bmad-docs/reviewer rejected before any gh call',
);
e = run([FJ, '--yolo'], good);
ok(e.code === 2 && e.calls.length === 0, 'e2e: unknown flag rejected');
e = run([], good);
ok(e.code === 2, 'e2e: no file → usage');
fs.writeFileSync(FJ, '{not json');
e = run([FJ], good);
ok(e.code === 2 && /invalid findings/.test(e.err), 'e2e: corrupt JSON → exit 2');
fs.writeFileSync(FJ, JSON.stringify(base));

e = run([FJ, '--post'], good);
const writes = e.calls.filter(
  (c) =>
    c.args.includes('--method') ||
    c.args.some((a) => /^-[fF]$|--field|--raw-field|--input/.test(a)),
);
ok(writes.length === 1, 'e2e: exactly one write-shaped gh call in a full --post run');

// ================= 4. guard policy additions =================
ok(
  decide('Write', {
    file_path: 'C:\\p\\bmad-docs\\reviewer\\r-pr12-2026-10-06\\findings.json',
    content: '{}',
  }).allow,
  'guard: findings.json write allowed',
);
ok(
  !decide('Write', {
    file_path: 'C:\\p\\bmad-docs\\reviewer\\r-pr12-2026-10-06\\x.yaml',
    content: '',
  }).allow,
  'guard: other extensions still blocked',
);
ok(
  checkBash('node .bmad-core/utils/pr-comments bmad-docs/reviewer/r-pr12-2026-10-06/findings.json')
    .allow,
  'guard: helper preview allowed',
);
ok(
  checkBash(
    'node .bmad-core/utils/pr-comments bmad-docs/reviewer/r-pr1-2026-10-06/findings.json --post',
  ).allow,
  'guard: helper --post allowed',
);
ok(
  checkBash(
    'node .bmad-core/utils/pr-comments/index.js bmad-docs/reviewer/r-pr1-2026-10-06/findings.json --post --submit',
  ).allow,
  'guard: helper index.js form allowed',
);
ok(
  checkBash(
    'node "C:\\p\\.bmad-core\\utils\\pr-comments" "C:\\p\\bmad-docs\\reviewer\\r-pr1-2026-10-06\\findings.json"',
  ).allow,
  'guard: absolute quoted paths allowed',
);
ok(
  !checkBash('node .bmad-core/utils/pr-comments src/x.json').allow,
  'guard: helper with non-findings file blocked',
);
ok(
  !checkBash(
    'node .bmad-core/utils/pr-comments bmad-docs/reviewer/r-pr1-2026-10-06/findings.json --force',
  ).allow,
  'guard: helper unknown flag blocked',
);
ok(!checkBash('node .bmad-core/utils/pr-comments').allow, 'guard: helper without file blocked');
ok(
  !checkBash('node .bmad-core/utils/other-helper bmad-docs/reviewer/r-pr1-2026-10-06/findings.json')
    .allow,
  'guard: other utils still blocked',
);
ok(
  !checkBash('gh api repos/o/r/pulls/12/reviews --method POST').allow,
  'guard: direct gh api still blocked',
);

// ================= 5. regression: earlier suites =================
for (const f of ['test.js', 'test-scratch.js']) {
  const b = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  ok(b.status === 0, `regression: ${f} — ${(b.stdout.match(/\d+\/\d+ passed.*/) || [''])[0]}`);
}

console.log(`\n${total - fails}/${total} passed` + (fails ? ` — ${fails} FAILED` : ' — ALL PASS'));
process.exit(fails ? 1 : 0);
