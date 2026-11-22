import React, {useRef, useState} from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Crosshair,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Share2,
  Swords,
  Trophy,
  Upload,
  Zap,
} from 'lucide-react';
import type {TranslationBundle} from '../i18n';
import type {
  ExtractedBlunder,
  OpeningStat,
  ScoutReport,
  UserTrainingProgress,
} from '../types/chess';

interface ScoutingDashboardProps {
  report: ScoutReport;
  t: TranslationBundle;
  progress: UserTrainingProgress;
  onRefresh: () => void;
  onExportMarkdown: () => void;
  onCopyShareLink: () => Promise<boolean>;
  onDrillOpening: (opening: OpeningStat) => void;
  onPunishBlunder: (blunderIndex: number, blunder: ExtractedBlunder) => void;
  onExportProgress: () => void;
  onImportProgress: (rawJson: string) => boolean;
  onResetProgress: () => void;
}

const WdlBar: React.FC<{winRate: number; drawRate: number; lossRate: number}> = ({
  winRate,
  drawRate,
  lossRate,
}) => (
  <div className="w-full h-2 rounded-full overflow-hidden bg-slate-800 flex" dir="ltr">
    {winRate > 0 && <div className="bg-emerald-500 h-full" style={{width: `${winRate}%`}} />}
    {drawRate > 0 && <div className="bg-slate-400 h-full" style={{width: `${drawRate}%`}} />}
    {lossRate > 0 && <div className="bg-rose-500 h-full" style={{width: `${lossRate}%`}} />}
  </div>
);

