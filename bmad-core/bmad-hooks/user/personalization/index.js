'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const { buildDetectCorrectionPrompt } = require('./prompts/detect-correction');

const LOG_FILE = path.join(os.homedir(), '.claude', 'bmad-hooks', 'personalization_debug.log');
const PERSONALIZATION_FILE = path.join(os.homedir(), '.claude', 'personalization.md');

// Layer 2 correction keywords — cheap pre-filter before any LLM call
const CORRECTION_KEYWORDS = [
  "don't",
  'dont',
  'stop',
  'never',
  'always',
  'told you',
  'said before',
  'i said',
  'not like that',
  'wrong way',
  'incorrect',
  'that is wrong',
  "that's wrong",
];

// Actions tracked for Layer 3
const ACTION_PATTERNS = [
  {
    key: 'build_compile',
    patterns: [
      'npm run build',
      'npm run compile',
      'tsc ',
      'dotnet build',
      'mvn package',
      'gradle build',
      'make ',
      'cargo build',
    ],
  },
  {
    key: 'run_tests',
    patterns: [
      'npm test',
      'npm run test',
      'jest ',
      'pytest ',
      'dotnet test',
      'mvn test',
      'gradle test',
      'go test',
    ],
  },
  {
    key: 'install_deps',
    patterns: [
      'npm install',
      'npm i ',
      'yarn install',
      'pip install',
      'dotnet restore',
      'mvn install',
      'composer install',
    ],
  },
  {
    key: 'db_migrations',
    patterns: [
      'migrate',
      'migration',
      'knex migrate',
      'sequelize db:migrate',
      'alembic upgrade',
      'flyway',
      'liquibase',
    ],
  },
  {
    key: 'lint_format',
    patterns: [
      'eslint',
      'prettier',
      'npm run lint',
      'dotnet format',
      'black ',
      'isort ',
      'rubocop',
    ],
  },
];

function log(level, message, extra) {
  try {
    const entry = { ts: new Date().toISOString(), level, message, ...extra };
    if (!fs.existsSync(LOG_FILE) || fs.statSync(LOG_FILE).size === 0) {
      fs.writeFileSync(LOG_FILE, '﻿', { encoding: 'utf8' });
    }
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', { encoding: 'utf8' });
  } catch {
    // ignore log failures
  }
}

function readPersonalization() {
  try {
    if (!fs.existsSync(PERSONALIZATION_FILE)) return null;
    return fs.readFileSync(PERSONALIZATION_FILE, 'utf8');
  } catch {
    return null;
  }
}

function findBmadMemoryStateDir(cwd) {
  if (!cwd) return null;
  const stateDir = path.join(cwd, 'bmad-docs', 'memory', '.state');
  if (fs.existsSync(stateDir)) return stateDir;
  return null;
}

function readLastUserMessage(transcriptPath) {
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return '';
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    // Walk backwards to find last user turn
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.role === 'user' || (entry.type === 'user' && entry.message)) {
          const msg = entry.message || entry.content || '';
          if (typeof msg === 'string') return msg;
          if (Array.isArray(msg)) {
            return msg.map((b) => (typeof b === 'string' ? b : b.text || '')).join(' ');
          }
        }
      } catch {
        // skip malformed line
      }
    }
    return '';
  } catch {
    return '';
  }
}

function hasKeywords(text) {
  const lower = text.toLowerCase();
  return CORRECTION_KEYWORDS.some((kw) => lower.includes(kw));
}

function callClaude(prompt) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn('claude', ['--print', '--output-format', 'text'], {
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      log('warn', 'callClaude: spawn failed', { error: error.message });
      resolve(null);
      return;
    }

    let output = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
      log('warn', 'callClaude: timed out');
      resolve(null);
    }, 60_000);

    proc.stdout.on('data', (chunk) => {
      output += chunk;
    });
    proc.stdin.write(prompt, 'utf8');
    proc.stdin.end();

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code === 0) {
        resolve(output.trim() || null);
      } else {
        log('warn', 'callClaude: non-zero exit', { code });
        resolve(null);
      }
    });

    proc.on('error', (error) => {
      clearTimeout(timer);
      log('warn', 'callClaude: error', { error: error.message });
      resolve(null);
    });
  });
}

function detectActionFromCommand(command) {
  if (!command || typeof command !== 'string') return null;
  const lower = command.toLowerCase();
  for (const action of ACTION_PATTERNS) {
    if (action.patterns.some((p) => lower.includes(p))) return action.key;
  }
  return null;
}

