import {Chess} from 'chess.js';
import type {
  BookMoveEntry,
  ChessComProfile,
  ChessComRawGame,
  ChessComStats,
  ClockAndStyleProfile,
  ExtractedBlunder,
  OpeningStat,
  PhaseStats,
  ScoutReport,
} from '../types/chess';
import {identifyOpening, normalizeFenKey} from './openingBook';
import {stockfishEngine} from './stockfishWorker';

type Outcome = 'win' | 'draw' | 'loss';

const DRAW_RESULTS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
]);

function mapOutcome(result: string): Outcome {
  if (result === 'win') return 'win';
  if (DRAW_RESULTS.has(result)) return 'draw';
  return 'loss';
}

function parseClockSeconds(comment: string): number | null {
  const match = comment.match(/\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = parseFloat(match[3]);
  return h * 3600 + m * 60 + s;
}

function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const regex = /^\[([A-Za-z0-9_]+)\s+"([^"]*)"\]/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }
  return headers;
}

function uciToSan(fen: string, uci: string | null): string {
  if (!uci || uci.length < 4) return '—';
  try {
    const c = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const mv = c.move({from, to, promotion});
    return mv ? mv.san : uci;
  } catch {
    return uci;
  }
}

interface ParsedGameRecord {
  raw: ChessComRawGame;
  scoutedColor: 'white' | 'black';
  outcome: Outcome;
  opponentResultStr: string;
  rivalRating: number;
  eco: string;
  openingName: string;
  fullMoves: number;
  sanMoves: string[];
  verboseMoves: Array<{
    from: string;
    to: string;
    san: string;
    lan: string;
    before: string;
    after: string;
    color: 'w' | 'b';
    promotion?: string;
  }>;
  lastClockSec: number | null;
}

