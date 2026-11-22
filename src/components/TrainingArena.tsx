import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Chess} from 'chess.js';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  RotateCcw,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {TranslationBundle} from '../i18n';
import {normalizeFenKey} from '../services/openingBook';
import {stockfishEngine} from '../services/stockfishWorker';
import type {
  BoardArrow,
  BookMoveEntry,
  ExtractedBlunder,
  OpeningStat,
  ScoutReport,
  TrainerMode,
  UserTrainingProgress,
} from '../types/chess';
import {playChessSound} from '../utils/chessAudio';
import {ChessBoard} from './ChessBoard';

interface TrainingArenaProps {
  report: ScoutReport | null;
  t: TranslationBundle;
  mode: TrainerMode;
  onModeChange: (mode: TrainerMode) => void;
  selectedOpening: OpeningStat | null;
  onSelectOpening: (opening: OpeningStat) => void;
  selectedBlunderIndex: number;
  onSelectBlunderIndex: (idx: number) => void;
  progress: UserTrainingProgress;
  onBlunderSolved: (username: string, blunderId: string) => void;
  onBlunderFailed: () => void;
  onOpeningMoveAttempt: (username: string, openingId: string, isAccurate: boolean) => void;
  onSparringOutcome: (username: string, outcome: 'win' | 'draw' | 'loss') => void;
}

function pickWeightedMove(entries: BookMoveEntry[]): BookMoveEntry | null {
  if (!entries || entries.length === 0) return null;
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  if (total <= 0) return entries[0];
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.count;
    if (roll <= 0) return entry;
  }
  return entries[0];
}

