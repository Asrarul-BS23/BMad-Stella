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

/**
 * Uninstall: drops our four lines and the header; everything else stays.
 * @returns {{removed:string[], file:string}}
 */
function remove(root) {
  const file = path.join(root, '.gitignore');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { removed: [], file };
  }
  const ours = new Set(GITIGNORE_LINES.map(normalise));
  const removed = [];
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const kept = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === GITIGNORE_HEADER) continue;
    if (ours.has(normalise(line)) && !line.trim().startsWith('#')) {
      removed.push(line.trim());
      continue;
    }
    kept.push(line);
  }
  if (removed.length === 0 && !text.includes(GITIGNORE_HEADER)) return { removed, file };
  while (kept.length > 0 && kept.at(-1).trim() === '') kept.pop();
  fs.writeFileSync(file, kept.length > 0 ? kept.join(eol) + eol : '');
  return { removed, file };
}

module.exports = { ensure, remove };
