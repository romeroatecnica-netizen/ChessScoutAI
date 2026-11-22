import React, {useMemo, useRef, useState} from 'react';
import {Chess, type Square} from 'chess.js';
import type {BoardArrow} from '../types/chess';
import {ChessPieceSvg} from './ChessPieceSvg';

interface ChessBoardProps {
  fen: string;
  orientation: 'white' | 'black';
  interactive: boolean;
  playerColor?: 'white' | 'black';
  lastMove?: {from: string; to: string} | null;
  arrows?: BoardArrow[];
  promoteTitle?: string;
  onMoveAttempt: (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

function squareToCoords(sq: string, orientation: 'white' | 'black'): {x: number; y: number} {
  const fileIdx = FILES.indexOf(sq[0] as (typeof FILES)[number]);
  const rankNum = parseInt(sq[1], 10);
  const col = orientation === 'white' ? fileIdx : 7 - fileIdx;
  const row = orientation === 'white' ? 8 - rankNum : rankNum - 1;
  return {
    x: col * 100 + 50,
    y: row * 100 + 50,
  };
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  fen,
  orientation,
  interactive,
  playerColor,
  lastMove,
  arrows = [],
  promoteTitle = 'Promote Pawn',
  onMoveAttempt,
}) => {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{from: string; to: string} | null>(null);

  const [dragState, setDragState] = useState<{
    from: string;
    pieceColor: 'w' | 'b';
    pieceType: 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isDragging: boolean;
  } | null>(null);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const boardMatrix = chess.board();
  const activeTurn = chess.turn(); // 'w' | 'b'
  const isCheck = chess.inCheck();

  const checkedKingSquare = useMemo(() => {
    if (!isCheck) return null;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = boardMatrix[r][c];
        if (piece && piece.type === 'k' && piece.color === activeTurn) {
          return piece.square;
        }
      }
    }
    return null;
  }, [boardMatrix, isCheck, activeTurn]);

  const legalMovesFromSelected = useMemo(() => {
    if (!selectedSquare) return new Map<string, boolean>();
    const moves = chess.moves({square: selectedSquare as Square, verbose: true});
    const map = new Map<string, boolean>();
    for (const m of moves) {
      map.set(m.to, Boolean(m.captured));
    }
    return map;
  }, [chess, selectedSquare]);

  const canControlColor = (pieceColor: 'w' | 'b'): boolean => {
    if (!interactive) return false;
    if (pieceColor !== activeTurn) return false;
    if (playerColor) {
      return (playerColor === 'white' && pieceColor === 'w') ||
        (playerColor === 'black' && pieceColor === 'b');
    }
    return true;
  };

  const tryExecuteMove = (from: string, to: string) => {
    const moves = chess.moves({square: from as Square, verbose: true});
    const matching = moves.filter((m) => m.to === to);
    if (matching.length === 0) return false;

    const needsPromotion = matching.some((m) => Boolean(m.promotion));
    if (needsPromotion) {
      setPendingPromotion({from, to});
      setSelectedSquare(null);
      return true;
    }

    setSelectedSquare(null);
    onMoveAttempt(from, to);
    return true;
  };

  const getSquareFromPointer = (clientX: number, clientY: number): string | null => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) return null;

    const col = Math.floor((relX / rect.width) * 8);
    const row = Math.floor((relY / rect.height) * 8);
    const file = orientation === 'white' ? FILES[col] : FILES[7 - col];
    const rank = orientation === 'white' ? RANKS[row] : RANKS[7 - row];
    if (!file || !rank) return null;
    return `${file}${rank}`;
  };

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    squareName: string,
    piece: {color: 'w' | 'b'; type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'} | null
  ) => {
    if (!interactive || pendingPromotion) return;

    // If a piece is already selected and user taps a legal target square
    if (selectedSquare && legalMovesFromSelected.has(squareName)) {
      e.preventDefault();
      tryExecuteMove(selectedSquare, squareName);
      return;
    }

    if (piece && canControlColor(piece.color)) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setSelectedSquare(squareName);
      setDragState({
        from: squareName,
        pieceColor: piece.color,
        pieceType: piece.type,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        isDragging: false,
      });
    } else {
      setSelectedSquare(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
    setDragState((prev) =>
      prev
        ? {
            ...prev,
            currentX: e.clientX,
            currentY: e.clientY,
            isDragging: prev.isDragging || dist > 6,
          }
        : null
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    const wasDragging = dragState.isDragging;
    const fromSquare = dragState.from;
    setDragState(null);

    if (wasDragging) {
      const targetSquare = getSquareFromPointer(e.clientX, e.clientY);
      if (targetSquare && targetSquare !== fromSquare) {
        tryExecuteMove(fromSquare, targetSquare);
      }
    }
  };

  const displayRanks = orientation === 'white' ? RANKS : [...RANKS].reverse();
  const displayFiles = orientation === 'white' ? FILES : [...FILES].reverse();

  const arrowColors: Record<BoardArrow['color'], string> = {
    emerald: '#10B981',
    amber: '#F59E0B',
    rose: '#F43F5E',
  };

  const boardSizePx = boardRef.current?.getBoundingClientRect().width ?? 400;
  const ghostPiecePx = boardSizePx / 8;

  return (
    <div dir="ltr" className="relative w-full max-w-[520px] mx-auto select-none">
      {/* 8x8 Grid */}
      <div
        ref={boardRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setDragState(null)}
        className="relative grid grid-cols-8 grid-rows-8 aspect-square w-full rounded-xl overflow-hidden border border-slate-700/80 shadow-xl touch-none"
      >
        {displayRanks.map((rank, rIdx) =>
          displayFiles.map((file, fIdx) => {
            const squareName = `${file}${rank}`;
            const rankBoardIdx = 8 - parseInt(rank, 10);
            const fileBoardIdx = FILES.indexOf(file);
            const isLight = (rankBoardIdx + fileBoardIdx) % 2 === 0;
            const piece = boardMatrix[rankBoardIdx]?.[fileBoardIdx] ?? null;

            const isSelected = selectedSquare === squareName;
            const isLastFrom = lastMove?.from === squareName;
            const isLastTo = lastMove?.to === squareName;
            const isKingChecked = checkedKingSquare === squareName;
            const isLegalDest = legalMovesFromSelected.has(squareName);
            const isCaptureDest = legalMovesFromSelected.get(squareName) === true;

            const isHiddenDuringDrag =
              dragState?.isDragging && dragState.from === squareName;

            const bgClass = isLight ? 'bg-[#EAE6DF]' : 'bg-[#36534C]';

            return (
              <div
                key={squareName}
                onPointerDown={(e) => handlePointerDown(e, squareName, piece)}
                className={`relative flex items-center justify-center ${bgClass} ${
                  piece && canControlColor(piece.color) ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                }`}
              >
                {/* Last Move & Selection Highlights */}
                {(isLastFrom || isLastTo) && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{backgroundColor: 'rgba(245, 158, 11, 0.34)'}}
                  />
                )}
                {isSelected && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{backgroundColor: 'rgba(16, 185, 129, 0.45)'}}
                  />
                )}
                {isKingChecked && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(225,29,72,0.8) 0%, rgba(225,29,72,0.18) 72%, transparent 100%)',
                    }}
                  />
                )}

                {/* Coordinates */}
                {fIdx === 0 && (
                  <span
                    className={`absolute top-0.5 left-1 text-[10px] font-mono font-semibold leading-none pointer-events-none ${
                      isLight ? 'text-[#36534C]/80' : 'text-[#EAE6DF]/80'
                    }`}
                  >
                    {rank}
                  </span>
                )}
                {rIdx === 7 && (
                  <span
                    className={`absolute bottom-0.5 right-1 text-[10px] font-mono font-semibold leading-none pointer-events-none ${
                      isLight ? 'text-[#36534C]/80' : 'text-[#EAE6DF]/80'
                    }`}
                  >
                    {file}
                  </span>
                )}

                {/* Legal Move Indicators */}
                {isLegalDest && !isCaptureDest && (
                  <div className="w-[28%] h-[28%] rounded-full bg-slate-900/30 pointer-events-none z-10" />
                )}
                {isLegalDest && isCaptureDest && (
                  <div className="absolute inset-[6%] rounded-full border-[4px] border-slate-900/35 pointer-events-none z-10" />
                )}

                {/* Piece */}
                {piece && !isHiddenDuringDrag && (
                  <div className="w-[84%] h-[84%] z-10 pointer-events-none">
                    <ChessPieceSvg color={piece.color} type={piece.type} />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* SVG Directional Arrow Overlay */}
        {arrows.length > 0 && (
          <svg
            viewBox="0 0 800 800"
            className="absolute inset-0 w-full h-full pointer-events-none z-20"
          >
            <defs>
              {(['emerald', 'amber', 'rose'] as const).map((col) => (
                <marker
                  key={col}
                  id={`arrow-head-${col}`}
                  markerWidth="4"
                  markerHeight="4"
                  refX="2.4"
                  refY="2"
                  orient="auto"
                >
                  <polygon points="0 0, 4 2, 0 4" fill={arrowColors[col]} />
                </marker>
              ))}
            </defs>
            {arrows.map((arrow, idx) => {
              const p1 = squareToCoords(arrow.from, orientation);
              const p2 = squareToCoords(arrow.to, orientation);
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const len = Math.hypot(dx, dy) || 1;
              // Shorten slightly so arrowhead rests cleanly inside destination square
              const endX = p2.x - (dx / len) * 18;
              const endY = p2.y - (dy / len) * 18;
              const startX = p1.x + (dx / len) * 14;
              const startY = p1.y + (dy / len) * 14;

              return (
                <line
                  key={`${arrow.from}-${arrow.to}-${idx}`}
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke={arrowColors[arrow.color]}
                  strokeWidth="15"
                  strokeLinecap="round"
                  opacity="0.82"
                  markerEnd={`url(#arrow-head-${arrow.color})`}
                />
              );
            })}
          </svg>
        )}

        {/* Promotion Modal */}
        {pendingPromotion && (
          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs z-30 flex flex-col items-center justify-center gap-3 p-4">
            <span className="text-sm font-medium text-slate-100">{promoteTitle}</span>
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 p-2 rounded-xl">
              {(['q', 'r', 'b', 'n'] as const).map((promo) => (
                <button
                  key={promo}
                  type="button"
                  onClick={() => {
                    const {from, to} = pendingPromotion;
                    setPendingPromotion(null);
                    onMoveAttempt(from, to, promo);
                  }}
                  className="w-14 h-14 p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600/30 border border-slate-700 hover:border-emerald-500 transition-colors cursor-pointer"
                >
                  <ChessPieceSvg color={activeTurn} type={promo} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Floating Drag Ghost Piece */}
      {dragState?.isDragging && (
        <div
          className="fixed pointer-events-none z-50"
          style={{
            width: `${ghostPiecePx}px`,
            height: `${ghostPiecePx}px`,
            left: `${dragState.currentX - ghostPiecePx / 2}px`,
            top: `${dragState.currentY - ghostPiecePx / 2}px`,
          }}
        >
          <ChessPieceSvg color={dragState.pieceColor} type={dragState.pieceType} />
        </div>
      )}
    </div>
  );
};