function formatEvalText(evalCpWhite: number, mateWhite: number | null): string {
  if (mateWhite !== null && mateWhite !== 0) {
    return `${mateWhite > 0 ? '+' : '-'}M${Math.abs(mateWhite)}`;
  }
  const pawns = evalCpWhite / 100;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

function computeWhiteBarPercent(evalCpWhite: number, mateWhite: number | null): number {
  if (mateWhite !== null && mateWhite !== 0) {
    return mateWhite > 0 ? 97 : 3;
  }
  const pawns = Math.max(-8, Math.min(8, evalCpWhite / 100));
  return Math.round(50 + (pawns / 8) * 45);
}

export const TrainingArena: React.FC<TrainingArenaProps> = ({
  report,
  t,
  mode,
  onModeChange,
  selectedOpening,
  onSelectOpening,
  selectedBlunderIndex,
  onSelectBlunderIndex,
  progress,
  onBlunderSolved,
  onBlunderFailed,
  onOpeningMoveAttempt,
  onSparringOutcome,
}) => {
  const [fen, setFen] = useState<string>(new Chess().fen());
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [fenStack, setFenStack] = useState<string[]>([new Chess().fen()]);
  const [lastMove, setLastMove] = useState<{from: string; to: string} | null>(null);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [userColor, setUserColor] = useState<'white' | 'black'>('white');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [engineThinking, setEngineThinking] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusTone, setStatusTone] = useState<'neutral' | 'emerald' | 'amber' | 'rose'>('neutral');
  const [moveSourceBadge, setMoveSourceBadge] = useState<'book' | 'engine' | null>(null);
  const [evalCpWhite, setEvalCpWhite] = useState<number>(20);
  const [mateWhite, setMateWhite] = useState<number | null>(null);
  const [puzzleSolved, setPuzzleSolved] = useState<boolean>(false);

  // Sparring start choice: 'start' or opening id
  const [sparringOpeningId, setSparringOpeningId] = useState<string>('default');

  const sessionTokenRef = useRef<number>(0);
  const botTimerRef = useRef<number | null>(null);
  const sparringRecordedRef = useRef<boolean>(false);

  const allOpenings = useMemo(() => {
    if (!report) return [];
    return [...report.whiteOpenings, ...report.blackOpenings];
  }, [report]);

  const currentBlunder: ExtractedBlunder | null = useMemo(() => {
    if (!report || report.blunders.length === 0) return null;
    const safeIdx = Math.max(0, Math.min(selectedBlunderIndex, report.blunders.length - 1));
    return report.blunders[safeIdx];
  }, [report, selectedBlunderIndex]);

  const clearTimers = () => {
    if (botTimerRef.current !== null) {
      window.clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const refreshPositionEval = useCallback(async (targetFen: string, token: number) => {
    const res = await stockfishEngine.evaluatePosition(targetFen, 9, 140);
    if (sessionTokenRef.current !== token) return;
    setEvalCpWhite(res.evalCpWhite);
    setMateWhite(res.mateWhite);
  }, []);

  const triggerBotTurn = useCallback(
    async (
      currentFen: string,
      botColor: 'white' | 'black',
      activeReport: ScoutReport | null,
      activeMode: TrainerMode,
      token: number
    ) => {
      const chess = new Chess(currentFen);
      if (chess.isGameOver()) {
        setEngineThinking(false);
        return;
      }

      const turnColor = chess.turn() === 'w' ? 'white' : 'black';
      if (turnColor !== botColor) return;

      setEngineThinking(true);

      // Look up opponent's real game tree
      const tree =
        botColor === 'white' ? activeReport?.moveTreeWhite : activeReport?.moveTreeBlack;
      const fenKey = normalizeFenKey(currentFen);
      const bookCandidates = tree?.[fenKey];

      let chosenUci: string | null = null;
      let usedBook = false;

      if (bookCandidates && bookCandidates.length > 0 && chess.history().length < 22) {
        const picked =
          activeMode === 'opening_drill'
            ? bookCandidates[0] // Main habit line in drill mode
            : pickWeightedMove(bookCandidates); // Probabilistic style in sparring mode
        if (picked) {
          chosenUci = picked.uci;
          usedBook = true;
        }
      }

      if (!chosenUci) {
        const engineRes = await stockfishEngine.evaluatePosition(currentFen, 10, 260);
        if (sessionTokenRef.current !== token) return;
        chosenUci = engineRes.bestMoveUci;
        setEvalCpWhite(engineRes.evalCpWhite);
        setMateWhite(engineRes.mateWhite);
      }

      if (!chosenUci || sessionTokenRef.current !== token) {
        setEngineThinking(false);
        return;
      }

      botTimerRef.current = window.setTimeout(() => {
        if (sessionTokenRef.current !== token) return;
        const c = new Chess(currentFen);
        const from = chosenUci!.slice(0, 2);
        const to = chosenUci!.slice(2, 4);
        const promotion = chosenUci!.length > 4 ? chosenUci![4] : undefined;

        try {
          const mv = c.move({from, to, promotion});
          if (!mv) {
            setEngineThinking(false);
            return;
          }
          const nextFen = c.fen();
          setFen(nextFen);
          setLastMove({from: mv.from, to: mv.to});
          setHistorySan((prev) => [...prev, mv.san]);
          setFenStack((prev) => [...prev, nextFen]);
          setMoveSourceBadge(usedBook ? 'book' : 'engine');
          setEngineThinking(false);

          if (c.inCheck()) {
            playChessSound('check', soundEnabled);
          } else if (mv.captured) {
            playChessSound('capture', soundEnabled);
          } else {
            playChessSound('move', soundEnabled);
          }

          if (!usedBook && activeMode === 'opening_drill') {
            setStatusMessage(t.trainer.drillStatusOutOfBook);
            setStatusTone('amber');
          }

          if (c.isGameOver()) {
            setStatusMessage(
              c.isCheckmate()
                ? t.trainer.checkmate
                : c.isStalemate()
                  ? t.trainer.stalemate
                  : t.trainer.draw
            );
            setStatusTone('amber');
            if (activeMode === 'sparring_bot' && activeReport && !sparringRecordedRef.current) {
              sparringRecordedRef.current = true;
              onSparringOutcome(
                activeReport.profile.username,
                c.isCheckmate() ? 'loss' : 'draw'
              );
            }
          } else {
            void refreshPositionEval(nextFen, token);
          }
        } catch {
          setEngineThinking(false);
        }
      }, 360);
    },
    [onSparringOutcome, refreshPositionEval, soundEnabled, t]
  );

  // Initialize or reset board when mode / opening / blunder / report changes
  const resetSession = useCallback(() => {
    clearTimers();
    sessionTokenRef.current += 1;
    const token = sessionTokenRef.current;

    sparringRecordedRef.current = false;
    setArrows([]);
    setEngineThinking(false);
    setMoveSourceBadge(null);
    setPuzzleSolved(false);

    if (!report) {
      const startFen = new Chess().fen();
      setFen(startFen);
      setHistorySan([]);
      setFenStack([startFen]);
      setLastMove(null);
      setOrientation('white');
      setUserColor('white');
      setStatusMessage(t.trainer.emptyTrainerHint);
      setStatusTone('neutral');
      return;
    }

    if (mode === 'opening_drill') {
      const targetOp =
        selectedOpening ??
        report.targetWeaknesses[0] ??
        report.whiteOpenings[0] ??
        report.blackOpenings[0] ??
        null;

      const uColor: 'white' | 'black' = targetOp
        ? targetOp.color === 'white'
          ? 'black'
          : 'white'
        : 'white';
      const botColor: 'white' | 'black' = uColor === 'white' ? 'black' : 'white';

      const startChess = new Chess();
      const startFen = startChess.fen();

      setUserColor(uColor);
      setOrientation(uColor);
      setFen(startFen);
      setHistorySan([]);
      setFenStack([startFen]);
      setLastMove(null);
      setEvalCpWhite(20);
      setMateWhite(null);
      setStatusMessage(t.trainer.drillStatusReady);
      setStatusTone('neutral');

      if (botColor === 'white') {
        void triggerBotTurn(startFen, 'white', report, 'opening_drill', token);
      }
      return;
    }

    if (mode === 'blunder_puzzles') {
      if (!currentBlunder) {
        const startFen = new Chess().fen();
        setFen(startFen);
        setHistorySan([]);
        setFenStack([startFen]);
        setLastMove(null);
        setStatusMessage(t.trainer.noBlundersForPuzzle);
        setStatusTone('neutral');
        return;
      }

      // Start on fenBefore briefly, then animate opponent's actual blunder to fenAfter
      setUserColor(currentBlunder.userColor);
      setOrientation(currentBlunder.userColor);
      setFen(currentBlunder.fenBefore);
      setHistorySan([]);
      setFenStack([currentBlunder.fenBefore]);
      setLastMove(null);
      setEvalCpWhite(
        currentBlunder.evalBeforePawns * (currentBlunder.opponentColor === 'white' ? 100 : -100)
      );
      setMateWhite(null);
      setStatusMessage(
        t.trainer.puzzlePrompt
          .replace('{move}', currentBlunder.blunderSan)
          .replace('{loss}', currentBlunder.evalLossPawns.toFixed(2))
      );
      setStatusTone('amber');

      botTimerRef.current = window.setTimeout(() => {
        if (sessionTokenRef.current !== token) return;
        const from = currentBlunder.blunderUci.slice(0, 2);
        const to = currentBlunder.blunderUci.slice(2, 4);
        setFen(currentBlunder.fenAfter);
        setFenStack([currentBlunder.fenBefore, currentBlunder.fenAfter]);
        setHistorySan([currentBlunder.blunderSan]);
        setLastMove({from, to});
        setEvalCpWhite(
          currentBlunder.evalAfterPawns * (currentBlunder.opponentColor === 'white' ? 100 : -100)
        );
        playChessSound('move', soundEnabled);
      }, 320);
      return;
    }

    // Mode 3: sparring_bot
    const chosenOp = allOpenings.find((o) => o.id === sparringOpeningId) ?? null;
    let initialFen = new Chess().fen();
    let initialMoves: string[] = [];
    let uColor: 'white' | 'black' = 'white';

    if (chosenOp) {
      uColor = chosenOp.color === 'white' ? 'black' : 'white';
      const replay = new Chess();
      for (const san of chosenOp.sampleMoves.slice(0, 6)) {
        try {
          const mv = replay.move(san);
          if (mv) initialMoves.push(mv.san);
        } catch {
          break;
        }
      }
      initialFen = replay.fen();
    } else if (report.blackOpenings.length > report.whiteOpenings.length) {
      uColor = 'white';
    }

    setUserColor(uColor);
    setOrientation(uColor);
    setFen(initialFen);
    setHistorySan(initialMoves);
    setFenStack([initialFen]);
    setLastMove(null);
    setStatusMessage(t.trainer.sparringStatusYourTurn);
    setStatusTone('neutral');
    void refreshPositionEval(initialFen, token);

    const turnSide = new Chess(initialFen).turn() === 'w' ? 'white' : 'black';
    const botColor: 'white' | 'black' = uColor === 'white' ? 'black' : 'white';
    if (turnSide === botColor) {
      void triggerBotTurn(initialFen, botColor, report, 'sparring_bot', token);
    }
  }, [
    allOpenings,
    currentBlunder,
    mode,
    refreshPositionEval,
    report,
    selectedOpening,
    soundEnabled,
    sparringOpeningId,
    t,
    triggerBotTurn,
  ]);

  useEffect(() => {
    resetSession();
  }, [resetSession]);

  const handleUserMoveAttempt = async (
    from: string,
    to: string,
    promotion?: 'q' | 'r' | 'b' | 'n'
  ) => {
    if (engineThinking) return;
    const chess = new Chess(fen);
    if (chess.isGameOver()) return;

    const currentTurnColor = chess.turn() === 'w' ? 'white' : 'black';
    if (currentTurnColor !== userColor) return;

    let playedMove;
    try {
      playedMove = chess.move({from, to, promotion});
    } catch {
      return;
    }
    if (!playedMove) return;

    const token = sessionTokenRef.current;
    const playedUci = `${playedMove.from}${playedMove.to}${playedMove.promotion ?? ''}`;
    const prevFen = fen;
    const nextFen = chess.fen();

    setFen(nextFen);
    setLastMove({from: playedMove.from, to: playedMove.to});
    setHistorySan((prev) => [...prev, playedMove.san]);
    setFenStack((prev) => [...prev, nextFen]);
    setArrows([]);

    if (chess.inCheck()) {
      playChessSound('check', soundEnabled);
    } else if (playedMove.captured) {
      playChessSound('capture', soundEnabled);
    } else {
      playChessSound('move', soundEnabled);
    }

    // Mode 2: Blunder Puzzle verification
    if (mode === 'blunder_puzzles' && currentBlunder) {
      if (puzzleSolved) return;

      if (playedUci === currentBlunder.punishMoveUci || chess.isCheckmate()) {
        setPuzzleSolved(true);
        if (report) {
          onBlunderSolved(report.profile.username, currentBlunder.id);
        }
        setStatusMessage(t.trainer.puzzleSolved);
        setStatusTone('emerald');
        playChessSound('success', soundEnabled);
        void refreshPositionEval(nextFen, token);
        return;
      }

      // Also accept near-equivalent Stockfish punishments
      setEngineThinking(true);
      const [refEval, userEval] = await Promise.all([
        stockfishEngine.evaluatePosition(prevFen, 9, 150),
        stockfishEngine.evaluatePosition(nextFen, 9, 150),
      ]);
      if (sessionTokenRef.current !== token) return;
      setEngineThinking(false);

      const userSign = userColor === 'white' ? 1 : -1;
      const bestScore = refEval.evalCpWhite * userSign;
      const playedScore = userEval.evalCpWhite * userSign;

      if (bestScore - playedScore <= 75) {
        setPuzzleSolved(true);
        if (report) {
          onBlunderSolved(report.profile.username, currentBlunder.id);
        }
        setStatusMessage(t.trainer.puzzleSolved);
        setStatusTone('emerald');
        setEvalCpWhite(userEval.evalCpWhite);
        setMateWhite(userEval.mateWhite);
        playChessSound('success', soundEnabled);
      } else {
        onBlunderFailed();
        setStatusMessage(t.trainer.puzzleWrong);
        setStatusTone('rose');
        playChessSound('error', soundEnabled);
        botTimerRef.current = window.setTimeout(() => {
          if (sessionTokenRef.current !== token) return;
          setFen(prevFen);
          setHistorySan((prev) => prev.slice(0, -1));
          setFenStack((prev) => prev.slice(0, -1));
        }, 550);
      }
      return;
    }

    if (chess.isGameOver()) {
      setStatusMessage(
        chess.isCheckmate()
          ? t.trainer.checkmate
          : chess.isStalemate()
            ? t.trainer.stalemate
            : t.trainer.draw
      );
      setStatusTone('emerald');
      if (mode === 'sparring_bot' && report && !sparringRecordedRef.current) {
        sparringRecordedRef.current = true;
        onSparringOutcome(
          report.profile.username,
          chess.isCheckmate() ? 'win' : 'draw'
        );
      }
      return;
    }

    // Mode 1: Opening Drill accuracy feedback
    if (mode === 'opening_drill') {
      setEngineThinking(true);
      const [beforeEval, afterEval] = await Promise.all([
        stockfishEngine.evaluatePosition(prevFen, 9, 120),
        stockfishEngine.evaluatePosition(nextFen, 9, 120),
      ]);
      if (sessionTokenRef.current !== token) return;

      const userSign = userColor === 'white' ? 1 : -1;
      const dropCp = (beforeEval.evalCpWhite - afterEval.evalCpWhite) * userSign;
      setEvalCpWhite(afterEval.evalCpWhite);
      setMateWhite(afterEval.mateWhite);

      const isInaccuracy =
        dropCp >= 95 && Boolean(beforeEval.bestMoveUci) && beforeEval.bestMoveUci !== playedUci;

      if (report) {
        const activeOpId =
          selectedOpening?.id ??
          report.targetWeaknesses[0]?.id ??
          report.whiteOpenings[0]?.id ??
          report.blackOpenings[0]?.id ??
          'general';
        onOpeningMoveAttempt(report.profile.username, activeOpId, !isInaccuracy);
      }

      if (isInaccuracy && beforeEval.bestMoveUci) {
        setArrows([
          {
            from: beforeEval.bestMoveUci.slice(0, 2),
            to: beforeEval.bestMoveUci.slice(2, 4),
            color: 'amber',
          },
        ]);
        setStatusMessage(t.trainer.drillStatusInaccuracy);
        setStatusTone('amber');
      } else {
        setStatusMessage(t.trainer.drillStatusGood);
        setStatusTone('emerald');
      }
    }

    const botColor: 'white' | 'black' = userColor === 'white' ? 'black' : 'white';
    void triggerBotTurn(nextFen, botColor, report, mode, token);
  };

  const handleShowHint = async () => {
    if (engineThinking) return;
    if (mode === 'blunder_puzzles' && currentBlunder && !puzzleSolved) {
      setArrows([
        {
          from: currentBlunder.punishMoveUci.slice(0, 2),
          to: currentBlunder.punishMoveUci.slice(2, 4),
          color: 'emerald',
        },
      ]);
      return;
    }
    setEngineThinking(true);
    const res = await stockfishEngine.evaluatePosition(fen, 11, 300);
    setEngineThinking(false);
    if (res.bestMoveUci) {
      setArrows([
        {
          from: res.bestMoveUci.slice(0, 2),
          to: res.bestMoveUci.slice(2, 4),
          color: 'emerald',
        },
      ]);
      setEvalCpWhite(res.evalCpWhite);
      setMateWhite(res.mateWhite);
    }
  };

  const handleUndo = () => {
    if (engineThinking || fenStack.length <= 1) return;
    const stepsBack = fenStack.length >= 3 ? 2 : 1;
    const nextStack = fenStack.slice(0, fenStack.length - stepsBack);
    const targetFen = nextStack[nextStack.length - 1];
    setFenStack(nextStack);
    setFen(targetFen);
    setHistorySan((prev) => prev.slice(0, Math.max(0, prev.length - stepsBack)));
    setLastMove(null);
    setArrows([]);
    setPuzzleSolved(false);
  };

  const whitePercent = computeWhiteBarPercent(evalCpWhite, mateWhite);
  const evalDisplay = formatEvalText(evalCpWhite, mateWhite);

  const toneClasses: Record<'neutral' | 'emerald' | 'amber' | 'rose', string> = {
    neutral: 'bg-slate-800/70 border-slate-700/80 text-slate-200',
    emerald: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200',
    amber: 'bg-amber-950/50 border-amber-500/40 text-amber-200',
    rose: 'bg-rose-950/60 border-rose-500/40 text-rose-200',
  };

  return (
    <section id="trainer" className="scroll-mt-20">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
            {t.trainer.sectionTitle}
          </h2>
          <p className="mt-1.5 text-sm text-slate-400 max-w-2xl">{t.trainer.subtitle}</p>
        </div>

        {/* 3-Mode Segmented Switcher */}
        <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 self-start">
          {(
            [
              {id: 'opening_drill', label: t.trainer.modeOpeningDrill},
              {id: 'blunder_puzzles', label: t.trainer.modeBlunderPuzzles},
              {id: 'sparring_bot', label: t.trainer.modeSparringBot},
            ] as const
          ).map((tab) => {
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onModeChange(tab.id)}
                className={`px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Center: Eval Bar + SVG Chessboard */}
        <div className="lg:col-span-7 bg-[#111923] border border-slate-800/90 rounded-2xl p-4 sm:p-5">
          {/* Top player / bot status strip */}
          <div className="flex items-center justify-between gap-3 mb-3 text-xs text-slate-300">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-100 truncate">
                {orientation === 'white'
                  ? report?.profile.username ?? t.trainer.opponentPlays
                  : `${t.trainer.youPlay} (${t.trainer.blackColor})`}
              </span>
              {moveSourceBadge && (
                <span className="text-slate-400 font-mono whitespace-nowrap">
                  · {moveSourceBadge === 'book' ? t.trainer.bookMoveBadge : t.trainer.engineMoveBadge}
                </span>
              )}
            </div>
            <div className="font-mono tabular-nums text-slate-300 whitespace-nowrap">
              {engineThinking ? t.trainer.engineThinking : `${t.trainer.evalLabel}: ${evalDisplay}`}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch gap-3">
            {/* Vertical Eval Bar (desktop) / Horizontal Eval Bar (mobile) */}
            <div
              dir="ltr"
              className="sm:w-5 w-full h-3 sm:h-auto rounded-full overflow-hidden bg-slate-800 border border-slate-700/80 flex sm:flex-col shrink-0"
              aria-label={`${t.trainer.evalLabel} ${evalDisplay}`}
            >
              {orientation === 'white' ? (
                <>
                  <div
                    className="bg-slate-950 transition-all duration-300"
                    style={{flexBasis: `${100 - whitePercent}%`}}
                  />
                  <div
                    className="bg-stone-100 transition-all duration-300"
                    style={{flexBasis: `${whitePercent}%`}}
                  />
                </>
              ) : (
                <>
                  <div
                    className="bg-stone-100 transition-all duration-300"
                    style={{flexBasis: `${whitePercent}%`}}
                  />
                  <div
                    className="bg-slate-950 transition-all duration-300"
                    style={{flexBasis: `${100 - whitePercent}%`}}
                  />
                </>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <ChessBoard
                fen={fen}
                orientation={orientation}
                interactive={!engineThinking && Boolean(report)}
                playerColor={userColor}
                lastMove={lastMove}
                arrows={arrows}
                promoteTitle={t.trainer.promoteTitle}
                onMoveAttempt={handleUserMoveAttempt}
              />
            </div>
          </div>

          {/* Bottom player strip + board action controls */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800/80">
            <div className="text-xs text-slate-300">
              <span className="font-semibold text-emerald-400">
                {t.trainer.youPlay}:{' '}
                {userColor === 'white' ? t.trainer.whiteColor : t.trainer.blackColor}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleShowHint}
                disabled={!report || engineThinking}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                {t.trainer.hintBtn}
              </button>
              <button
                type="button"
                onClick={handleUndo}
                disabled={!report || engineThinking || fenStack.length <= 1}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Undo2 className="w-3.5 h-3.5" />
                {t.trainer.undoBtn}
              </button>
              <button
                type="button"
                onClick={resetSession}
                disabled={!report}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t.trainer.resetBtn}
              </button>
              <button
                type="button"
                onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                title={t.trainer.flipBoard}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.trainer.flipBoard}</span>
              </button>
              <button
                type="button"
                onClick={() => setSoundEnabled((s) => !s)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
                title={soundEnabled ? t.trainer.soundOn : t.trainer.soundOff}
              >
                {soundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Mode Controls, Feedback & Move List */}
        <div className="lg:col-span-5 bg-[#111923] border border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-4">
          {/* Status Feedback Banner */}
          <div className={`p-3.5 rounded-xl border text-sm leading-relaxed ${toneClasses[statusTone]}`}>
            {statusMessage}
          </div>

          {/* Mode-Specific Selector */}
          {report && mode === 'opening_drill' && (
            <div className="space-y-2">
              <label
                htmlFor="drill-opening-select"
                className="block text-xs font-semibold text-slate-400"
              >
                {t.trainer.drillSelectOpening}
              </label>
              <select
                id="drill-opening-select"
                value={
                  selectedOpening?.id ??
                  report.targetWeaknesses[0]?.id ??
                  report.whiteOpenings[0]?.id ??
                  report.blackOpenings[0]?.id ??
                  ''
                }
                onChange={(e) => {
                  const found = allOpenings.find((o) => o.id === e.target.value);
                  if (found) onSelectOpening(found);
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                {allOpenings.slice(0, 16).map((op) => (
                  <option key={op.id} value={op.id}>
                    [{op.eco}] {op.name} ({op.color === 'white' ? t.weaknesses.asWhite : t.weaknesses.asBlack} · {op.games}g · {op.lossRate}%L)
                  </option>
                ))}
              </select>
            </div>
          )}

          {report && mode === 'blunder_puzzles' && (
            <div className="space-y-3">
              {report.blunders.length > 0 && currentBlunder ? (
                <>
                  <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
                    <span>
                      {t.trainer.puzzleCounter} {selectedBlunderIndex + 1} / {report.blunders.length}
                    </span>
                    <span className="text-emerald-400 font-semibold">
                      {t.trainer.puzzleStreak}: {progress.currentStreak}
                      <span className="text-slate-500 font-normal">
                        {' '}
                        / {t.progressTracker.bestStreakLabel}: {progress.bestStreak}
                      </span>
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 space-y-1">
                    <div className="font-semibold text-slate-100">
                      [{currentBlunder.eco}] {currentBlunder.openingName}
                    </div>
                    <div className="tabular-nums text-slate-400">
                      {t.blunders.moveLabel} {currentBlunder.moveNumber} · {currentBlunder.timeClass} ·{' '}
                      {currentBlunder.date}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onSelectBlunderIndex(
                          (selectedBlunderIndex - 1 + report.blunders.length) %
                            report.blunders.length
                        )
                      }
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      {t.trainer.prevPuzzle}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectBlunderIndex((selectedBlunderIndex + 1) % report.blunders.length)
                      }
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-slate-950 cursor-pointer"
                    >
                      {t.trainer.nextPuzzle}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400">{t.trainer.noBlundersForPuzzle}</p>
              )}
            </div>
          )}

          {report && mode === 'sparring_bot' && (
            <div className="space-y-2">
              <label
                htmlFor="sparring-start-select"
                className="block text-xs font-semibold text-slate-400"
              >
                {t.trainer.sparringStartPos}
              </label>
              <select
                id="sparring-start-select"
                value={sparringOpeningId}
                onChange={(e) => setSparringOpeningId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="default">{t.trainer.sparringDefaultPos}</option>
                {allOpenings.slice(0, 12).map((op) => (
                  <option key={op.id} value={op.id}>
                    [{op.eco}] {op.name} ({op.color === 'white' ? t.weaknesses.asWhite : t.weaknesses.asBlack})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Move History */}
          <div className="pt-2 border-t border-slate-800/80">
            <h3 className="text-xs font-semibold text-slate-400 mb-2">
              {t.trainer.moveHistoryTitle}
            </h3>
            <div
              dir="ltr"
              className="h-44 overflow-y-auto scout-scroll rounded-xl bg-slate-900/70 border border-slate-800/80 p-3 font-mono text-xs tabular-nums"
            >
              {historySan.length === 0 ? (
                <span className="text-slate-500">—</span>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {Array.from({length: Math.ceil(historySan.length / 2)}).map((_, idx) => (
                    <React.Fragment key={idx}>
                      <div className="text-slate-200">
                        <span className="text-slate-500 mr-2">{idx + 1}.</span>
                        {historySan[idx * 2]}
                      </div>
                      <div className="text-slate-300">{historySan[idx * 2 + 1] ?? ''}</div>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
