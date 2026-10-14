'use strict';

// Step 1 — preflight. Node 20.10+, uv, gh, git. Silent when everything is present.
// `run` is injectable for tests: (cmd, args) => { status, stdout }.

const { spawnSync } = require('node:child_process');
const { MIN_NODE } = require('./constants');

const defaultRun = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });

function parseNode(version) {
  const m = /^v?(\d+)\.(\d+)/.exec(String(version || ''));
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

function nodeOk(version) {
  const v = parseNode(version);
  if (!v) return false;
  return v.major > MIN_NODE.major || (v.major === MIN_NODE.major && v.minor >= MIN_NODE.minor);
}

function present(run, cmd) {
  try {
    const r = run(cmd, ['--version']);
    return Boolean(r && r.status === 0);
  } catch {
    return false;
  }
}

/**
 * @returns {{ok:boolean, errors:string[], warnings:string[], found:object}}
 */
function check({ run = defaultRun, nodeVersion = process.version } = {}) {
  const errors = [];
  const warnings = [];
  const found = {
    node: nodeOk(nodeVersion),
    uv: present(run, 'uv'),
    gh: present(run, 'gh'),
    git: present(run, 'git'),
  };
  if (!found.node) {
    errors.push(
      `Node ${MIN_NODE.major}.${MIN_NODE.minor}+ is required (found ${nodeVersion}). Install from https://nodejs.org/`,
    );
  }
  if (!found.uv) {
    errors.push(
      'uv is required: every BMad v6 skill renders through `uv run`. Install it from https://docs.astral.sh/uv/getting-started/installation/ and re-run.',
    );
  }
  if (!found.gh) {
    warnings.push(
      'gh (GitHub CLI) not found. /stella-pr-review needs it: https://cli.github.com/ then `gh auth login`.',
    );
  }
  if (!found.git) {
    warnings.push('git not found. BMad records baselines and the review guard needs a repository.');
  }
  return { ok: errors.length === 0, errors, warnings, found };
}

module.exports = { check, nodeOk, parseNode };
