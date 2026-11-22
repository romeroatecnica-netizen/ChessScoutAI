import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AlertCircle, Globe, Search} from 'lucide-react';
import {
  AffiliateResourcesSection,
  EditorialSeoSection,
  MediaNetAdSlot,
} from './components/MonetizationAndSeo';
import {ScoutingDashboard} from './components/ScoutingDashboard';
import {TrainingArena} from './components/TrainingArena';
import {
  SUPPORTED_LANGUAGES,
  detectInitialLanguage,
  getTranslation,
} from './i18n';
import {
  ScoutApiError,
  fetchPlayerProfileAndStats,
  fetchRecentStandardGames,
  getCachedReport,
  saveCachedReport,
} from './services/chessComApi';
import {
  clearAllProgress,
  exportProgressJson,
  importProgressJson,
  loadProgress,
  recordBlunderFailed,
  recordBlunderSolved,
  recordOpeningMoveAttempt,
  recordOpponentScouted,
  recordSparringOutcome,
} from './services/progressStore';
import {analyzeScoutReport} from './services/scoutAnalyzer';
import type {
  ExtractedBlunder,
  LanguageCode,
  OpeningStat,
  ScoutErrorCode,
  ScoutProgress,
  ScoutReport,
  TrainerMode,
  UserTrainingProgress,
} from './types/chess';
import {downloadMarkdownReport} from './utils/exportMarkdown';
import {updateDocumentSeo} from './utils/seo';

const QUICK_EXAMPLES = ['Hikaru', 'GothamChess', 'MagnusCarlsen'] as const;

