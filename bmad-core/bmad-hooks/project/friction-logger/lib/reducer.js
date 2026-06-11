'use strict';

const fs = require('node:fs');

// Transcript JSONL -> friction "screenplay".
// Locked keep/drop rules (validated on real transcripts: 257->76, 68->20 lines):
//   KEEP  [USER]            typed human prompts (never truncated — friction gold)
//   KEEP  [AGENT]           assistant text blocks (full, no cap — the agent's visible speech)
//   KEEP  [command: X]      slash-command invocations (<command-name>)
//   KEEP  [activated: X]    isMeta injected agent/skill bodies, reduced to one marker
//   KEEP  [tool: name arg]  tool_use headers (file parentDir/basename | command ~60ch | pattern ~40ch), payload dropped
//   KEEP  [SESSION RECAP]   system/away_summary (Claude's own end-of-session recap)
//   DROP  tool_result content entirely, thinking blocks, attachments, system, metadata lines

function reduceTranscript(transcriptPath) {
  const lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  let firstTs = null;
  let lastTs = null;

  for (const line of lines) {
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.timestamp) {
      if (!firstTs) firstTs = o.timestamp;
      lastTs = o.timestamp;
    }

    if (o.type === 'system' && o.subtype === 'away_summary' && o.content) {
      out.push(`[SESSION RECAP] ${o.content}`);
      continue;
    }

    if (o.type === 'user') {
      const c = o.message && o.message.content;

      if (o.isMeta) {
        const text = Array.isArray(c) ? (c[0] && c[0].text) || '' : '';
        const m = text.match(/^#\s*(\S+)/);
        out.push(`[activated: ${m ? m[1] : 'injected-content'}]`);
        continue;
      }

      if (typeof c === 'string') {
        const cm = c.match(/<command-name>([^<]+)<\/command-name>/);
        if (cm) {
          out.push(`[command: ${cm[1]}]`);
        } else {
          out.push(`[USER] ${JSON.stringify(c)}`);
        }
      }
      // tool_result arrays -> dropped
      continue;
    }

    if (o.type === 'assistant') {
      for (const b of (o.message && o.message.content) || []) {
        if (b.type === 'text' && b.text && b.text.trim()) {
          out.push(`[AGENT] ${JSON.stringify(b.text)}`);
        }
        if (b.type === 'tool_use') {
          let hdr = b.name;
          const inp = b.input || {};
          if (inp.file_path) {
            hdr += ' ' + String(inp.file_path).split(/[\\/]/).slice(-2).join('/');
          } else if (inp.command) {
            hdr += ' `' + String(inp.command).slice(0, 60) + '`';
          } else if (inp.pattern) {
            hdr += ' /' + String(inp.pattern).slice(0, 40) + '/';
          }
          out.push(`[tool: ${hdr}]`);
        }
        // thinking blocks -> dropped
      }
    }
    // attachments / system / metadata -> dropped
  }

  return { script: out.join('\n'), firstTs, lastTs, rawLines: lines.length, keptLines: out.length };
}

// Build the full screenplays input for the analysis: one labeled block per
// session, ordered chronologically by endedAt.
// sessions: [ { sessionId, agents[], transcript, endedAt } ]
function buildScreenplays(sessions) {
  const blocks = [];
  const ordered = [...sessions].sort((a, b) => String(a.endedAt).localeCompare(String(b.endedAt)));
  for (const s of ordered) {
    const { script, firstTs } = reduceTranscript(s.transcript);
    const date = (firstTs || '').slice(0, 10);
    blocks.push(
      `=== Session ${s.sessionId.slice(0, 8)} · agents: [${s.agents.join(', ')}] · ${date} ===\n${script}`,
    );
  }
  return blocks.join('\n\n');
}

module.exports = { reduceTranscript, buildScreenplays };
