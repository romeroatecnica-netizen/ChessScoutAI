import React, {useState} from 'react';
import {BookOpen, ChevronDown, ExternalLink} from 'lucide-react';
import type {TranslationBundle} from '../i18n';

interface MediaNetAdSlotProps {
  slotId: string;
  variant: 'leaderboard' | 'rectangle';
  adLabel: string;
  slotNote: string;
}

/**
 * Clean, CLS-safe Media.net Ad Container.
 *
 * Production Integration Steps:
 * 1. Add your Media.net contextual ad script tag in index.html <head>:
 *    <script type="text/javascript">
 *      window._mNHandle = window._mNHandle || {};
 *      window._mNHandle.queue = window._mNHandle.queue || [];
 *      medianet_versionId = "YOUR_MEDIANET_VERSION_ID";
 *    </script>
 *    <script src="https://contextual.media.net/dmedianet.js?cid=YOUR_CID" async="async"></script>
 * 2. Replace the placeholder inner div below with your <div id="YOUR_AD_UNIT_ID"></div>
 *    and push window._mNHandle.queue.push(function(){ window._mNDetails.loadTag(...); }).
 */
export const MediaNetAdSlot: React.FC<MediaNetAdSlotProps> = ({
  slotId,
  variant,
  adLabel,
  slotNote,
}) => {
  const heightClass =
    variant === 'leaderboard'
      ? 'min-h-[100px] sm:min-h-[96px]'
      : 'min-h-[250px] max-w-[360px] mx-auto';

  return (
    <aside
      aria-label={adLabel}
      data-medianet-slot={slotId}
      className={`ad-print-hidden w-full ${heightClass} rounded-2xl border border-slate-800/80 bg-[#0E151F] flex flex-col items-center justify-center p-4 text-center`}
    >
      <span className="text-[11px] font-medium text-slate-500 mb-1">{adLabel}</span>
      {/* Replace inner content with live Media.net tag mount node (e.g. id={slotId}) */}
      <div id={slotId} className="text-xs font-mono text-slate-600">
        {slotNote}
      </div>
    </aside>
  );
};

export const AffiliateResourcesSection: React.FC<{t: TranslationBundle}> = ({t}) => {
  return (
    <section className="bg-[#111923] border border-slate-800/90 rounded-2xl p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
            <BookOpen className="w-4 h-4" />
            <span>{t.monetization.resourcesTitle}</span>
          </div>
          <p className="mt-1 text-sm text-slate-300">{t.monetization.resourcesSubtitle}</p>
        </div>
        <p className="text-xs text-slate-500">{t.monetization.affiliateDisclosure}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {t.monetization.resourceItems.map((item) => (
          <a
            key={item.title}
            href={item.url}
            target="_blank"
            rel="sponsored nofollow noopener"
            className="group p-4 rounded-xl bg-slate-900/75 border border-slate-800 hover:border-emerald-500/50 transition-colors flex flex-col justify-between gap-4"
          >
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-amber-400">{item.category}</div>
              <h3 className="text-base font-semibold text-slate-100 group-hover:text-emerald-300 transition-colors">
                {item.title}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <span>{item.cta}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

export const EditorialSeoSection: React.FC<{t: TranslationBundle}> = ({t}) => {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  return (
    <section id="guide" className="scroll-mt-20 space-y-10 pt-4">
      <div className="space-y-2 max-w-3xl">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100">
          {t.editorial.sectionTitle}
        </h2>
        <p className="text-sm sm:text-base text-slate-400">{t.editorial.sectionSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {t.editorial.articles.map((article) => (
          <article
            key={article.title}
            className="p-5 rounded-2xl bg-[#111923] border border-slate-800/90 space-y-2.5"
          >
            <h3 className="text-base font-semibold text-slate-100">{article.title}</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{article.body}</p>
          </article>
        ))}
      </div>

      {/* Interactive FAQ Accordion */}
      <div className="bg-[#111923] border border-slate-800/90 rounded-2xl p-6 space-y-4">
        <h3 className="text-xl font-bold text-slate-100">{t.editorial.faqTitle}</h3>
        <div className="divide-y divide-slate-800/80">
          {t.editorial.faqs.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div key={faq.question} className="py-3 first:pt-1 last:pb-1">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 py-2 text-start text-sm sm:text-base font-semibold text-slate-100 hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  <span>{faq.question}</span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-emerald-400' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="pt-1 pb-2 text-sm text-slate-300 leading-relaxed max-w-3xl">
                    {faq.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
