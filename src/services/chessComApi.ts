import type {
  ChessComProfile,
  ChessComRawGame,
  ChessComStats,
  ScoutErrorCode,
  ScoutReport,
} from '../types/chess';

const CACHE_PREFIX = 'chessscout_report_v1_';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class ScoutApiError extends Error {
  code: ScoutErrorCode;
  constructor(code: ScoutErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'ScoutApiError';
  }
}

export function getCachedReport(username: string): ScoutReport | null {
  if (typeof window === 'undefined') return null;
  const key = CACHE_PREFIX + username.trim().toLowerCase();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScoutReport;
    if (!parsed || !parsed.fetchedAt) return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedReport(report: ScoutReport): void {
  if (typeof window === 'undefined') return;
  const key = CACHE_PREFIX + report.username.trim().toLowerCase();
  try {
    window.localStorage.setItem(key, JSON.stringify(report));
  } catch {
    // Ignore quota errors gracefully
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });
  } catch {
    throw new ScoutApiError('NETWORK_ERROR');
  }

  if (response.status === 404) {
    throw new ScoutApiError('NOT_FOUND');
  }
  if (response.status === 429) {
    throw new ScoutApiError('RATE_LIMITED');
  }
  if (!response.ok) {
    throw new ScoutApiError('NETWORK_ERROR', `HTTP ${response.status}`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ScoutApiError('NETWORK_ERROR');
  }
}

interface RawPlayerResponse {
  username: string;
  name?: string;
  title?: string;
  avatar?: string;
  country?: string;
  followers?: number;
  joined?: number;
  url: string;
  status?: string;
}

interface RawStatsResponse {
  chess_bullet?: {
    last?: {rating?: number};
    best?: {rating?: number};
    record?: {win?: number; draw?: number; loss?: number};
  };
  chess_blitz?: {
    last?: {rating?: number};
    best?: {rating?: number};
    record?: {win?: number; draw?: number; loss?: number};
  };
  chess_rapid?: {
    last?: {rating?: number};
    best?: {rating?: number};
    record?: {win?: number; draw?: number; loss?: number};
  };
}

function mapRatingBucket(
  bucket?: RawStatsResponse['chess_blitz']
): ChessComStats['blitz'] | undefined {
  if (!bucket?.last?.rating) return undefined;
  return {
    rating: bucket.last.rating,
    best: bucket.best?.rating,
    win: bucket.record?.win ?? 0,
    draw: bucket.record?.draw ?? 0,
    loss: bucket.record?.loss ?? 0,
  };
}

export async function fetchPlayerProfileAndStats(username: string): Promise<{
  profile: ChessComProfile;
  stats: ChessComStats;
}> {
  const cleanUser = encodeURIComponent(username.trim().toLowerCase());
  const [rawProfile, rawStats] = await Promise.all([
    fetchJson<RawPlayerResponse>(`https://api.chess.com/pub/player/${cleanUser}`),
    fetchJson<RawStatsResponse>(`https://api.chess.com/pub/player/${cleanUser}/stats`).catch(
      () => ({} as RawStatsResponse)
    ),
  ]);

  let countryCode: string | undefined;
  if (rawProfile.country) {
    const parts = rawProfile.country.split('/');
    countryCode = parts[parts.length - 1];
  }

  const profile: ChessComProfile = {
    username: rawProfile.username,
    name: rawProfile.name,
    title: rawProfile.title,
    avatar: rawProfile.avatar,
    country: rawProfile.country,
    countryCode,
    followers: rawProfile.followers,
    joined: rawProfile.joined,
    url: rawProfile.url,
    status: rawProfile.status,
  };

  const stats: ChessComStats = {
    bullet: mapRatingBucket(rawStats.chess_bullet),
    blitz: mapRatingBucket(rawStats.chess_blitz),
    rapid: mapRatingBucket(rawStats.chess_rapid),
  };

  return {profile, stats};
}

export async function fetchRecentStandardGames(
  username: string,
  onArchiveProgress?: (loadedCount: number, totalArchives: number) => void
): Promise<ChessComRawGame[]> {
  const cleanUser = encodeURIComponent(username.trim().toLowerCase());
  const archivesData = await fetchJson<{archives?: string[]}>(
    `https://api.chess.com/pub/player/${cleanUser}/games/archives`
  );

  const archives = archivesData.archives ?? [];
  if (archives.length === 0) {
    throw new ScoutApiError('NO_RECENT_GAMES');
  }

  // Last 2 monthly archives
  const targetArchives = archives.slice(-2).reverse();
  const collected: ChessComRawGame[] = [];

  for (let i = 0; i < targetArchives.length; i++) {
    const archiveUrl = targetArchives[i];
    const archiveJson = await fetchJson<{games?: ChessComRawGame[]}>(archiveUrl);
    const standardGames = (archiveJson.games ?? []).filter(
      (g) => g.rules === 'chess' && typeof g.pgn === 'string' && g.pgn.trim().length > 0
    );
    collected.push(...standardGames);
    onArchiveProgress?.(i + 1, targetArchives.length);
  }

  if (collected.length === 0) {
    throw new ScoutApiError('NO_RECENT_GAMES');
  }

  // Sort newest first and cap to latest 60 standard games
  collected.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
  return collected.slice(0, 60);
}
