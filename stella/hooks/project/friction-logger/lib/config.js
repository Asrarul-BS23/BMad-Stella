'use strict';

const fs = require('node:fs');
const paths = require('./paths');

// Reader for _bmad/custom/stella/friction.json (written by the Stella installer).
// JSON on purpose — hooks are zero-dependency and Node has no TOML parser.
// Falls back to locked defaults when the file or a key is absent.

const DEFAULTS = {
  triggerStatuses: ['done'], // spec frontmatter `status:` values that make a plan fireable
  model: 'default', // 'default' = no --model flag on claude --print
  confluence: { enabled: false, logsPageUrl: '' }, // publishing is opt-in via installer
};

function readLoggingConfig(cwd) {
  const config = {
    ...DEFAULTS,
    triggerStatuses: [...DEFAULTS.triggerStatuses],
    confluence: { ...DEFAULTS.confluence },
  };

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(paths.configFile(cwd), 'utf8'));
  } catch {
    return config;
  }
  if (!parsed || typeof parsed !== 'object') return config;

  if (Array.isArray(parsed.triggerStatuses)) {
    const statuses = parsed.triggerStatuses
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => s.trim());
    if (statuses.length > 0) config.triggerStatuses = statuses;
  }

  if (typeof parsed.model === 'string' && parsed.model.trim()) config.model = parsed.model.trim();

  if (parsed.confluence && typeof parsed.confluence === 'object') {
    if (typeof parsed.confluence.enabled === 'boolean') {
      config.confluence.enabled = parsed.confluence.enabled;
    }
    if (typeof parsed.confluence.logsPageUrl === 'string') {
      config.confluence.logsPageUrl = parsed.confluence.logsPageUrl.trim();
    }
  }

  return config;
}

module.exports = { readLoggingConfig, DEFAULTS };