export default function App() {
  const [lang, setLang] = useState<LanguageCode>(() => detectInitialLanguage());
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [report, setReport] = useState<ScoutReport | null>(null);
  const [progress, setProgress] = useState<ScoutProgress>({stage: 'idle', percent: 0});
  const [errorCode, setErrorCode] = useState<ScoutErrorCode | null>(null);

  const [trainerMode, setTrainerMode] = useState<TrainerMode>('opening_drill');
  const [selectedOpening, setSelectedOpening] = useState<OpeningStat | null>(null);
  const [selectedBlunderIndex, setSelectedBlunderIndex] = useState<number>(0);
  const [userProgress, setUserProgress] = useState<UserTrainingProgress>(() => loadProgress());

  const activeRequestIdRef = useRef<number>(0);
  const autoRunDoneRef = useRef<boolean>(false);

  const t = getTranslation(lang);

  // Sync SEO meta, html lang/dir, canonical, hreflang, and JSON-LD
  useEffect(() => {
    updateDocumentSeo(lang, report?.profile.username ?? null);
    try {
      window.localStorage.setItem('chessscout_lang', lang);
    } catch {
      // Ignore storage errors
    }
  }, [lang, report?.profile.username]);

  const syncUrlParams = useCallback((nextUser: string | null, nextLang: LanguageCode) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('lang', nextLang);
    if (nextUser && nextUser.trim()) {
      url.searchParams.set('user', nextUser.trim());
    } else {
      url.searchParams.delete('user');
    }
    window.history.replaceState({}, '', url.toString());
  }, []);

  const runScout = useCallback(
    async (rawUsername: string, bypassCache = false) => {
      const clean = rawUsername.trim();
      if (!clean) {
        setErrorCode('EMPTY_USERNAME');
        return;
      }

      const requestId = ++activeRequestIdRef.current;
      setUsernameInput(clean);
      setErrorCode(null);
      syncUrlParams(clean, lang);

      if (!bypassCache) {
        const cached = getCachedReport(clean);
        if (cached) {
          setReport(cached);
          setUserProgress((prev) => recordOpponentScouted(prev, cached.profile.username));
          setSelectedOpening(
            cached.targetWeaknesses[0] ??
              cached.whiteOpenings[0] ??
              cached.blackOpenings[0] ??
              null
          );
          setSelectedBlunderIndex(0);
          setProgress({stage: 'complete', percent: 100});
          return;
        }
      }

      try {
        setProgress({stage: 'profile', percent: 12});
        const {profile, stats} = await fetchPlayerProfileAndStats(clean);
        if (activeRequestIdRef.current !== requestId) return;

        setProgress({stage: 'archives', percent: 28});
        const games = await fetchRecentStandardGames(clean, (loaded, total) => {
          if (activeRequestIdRef.current !== requestId) return;
          const pct = 32 + Math.round((loaded / Math.max(total, 1)) * 25);
          setProgress({stage: 'downloading', percent: pct, detail: `${loaded}/${total}`});
        });
        if (activeRequestIdRef.current !== requestId) return;

        const analyzed = await analyzeScoutReport(
          clean,
          profile,
          stats,
          games,
          (stage, percent, detail) => {
            if (activeRequestIdRef.current !== requestId) return;
            setProgress({stage, percent, detail});
          }
        );
        if (activeRequestIdRef.current !== requestId) return;

        saveCachedReport(analyzed);
        setReport(analyzed);
        setUserProgress((prev) => recordOpponentScouted(prev, analyzed.profile.username));
        setSelectedOpening(
          analyzed.targetWeaknesses[0] ??
            analyzed.whiteOpenings[0] ??
            analyzed.blackOpenings[0] ??
            null
        );
        setSelectedBlunderIndex(0);
        setProgress({stage: 'complete', percent: 100});
      } catch (err) {
        if (activeRequestIdRef.current !== requestId) return;
        setProgress({stage: 'error', percent: 0});
        if (err instanceof ScoutApiError) {
          setErrorCode(err.code);
        } else {
          setErrorCode('NETWORK_ERROR');
        }
      }
    },
    [lang, syncUrlParams]
  );

  // Auto-run if ?user=... is provided in the URL
  useEffect(() => {
    if (autoRunDoneRef.current) return;
    autoRunDoneRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const urlUser = params.get('user')?.trim();
    if (urlUser) {
      setUsernameInput(urlUser);
      void runScout(urlUser);
    }
  }, [runScout]);

  const handleLanguageChange = (nextLang: LanguageCode) => {
    setLang(nextLang);
    syncUrlParams(report?.profile.username ?? (usernameInput.trim() || null), nextLang);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runScout(usernameInput);
  };

  const handleCopyShareLink = async (): Promise<boolean> => {
    if (!report) return false;
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('user', report.profile.username);
    url.searchParams.set('lang', lang);
    try {
      await navigator.clipboard.writeText(url.toString());
      return true;
    } catch {
      return false;
    }
  };

  const handleDrillOpening = (opening: OpeningStat) => {
    setSelectedOpening(opening);
    setTrainerMode('opening_drill');
    document.getElementById('trainer')?.scrollIntoView({behavior: 'smooth'});
  };

  const handlePunishBlunder = (blunderIndex: number, _blunder: ExtractedBlunder) => {
    setSelectedBlunderIndex(blunderIndex);
    setTrainerMode('blunder_puzzles');
    document.getElementById('trainer')?.scrollIntoView({behavior: 'smooth'});
  };

  const handleBlunderSolved = useCallback((username: string, blunderId: string) => {
    setUserProgress((prev) => recordBlunderSolved(prev, username, blunderId));
  }, []);

  const handleBlunderFailed = useCallback(() => {
    setUserProgress((prev) => recordBlunderFailed(prev));
  }, []);

  const handleOpeningMoveAttempt = useCallback(
    (username: string, openingId: string, isAccurate: boolean) => {
      setUserProgress((prev) => recordOpeningMoveAttempt(prev, username, openingId, isAccurate));
    },
    []
  );

  const handleSparringOutcome = useCallback(
    (username: string, outcome: 'win' | 'draw' | 'loss') => {
      setUserProgress((prev) => recordSparringOutcome(prev, username, outcome));
    },
    []
  );

  const handleImportProgress = useCallback((rawJson: string): boolean => {
    const imported = importProgressJson(rawJson);
    if (!imported) return false;
    setUserProgress(imported);
    return true;
  }, []);

  const handleResetProgress = useCallback(() => {
    setUserProgress(clearAllProgress());
  }, []);

  const isLoading =
    progress.stage === 'profile' ||
    progress.stage === 'archives' ||
    progress.stage === 'downloading' ||
    progress.stage === 'parsing' ||
    progress.stage === 'stockfish';

  const progressStageLabel = (() => {
    switch (progress.stage) {
      case 'profile':
        return t.progress.profile;
      case 'archives':
        return t.progress.archives;
      case 'downloading':
        return t.progress.downloading;
      case 'parsing':
        return t.progress.parsing;
      case 'stockfish':
        return `${t.progress.stockfish}${progress.detail ? ` (${progress.detail})` : ''}`;
      case 'complete':
        return t.progress.complete;
      default:
        return '';
    }
  })();

  return (
    <div className="min-h-screen flex flex-col bg-[#0B1118] text-slate-100">
      {/* Sticky Single-Row 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 bg-[#0B1118]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            ChessScout <span className="text-emerald-400">AI</span>
          </a>

          {/* Zone 2: 4 Single-line Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <a
              href="#scouting"
              className="hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0"
            >
              {t.nav.scouting}
            </a>
            <a
              href="#weaknesses"
              className="hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0"
            >
              {t.nav.weaknesses}
            </a>
            <a
              href="#trainer"
              className="hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0"
            >
              {t.nav.trainer}
            </a>
            <a
              href="#guide"
              className="hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0"
            >
              {t.nav.guide}
            </a>
          </nav>

          {/* Zone 3: Language Switcher Control */}
          <div className="flex items-center gap-2 shrink-0">
            <Globe className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            <label htmlFor="lang-select" className="sr-only">
              Language
            </label>
            <select
              id="lang-select"
              value={lang}
              onChange={(e) => handleLanguageChange(e.target.value as LanguageCode)}
              className="bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.nativeName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">
        {/* Hero Search Section */}
        <section className="max-w-4xl mx-auto text-center space-y-6">
          <p className="text-xs font-medium text-emerald-400">{t.hero.localBadge}</p>

          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-50 leading-[1.15]"
            style={{textWrap: 'balance'}}
          >
            {t.hero.h1}
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            {t.hero.subtitle}
          </p>

          {/* Search Form */}
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search
                  className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder={t.hero.inputPlaceholder}
                  aria-label={t.hero.inputPlaceholder}
                  className="w-full ps-10 pe-4 py-3.5 rounded-xl bg-[#111923] border border-slate-700 focus:border-emerald-500 focus:outline-none text-sm sm:text-base text-slate-100 placeholder:text-slate-500"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold text-sm sm:text-base transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isLoading ? t.hero.analyzingBtn : t.hero.analyzeBtn}
              </button>
            </div>

            {/* 1-Click Quick Examples */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400 pt-1">
              <span>{t.hero.quickExamplesLabel}</span>
              {QUICK_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setUsernameInput(example);
                    void runScout(example);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 text-slate-200 font-mono transition-colors cursor-pointer whitespace-nowrap"
                >
                  {example}
                </button>
              ))}
            </div>

            {/* Recent Scouted Opponents History */}
            {userProgress.recentOpponents.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
                <span>{t.progressTracker.recentOpponentsLabel}</span>
                {userProgress.recentOpponents.map((recentUser) => (
                  <button
                    key={recentUser}
                    type="button"
                    disabled={isLoading}
                    onClick={() => {
                      setUsernameInput(recentUser);
                      void runScout(recentUser);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 font-mono transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {recentUser}
                  </button>
                ))}
              </div>
            )}
          </form>

          {/* Real Multi-Stage Progress Bar */}
          {isLoading && (
            <div className="max-w-2xl mx-auto p-4 rounded-xl bg-[#111923] border border-slate-800 text-start space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-200 font-medium">{progressStageLabel}</span>
                <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                  {progress.percent}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden" dir="ltr">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{width: `${progress.percent}%`}}
                />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorCode && (
            <div
              role="alert"
              className="max-w-2xl mx-auto p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-sm flex items-center gap-3 text-start"
            >
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{t.errors[errorCode]}</span>
            </div>
          )}
        </section>

        {/* Scouting Results Dashboard */}
        {report && (
          <ScoutingDashboard
            report={report}
            t={t}
            progress={userProgress}
            onRefresh={() => void runScout(report.profile.username, true)}
            onExportMarkdown={() => downloadMarkdownReport(report)}
            onCopyShareLink={handleCopyShareLink}
            onDrillOpening={handleDrillOpening}
            onPunishBlunder={handlePunishBlunder}
            onExportProgress={() => exportProgressJson(userProgress)}
            onImportProgress={handleImportProgress}
            onResetProgress={handleResetProgress}
          />
        )}

        {/* Interactive Training Arena */}
        <TrainingArena
          report={report}
          t={t}
          mode={trainerMode}
          onModeChange={setTrainerMode}
          selectedOpening={selectedOpening}
          onSelectOpening={setSelectedOpening}
          selectedBlunderIndex={selectedBlunderIndex}
          onSelectBlunderIndex={setSelectedBlunderIndex}
          progress={userProgress}
          onBlunderSolved={handleBlunderSolved}
          onBlunderFailed={handleBlunderFailed}
          onOpeningMoveAttempt={handleOpeningMoveAttempt}
          onSparringOutcome={handleSparringOutcome}
        />

        {/* Media.net Ad Slot #1 (Between Training Arena and Editorial SEO) */}
        <MediaNetAdSlot
          slotId="medianet-leaderboard-mid"
          variant="leaderboard"
          adLabel={t.monetization.adLabel}
          slotNote={t.monetization.adLeaderboardNote}
        />

        {/* Contextual Affiliate Chess Resources */}
        <AffiliateResourcesSection t={t} />

        {/* Rich Multilingual Editorial Guide & Interactive FAQ */}
        <EditorialSeoSection t={t} />

        {/* Media.net Ad Slot #2 (Bottom before Footer) */}
        <MediaNetAdSlot
          slotId="medianet-rectangle-bottom"
          variant="rectangle"
          adLabel={t.monetization.adLabel}
          slotNote={t.monetization.adRectangleNote}
        />
      </main>

      {/* Footer with Mandatory Chess.com Public API Legal Notice */}
      <footer className="border-t border-slate-800/80 bg-[#090E14] py-8 px-4 sm:px-6 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-slate-400">
          <div className="space-y-1">
            <p className="font-semibold text-slate-300">{t.footer.legalNotice}</p>
            <p>{t.footer.privacyNote}</p>
          </div>
          <p className="text-slate-500">{t.footer.builtLocally}</p>
        </div>
      </footer>
    </div>
  );
}
