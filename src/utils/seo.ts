import {
  CANONICAL_ORIGIN,
  DEFAULT_SEO_LANGUAGE,
  buildCanonicalUrl,
} from '../config/seo';
import {getLanguageMeta, getTranslation, SUPPORTED_LANGUAGES} from '../i18n';
import type {LanguageCode} from '../types/chess';

function setMetaContent(selector: string, content: string): void {
  const el = document.querySelector<HTMLMetaElement>(selector);
  if (el) {
    el.setAttribute('content', content);
  }
}

export function updateDocumentSeo(lang: LanguageCode, analyzedUsername?: string | null): void {
  if (typeof document === 'undefined') return;

  const meta = getLanguageMeta(lang);
  const t = getTranslation(lang);

  // 1. Update <html lang="..." dir="...">
  document.documentElement.lang = meta.code;
  document.documentElement.dir = meta.dir;

  // 2. Title & description (localized, optionally personalized to analyzed player)
  const cleanUser = analyzedUsername?.trim();
  const title = cleanUser
    ? t.seo.titleWithUser.replace('{user}', cleanUser)
    : t.seo.title;
  const description = cleanUser
    ? t.seo.descriptionWithUser.replace('{user}', cleanUser)
    : t.seo.description;

  document.title = title;
  setMetaContent('meta[name="description"]', description);
  setMetaContent('meta[property="og:title"]', title);
  setMetaContent('meta[property="og:description"]', description);
  setMetaContent('meta[name="twitter:title"]', title);
  setMetaContent('meta[name="twitter:description"]', description);

  // 3. Canonical, og:url & hreflang strictly derived from CANONICAL_ORIGIN
  const canonicalHref = buildCanonicalUrl(lang);
  setMetaContent('meta[property="og:url"]', canonicalHref);

  const canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonicalLink) {
    canonicalLink.href = canonicalHref;
  }

  for (const item of SUPPORTED_LANGUAGES) {
    const link = document.querySelector<HTMLLinkElement>(
      `link[rel="alternate"][hreflang="${item.hreflang}"]`
    );
    if (link) {
      link.href = buildCanonicalUrl(item.code);
    }
  }
  const xDefault = document.querySelector<HTMLLinkElement>(
    'link[rel="alternate"][hreflang="x-default"]'
  );
  if (xDefault) {
    xDefault.href = buildCanonicalUrl(DEFAULT_SEO_LANGUAGE);
  }

  // 4. Dynamic JSON-LD (SoftwareApplication + FAQPage) in active language
  const jsonLdPayload = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'ChessScout AI',
        alternateName: t.hero.h1,
        applicationCategory: t.seo.appCategory,
        operatingSystem: 'Web Browser',
        inLanguage: meta.code,
        description,
        url: canonicalHref,
        mainEntityOfPage: `${CANONICAL_ORIGIN}/`,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        featureList: [
          t.trainer.modeOpeningDrill,
          t.trainer.modeBlunderPuzzles,
          t.trainer.modeSparringBot,
          t.weaknesses.sectionTitle,
        ],
      },
      {
        '@type': 'FAQPage',
        inLanguage: meta.code,
        url: canonicalHref,
        mainEntity: t.editorial.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      },
    ],
  };

  let scriptEl = document.getElementById('chessscout-jsonld') as HTMLScriptElement | null;
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.id = 'chessscout-jsonld';
    scriptEl.type = 'application/ld+json';
    document.head.appendChild(scriptEl);
  }
  scriptEl.textContent = JSON.stringify(jsonLdPayload);
}
