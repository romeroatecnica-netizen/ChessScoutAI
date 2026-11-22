import type {LanguageCode} from '../types/chess';
import {
  SUPPORTED_LANGUAGES,
  detectInitialLanguage,
  getLanguageMeta,
  isLanguageCode,
  type TranslationBundle,
} from './languages';
import {LOCALES_A} from './localesA';
import {LOCALES_B} from './localesB';

const ALL_TRANSLATIONS: Record<LanguageCode, TranslationBundle> = {
  ...LOCALES_A,
  ...LOCALES_B,
};

export function getTranslation(lang: LanguageCode): TranslationBundle {
  return ALL_TRANSLATIONS[lang] ?? ALL_TRANSLATIONS.en;
}

export {
  SUPPORTED_LANGUAGES,
  detectInitialLanguage,
  getLanguageMeta,
  isLanguageCode,
  type TranslationBundle,
};
