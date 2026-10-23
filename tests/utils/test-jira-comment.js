'use strict';

// jira-comment helper: markdown → ADF conversion, the fixed comment-file contract,
// exit codes and dev-facing messages, host lock, and the mocked POST. No network.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const H = path.join(REPO, 'stella', 'utils', 'jira-comment');
const helper = require(path.join(H, 'index.js'));
const { markdownToAdf, MAX_CHARS } = require(path.join(H, 'lib', 'markdown-to-adf.js'));

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

for (const k of ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'BMAD_JIRA_CACHE_DIR'])
  delete process.env[k];

// ---- converter ----
let doc = markdownToAdf('Hello **world** and `code` at [site](https://x.atlassian.net/a).');
ok(
  doc.version === 1 && doc.type === 'doc' && doc.content[0].type === 'paragraph',
  'adf: paragraph doc',
);
const marks = doc.content[0].content.map((n) => (n.marks ? n.marks[0].type : 'plain'));
ok(
  marks.join(',') === 'plain,strong,plain,code,plain,link,plain',
  `adf: inline marks in order (${marks})`,
);
ok(
  doc.content[0].content[5].marks[0].attrs.href === 'https://x.atlassian.net/a' &&
    doc.content[0].content[5].text === 'site',
  'adf: link label + href',
);

doc = markdownToAdf(
  '# Done\n\n- one\n- two\n\n1. first\n2. second\n\n```js\nconst a = 1;\n```\n\ntail',
);
ok(
  doc.content.map((n) => n.type).join(',') === 'heading,bulletList,orderedList,codeBlock,paragraph',
  `adf: block types (${doc.content.map((n) => n.type)})`,
);
ok(doc.content[0].attrs.level === 1, 'adf: heading level');
ok(
  doc.content[1].content.length === 2 && doc.content[1].content[0].type === 'listItem',
  'adf: two bullet items',
);
ok(
  doc.content[3].attrs.language === 'js' && doc.content[3].content[0].text === 'const a = 1;',
  'adf: code block keeps text and language',
);
ok(
  markdownToAdf('line one\nline two').content[0].content[0].text === 'line one line two',
  'adf: soft line break joins a paragraph',
);
ok(markdownToAdf('').content[0].type === 'paragraph', 'adf: empty input → one empty paragraph');
let threw = null;
try {
  markdownToAdf('x'.repeat(MAX_CHARS + 1));
} catch (error) {
  threw = error;
}
ok(threw && /too long/.test(threw.message), 'adf: over the limit throws');
ok(
  markdownToAdf('<b>raw</b> & stuff').content[0].content[0].text === '<b>raw</b> & stuff',
  'adf: html is plain text, never markup',
);

// ---- contract ----
ok(
  helper.KEY_RE.test('LEADRSC-4901') &&
    !helper.KEY_RE.test('leadrsc-4901 --x') &&
    !helper.KEY_RE.test('../x'),
  'key: strict pattern',
);
ok(
  helper.trustedBase('https://stellaint.atlassian.net') &&
    !helper.trustedBase('https://evil.example.com') &&
    helper.trustedBase('http://localhost:8080'),
  'host: only *.atlassian.net (localhost for tests)',
);
ok(
  helper.EXIT_CODES.AUTH === 20 && helper.EXIT_CODES.CONFIG === 10,
  'exit codes: same table as jira-attachments',
);
ok(
  helper.MESSAGES.tokenExpired ===
    'Jira token expired. Put a new token in _bmad-output/stella/.bmad-tokens/.env (JIRA_API_TOKEN).' &&
    helper.MESSAGES.tokenMissing === 'Jira token file missing. Run the installer again.',
  'messages: exact dev-facing wording',
);

// ---- CLI without credentials ----
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-jc-'));
fs.mkdirSync(path.join(ROOT, '_bmad'), { recursive: true });
const run = (args) =>
  spawnSync(process.execPath, [path.join(H, 'index.js'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, JIRA_BASE_URL: '', JIRA_EMAIL: '', JIRA_API_TOKEN: '' },
  });
