import type {ScoutReport} from '../types/chess';

export function generateScoutMarkdown(report: ScoutReport): string {
  const lines: string[] = [];
  lines.push(`# ChessScout AI — Scouting Report: ${report.profile.username}`);
  lines.push(`Generated: ${new Date(report.fetchedAt).toISOString()}`);
  lines.push(`Games Analyzed: ${report.totalGamesAnalyzed} standard games`);
  lines.push(
    `Record: ${report.overallRecord.wins}W / ${report.overallRecord.draws}D / ${report.overallRecord.losses}L`
  );
  lines.push('');

  lines.push('## Ratings');
  if (report.stats.bullet) lines.push(`- Bullet: ${report.stats.bullet.rating}`);
  if (report.stats.blitz) lines.push(`- Blitz: ${report.stats.blitz.rating}`);
  if (report.stats.rapid) lines.push(`- Rapid: ${report.stats.rapid.rating}`);
  lines.push('');

  lines.push('## Target Weaknesses (Top Vulnerable Openings)');
  if (report.targetWeaknesses.length === 0) {
    lines.push('- No clear opening vulnerabilities detected.');
  } else {
    for (const w of report.targetWeaknesses) {
      lines.push(
        `- [${w.eco}] ${w.name} (${w.color}): ${w.games} games · ${w.winRate}%W / ${w.drawRate}%D / ${w.lossRate}%L`
      );
    }
  }
  lines.push('');

  lines.push('## Phase Collapse & Clock Profile');
  lines.push(
    `- Opening Losses (<15 moves): ${report.phaseStats.opening.losses} (${report.phaseStats.opening.shareOfLosses}%)`
  );
  lines.push(
    `- Middlegame Losses (15–35 moves): ${report.phaseStats.middlegame.losses} (${report.phaseStats.middlegame.shareOfLosses}%)`
  );
  lines.push(
    `- Endgame Losses (>35 moves): ${report.phaseStats.endgame.losses} (${report.phaseStats.endgame.shareOfLosses}%)`
  );
  lines.push(
    `- Avg Time / Move: ${report.clockStyle.avgSecondsPerMove !== null ? `${report.clockStyle.avgSecondsPerMove}s` : 'N/A'}`
  );
  lines.push(
    `- Timeout Losses: ${report.clockStyle.timeoutLosses} (${report.clockStyle.timeoutLossRate}%)`
  );
  lines.push(`- Style Profile: ${report.clockStyle.styleLabel}`);
  lines.push('');

  lines.push('## White Repertoire');
  for (const op of report.whiteOpenings.slice(0, 8)) {
    lines.push(
      `- ${op.eco} ${op.name}: ${op.games}g (${op.winRate}%W / ${op.drawRate}%D / ${op.lossRate}%L) — ${op.sampleMoves.join(' ')}`
    );
  }
  lines.push('');

  lines.push('## Black Repertoire');
  for (const op of report.blackOpenings.slice(0, 8)) {
    lines.push(
      `- ${op.eco} ${op.name}: ${op.games}g (${op.winRate}%W / ${op.drawRate}%D / ${op.lossRate}%L) — ${op.sampleMoves.join(' ')}`
    );
  }
  lines.push('');

  lines.push('## Real Blunders Extracted by Stockfish');
  if (report.blunders.length === 0) {
    lines.push('- No >= 2.00 pawn blunders flagged.');
  } else {
    for (const b of report.blunders) {
      lines.push(
        `- Move ${b.moveNumber} (${b.eco} ${b.openingName}): Played **${b.blunderSan}** (best: ${b.bestMoveBeforeSan}, swing: -${b.evalLossPawns} pawns) | Punishment: **${b.punishMoveSan}** | FEN: \`${b.fenBefore}\``
      );
    }
  }
  lines.push('');
  lines.push(
    '--- \n*Independent tool compatible with Chess.com Public API. Not affiliated with or endorsed by Chess.com.*'
  );

  return lines.join('\n');
}

export function downloadMarkdownReport(report: ScoutReport): void {
  const md = generateScoutMarkdown(report);
  const blob = new Blob([md], {type: 'text/markdown;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chessscout-${report.username.toLowerCase()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