export const ScoutingDashboard: React.FC<ScoutingDashboardProps> = ({
  report,
  t,
  progress,
  onRefresh,
  onExportMarkdown,
  onCopyShareLink,
  onDrillOpening,
  onPunishBlunder,
  onExportProgress,
  onImportProgress,
  onResetProgress,
}) => {
  const [repertoireTab, setRepertoireTab] = useState<'white' | 'black'>('white');
  const [copied, setCopied] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{text: string; ok: boolean} | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const opponentKey = report.profile.username.trim().toLowerCase();
  const opponentProgress = progress.opponents[opponentKey];
  const solvedIds = opponentProgress?.solvedBlunderIds ?? [];
  const solvedCountForReport = report.blunders.filter((b) => solvedIds.includes(b.id)).length;

  const drillStats = Object.values(opponentProgress?.drilledOpenings ?? {});
  const totalDrillAttempts = drillStats.reduce((sum, item) => sum + item.attempts, 0);
  const totalDrillAccurate = drillStats.reduce((sum, item) => sum + item.accurateMoves, 0);
  const drillAccuracyPct =
    totalDrillAttempts > 0 ? Math.round((totalDrillAccurate / totalDrillAttempts) * 100) : null;

  const sparringRec = opponentProgress?.sparringRecord ?? {wins: 0, draws: 0, losses: 0};

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const ok = onImportProgress(text);
    setBackupMessage({
      text: ok ? t.progressTracker.importSuccess : t.progressTracker.importError,
      ok,
    });
    window.setTimeout(() => setBackupMessage(null), 3000);
  };

  const handleCopy = async () => {
    const ok = await onCopyShareLink();
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    }
  };

  const activeOpenings =
    repertoireTab === 'white' ? report.whiteOpenings : report.blackOpenings;

  const styleLabelMap = {
    aggressive: t.weaknesses.styleAggressive,
    positional: t.weaknesses.stylePositional,
    balanced: t.weaknesses.styleBalanced,
  };

  const phaseRows = [
    {
      key: 'opening' as const,
      title: t.weaknesses.openingPhase,
      range: t.weaknesses.openingRange,
      data: report.phaseStats.opening,
    },
    {
      key: 'middlegame' as const,
      title: t.weaknesses.middlegamePhase,
      range: t.weaknesses.middlegameRange,
      data: report.phaseStats.middlegame,
    },
    {
      key: 'endgame' as const,
      title: t.weaknesses.endgamePhase,
      range: t.weaknesses.endgameRange,
      data: report.phaseStats.endgame,
    },
  ];

  return (
    <div id="scouting" className="space-y-10 scroll-mt-20">
      {/* Player Profile & Action Bar */}
      <section className="bg-[#111923] border border-slate-800/90 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            {report.profile.avatar ? (
              <img
                src={report.profile.avatar}
                alt={report.profile.username}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-xl object-cover border border-slate-700 shrink-0 bg-slate-900"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl font-bold text-emerald-400 shrink-0">
                {report.profile.username.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                {report.profile.title && (
                  <span className="text-sm font-mono font-bold text-amber-400">
                    {report.profile.title}
                  </span>
                )}
                <h2 className="text-xl sm:text-2xl font-bold text-slate-100 truncate">
                  {report.profile.username}
                </h2>
                <a
                  href={report.profile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-emerald-400 transition-colors"
                  aria-label="Chess.com Profile"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400 tabular-nums">
                {report.profile.countryCode && (
                  <>
                    <span className="font-mono text-slate-300">{report.profile.countryCode}</span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>
                  {report.totalGamesAnalyzed} {t.profile.gamesAnalyzed}
                </span>
                {typeof report.profile.followers === 'number' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      {report.profile.followers.toLocaleString()} {t.profile.followers}
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>{t.profile.cachedNote}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t.profile.refreshBtn}
            </button>
            <button
              type="button"
              onClick={onExportMarkdown}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              {t.profile.exportMd}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-slate-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              {copied ? t.profile.linkCopied : t.profile.copyLink}
            </button>
          </div>
        </div>

        {/* Ratings & Overall Record Row */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-0.5">
            <div className="text-xs text-slate-400">{t.profile.bullet}</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-100">
              {report.stats.bullet?.rating ?? '—'}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-xs text-slate-400">{t.profile.blitz}</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-amber-400">
              {report.stats.blitz?.rating ?? '—'}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-xs text-slate-400">{t.profile.rapid}</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
              {report.stats.rapid?.rating ?? '—'}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-xs text-slate-400">{t.profile.overallRecord}</div>
            <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-slate-100">
              <span className="text-emerald-400">
                {report.overallRecord.wins}
                {t.profile.wins}
              </span>
              <span className="text-slate-600 mx-1.5">/</span>
              <span className="text-slate-300">
                {report.overallRecord.draws}
                {t.profile.draws}
              </span>
              <span className="text-slate-600 mx-1.5">/</span>
              <span className="text-rose-400">
                {report.overallRecord.losses}
                {t.profile.losses}
              </span>
            </div>
          </div>
        </div>

        {/* Local Training Progress & Backup Strip */}
        <div className="mt-5 pt-5 border-t border-slate-800/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <Trophy className="w-3.5 h-3.5 shrink-0" />
              <span>{t.progressTracker.title}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-300 tabular-nums">
              <span>
                <span className="text-slate-400">{t.progressTracker.puzzlesSolvedLabel}: </span>
                <strong className="font-mono text-slate-100">
                  {solvedCountForReport}/{report.blunders.length}
                </strong>
              </span>
              <span>
                <span className="text-slate-400">{t.progressTracker.bestStreakLabel}: </span>
                <strong className="font-mono text-amber-400">{progress.bestStreak}</strong>
              </span>
              <span>
                <span className="text-slate-400">{t.progressTracker.drillAccuracyLabel}: </span>
                <strong className="font-mono text-emerald-400">
                  {drillAccuracyPct !== null ? `${drillAccuracyPct}%` : '—'}
                </strong>
              </span>
              <span>
                <span className="text-slate-400">{t.progressTracker.sparringRecordLabel}: </span>
                <strong className="font-mono text-slate-100">
                  {sparringRec.wins}W / {sparringRec.draws}D / {sparringRec.losses}L
                </strong>
              </span>
            </div>
            {backupMessage && (
              <p
                className={`text-xs font-medium ${
                  backupMessage.ok ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {backupMessage.text}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={onExportProgress}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              {t.progressTracker.exportBackup}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              {t.progressTracker.importBackup}
            </button>
            <button
              type="button"
              onClick={onResetProgress}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/40 text-xs font-medium text-slate-300 hover:text-rose-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t.progressTracker.resetProgress}
            </button>
          </div>
        </div>
      </section>

      {/* Target Weaknesses, Phase Collapse & Clock Profile */}
      <section id="weaknesses" className="scroll-mt-20 space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">
          {t.weaknesses.sectionTitle}
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Top 3 Vulnerable Openings */}
          <div className="lg:col-span-5 bg-[#111923] border border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-2 text-slate-100 font-semibold">
                <Crosshair className="w-4 h-4 text-rose-400 shrink-0" />
                <h3>{t.weaknesses.targetOpeningsTitle}</h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">{t.weaknesses.targetOpeningsDesc}</p>
            </div>

            {report.targetWeaknesses.length === 0 ? (
              <p className="text-sm text-slate-400 py-6">{t.weaknesses.noWeaknesses}</p>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {report.targetWeaknesses.map((w) => (
                  <div key={w.id} className="py-3.5 first:pt-1 last:pb-1 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-mono text-amber-400">
                          {w.eco} · {w.color === 'white' ? t.weaknesses.asWhite : t.weaknesses.asBlack}
                        </div>
                        <div className="text-sm font-semibold text-slate-100 truncate">
                          {w.name}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDrillOpening(w)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-xs font-semibold text-emerald-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {t.weaknesses.trainLine}
                      </button>
                    </div>
                    <WdlBar winRate={w.winRate} drawRate={w.drawRate} lossRate={w.lossRate} />
                    <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums">
                      <span>
                        {w.games} {t.weaknesses.gamesCount}
                      </span>
                      <span className="text-rose-400 font-mono font-semibold">
                        {w.lossRate}% {t.weaknesses.lossRateLabel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Phase Breakdown */}
          <div className="lg:col-span-4 bg-[#111923] border border-slate-800/90 rounded-2xl p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2 text-slate-100 font-semibold">
                <Swords className="w-4 h-4 text-amber-400 shrink-0" />
                <h3>{t.weaknesses.phaseTitle}</h3>
              </div>
              <p className="mt-1 text-xs text-slate-400">{t.weaknesses.phaseSubtitle}</p>
            </div>

            <div className="space-y-4 pt-1">
              {phaseRows.map((row) => {
                const isPrimary =
                  report.phaseStats.totalLosses > 0 &&
                  report.phaseStats.primaryWeakness === row.key;
                return (
                  <div key={row.key} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200">
                        {row.title}{' '}
                        <span className="text-slate-500 font-mono">({row.range})</span>
                      </span>
                      <span className="font-mono tabular-nums text-slate-200">
                        {row.data.losses} ({row.data.shareOfLosses}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden" dir="ltr">
                      <div
                        className={`h-full rounded-full ${
                          isPrimary ? 'bg-amber-400' : 'bg-slate-500'
                        }`}
                        style={{width: `${row.data.shareOfLosses}%`}}
                      />
                    </div>
                    {isPrimary && (
                      <div className="text-[11px] font-semibold text-amber-400">
                        {t.weaknesses.primaryLeak}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Clock & Playing Style Profile */}
          <div className="lg:col-span-3 bg-[#111923] border border-slate-800/90 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-slate-100 font-semibold">
              <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
              <h3>{t.weaknesses.clockTitle}</h3>
            </div>

            <div className="divide-y divide-slate-800/80 text-xs">
              <div className="py-2.5 flex items-center justify-between gap-2">
                <span className="text-slate-400">{t.weaknesses.avgMoveTime}</span>
                <span className="font-mono tabular-nums font-semibold text-slate-100">
                  {report.clockStyle.avgSecondsPerMove !== null
                    ? `${report.clockStyle.avgSecondsPerMove}${t.weaknesses.secondsShort}`
                    : t.weaknesses.noClockData}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-2">
                <span className="text-slate-400">{t.weaknesses.timeoutLosses}</span>
                <span className="font-mono tabular-nums font-semibold text-rose-400">
                  {report.clockStyle.timeoutLosses} ({report.clockStyle.timeoutLossRate}%)
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-2">
                <span className="text-slate-400">{t.weaknesses.timeTrouble}</span>
                <span className="font-mono tabular-nums font-semibold text-amber-400">
                  {report.clockStyle.timeTroubleLossRate}%
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-2">
                <span className="text-slate-400">{t.weaknesses.avgLength}</span>
                <span className="font-mono tabular-nums font-semibold text-slate-100">
                  {report.clockStyle.avgGameMoves} {t.weaknesses.movesShort}
                </span>
              </div>
              <div className="pt-3 space-y-1">
                <span className="text-slate-400 block">{t.weaknesses.styleTitle}</span>
                <span className="text-sm font-semibold text-emerald-400">
                  {styleLabelMap[report.clockStyle.styleLabel]}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* White & Black Repertoire Table */}
      <section className="bg-[#111923] border border-slate-800/90 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100">
            {t.repertoire.sectionTitle}
          </h2>

          <div className="inline-flex p-1 rounded-xl bg-slate-900 border border-slate-800 self-start">
            <button
              type="button"
              onClick={() => setRepertoireTab('white')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                repertoireTab === 'white'
                  ? 'bg-stone-100 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {t.repertoire.whiteTab} ({report.whiteOpenings.length})
            </button>
            <button
              type="button"
              onClick={() => setRepertoireTab('black')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                repertoireTab === 'black'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {t.repertoire.blackTab} ({report.blackOpenings.length})
            </button>
          </div>
        </div>

        {activeOpenings.length === 0 ? (
          <p className="text-sm text-slate-400 py-6">{t.repertoire.emptyRepertoire}</p>
        ) : (
          <div className="overflow-x-auto scout-scroll">
            <table className="w-full text-left border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400">
                  <th className="py-3 pr-3">{t.repertoire.ecoCol}</th>
                  <th className="py-3 px-3">{t.repertoire.openingCol}</th>
                  <th className="py-3 px-3 text-right">{t.repertoire.gamesCol}</th>
                  <th className="py-3 px-3 w-48">{t.repertoire.wdlCol}</th>
                  <th className="py-3 px-3">{t.repertoire.linesCol}</th>
                  <th className="py-3 pl-3 text-right">{t.repertoire.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-sm">
                {activeOpenings.slice(0, 12).map((op) => (
                  <tr key={op.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pr-3 font-mono text-xs text-amber-400 whitespace-nowrap">
                      {op.eco}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-100 max-w-[240px] truncate">
                      {op.name}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200">
                      {op.games}
                    </td>
                    <td className="py-3 px-3 space-y-1">
                      <WdlBar winRate={op.winRate} drawRate={op.drawRate} lossRate={op.lossRate} />
                      <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400">
                        <span className="text-emerald-400">{op.winRate}%</span>
                        <span>{op.drawRate}%</span>
                        <span className="text-rose-400">{op.lossRate}%</span>
                      </div>
                    </td>
                    <td
                      dir="ltr"
                      className="py-3 px-3 font-mono text-xs text-slate-400 max-w-[220px] truncate"
                    >
                      {op.sampleMoves.slice(0, 6).join(' ')}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => onDrillOpening(op)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {t.repertoire.practiceBtn}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Extracted Stockfish Blunders */}
      <section className="bg-[#111923] border border-slate-800/90 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100">
                {t.blunders.sectionTitle}
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">{t.blunders.subtitle}</p>
          </div>
        </div>

        {report.blunders.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">{t.blunders.emptyBlunders}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {report.blunders.slice(0, 6).map((b, idx) => {
              const isSolved = solvedIds.includes(b.id);
              return (
                <div
                  key={b.id}
                  className={`p-4 rounded-xl bg-slate-900/80 border flex flex-col justify-between gap-3 ${
                    isSolved ? 'border-emerald-500/40' : 'border-slate-800'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-400 tabular-nums gap-2">
                      <span>
                        {b.eco} · {t.blunders.moveLabel} {b.moveNumber}
                      </span>
                      <div className="flex items-center gap-2.5">
                        {isSolved && (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {t.progressTracker.solvedTag}
                          </span>
                        )}
                        <span className="font-mono font-bold text-rose-400">
                          -{b.evalLossPawns.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-slate-100 truncate">
                      {b.openingName}
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono tabular-nums pt-1">
                      <span className="text-rose-400">
                        {t.blunders.playedLabel}: {b.blunderSan}
                      </span>
                      <span className="text-emerald-400">
                        {t.blunders.bestLabel}: {b.bestMoveBeforeSan}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onPunishBlunder(idx, b)}
                    className="w-full py-2 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40 text-xs font-semibold text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {t.blunders.punishBtn}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
