'use strict';

const fs = require('node:fs');

// Transcript JSONL -> friction "screenplay".
// Locked keep/drop rules (validated on real transcripts: 257->76, 68->20 lines):
//   KEEP  [USER]            typed human prompts (never truncated — friction gold)
//   KEEP  [AGENT]           assistant text blocks, capped at MAX_AGENT_LINE_CHARS
//   KEEP  [command: X]      slash-command invocations (<command-name>)
//   KEEP  [activated: X]    isMeta injected agent/skill bodies, reduced to one marker
//   KEEP  [tool: name arg]  tool_use headers (file parentDir/basename | command ~60ch | pattern ~40ch), payload dropped
//   KEEP  [SESSION RECAP]   system/away_summary (Claude's own end-of-session recap)
//   DROP  tool_result content entirely, thinking blocks, attachments, system, metadata lines
//
// Size budget (measured on 39 local transcripts: median 23k chars, p90 365k,
// max 855k ≈ 215k tokens — a single heavy session overflowed the context):
//   MAX_AGENT_LINE_CHARS   per [AGENT] line; long agent essays are mostly noise
//   MAX_SCREENPLAY_CHARS   whole screenplays input (~75k tokens); oldest sessions
//                          are dropped first, newest is always kept (sliced if needed)

const MAX_AGENT_LINE_CHARS = 1500;
const MAX_SCREENPLAY_CHARS = 300_000;

function capAgentText(text) {
  if (text.length <= MAX_AGENT_LINE_CHARS) return text;
  return text.slice(0, MAX_AGENT_LINE_CHARS) + ' …[truncated]';
}

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
          out.push(`[AGENT] ${JSON.stringify(capAgentText(b.text))}`);
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
//
// Budget rule: fill from the NEWEST session backwards until MAX_SCREENPLAY_CHARS
// is reached (newest sessions carry most friction — dev fixes, QA loops). Whole
// older sessions are dropped, never partially cut; a marker records how many.
// The newest session is always kept — if it alone exceeds the budget, its head
// is kept and the tail sliced (the tail is where the session wound down).
function buildScreenplays(sessions) {
  const ordered = [...sessions].sort((a, b) => String(a.endedAt).localeCompare(String(b.endedAt)));
  const blocks = ordered.map((s) => {
    const { script, firstTs } = reduceTranscript(s.transcript);
    const date = (firstTs || '').slice(0, 10);
    return `=== Session ${s.sessionId.slice(0, 8)} · agents: [${s.agents.join(', ')}] · ${date} ===\n${script}`;
  });

  const kept = [];
  let used = 0;
  let dropped = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    let block = blocks[i];
    if (kept.length === 0 && block.length > MAX_SCREENPLAY_CHARS) {
      block = block.slice(0, MAX_SCREENPLAY_CHARS) + '\n…[session truncated: size budget]';
    } else if (used + block.length + 2 > MAX_SCREENPLAY_CHARS) {
      dropped = i + 1; // this block and every older one are out
      break;
    }
    kept.unshift(block);
    used += block.length + 2;
  }

  if (dropped > 0) {
    kept.unshift(`[TRUNCATED: ${dropped} older session(s) omitted — size budget]`);
  }
  return kept.join('\n\n');
}

module.exports = {
  reduceTranscript,
  buildScreenplays,
  MAX_SCREENPLAY_CHARS,
  MAX_AGENT_LINE_CHARS,
};
