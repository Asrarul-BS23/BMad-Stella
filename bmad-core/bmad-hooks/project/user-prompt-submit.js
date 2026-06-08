'use strict';

// UserPromptSubmit hook — fires on every user message.
// Sole purpose: check if a new calendar day has started and spawn daily-job.js if so.
// Must exit quickly — does not block the session.

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const DAILY_JOB = path.join(__dirname, 'daily-job.js');

function readDailyState(cwd) {
  try {
    const filePath = path.join(cwd, 'bmad-docs', 'memory', '.state', '.daily-state.json');
    if (!fs.existsSync(filePath)) return { last_daily_run: null, last_weekly_run: null };
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { last_daily_run: null, last_weekly_run: null };
  }
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(raw);
    const cwd = data.cwd;

    if (!cwd) process.exit(0);

    // Guard: only run in BMad projects
    const memoryDir = path.join(cwd, 'bmad-docs', 'memory');
    if (!fs.existsSync(memoryDir)) process.exit(0);

    const state = readDailyState(cwd);
    const today = todayUTC();

    if (state.last_daily_run === today) {
      // Already ran today
      process.exit(0);
    }

    // Spawn daily job as detached background process
    const proc = spawn(process.execPath, [DAILY_JOB, cwd], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    proc.unref();
  } catch {
    // Never crash Claude
  }
  process.exit(0);
});