const out = (r) => {
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
};
let r = run(['--help']);
ok(r.status === 0 && /comment\.md/.test(r.stdout), 'cli: --help');
r = run(['nope']);
ok(
  r.status === 10 && /issue key like ABC-123/.test(out(r).message),
  'cli: bad key → 10 with message',
);
r = run(['LEADRSC-1']);
ok(
  r.status === 10 &&
    /Comment file not found: _bmad-output\/stella\/cache\/jira\/LEADRSC-1\/comment\.md/.test(
      out(r).message,
    ),
  'cli: missing comment file → 10 names the fixed path',
);
const cf = path.join(ROOT, '_bmad-output', 'stella', 'cache', 'jira', 'LEADRSC-1', 'comment.md');
fs.mkdirSync(path.dirname(cf), { recursive: true });
fs.writeFileSync(cf, '   \n');
r = run(['LEADRSC-1']);
ok(r.status === 10 && /empty/.test(out(r).message), 'cli: empty comment file → 10');
fs.writeFileSync(cf, 'Done. **Verified** with tests.\n');
r = run(['LEADRSC-1', '--dry-run']);
ok(
  r.status === 0 && out(r).dryRun === true && out(r).body.content[0].type === 'paragraph',
  'cli: --dry-run converts, posts nothing, needs no credentials',
);
ok(fs.existsSync(cf), 'cli: --dry-run keeps the file');
r = run(['LEADRSC-1']);
ok(
  r.status === 10 && out(r).message === helper.MESSAGES.tokenMissing,
  'cli: no credentials → 10 with the token-missing line',
);
r = run(['LEADRSC-1', '--bogus']);
ok(r.status === 10 && /Unknown option/.test(out(r).message), 'cli: unknown option → 10');

// ---- mocked POST through main() ----
(async () => {
  const seen = [];
  const mockFetch =
    (status, body = {}) =>
    async (url, init) => {
      seen.push({ url, init });
      return {
        ok: status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
      };
    };
  const envFile = path.join(ROOT, '_bmad-output', 'stella', '.bmad-tokens', '.env');
  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  fs.writeFileSync(
    envFile,
    'JIRA_BASE_URL=https://stellaint.atlassian.net\nJIRA_EMAIL=dev@x.com\nJIRA_API_TOKEN=tok\n',
  );
  const capture = async (argv, fetch) => {
    let printed = '';
    const orig = process.stdout.write;
    process.stdout.write = (s) => {
      printed += s;
      return true;
    };
    let code;
    try {
      code = await helper.main([...argv, '--project-root', ROOT], { fetch });
    } finally {
      process.stdout.write = orig;
    }
    return { code, json: JSON.parse(printed) };
  };

  fs.writeFileSync(cf, '- changed X\n- tests green\n');
  let res = await capture(['LEADRSC-1'], mockFetch(201, { id: '777' }));
  ok(
    res.code === 0 && res.json.ok && res.json.commentId === '777',
    'post: 201 → ok with comment id',
  );
  ok(
    seen[0].url === 'https://stellaint.atlassian.net/rest/api/3/issue/LEADRSC-1/comment' &&
      seen[0].init.method === 'POST',
    'post: exact endpoint and method',
  );
  ok(
    seen[0].init.headers.Authorization.startsWith('Basic ') &&
      JSON.parse(seen[0].init.body).body.type === 'doc',
    'post: basic auth + ADF body',
  );
  ok(!fs.existsSync(cf), 'post: comment file deleted after success');
  ok(/focusedCommentId=777/.test(res.json.url), 'post: url points at the comment');

  fs.writeFileSync(cf, 'again\n');
  res = await capture(['LEADRSC-1', '--keep'], mockFetch(201, { id: '778' }));
  ok(res.code === 0 && fs.existsSync(cf), 'post: --keep leaves the file');

  res = await capture(['LEADRSC-1'], mockFetch(401));
  ok(
    res.code === 20 && res.json.message === helper.MESSAGES.tokenExpired && fs.existsSync(cf),
    'post: 401 → 20 with the token line, file kept',
  );
  res = await capture(['LEADRSC-1'], mockFetch(404));
  ok(res.code === 30 && /not found/.test(res.json.message), 'post: 404 → 30');
  res = await capture(['LEADRSC-1'], mockFetch(500, { err: 'x' }));
  ok(res.code === 40 && /Jira replied 500/.test(res.json.message), 'post: 500 → 40');
  res = await capture(['LEADRSC-1'], async () => {
    throw new Error('ECONNREFUSED');
  });
  ok(
    res.code === 40 && /Could not reach Jira: ECONNREFUSED/.test(res.json.message),
    'post: network error → 40',
  );

  fs.writeFileSync(
    envFile,
    'JIRA_BASE_URL=https://evil.example.com\nJIRA_EMAIL=dev@x.com\nJIRA_API_TOKEN=tok\n',
  );
  seen.length = 0;
  res = await capture(['LEADRSC-1'], mockFetch(201, { id: '1' }));
  ok(
    res.code === 10 && /atlassian\.net/.test(res.json.message) && seen.length === 0,
    'post: foreign host refused before any request',
  );

  fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(
    `utils jira-comment: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
  );
  process.exit(fails ? 1 : 0);
})();
