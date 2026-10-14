'use strict';

// Step 8 — .gitignore. Each required line is added once, under a header, never
// duplicated; existing content is preserved. Mandatory (user decision):
// _bmad/, _bmad-output/, .claude/, .env.

const fs = require('node:fs');
const path = require('node:path');
const { GITIGNORE_LINES, GITIGNORE_HEADER } = require('./constants');

const normalise = (line) => line.trim().replace(/^\/+/, '');

/**
 * @returns {{added:string[], file:string}}
 */
function ensure(root) {
  const file = path.join(root, '.gitignore');
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    text = '';
  }
  const present = new Set(
    text
      .split(/\r?\n/)
      .map(normalise)
      .filter((l) => l && !l.startsWith('#')),
  );
  const added = GITIGNORE_LINES.filter((l) => !present.has(normalise(l)));
  if (added.length === 0) return { added, file };

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let out = text;
  if (out && !out.endsWith('\n')) out += eol;
  if (!out.includes(GITIGNORE_HEADER)) out += (out ? eol : '') + GITIGNORE_HEADER + eol;
  out += added.join(eol) + eol;
  fs.writeFileSync(file, out);
  return { added, file };
}

module.exports = { ensure };