export async function analyzeScoutReport(
  username: string,
  profile: ChessComProfile,
  stats: ChessComStats,
  rawGames: ChessComRawGame[],
  onStageProgress: (stage: 'parsing' | 'stockfish', percent: number, detail?: string) => void
): Promise<ScoutReport> {
  const lowerUser = username.trim().toLowerCase();

  const openingMap = new Map<
    string,
    {
      eco: string;
      name: string;
      color: 'white' | 'black';
      games: number;
      wins: number;
      draws: number;
      losses: number;
      eloSum: number;
      sampleMoves: string[];
      keyPositionFen: string;
    }
  >();

  const moveTreeWhite: Record<string, BookMoveEntry[]> = {};
  const moveTreeBlack: Record<string, BookMoveEntry[]> = {};

  let overallWins = 0;
  let overallDraws = 0;
  let overallLosses = 0;

  let openingLosses = 0;
  let middlegameLosses = 0;
  let endgameLosses = 0;
  let totalLosses = 0;
  let timeoutLosses = 0;
  let timeTroubleLosses = 0;

  let totalClockSpendSec = 0;
  let clockSamplesCount = 0;
  let totalMovesSum = 0;
  let quickDecisiveGames = 0;

  const parsedLosses: ParsedGameRecord[] = [];

  onStageProgress('parsing', 62);

  for (const raw of rawGames) {
    if (!raw.pgn) continue;
    const isWhite = raw.white.username.toLowerCase() === lowerUser;
    const scoutedColor: 'white' | 'black' = isWhite ? 'white' : 'black';
    const playerSide = isWhite ? raw.white : raw.black;
    const rivalSide = isWhite ? raw.black : raw.white;
    const outcome = mapOutcome(playerSide.result);

    const chess = new Chess();
    try {
      chess.loadPgn(raw.pgn);
    } catch {
      continue;
    }

    const verboseMoves = chess.history({verbose: true});
    if (verboseMoves.length < 2) continue;

    const headers = parsePgnHeaders(raw.pgn);
    const sanMoves = verboseMoves.map((m) => m.san);
    const ecoInfo = identifyOpening(headers.ECO, headers.ECOUrl || raw.eco, sanMoves);

    const fullMoves = Math.ceil(verboseMoves.length / 2);
    totalMovesSum += fullMoves;
    if (outcome !== 'draw' && fullMoves <= 26) {
      quickDecisiveGames++;
    }

    if (outcome === 'win') overallWins++;
    else if (outcome === 'draw') overallDraws++;
    else overallLosses++;

    // Key position after ~6-10 plies for drill/sparring start
    const keyPlyIdx = Math.min(verboseMoves.length - 1, 7);
    const keyPositionFen = verboseMoves[keyPlyIdx]?.after ?? verboseMoves[0].after;

    const opKey = `${scoutedColor}::${ecoInfo.eco}::${ecoInfo.name}`;
    const existingOp = openingMap.get(opKey);
    if (existingOp) {
      existingOp.games++;
      if (outcome === 'win') existingOp.wins++;
      else if (outcome === 'draw') existingOp.draws++;
      else existingOp.losses++;
      existingOp.eloSum += rivalSide.rating || 0;
    } else {
      openingMap.set(opKey, {
        eco: ecoInfo.eco,
        name: ecoInfo.name,
        color: scoutedColor,
        games: 1,
        wins: outcome === 'win' ? 1 : 0,
        draws: outcome === 'draw' ? 1 : 0,
        losses: outcome === 'loss' ? 1 : 0,
        eloSum: rivalSide.rating || 0,
        sampleMoves: sanMoves.slice(0, 10),
        keyPositionFen,
      });
    }

    // Populate opponent move tree up to ply 18
    const targetTree = scoutedColor === 'white' ? moveTreeWhite : moveTreeBlack;
    const targetSideChar = scoutedColor === 'white' ? 'w' : 'b';
    const maxTreePly = Math.min(verboseMoves.length, 18);

    for (let ply = 0; ply < maxTreePly; ply++) {
      const mv = verboseMoves[ply];
      if (mv.color !== targetSideChar) continue;

      const fenKey = normalizeFenKey(mv.before);
      const uci = `${mv.from}${mv.to}${mv.promotion ?? ''}`;
      if (!targetTree[fenKey]) {
        targetTree[fenKey] = [];
      }
      const list = targetTree[fenKey];
      let entry = list.find((e) => e.uci === uci);
      if (!entry) {
        entry = {
          san: mv.san,
          uci,
          from: mv.from,
          to: mv.to,
          count: 0,
          wins: 0,
          draws: 0,
          losses: 0,
        };
        list.push(entry);
      }
      entry.count++;
      if (outcome === 'win') entry.wins++;
      else if (outcome === 'draw') entry.draws++;
      else entry.losses++;
    }

    // Parse clock annotations [%clk ...]
    const comments = chess.getComments();
    const clkByFen = new Map<string, number>();
    for (const c of comments) {
      const sec = parseClockSeconds(c.comment);
      if (sec !== null) {
        clkByFen.set(c.fen, sec);
      }
    }

    let prevPlayerClock: number | null = null;
    let lastPlayerClock: number | null = null;

    for (const mv of verboseMoves) {
      if (mv.color !== targetSideChar) continue;
      const clk = clkByFen.get(mv.after);
      if (clk !== undefined) {
        if (prevPlayerClock !== null) {
          const spent = prevPlayerClock - clk;
          if (spent >= 0 && spent <= 120) {
            totalClockSpendSec += spent;
            clockSamplesCount++;
          }
        }
        prevPlayerClock = clk;
        lastPlayerClock = clk;
      }
    }

    if (outcome === 'loss') {
      totalLosses++;
      if (fullMoves < 15) openingLosses++;
      else if (fullMoves <= 35) middlegameLosses++;
      else endgameLosses++;

      if (playerSide.result === 'timeout') {
        timeoutLosses++;
        timeTroubleLosses++;
      } else if (lastPlayerClock !== null && lastPlayerClock < 10) {
        timeTroubleLosses++;
      }

      if (verboseMoves.length >= 12) {
        parsedLosses.push({
          raw,
          scoutedColor,
          outcome,
          opponentResultStr: playerSide.result,
          rivalRating: rivalSide.rating || 0,
          eco: ecoInfo.eco,
          openingName: ecoInfo.name,
          fullMoves,
          sanMoves,
          verboseMoves,
          lastClockSec: lastPlayerClock,
        });
      }
    }
  }

  // Sort entries in move trees by frequency
  for (const tree of [moveTreeWhite, moveTreeBlack]) {
    for (const key of Object.keys(tree)) {
      tree[key].sort((a, b) => b.count - a.count);
    }
  }

  const allOpenings: OpeningStat[] = Array.from(openingMap.entries()).map(([id, item]) => ({
    id,
    eco: item.eco,
    name: item.name,
    color: item.color,
    games: item.games,
    wins: item.wins,
    draws: item.draws,
    losses: item.losses,
    winRate: Math.round((item.wins / item.games) * 100),
    drawRate: Math.round((item.draws / item.games) * 100),
    lossRate: Math.round((item.losses / item.games) * 100),
    sampleMoves: item.sampleMoves,
    keyPositionFen: item.keyPositionFen,
    avgOpponentElo: item.games > 0 ? Math.round(item.eloSum / item.games) : 0,
  }));

  const whiteOpenings = allOpenings
    .filter((o) => o.color === 'white')
    .sort((a, b) => b.games - a.games || b.lossRate - a.lossRate);

  const blackOpenings = allOpenings
    .filter((o) => o.color === 'black')
    .sort((a, b) => b.games - a.games || b.lossRate - a.lossRate);

  // Target Weaknesses: Top 3 vulnerable openings
  const targetWeaknesses = allOpenings
    .filter((o) => o.losses > 0)
    .sort((a, b) => {
      const scoreA = a.losses * (0.5 + a.lossRate / 100) + (a.games >= 2 ? 0.8 : 0);
      const scoreB = b.losses * (0.5 + b.lossRate / 100) + (b.games >= 2 ? 0.8 : 0);
      return scoreB - scoreA;
    })
    .slice(0, 3);

  const safeLosses = Math.max(totalLosses, 1);
  const openingShare = Math.round((openingLosses / safeLosses) * 100);
  const middleShare = Math.round((middlegameLosses / safeLosses) * 100);
  const endgameShare = Math.round((endgameLosses / safeLosses) * 100);

  let primaryWeakness: PhaseStats['primaryWeakness'] = 'middlegame';
  if (openingLosses >= middlegameLosses && openingLosses >= endgameLosses) {
    primaryWeakness = 'opening';
  } else if (endgameLosses > middlegameLosses && endgameLosses > openingLosses) {
    primaryWeakness = 'endgame';
  }

  const phaseStats: PhaseStats = {
    opening: {losses: openingLosses, shareOfLosses: totalLosses > 0 ? openingShare : 0},
    middlegame: {losses: middlegameLosses, shareOfLosses: totalLosses > 0 ? middleShare : 0},
    endgame: {losses: endgameLosses, shareOfLosses: totalLosses > 0 ? endgameShare : 0},
    totalLosses,
    primaryWeakness,
  };

  const totalAnalyzed = overallWins + overallDraws + overallLosses;
  const avgGameMoves = totalAnalyzed > 0 ? Math.round(totalMovesSum / totalAnalyzed) : 0;
  const quickDecisiveRate =
    totalAnalyzed > 0 ? Math.round((quickDecisiveGames / totalAnalyzed) * 100) : 0;
  const drawRate = totalAnalyzed > 0 ? Math.round((overallDraws / totalAnalyzed) * 100) : 0;

  let styleLabel: ClockAndStyleProfile['styleLabel'] = 'balanced';
  if (quickDecisiveRate >= 34 || (avgGameMoves > 0 && avgGameMoves <= 32 && drawRate < 15)) {
    styleLabel = 'aggressive';
  } else if (avgGameMoves >= 41 || drawRate >= 20) {
    styleLabel = 'positional';
  }

  const clockStyle: ClockAndStyleProfile = {
    avgSecondsPerMove:
      clockSamplesCount > 0 ? Number((totalClockSpendSec / clockSamplesCount).toFixed(1)) : null,
    clockSamplesCount,
    timeoutLosses,
    totalLosses,
    timeoutLossRate: totalLosses > 0 ? Math.round((timeoutLosses / totalLosses) * 100) : 0,
    timeTroubleLossRate: totalLosses > 0 ? Math.round((timeTroubleLosses / totalLosses) * 100) : 0,
    avgGameMoves,
    styleLabel,
    quickDecisiveRate,
    drawRate,
  };

  // Stockfish Web Worker scan for real blunders (swing >= 2.00 pawns)
  const blunders: ExtractedBlunder[] = [];
  const lossesToScan = parsedLosses.slice(0, 10);

  if (lossesToScan.length > 0) {
    onStageProgress('stockfish', 70, `0/${lossesToScan.length}`);

    for (let gIdx = 0; gIdx < lossesToScan.length; gIdx++) {
      const game = lossesToScan[gIdx];
      const targetChar = game.scoutedColor === 'white' ? 'w' : 'b';
      const playerSign = game.scoutedColor === 'white' ? 1 : -1;

      // Candidate plies: moves 6 to 36 (ply 10 to 72)
      const candidateIndices: number[] = [];
      for (let i = 10; i < Math.min(game.verboseMoves.length - 1, 72); i++) {
        if (game.verboseMoves[i].color === targetChar) {
          candidateIndices.push(i);
        }
      }

      // Sample up to 4 evenly-spaced critical turns per loss
      const sampledIndices: number[] = [];
      if (candidateIndices.length <= 4) {
        sampledIndices.push(...candidateIndices);
      } else {
        const step = (candidateIndices.length - 1) / 3;
        for (let k = 0; k < 4; k++) {
          sampledIndices.push(candidateIndices[Math.round(k * step)]);
        }
      }

      let foundInThisGame = 0;
      for (const idx of sampledIndices) {
        if (foundInThisGame >= 2) break; // Max 2 blunders per single game for diversity

        const mv = game.verboseMoves[idx];
        const playedUci = `${mv.from}${mv.to}${mv.promotion ?? ''}`;

        const beforeEval = await stockfishEngine.evaluatePosition(mv.before, 8, 120);
        if (beforeEval.bestMoveUci === playedUci) continue;

        const beforeScorePlayerCp = beforeEval.evalCpWhite * playerSign;
        // Skip already hopelessly lost positions (> 5.5 pawns down before move)
        if (beforeScorePlayerCp < -550) continue;

        const afterEval = await stockfishEngine.evaluatePosition(mv.after, 8, 120);
        const afterScorePlayerCp = afterEval.evalCpWhite * playerSign;

        const swingCp = beforeScorePlayerCp - afterScorePlayerCp;
        if (swingCp >= 200 && afterEval.bestMoveUci) {
          const punishSan = uciToSan(mv.after, afterEval.bestMoveUci);
          const bestBeforeSan = uciToSan(mv.before, beforeEval.bestMoveUci);
          const dateStr = game.raw.end_time
            ? new Date(game.raw.end_time * 1000).toISOString().slice(0, 10)
            : '';

          blunders.push({
            id: `${game.raw.url}-${idx}`,
            gameUrl: game.raw.url,
            date: dateStr,
            timeClass: game.raw.time_class,
            opponentColor: game.scoutedColor,
            userColor: game.scoutedColor === 'white' ? 'black' : 'white',
            moveNumber: Math.floor(idx / 2) + 1,
            openingName: game.openingName,
            eco: game.eco,
            fenBefore: mv.before,
            fenAfter: mv.after,
            blunderSan: mv.san,
            blunderUci: playedUci,
            bestMoveBeforeUci: beforeEval.bestMoveUci ?? playedUci,
            bestMoveBeforeSan: bestBeforeSan,
            punishMoveUci: afterEval.bestMoveUci,
            punishMoveSan: punishSan,
            evalBeforePawns: Number((beforeScorePlayerCp / 100).toFixed(2)),
            evalAfterPawns: Number((afterScorePlayerCp / 100).toFixed(2)),
            evalLossPawns: Number((swingCp / 100).toFixed(2)),
            opponentRating:
              game.scoutedColor === 'white' ? game.raw.white.rating : game.raw.black.rating,
            rivalRating: game.rivalRating,
          });
          foundInThisGame++;
        }
      }

      const pct = 70 + Math.round(((gIdx + 1) / lossesToScan.length) * 28);
      onStageProgress('stockfish', pct, `${gIdx + 1}/${lossesToScan.length}`);
    }
  }

  blunders.sort((a, b) => b.evalLossPawns - a.evalLossPawns);

  return {
    username: profile.username,
    fetchedAt: Date.now(),
    profile,
    stats,
    totalGamesAnalyzed: totalAnalyzed,
    overallRecord: {
      wins: overallWins,
      draws: overallDraws,
      losses: overallLosses,
    },
    whiteOpenings,
    blackOpenings,
    targetWeaknesses,
    phaseStats,
    clockStyle,
    blunders: blunders.slice(0, 12),
    moveTreeWhite,
    moveTreeBlack,
  };
}
