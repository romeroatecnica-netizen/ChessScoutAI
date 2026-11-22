export type LanguageCode =
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'pt'
  | 'ru'
  | 'hi'
  | 'ar'
  | 'zh'
  | 'ja';

export interface LanguageMeta {
  code: LanguageCode;
  nativeName: string;
  englishName: string;
  dir: 'ltr' | 'rtl';
  hreflang: string;
}

export interface ChessComProfile {
  username: string;
  name?: string;
  title?: string;
  avatar?: string;
  country?: string;
  countryCode?: string;
  followers?: number;
  joined?: number;
  url: string;
  status?: string;
}

export interface RatingRecord {
  rating: number;
  best?: number;
  win: number;
  draw: number;
  loss: number;
}

export interface ChessComStats {
  bullet?: RatingRecord;
  blitz?: RatingRecord;
  rapid?: RatingRecord;
}

export interface ChessComRawGame {
  url: string;
  pgn?: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  time_class: 'bullet' | 'blitz' | 'rapid' | 'daily' | string;
  rules: string;
  eco?: string;
  white: {
    rating: number;
    result: string;
    username: string;
  };
  black: {
    rating: number;
    result: string;
    username: string;
  };
}

export interface BookMoveEntry {
  san: string;
  uci: string;
  from: string;
  to: string;
  count: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface OpeningStat {
  id: string;
  eco: string;
  name: string;
  color: 'white' | 'black';
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  sampleMoves: string[];
  keyPositionFen: string;
  avgOpponentElo: number;
}

export interface PhaseBreakdown {
  losses: number;
  shareOfLosses: number;
}

export interface PhaseStats {
  opening: PhaseBreakdown; // < 15 moves
  middlegame: PhaseBreakdown; // 15-35 moves
  endgame: PhaseBreakdown; // > 35 moves
  totalLosses: number;
  primaryWeakness: 'opening' | 'middlegame' | 'endgame';
}

export interface ClockAndStyleProfile {
  avgSecondsPerMove: number | null;
  clockSamplesCount: number;
  timeoutLosses: number;
  totalLosses: number;
  timeoutLossRate: number;
  timeTroubleLossRate: number;
  avgGameMoves: number;
  styleLabel: 'aggressive' | 'positional' | 'balanced';
  quickDecisiveRate: number;
  drawRate: number;
}

export interface ExtractedBlunder {
  id: string;
  gameUrl: string;
  date: string;
  timeClass: string;
  opponentColor: 'white' | 'black';
  userColor: 'white' | 'black';
  moveNumber: number;
  openingName: string;
  eco: string;
  fenBefore: string;
  fenAfter: string;
  blunderSan: string;
  blunderUci: string;
  bestMoveBeforeUci: string;
  bestMoveBeforeSan: string;
  punishMoveUci: string;
  punishMoveSan: string;
  evalBeforePawns: number;
  evalAfterPawns: number;
  evalLossPawns: number;
  opponentRating: number;
  rivalRating: number;
}

export interface ScoutReport {
  username: string;
  fetchedAt: number;
  profile: ChessComProfile;
  stats: ChessComStats;
  totalGamesAnalyzed: number;
  overallRecord: {
    wins: number;
    draws: number;
    losses: number;
  };
  whiteOpenings: OpeningStat[];
  blackOpenings: OpeningStat[];
  targetWeaknesses: OpeningStat[];
  phaseStats: PhaseStats;
  clockStyle: ClockAndStyleProfile;
  blunders: ExtractedBlunder[];
  moveTreeWhite: Record<string, BookMoveEntry[]>;
  moveTreeBlack: Record<string, BookMoveEntry[]>;
}

export type ScoutStage =
  | 'idle'
  | 'profile'
  | 'archives'
  | 'downloading'
  | 'parsing'
  | 'stockfish'
  | 'complete'
  | 'error';

export interface ScoutProgress {
  stage: ScoutStage;
  percent: number;
  detail?: string;
}

export type ScoutErrorCode =
  | 'NOT_FOUND'
  | 'NO_RECENT_GAMES'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'EMPTY_USERNAME';

export type TrainerMode = 'opening_drill' | 'blunder_puzzles' | 'sparring_bot';

export interface BoardArrow {
  from: string;
  to: string;
  color: 'emerald' | 'amber' | 'rose';
}

export interface OpeningDrillProgress {
  attempts: number;
  accurateMoves: number;
  lastTrainedAt: number;
}

export interface OpponentTrainingProgress {
  username: string;
  lastScoutedAt: number;
  solvedBlunderIds: string[];
  drilledOpenings: Record<string, OpeningDrillProgress>;
  sparringRecord: {
    wins: number;
    draws: number;
    losses: number;
  };
}

export interface UserTrainingProgress {
  version: 1;
  currentStreak: number;
  bestStreak: number;
  totalPuzzlesSolved: number;
  recentOpponents: string[];
  opponents: Record<string, OpponentTrainingProgress>;
}

