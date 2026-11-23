import type {LanguageCode} from '../types/chess';

/**
 * Single source of truth for the official production canonical domain.
 * Never derive canonical, hreflang, og:url, or JSON-LD URLs from
 * window.location.origin, localhost, or temporary *.pages.dev preview hosts.
 */
export const CANONICAL_ORIGIN = 'https://chesscoutai.bastelar.com';
export const DEFAULT_SEO_LANGUAGE: LanguageCode = 'en';

export function buildCanonicalUrl(lang: LanguageCode = DEFAULT_SEO_LANGUAGE): string {
  return lang === DEFAULT_SEO_LANGUAGE
    ? `${CANONICAL_ORIGIN}/`
    : `${CANONICAL_ORIGIN}/?lang=${lang}`;
}

export function buildShareUrl(username: string, lang: LanguageCode): string {
  const url = new URL(`${CANONICAL_ORIGIN}/`);
  url.searchParams.set('user', username.trim());
  if (lang !== DEFAULT_SEO_LANGUAGE) {
    url.searchParams.set('lang', lang);
  }
  return url.toString();
}
