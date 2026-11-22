import type {OpponentTrainingProgress, UserTrainingProgress} from '../types/chess';

const PROGRESS_STORAGE_KEY = 'chessscout_progress_v1';

function createEmptyProgress(): UserTrainingProgress {
  return {
    version: 1,
    currentStreak: 0,
    bestStreak: 0,
    totalPuzzlesSolved: 0,
    recentOpponents: [],
    opponents: {},
  };
}

function getOrCreateOpponent(
  progress: UserTrainingProgress,
  username: string
): {next: UserTrainingProgress; key: string; opponent: OpponentTrainingProgress} {
  const cleanName = username.trim();
  const key = cleanName.toLowerCase();
  const existing = progress.opponents[key];
  const opponent: OpponentTrainingProgress = existing
    ? {
        ...existing,
        solvedBlunderIds: [...existing.solvedBlunderIds],
        drilledOpenings: {...existing.drilledOpenings},
        sparringRecord: {...existing.sparringRecord},
      }
    : {
        username: cleanName,
        lastScoutedAt: Date.now(),
        solvedBlunderIds: [],
        drilledOpenings: {},
        sparringRecord: {wins: 0, draws: 0, losses: 0},
      };

  const next: UserTrainingProgress = {
    ...progress,
    recentOpponents: [...progress.recentOpponents],
    opponents: {...progress.opponents, [key]: opponent},
  };
  return {next, key, opponent};
}

export function loadProgress(): UserTrainingProgress {
  if (typeof window === 'undefined') return createEmptyProgress();
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return createEmptyProgress();
    const parsed = JSON.parse(raw) as Partial<UserTrainingProgress>;
    if (!parsed || parsed.version !== 1 || typeof parsed.opponents !== 'object') {
      return createEmptyProgress();
    }
    return {
      version: 1,
      currentStreak: typeof parsed.currentStreak === 'number' ? parsed.currentStreak : 0,
      bestStreak: typeof parsed.bestStreak === 'number' ? parsed.bestStreak : 0,
      totalPuzzlesSolved:
        typeof parsed.totalPuzzlesSolved === 'number' ? parsed.totalPuzzlesSolved : 0,
      recentOpponents: Array.isArray(parsed.recentOpponents)
        ? parsed.recentOpponents.filter((u): u is string => typeof u === 'string').slice(0, 8)
        : [],
      opponents: parsed.opponents ?? {},
    };
  } catch {
    return createEmptyProgress();
  }
}

export function saveProgress(progress: UserTrainingProgress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function recordOpponentScouted(
  current: UserTrainingProgress,
  username: string
): UserTrainingProgress {
  const {next, key, opponent} = getOrCreateOpponent(current, username);
  opponent.username = username.trim();
  opponent.lastScoutedAt = Date.now();

  const filtered = next.recentOpponents.filter((u) => u.toLowerCase() !== key);
  next.recentOpponents = [username.trim(), ...filtered].slice(0, 8);
  saveProgress(next);
  return next;
}

export function recordBlunderSolved(
  current: UserTrainingProgress,
  username: string,
  blunderId: string
): UserTrainingProgress {
  const {next, opponent} = getOrCreateOpponent(current, username);
  const alreadySolved = opponent.solvedBlunderIds.includes(blunderId);
  if (!alreadySolved) {
    opponent.solvedBlunderIds.push(blunderId);
    next.totalPuzzlesSolved += 1;
  }
  next.currentStreak += 1;
  if (next.currentStreak > next.bestStreak) {
    next.bestStreak = next.currentStreak;
  }
  saveProgress(next);
  return next;
}

export function recordBlunderFailed(current: UserTrainingProgress): UserTrainingProgress {
  const next: UserTrainingProgress = {
    ...current,
    currentStreak: 0,
  };
  saveProgress(next);
  return next;
}

export function recordOpeningMoveAttempt(
  current: UserTrainingProgress,
  username: string,
  openingId: string,
  isAccurate: boolean
): UserTrainingProgress {
  const {next, opponent} = getOrCreateOpponent(current, username);
  const prevOp = opponent.drilledOpenings[openingId] ?? {
    attempts: 0,
    accurateMoves: 0,
    lastTrainedAt: Date.now(),
  };
  opponent.drilledOpenings[openingId] = {
    attempts: prevOp.attempts + 1,
    accurateMoves: prevOp.accurateMoves + (isAccurate ? 1 : 0),
    lastTrainedAt: Date.now(),
  };
  saveProgress(next);
  return next;
}

export function recordSparringOutcome(
  current: UserTrainingProgress,
  username: string,
  outcome: 'win' | 'draw' | 'loss'
): UserTrainingProgress {
  const {next, opponent} = getOrCreateOpponent(current, username);
  if (outcome === 'win') opponent.sparringRecord.wins += 1;
  else if (outcome === 'draw') opponent.sparringRecord.draws += 1;
  else opponent.sparringRecord.losses += 1;
  saveProgress(next);
  return next;
}

export function clearAllProgress(): UserTrainingProgress {
  const fresh = createEmptyProgress();
  saveProgress(fresh);
  return fresh;
}

export function exportProgressJson(progress: UserTrainingProgress): void {
  const blob = new Blob([JSON.stringify(progress, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chessscout-progress-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importProgressJson(rawText: string): UserTrainingProgress | null {
  try {
    const parsed = JSON.parse(rawText) as Partial<UserTrainingProgress>;
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.opponents !== 'object' ||
      parsed.opponents === null ||
      !Array.isArray(parsed.recentOpponents)
    ) {
      return null;
    }

    const sanitized: UserTrainingProgress = {
      version: 1,
      currentStreak: typeof parsed.currentStreak === 'number' ? parsed.currentStreak : 0,
      bestStreak: typeof parsed.bestStreak === 'number' ? parsed.bestStreak : 0,
      totalPuzzlesSolved:
        typeof parsed.totalPuzzlesSolved === 'number' ? parsed.totalPuzzlesSolved : 0,
      recentOpponents: parsed.recentOpponents
        .filter((u): u is string => typeof u === 'string')
        .slice(0, 8),
      opponents: parsed.opponents,
    };
    saveProgress(sanitized);
    return sanitized;
  } catch {
    return null;
  }
}
