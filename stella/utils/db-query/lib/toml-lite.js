'use strict';

// Small TOML reader for the stella-investigate profile. It covers what the profile
// uses: tables, arrays of tables, strings, booleans, numbers and arrays of those.
// The same file can also hold other skill overrides, so syntax this reader does not
// know (inline tables, dates) is kept as raw text instead of failing.

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function splitKey(text) {
  const parts = [];
  const re = /\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*(?:\.|$)/y;
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < text.length && (m = re.exec(text)) !== null) {
    parts.push(m[1] ?? m[2] ?? m[3]);
  }
  if (parts.length === 0 || re.lastIndex < text.length) {
    throw new Error(`cannot read key "${text.trim()}"`);
  }
  for (const part of parts) {
    if (FORBIDDEN_KEYS.has(part)) throw new Error(`key "${part}" is not allowed`);
  }
  return parts;
}

// Returns the table at `parts`, creating tables on the way. When a step is an
// array of tables, the walk continues in its last element.
function descend(root, parts) {
  let node = root;
  for (const part of parts) {
    if (!Object.hasOwn(node, part)) node[part] = {};
    let next = node[part];
    if (Array.isArray(next)) next = next.at(-1);
    if (next === null || typeof next !== 'object') {
      throw new Error(`"${parts.join('.')}" is both a value and a table`);
    }
    node = next;
  }
  return node;
}

function unescapeBasic(text) {
  return text.replaceAll(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c) => {
    if (c[0] === 'u') return String.fromCodePoint(Number.parseInt(c.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' }[c] ?? c;
  });
}

// Removes a trailing comment that is outside quotes.
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#') return line.slice(0, i);
  }
  return line;
}

function parseScalar(raw) {
  const text = raw.trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return unescapeBasic(text.slice(1, -1));
  if (/^'[^']*'$/.test(text)) return text.slice(1, -1);
  if (/^[+-]?\d[\d_]*$/.test(text)) return Number.parseInt(text.replaceAll('_', ''), 10);
  if (/^[+-]?\d[\d_]*\.\d+$/.test(text)) return Number.parseFloat(text.replaceAll('_', ''));
  return text; // unknown syntax: keep the raw text
}

function parseArray(text) {
  const inner = text.trim().slice(1, -1);
  const items = [];
  let current = '';
  let quote = null;
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      current += ch;
      if (ch === '\\' && quote === '"') current += inner[++i] ?? '';
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      if (current.trim()) items.push(parseScalar(current));
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) items.push(parseScalar(current));
  return items;
}

// True when every bracket opened outside quotes is closed.
function bracketsClosed(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === '[') depth++;
    if (ch === ']') depth--;
  }
  return depth <= 0;
}

/**
 * @param {string} source TOML text
 * @returns {object}
 */
function parse(source) {
  const root = {};
  let table = root;
  // a file saved by Windows tools may start with a byte order mark
  const text = String(source);
  const lines = (text.codePointAt(0) === 0xfe_ff ? text.slice(1) : text).split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim();
    if (!line) continue;

    const arrayHeader = line.match(/^\[\[(.+)\]\]$/);
    if (arrayHeader) {
      const parts = splitKey(arrayHeader[1]);
      const parent = descend(root, parts.slice(0, -1));
      const last = parts.at(-1);
      if (!Array.isArray(parent[last])) parent[last] = [];
      table = {};
      parent[last].push(table);
      continue;
    }
    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      table = descend(root, splitKey(header[1]));
      continue;
    }

    const eq = lines[i].indexOf('=');
    if (eq === -1) throw new Error(`line ${i + 1}: expected "key = value"`);
    const keyParts = splitKey(lines[i].slice(0, eq));
    let rest = lines[i].slice(eq + 1).trim();
    let value;

    const multi = rest.startsWith('"""') ? '"""' : rest.startsWith("'''") ? "'''" : null;
    if (multi) {
      let body = rest.slice(3);
      while (!body.includes(multi)) {
        i++;
        if (i >= lines.length) throw new Error(`unclosed ${multi} string`);
        body += '\n' + lines[i];
      }
      body = body.slice(0, body.indexOf(multi)).replace(/^\r?\n/, '');
      value = multi === '"""' ? unescapeBasic(body) : body;
    } else {
      rest = stripComment(rest).trim();
      if (rest.startsWith('[')) {
        while (!bracketsClosed(rest)) {
          i++;
          if (i >= lines.length) throw new Error('unclosed array');
          rest += ' ' + stripComment(lines[i]).trim();
        }
        value = parseArray(rest);
      } else {
        value = parseScalar(rest);
      }
    }

    const target = descend(table, keyParts.slice(0, -1));
    target[keyParts.at(-1)] = value;
  }
  return root;
}

module.exports = { parse };
