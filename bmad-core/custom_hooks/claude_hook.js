'use strict';

const notifier = require('node-notifier');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const LOG_FILE = path.join(os.homedir(), '.claude', 'custom_hooks', 'claude_hook_debug.log');
const PLATFORM = process.platform;

function log(eventType, data) {
  try {
    fs.appendFileSync(
      LOG_FILE,
      `${new Date().toISOString()} [${eventType}] ${JSON.stringify(data)}\n`,
    );
  } catch {
    // ignore log failures — hook must not crash Claude
  }
}

function sendNotification(title, message, withBeep) {
  if (withBeep && PLATFORM === 'linux') {
    process.stdout.write('');
  }

  const options = {
    title,
    message,
    sound: withBeep && PLATFORM !== 'linux',
  };

  if (PLATFORM === 'win32') {
    options.appID = 'Claude Code';
  }

  notifier.notify(options);
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
        sendNotification(title, 'Waiting for Answer', true);
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
});
