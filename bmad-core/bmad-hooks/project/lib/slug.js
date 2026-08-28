'use strict';

// Shared slug normalization — keeps module tags and semantic domains consistent
// so "Triage-Pipeline", "triage_pipeline", and "triage-pipeline" don't fragment
// into separate files.
function normalizeModuleTag(tag) {
  if (!tag || typeof tag !== 'string') return null;
  const slug = tag
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_]+/g, '-')
    .replaceAll(/[^a-z0-9-]/g, '')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '');
  return slug || null;
}

module.exports = { normalizeModuleTag };
