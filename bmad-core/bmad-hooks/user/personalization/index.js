'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const { buildDetectCorrectionsSessionPrompt } = require('./prompts/detect-corrections-session');

const LOG_FILE = path.join(os.homedir(), '.claude', 'bmad-hooks', 'personalization_debug.log');
const PERSONALIZATION_FILE = path.join(os.homedir(), '.claude', 'personalization.md');
const COUNTERS_FILE = path.join(
  os.homedir(),
  '.claude',
  'bmad-hooks',
  'personalization',
  'counters.json',
);

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

const ACTION_LABELS = {
  build_compile: 'Build / compile',
  run_tests: 'Run tests',
  install_deps: 'Install dependencies',
  db_migrations: 'DB migrations',
  lint_format: 'Lint / format',
};

// Min observations before a default is promoted to just-do (all observations are BMad's — developer terminal is unobservable)
const THRESHOLDS = {
  db_migrations: 15,
  run_tests: 10,
  install_deps: 10,
  build_compile: 7,
  lint_format: 7,
};

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

function readCounters() {
  try {
    if (!fs.existsSync(COUNTERS_FILE)) return null;
    return JSON.parse(fs.readFileSync(COUNTERS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeCounters(counters) {
  try {
    const tmp = COUNTERS_FILE + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(counters, null, 2), 'utf8');
    fs.renameSync(tmp, COUNTERS_FILE);
  } catch (error) {
    log('warn', 'writeCounters: failed', { error: error.message });
  }
}

function findBmadMemoryStateDir(cwd) {
  if (!cwd) return null;
  const stateDir = path.join(cwd, 'bmad-docs', 'memory', '.state');
  if (fs.existsSync(stateDir)) return stateDir;
  return null;
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
      resolve(code === 0 ? output.trim() || null : null);
    });

    proc.on('error', (error) => {
      clearTimeout(timer);
      log('warn', 'callClaude: error', { error: error.message });
      resolve(null);
    });
  });
}

function extractTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join(' ')
    .trim();
}

// Returns { exchanges: [{assistant, user}], bashCommands: [string] }
function parseTranscript(transcriptPath) {
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      return { exchanges: [], bashCommands: [] };
    }

    const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n').filter(Boolean);
    const messages = [];
    for (const line of lines) {
      try {
        messages.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }

    const exchanges = [];
    const bashCommands = [];
    let lastAssistantText = null;

    for (const msg of messages) {
      const role = msg.role || msg.type;
      const content = msg.message || msg.content || '';
      const blocks = Array.isArray(content) ? content : [];

      if (role === 'assistant') {
        for (const block of blocks) {
          if (block.type === 'tool_use' && block.name === 'Bash') {
            const cmd = block.input?.command || '';
            if (cmd) bashCommands.push(cmd);
          }
        }
        lastAssistantText = extractTextFromContent(content);
      } else if (role === 'user') {
        // Skip pure tool_result messages — not human input
        const allToolResults = blocks.length > 0 && blocks.every((b) => b.type === 'tool_result');
        if (allToolResults) continue;

        const userText = extractTextFromContent(content);
        if (userText && lastAssistantText !== null) {
          exchanges.push({ assistant: lastAssistantText, user: userText });
        }
        lastAssistantText = null;
      }
    }

    return { exchanges, bashCommands };
  } catch (error) {
    log('warn', 'parseTranscript: failed', { error: error.message });
    return { exchanges: [], bashCommands: [] };
  }
}

function detectActionsFromCommands(commands) {
  const counts = {};
  for (const command of commands) {
    const lower = command.toLowerCase();
    for (const action of ACTION_PATTERNS) {
      if (action.patterns.some((p) => lower.includes(p))) {
        counts[action.key] = (counts[action.key] || 0) + 1;
      }
    }
  }
  return counts;
}

function isGracePeriodActive(counters) {
  if (!counters.grace_period_start) return true;
  const days =
    (Date.now() - new Date(counters.grace_period_start).getTime()) / (1000 * 60 * 60 * 24);
  const totalObs = Object.values(counters)
    .filter((v) => v && typeof v === 'object' && 'observations' in v)
    .reduce((sum, v) => sum + v.observations, 0);
  return days < 30 || totalObs < 20;
}