function patchLayer3Counter(content, actionKey, actor) {
  // Find the JSON block under "### Action Frequency Counters"
  const blockMatch = content.match(/(### Action Frequency Counters\s*```json\s*)([\s\S]*?)(```)/);
  if (!blockMatch) return content;
  try {
    const counters = JSON.parse(blockMatch[2]);
    if (!counters[actionKey]) return content;
    counters[actionKey].observations = (counters[actionKey].observations || 0) + 1;
    counters[actionKey][actor] = (counters[actionKey][actor] || 0) + 1;
    if (!counters.grace_period_start) {
      counters.grace_period_start = new Date().toISOString().slice(0, 10);
    }
    const updated = content.replace(
      blockMatch[0],
      blockMatch[1] + JSON.stringify(counters, null, 2) + '\n' + blockMatch[3],
    );
    return updated;
  } catch {
    return content;
  }
}

// ---- Event handlers ----

async function handleSessionStart(data) {
  const content = readPersonalization();
  if (!content) {
    log('info', 'SessionStart: personalization.md not found, skipping injection');
    return;
  }
  const output = { hookSpecificOutput: { additionalContext: content } };
  process.stdout.write(JSON.stringify(output));
  log('info', 'SessionStart: personalization injected', { chars: content.length });
}

async function handleStop(data) {
  const lastAssistant = data.last_assistant_message || '';
  const lastUser = readLastUserMessage(data.transcript_path);

  const combined = lastAssistant + ' ' + lastUser;
  if (!hasKeywords(combined)) {
    log('info', 'Stop: no correction keywords, skipping');
    return;
  }

  log('info', 'Stop: keywords matched, calling claude for correction detection');

  const prompt = buildDetectCorrectionPrompt({
    lastAssistant: lastAssistant.slice(0, 2000),
    lastUser: lastUser.slice(0, 1000),
  });

  const result = await callClaude(prompt);
  if (!result) return;

  try {
    const parsed = JSON.parse(result.trim());
    if (!parsed.is_correction) {
      log('info', 'Stop: haiku determined not a correction');
      return;
    }

    const stateDir = findBmadMemoryStateDir(data.cwd);
    if (!stateDir) {
      log('info', 'Stop: not a BMad project (no bmad-docs/memory/.state/), skipping staging');
      return;
    }

    const stagingFile = path.join(stateDir, '.personalization-staging.json');
    let staged = [];
    try {
      if (fs.existsSync(stagingFile)) {
        staged = JSON.parse(fs.readFileSync(stagingFile, 'utf8'));
      }
    } catch {
      staged = [];
    }

    staged.push({
      rule: parsed.rule,
      agent_context: parsed.agent_context || 'general',
      date: new Date().toISOString().slice(0, 10),
    });

    fs.writeFileSync(stagingFile, JSON.stringify(staged, null, 2), 'utf8');
    log('info', 'Stop: correction staged', { rule: parsed.rule });
  } catch {
    log('warn', 'Stop: failed to parse haiku response');
  }
}

async function handlePostToolUse(data) {
  const toolName = data.tool_name || '';
  if (toolName !== 'Bash') return;

  const command = (data.tool_input && data.tool_input.command) || '';
  const actionKey = detectActionFromCommand(command);
  if (!actionKey) return;

  // Determine if BMad ran it (tool_response success = BMad ran it)
  const actor = 'bmad';

  const content = readPersonalization();
  if (!content) return;

  const updated = patchLayer3Counter(content, actionKey, actor);
  if (updated === content) return;

  try {
    fs.writeFileSync(PERSONALIZATION_FILE, updated, 'utf8');
    log('info', 'PostToolUse: layer3 counter updated', { actionKey, actor });
  } catch (error) {
    log('warn', 'PostToolUse: failed to write personalization', { error: error.message });
  }
}

// ---- Main ----

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    // empty or invalid stdin
  }

  const event = data.hook_event_name;
  log('info', `event received: ${event}`);

  const run = async () => {
    switch (event) {
      case 'SessionStart': {
        await handleSessionStart(data);
        break;
      }
      case 'Stop': {
        await handleStop(data);
        break;
      }
      case 'PostToolUse': {
        await handlePostToolUse(data);
        break;
      }
      // no default — silently ignore other events
    }
  };

  run().catch((error) => {
    log('error', 'unhandled error', { error: error.message });
    // always exit 0 — hook must not crash Claude
  });
});
