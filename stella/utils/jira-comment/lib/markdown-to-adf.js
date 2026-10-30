'use strict';

// Minimal, deterministic Markdown → Atlassian Document Format for completion
// comments. Supported: paragraphs, headings (#..###), bullet and numbered lists,
// fenced code blocks, inline code, bold, links. Everything else is plain text.
// Deliberately small: no HTML, no nesting beyond one list level, no tables.

const MAX_CHARS = 32_000; // Jira comment limit is ~32k characters

function text(value, marks) {
  const node = { type: 'text', text: value };
  if (marks && marks.length > 0) node.marks = marks;
  return node;
}

/** Inline: `code`, **bold**, [label](https://url). Left to right, no nesting. */
function inline(line) {
  const out = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push(text(line.slice(last, m.index)));
    if (m[1]) out.push(text(m[1].slice(1, -1), [{ type: 'code' }]));
    else if (m[2]) out.push(text(m[2].slice(2, -2), [{ type: 'strong' }]));
    else if (m[3]) {
      const label = m[3].slice(1, m[3].indexOf(']('));
      out.push(text(label, [{ type: 'link', attrs: { href: m[4] } }]));
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(text(line.slice(last)));
  return out.length > 0 ? out : [text('')];
}

const paragraph = (lines) => ({ type: 'paragraph', content: inline(lines.join(' ')) });

function listNode(kind, items) {
  return {
    type: kind === 'ol' ? 'orderedList' : 'bulletList',
    content: items.map((item) => ({ type: 'listItem', content: [paragraph([item])] })),
  };
}

/**
 * @param {string} markdown
 * @returns {{version:1, type:'doc', content:object[]}}
 */
function markdownToAdf(markdown) {
  const src = String(markdown || '').replaceAll('\r\n', '\n');
  if (src.length > MAX_CHARS) {
    throw new Error(`Comment too long (${src.length} chars, max ${MAX_CHARS}).`);
  }
  const lines = src.split('\n');
  const content = [];
  let para = [];
  let list = null; // { kind, items }
  let code = null; // { lang, lines }

  const flushPara = () => {
    if (para.length > 0) content.push(paragraph(para));
    para = [];
  };
  const flushList = () => {
    if (list) content.push(listNode(list.kind, list.items));
    list = null;
  };

  for (const raw of lines) {
    if (code) {
      if (raw.startsWith('```')) {
        content.push({
          type: 'codeBlock',
          attrs: code.lang ? { language: code.lang } : {},
          content: code.lines.length > 0 ? [text(code.lines.join('\n'))] : [],
        });
        code = null;
      } else code.lines.push(raw);
      continue;
    }
    const line = raw.trimEnd();
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      flushPara();
      flushList();
      code = { lang: fence[1] || '', lines: [] };
      continue;
    }
    if (line.trim() === '') {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      content.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: inline(heading[2]),
      });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const kind = bullet ? 'ul' : 'ol';
      if (!list || list.kind !== kind) {
        flushList();
        list = { kind, items: [] };
      }
      list.items.push((bullet || numbered)[1]);
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  if (code) {
    content.push({
      type: 'codeBlock',
      attrs: {},
      content: code.lines.length > 0 ? [text(code.lines.join('\n'))] : [],
    });
  }
  flushPara();
  flushList();
  if (content.length === 0) content.push(paragraph(['']));
  return { version: 1, type: 'doc', content };
}

module.exports = { markdownToAdf, MAX_CHARS };