function patchLayer3Defaults(content, counters, gracePeriodActive) {
  const statusLines = Object.entries(ACTION_LABELS).map(([key, label]) => {
    const c = counters[key];
    const minObs = THRESHOLDS[key];
    let status = 'still observing';
    if (!gracePeriodActive && c && c.observations >= minObs) {
      status = c.default === 'just-do' ? 'just-do' : 'ask';
    }
    return `- ${label}: ${status}`;
  });

  const graceNote = gracePeriodActive
    ? '_(Grace period active — defaults not applied until 30 days or 20 observations have passed.)_'
    : '_(Grace period complete — learned defaults are active.)_';

  const newSection =
    `## Layer 3 — Learned Action Defaults\n\n` +
    `_(Auto-maintained by SessionEnd hook. Do not edit manually.)_\n` +
    `${graceNote}\n\n` +
    statusLines.join('\n');

  const start = content.indexOf('## Layer 3 — Learned Action Defaults');
  if (start === -1) {
    return content.trimEnd() + '\n\n' + newSection + '\n';
  }
  const nextSection = content.indexOf('\n## ', start + 1);
  const before = content.slice(0, start);
  const after = nextSection === -1 ? '' : content.slice(nextSection);
  return before + newSection + '\n' + after;
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

async function handleSessionEnd(data) {
  const { exchanges, bashCommands } = parseTranscript(data.transcript_path);
  log('info', 'SessionEnd: parsed transcript', {
    exchanges: exchanges.length,
    bashCommands: bashCommands.length,
  });

  // --- Correction pass ---
  const matchedExchanges = exchanges.filter((e) => hasKeywords(e.user));
  if (matchedExchanges.length > 0) {
    log('info', 'SessionEnd: correction keywords found, calling claude', {
      count: matchedExchanges.length,
    });

    const prompt = buildDetectCorrectionsSessionPrompt({ exchanges: matchedExchanges });
    const result = await callClaude(prompt);

    if (result) {
      try {
        const parsed = JSON.parse(result.trim());
        if (Array.isArray(parsed.corrections) && parsed.corrections.length > 0) {
          const stateDir = findBmadMemoryStateDir(data.cwd);
          if (stateDir) {
            const stagingFile = path.join(stateDir, '.personalization-staging.json');
            let staged = [];
            try {
              if (fs.existsSync(stagingFile)) {
                staged = JSON.parse(fs.readFileSync(stagingFile, 'utf8'));
              }
            } catch {
              staged = [];
            }
            for (const c of parsed.corrections) {
              staged.push({
                rule: c.rule,
                agent_context: c.agent_context || 'general',
                date: new Date().toISOString().slice(0, 10),
              });
            }
            fs.writeFileSync(stagingFile, JSON.stringify(staged, null, 2), 'utf8');
            log('info', 'SessionEnd: corrections staged', { count: parsed.corrections.length });
          } else {
            log('info', 'SessionEnd: not a BMad project, corrections not staged');
          }
        } else {
          log('info', 'SessionEnd: no behavioral corrections detected');
        }
      } catch {
        log('warn', 'SessionEnd: failed to parse correction response');
      }
    }
  } else {
    log('info', 'SessionEnd: no correction keywords in session');
  }

  // --- Action counting pass ---
  if (bashCommands.length === 0) {
    log('info', 'SessionEnd: no bash commands in session, skipping counter update');
    return;
  }

  const counters = readCounters();
  if (!counters) {
    log('warn', 'SessionEnd: counters.json not found, skipping action tracking');
    return;
  }

  if (!counters.grace_period_start) {
    counters.grace_period_start = new Date().toISOString().slice(0, 10);
  }

  const sessionCounts = detectActionsFromCommands(bashCommands);
  if (Object.keys(sessionCounts).length === 0) {
    log('info', 'SessionEnd: no tracked actions found in bash commands');
    return;
  }

  for (const [key, count] of Object.entries(sessionCounts)) {
    if (counters[key]) counters[key].observations += count;
  }

  const gracePeriodActive = isGracePeriodActive(counters);
  if (!gracePeriodActive) {
    for (const [key, minObs] of Object.entries(THRESHOLDS)) {
      const c = counters[key];
      if (c && c.observations >= minObs && c.default !== 'just-do') {
        counters[key].default = 'just-do';
        log('info', 'SessionEnd: threshold crossed, default promoted to just-do', {
          key,
          observations: c.observations,
        });
      }
    }
  }

  writeCounters(counters);

  const personalization = readPersonalization();
  if (personalization) {
    const updated = patchLayer3Defaults(personalization, counters, gracePeriodActive);
    if (updated !== personalization) {
      try {
        fs.writeFileSync(PERSONALIZATION_FILE, updated, 'utf8');
        log('info', 'SessionEnd: personalization.md Layer 3 updated');
      } catch (error) {
        log('warn', 'SessionEnd: failed to write personalization.md', { error: error.message });
      }
    }
  }

  log('info', 'SessionEnd: action counting complete', { sessionCounts, gracePeriodActive });
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
      case 'SessionEnd': {
        await handleSessionEnd(data);
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
