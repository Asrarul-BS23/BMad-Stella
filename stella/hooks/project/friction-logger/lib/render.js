'use strict';

// friction.json -> friction.md (human-readable rendering, locked layout).

function renderMarkdown(friction) {
  const lines = [];
  const sessions = (friction.sessions_analyzed || [])
    .map((s) => `${String(s.sessionId).slice(0, 8)} (${(s.agents || []).join(', ')})`)
    .join(', ');
  const st = friction.stats || {};

  lines.push(
    `# Friction Log — ${friction.plan_id} · ${friction.plan_title || ''}`.trim(),
    `Generated: ${(friction.generated_at || '').slice(0, 10)} · generation ${friction.generation} · sessions: ${sessions}`,
    '',
    '## Summary',
    friction.summary || '(none)',
    '',
    '## Stats',
    `- total: **${st.total ?? 0}**`,
    `- by failure mode: ${renderCounts(st.by_failure_mode)}`,
    `- by attribution: ${renderCounts(st.by_attribution)}`,
    `- by detection: ${renderCounts(st.by_detection)}`,
    '',
    '## Entries',
  );

  const entries = friction.entries || [];
  if (entries.length === 0) {
    lines.push('', '_No friction found — sessions ran smoothly._');
  }
  for (const e of entries) {
    lines.push(
      '',
      `### ${e.id} · ${e.failure_mode} · ${e.attribution} · ${e.detection}`,
      '',
      `- **agent:** ${e.agent}`,
      `- **task:** ${e.ref && e.ref.task ? e.ref.task : '—'}`,
      `- **trigger:** ${e.trigger}`,
      `- **attempting:** ${e.attempting}`,
      `- **resolution:** ${e.resolution} · **outcome:** ${e.outcome} · **confidence:** ${e.confidence}`,
    );
    if (e.human_input) lines.push(`- **human input:** ${e.human_input}`);
    if (e.evidence && e.evidence.quote) {
      lines.push(
        '',
        `> evidence: "${e.evidence.quote}" — ${e.evidence.speaker}, session ${e.evidence.session}`,
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}

function renderCounts(obj) {
  if (!obj || Object.keys(obj).length === 0) return '—';
  return Object.entries(obj)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ');
}

module.exports = { renderMarkdown };
