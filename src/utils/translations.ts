import arMessages from '@locales/ar/messages.json';
import enMessages from '@locales/en/messages.json';
import esMessages from '@locales/es/messages.json';
import frMessages from '@locales/fr/messages.json';
import jaMessages from '@locales/ja/messages.json';
import koMessages from '@locales/ko/messages.json';
import ptMessages from '@locales/pt/messages.json';
import ruMessages from '@locales/ru/messages.json';
import zhMessages from '@locales/zh/messages.json';
import zhTWMessages from '@locales/zh_TW/messages.json';

import type { AppLanguage } from './language';

type RawLocaleMessages = typeof enMessages;

// Compile-time guarantee: every supported language must provide at least the same keys as English.
const rawMessagesByLanguage = {
  en: enMessages,
  zh: zhMessages,
  zh_TW: zhTWMessages,
  ja: jaMessages,
  fr: frMessages,
  es: esMessages,
  pt: ptMessages,
  ar: arMessages,
  ru: ruMessages,
  ko: koMessages,
} satisfies Record<AppLanguage, RawLocaleMessages>;

export type TranslationKey = keyof RawLocaleMessages;
export type Translation = Record<TranslationKey, string>;

function extractTranslations<M extends Record<string, { message: string }>>(
  raw: M,
): Record<keyof M, string> {
  const out = {} as Record<keyof M, string>;
  for (const key of Object.keys(raw) as Array<keyof M>) {
    out[key] = raw[key].message;
  }
  return out;
}

export const TRANSLATIONS: Record<AppLanguage, Translation> = {
  en: extractTranslations(rawMessagesByLanguage.en),
  zh: extractTranslations(rawMessagesByLanguage.zh),
  zh_TW: extractTranslations(rawMessagesByLanguage.zh_TW),
  ja: extractTranslations(rawMessagesByLanguage.ja),
  fr: extractTranslations(rawMessagesByLanguage.fr),
  es: extractTranslations(rawMessagesByLanguage.es),
  pt: extractTranslations(rawMessagesByLanguage.pt),
  ar: extractTranslations(rawMessagesByLanguage.ar),
  ru: extractTranslations(rawMessagesByLanguage.ru),
  ko: extractTranslations(rawMessagesByLanguage.ko),
};

export function isTranslationKey(value: string): value is TranslationKey {
  return value in rawMessagesByLanguage.en;
}
