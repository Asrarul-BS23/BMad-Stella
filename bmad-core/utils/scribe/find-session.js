'use strict';

/**
 * find-session.js — discover Claude Code session_id for the current project.
 *
 * Usage:
 *   echo "<unique snippet>" | node find-session.js   (content-match preferred)
 *   node find-session.js                              (mtime fallback only)
 *
 * Output: session_id on stdout (no trailing newline).
 *         Errors on stderr; exit 0 = success, non-zero = failure.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TAIL_BYTES = 16 * 1024;

function encodeProjectPath(cwd) {
  // Claude Code: ":", "\", "/" all become "-". Case preserved.
  return cwd.replaceAll(/[:\\/]/g, '-');
}

function readTail(filePath, bytes) {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - bytes);
  const len = stat.size - start;
  if (len === 0) return '';
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, len, start);
  } finally {
    fs.closeSync(fd);
  }
  return buf.toString('utf8');
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.trim();
}

function listSessions(projDir) {
  if (!fs.existsSync(projDir)) return [];
  return fs
    .readdirSync(projDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const full = path.join(projDir, f);
      try {
        return {
          sessionId: f.replace(/\.jsonl$/, ''),
          path: full,
          mtime: fs.statSync(full).mtime.getTime(),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
}

(async () => {
  try {
    const cwd = process.cwd();
    const enc = encodeProjectPath(cwd);
    const projDir = path.join(os.homedir(), '.claude', 'projects', enc);

    const sessions = listSessions(projDir);
    if (sessions.length === 0) {
      process.stderr.write(`find-session: no transcripts in ${projDir}\n`);
      process.exit(2);
    }

    const fingerprint = await readStdin();

    if (fingerprint) {
      for (const s of sessions) {
        try {
          const tail = readTail(s.path, TAIL_BYTES);
          if (tail.includes(fingerprint)) {
            process.stdout.write(s.sessionId);
            return;
          }
        } catch {
          // skip unreadable file
        }
      }
      // No content match — fall through to mtime fallback
    }

    process.stdout.write(sessions[0].sessionId);
  } catch (error) {
    process.stderr.write(`find-session: ${error.message}\n`);
    process.exit(1);
  }
})();
