import type {LanguageCode, LanguageMeta} from '../types/chess';

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  {code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', hreflang: 'en'},
  {code: 'es', nativeName: 'Español', englishName: 'Spanish', dir: 'ltr', hreflang: 'es'},
  {code: 'fr', nativeName: 'Français', englishName: 'French', dir: 'ltr', hreflang: 'fr'},
  {code: 'de', nativeName: 'Deutsch', englishName: 'German', dir: 'ltr', hreflang: 'de'},
  {code: 'pt', nativeName: 'Português', englishName: 'Portuguese', dir: 'ltr', hreflang: 'pt'},
  {code: 'ru', nativeName: 'Русский', englishName: 'Russian', dir: 'ltr', hreflang: 'ru'},
  {code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', dir: 'ltr', hreflang: 'hi'},
  {code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl', hreflang: 'ar'},
  {code: 'zh', nativeName: '中文', englishName: 'Chinese', dir: 'ltr', hreflang: 'zh'},
  {code: 'ja', nativeName: '日本語', englishName: 'Japanese', dir: 'ltr', hreflang: 'ja'},
];

export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

export function isLanguageCode(val: string | null | undefined): val is LanguageCode {
  if (!val) return false;
  return LANGUAGE_CODES.includes(val as LanguageCode);
}

export function detectInitialLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'en';
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get('lang')?.toLowerCase();
  if (isLanguageCode(urlLang)) return urlLang;

  const saved = window.localStorage.getItem('chessscout_lang')?.toLowerCase();
  if (isLanguageCode(saved)) return saved;

  const navLang = (navigator.language || 'en').toLowerCase().split('-')[0];
  if (isLanguageCode(navLang)) return navLang;
  return 'en';
}

export function getLanguageMeta(code: LanguageCode): LanguageMeta {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? SUPPORTED_LANGUAGES[0];
}

export interface TranslationBundle {
  seo: {
    title: string;
    titleWithUser: string; // {user}
    description: string;
    descriptionWithUser: string; // {user}
    appCategory: string;
  };
  nav: {
    scouting: string;
    weaknesses: string;
    trainer: string;
    guide: string;
  };
  hero: {
    h1: string;
    subtitle: string;
    inputPlaceholder: string;
    analyzeBtn: string;
    analyzingBtn: string;
    quickExamplesLabel: string;
    localBadge: string;
  };
  progress: {
    profile: string;
    archives: string;
    downloading: string;
    parsing: string;
    stockfish: string;
    complete: string;
  };
  errors: {
    NOT_FOUND: string;
    NO_RECENT_GAMES: string;
    RATE_LIMITED: string;
    NETWORK_ERROR: string;
    EMPTY_USERNAME: string;
  };
  profile: {
    gamesAnalyzed: string;
    followers: string;
    cachedNote: string;
    refreshBtn: string;
    exportMd: string;
    copyLink: string;
    linkCopied: string;
    bullet: string;
    blitz: string;
    rapid: string;
    overallRecord: string;
    wins: string;
    draws: string;
    losses: string;
  };
  weaknesses: {
    sectionTitle: string;
    targetOpeningsTitle: string;
    targetOpeningsDesc: string;
    noWeaknesses: string;
    trainLine: string;
    asWhite: string;
    asBlack: string;
    lossRateLabel: string;
    gamesCount: string;
    phaseTitle: string;
    phaseSubtitle: string;
    openingPhase: string;
    openingRange: string;
    middlegamePhase: string;
    middlegameRange: string;
    endgamePhase: string;
    endgameRange: string;
    primaryLeak: string;
    clockTitle: string;
    avgMoveTime: string;
    secondsShort: string;
    noClockData: string;
    timeoutLosses: string;
    timeTrouble: string;
    styleTitle: string;
    avgLength: string;
    movesShort: string;
    styleAggressive: string;
    stylePositional: string;
    styleBalanced: string;
  };
  repertoire: {
    sectionTitle: string;
    whiteTab: string;
    blackTab: string;
    ecoCol: string;
    openingCol: string;
    gamesCol: string;
    wdlCol: string;
    linesCol: string;
    actionCol: string;
    practiceBtn: string;
    emptyRepertoire: string;
  };
  blunders: {
    sectionTitle: string;
    subtitle: string;
    emptyBlunders: string;
    moveLabel: string;
    playedLabel: string;
    bestLabel: string;
    lossLabel: string;
    punishBtn: string;
  };
  trainer: {
    sectionTitle: string;
    subtitle: string;
    modeOpeningDrill: string;
    modeBlunderPuzzles: string;
    modeSparringBot: string;
    flipBoard: string;
    soundOn: string;
    soundOff: string;
    hintBtn: string;
    resetBtn: string;
    undoBtn: string;
    nextPuzzle: string;
    prevPuzzle: string;
    youPlay: string;
    opponentPlays: string;
    whiteColor: string;
    blackColor: string;
    evalLabel: string;
    engineThinking: string;
    bookMoveBadge: string;
    engineMoveBadge: string;
    moveHistoryTitle: string;
    drillSelectOpening: string;
    drillStatusReady: string;
    drillStatusGood: string;
    drillStatusInaccuracy: string;
    drillStatusOutOfBook: string;
    puzzleCounter: string;
    puzzlePrompt: string;
    puzzleSolved: string;
    puzzleWrong: string;
    puzzleStreak: string;
    sparringStartPos: string;
    sparringDefaultPos: string;
    sparringStatusYourTurn: string;
    sparringStatusGameOver: string;
    checkmate: string;
    stalemate: string;
    draw: string;
    promoteTitle: string;
    noBlundersForPuzzle: string;
    emptyTrainerHint: string;
  };
  monetization: {
    adLabel: string;
    adLeaderboardNote: string;
    adRectangleNote: string;
    resourcesTitle: string;
    resourcesSubtitle: string;
    affiliateDisclosure: string;
    resourceItems: Array<{
      category: string;
      title: string;
      description: string;
      cta: string;
      url: string;
    }>;
  };
  editorial: {
    sectionTitle: string;
    sectionSubtitle: string;
    articles: Array<{
      title: string;
      body: string;
    }>;
    faqTitle: string;
    faqs: Array<{
      question: string;
      answer: string;
    }>;
  };
  progressTracker: {
    recentOpponentsLabel: string;
    title: string;
    puzzlesSolvedLabel: string;
    bestStreakLabel: string;
    drillAccuracyLabel: string;
    sparringRecordLabel: string;
    solvedTag: string;
    exportBackup: string;
    importBackup: string;
    resetProgress: string;
    importSuccess: string;
    importError: string;
  };
  footer: {
    legalNotice: string;
    privacyNote: string;
    builtLocally: string;
  };
}
