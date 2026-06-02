'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const LOG_FILE = path.join(os.homedir(), '.claude', 'custom_hooks', 'claude_hook_debug.log');
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
    ];
    if (!withBeep) args.push('-silent');
    spawnDetached(snoretoast, args);
  } else if (PLATFORM === 'darwin') {
    const esc = (s) => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    if (withBeep) {
      spawnDetached('afplay', ['/System/Library/Sounds/Funk.aiff']);
    }
    spawnDetached('osascript', [
      '-e',
      `display notification "${esc(message)}" with title "${esc(title)}"`,
    ]);
  } else {
    if (withBeep) process.stdout.write('');
    spawnDetached('notify-send', ['-i', ICON, title, message]);
  }
}

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
    // empty stdin or invalid JSON — treat as Stop event with no cwd
  }

  const title = (data.cwd ? path.basename(data.cwd) : '') || 'Claude Code';
  const isNotification = Boolean(data.notification_type);

  log(isNotification ? 'Notification' : 'Stop', data);

  if (isNotification) {
    switch (data.notification_type) {
      case 'permission_prompt': {
        sendNotification(title, 'Waiting for Your Input', true);
        break;
      }
      case 'idle_prompt': {
        break;
      }
      case 'push_notification': {
        sendNotification(title, data.message || 'Notification', false);
        break;
      }
      default: {
        sendNotification(title, data.message || 'Notification', false);
      }
    }
  } else {
    sendNotification(title, 'Done', false);
  }
  // Node exits naturally here — all spawned processes are detached and unref'd
});
