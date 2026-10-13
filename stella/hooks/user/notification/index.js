'use strict';

const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const LOG_FILE = path.join(os.homedir(), '.claude', 'bmad-hooks', 'claude_hook_debug.log');
const PLATFORM = process.platform;
const ICON = path.join(__dirname, 'claude-icon.png');

function log(eventType, data) {
  try {
    const eventName = data.notification_type ? `${eventType}:${data.notification_type}` : eventType;
    const slim = { cwd: data.cwd, message: data.message };
    // Write UTF-8 BOM on first write so Windows auto-detection reads the file correctly
    if (!fs.existsSync(LOG_FILE) || fs.statSync(LOG_FILE).size === 0) {
      fs.writeFileSync(LOG_FILE, '﻿', { encoding: 'utf8' });
    }
    fs.appendFileSync(
      LOG_FILE,
      `${new Date().toISOString()} [${eventName}] ${JSON.stringify(slim)}\n`,
      { encoding: 'utf8' },
    );
  } catch {
    // ignore log failures — hook must not crash Claude
  }
}

function spawnDetached(cmd, args) {
  const proc = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
  proc.unref();
}

function sendNotification(title, message, withBeep) {
  if (PLATFORM === 'win32') {
    const arch = process.arch === 'x64' ? 'x64' : 'x86';
    const snoretoast = path.join(
      __dirname,
      'node_modules',
      'node-notifier',
      'vendor',
      'snoreToast',
      `snoretoast-${arch}.exe`,
    );
    const args = [
      '-t',
      title,
      '-m',
      message,
      '-p',
      ICON,
      '-appID',
      'Claude Code',
      '-id',
      'claude-code',
      '-silent',
    ];
    // Toast first (detached — fast, exits before anything else runs)
    spawnDetached(snoretoast, args);
    if (withBeep) {
      // spawnSync blocks Node until PowerShell finishes — guarantees beep plays.
      // Play() + Start-Sleep avoids PlaySync()'s message-loop dependency.
      spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-Command',
          '[System.Media.SystemSounds]::Beep.Play(); Start-Sleep -Milliseconds 400',
        ],
        { stdio: 'ignore', windowsHide: true, timeout: 5000 },
      );
    }
  } else if (PLATFORM === 'darwin') {
    const esc = (s) => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    if (withBeep) {
      spawnDetached('osascript', ['-e', 'beep']);
    }
    spawnDetached('osascript', [
      '-e',
      `display notification "${esc(message)}" with title "${esc(title)}"`,
    ]);
  } else {
    if (withBeep) {
      spawnDetached('sh', [
        '-c',
        'paplay /usr/share/sounds/freedesktop/stereo/bell.oga 2>/dev/null || aplay /usr/share/sounds/alsa/Front_Center.wav 2>/dev/null',
      ]);
    }
    spawnDetached('notify-send', ['-i', ICON, title, message]);
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  // Background LLM subprocesses (daily-job.js, pattern-scanner.js, domain-map-distiller.js)
  // are spawned headless with this env var set — nobody is present to see or act on a
  // notification for them, so skip sending one entirely.
  if (process.env.BMAD_HOOK_SUBPROCESS === '1') return;

  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    // empty stdin or invalid JSON — treat as Stop event with no cwd
  }

  const title = (data.cwd ? path.basename(data.cwd) : '') || 'Claude Code';
  const eventName = data.hook_event_name;

  log(eventName || 'Unknown', data);

  switch (eventName) {
    case 'PermissionRequest': {
      sendNotification(title, 'Waiting for Your Input', true);

      break;
    }
    case 'Stop': {
      sendNotification(title, 'Done', false);

      break;
    }
    // No default
  }
  // Node exits naturally — all spawned processes are detached and unref'd
});
