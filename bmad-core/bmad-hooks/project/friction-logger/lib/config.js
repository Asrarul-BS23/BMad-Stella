'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Minimal reader for the `logging:` block of {project}/.bmad-core/core-config.yaml.
// Line-based on purpose — no YAML dependency (hooks are zero-dep). Falls back to
// locked defaults when the file or block is absent.

const DEFAULTS = {
  triggerStatuses: ['Ready for Review', 'Ready for Done'],
  model: 'default', // 'default' = no --model flag on claude --print
  confluence: { enabled: false, logsPageUrl: '' }, // publishing is opt-in via installer
};

function readLoggingConfig(cwd) {
  const config = {
    ...DEFAULTS,
    triggerStatuses: [...DEFAULTS.triggerStatuses],
    confluence: { ...DEFAULTS.confluence },
  };
  let text;
  try {
    text = fs.readFileSync(path.join(cwd, '.bmad-core', 'core-config.yaml'), 'utf8');
  } catch {
    return config;
  }

  const block = text.match(/^logging:\s*\r?\n((?:[ \t]+.*\r?\n?)*)/m);
  if (!block) return config;
  const body = block[1];

  const statuses = [];
  const statusBlock = body.match(/triggerStatuses:\s*\r?\n((?:[ \t]+-[^\n]*\r?\n?)*)/);
  if (statusBlock) {
    for (const line of statusBlock[1].split(/\r?\n/)) {
      const m = line.match(/-\s*(.+?)\s*$/);
      if (m) statuses.push(m[1]);
    }
  }
  if (statuses.length > 0) config.triggerStatuses = statuses;

  const model = body.match(/model:\s*(\S+)/);
  if (model) config.model = model[1];

  // confluence: sub-block (written by the installer; absent on local-only installs)
  const confluenceBlock = body.match(/confluence:\s*\r?\n((?:[ \t]+[^\n]*\r?\n?)*)/);
  if (confluenceBlock) {
    const cBody = confluenceBlock[1];
    const enabled = cBody.match(/enabled:\s*(\S+)/);
    if (enabled) config.confluence.enabled = enabled[1] === 'true';
    const logsPageUrl = cBody.match(/logsPageUrl:\s*(\S+)/);
    if (logsPageUrl) config.confluence.logsPageUrl = logsPageUrl[1].replaceAll(/^['"]|['"]$/g, '');
  }

  return config;
}

module.exports = { readLoggingConfig, DEFAULTS };
