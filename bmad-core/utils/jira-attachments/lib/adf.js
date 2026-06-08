'use strict';

const MEDIA_NODE_TYPES = new Set(['media', 'mediaInline']);
const TEXT_NODE_TYPE = 'text';

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  const content = node.content;
  if (Array.isArray(content)) {
    for (const child of content) walk(child, visit);
  }
}

function extractMediaReferences(adf) {
  const refs = [];
  walk(adf, (node) => {
    if (node && MEDIA_NODE_TYPES.has(node.type)) {
      const attrs = node.attrs || {};
      refs.push({
        mediaId: attrs.id || null,
        collection: attrs.collection || null,
        fileName: attrs.alt || attrs.fileName || null,
        width: attrs.width || null,
        height: attrs.height || null,
      });
    }
  });
  return refs;
}

function extractPlainText(adf) {
  if (!adf) return '';
  const parts = [];
  walk(adf, (node) => {
    if (node && node.type === TEXT_NODE_TYPE && typeof node.text === 'string') {
      parts.push(node.text);
    }
  });
  return parts.join('').trim();
}

function summarizeDescription(issue) {
  const renderedText =
    typeof issue?.renderedFields?.description === 'string'
      ? stripHtml(issue.renderedFields.description)
      : '';
  const adf = issue?.fields?.description;
  const adfText = adf && typeof adf === 'object' ? extractPlainText(adf) : '';
  return renderedText || adfText || '';
}

function stripHtml(html) {
  return String(html)
    .replaceAll(/<style[\s\S]*?<\/style>/gi, ' ')
    .replaceAll(/<script[\s\S]*?<\/script>/gi, ' ')
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function collectAdfMediaFromIssue(issue) {
  const locations = [];

  if (issue?.fields?.description) {
    locations.push({
      source: 'description',
      refs: extractMediaReferences(issue.fields.description),
    });
  }

  const comments = issue?.fields?.comment?.comments;
  if (Array.isArray(comments)) {
    for (const comment of comments) {
      if (comment?.body) {
        const refs = extractMediaReferences(comment.body);
        if (refs.length > 0) {
          locations.push({
            source: 'comment',
            commentId: comment.id || null,
            commentAuthor: comment?.author?.displayName || null,
            refs,
          });
        }
      }
    }
  }

  return locations;
}

module.exports = {
  extractMediaReferences,
  extractPlainText,
  summarizeDescription,
  collectAdfMediaFromIssue,
};
