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
type MessageFile = Record<string, { message: string }>;

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

/**
 * A primitive's own strings live in `features/plugins/verbs/<name>/messages/<lang>.json`.
 * Its folder types their keys by merging its English fragment into this interface:
 *
 *   import type messages from './messages/en.json';
 *   declare module '@/utils/translations' {
 *     interface PrimitiveMessages { tableCopy: typeof messages }
 *   }
 */
export interface PrimitiveMessages {}

type PrimitiveMessageKey = {
  [Name in keyof PrimitiveMessages]: keyof PrimitiveMessages[Name] & string;
}[keyof PrimitiveMessages];

export type TranslationKey = keyof RawLocaleMessages | PrimitiveMessageKey;
export type Translation = Record<TranslationKey, string>;

// Vite-only, like the catalog's site discovery: adding a primitive's strings is adding its files.
const primitiveMessageFiles = import.meta.glob<MessageFile>(
  '../features/plugins/verbs/*/messages/*.json',
  { eager: true, import: 'default' },
);

const PRIMITIVE_MESSAGE_LANGUAGE = /\/messages\/([^/]+)\.json$/;

function extractTranslations(raw: MessageFile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(raw)) {
    out[key] = raw[key].message;
  }
  return out;
}

function buildTranslations(language: AppLanguage): Translation {
  const merged = extractTranslations(rawMessagesByLanguage[language]);
  for (const [path, messages] of Object.entries(primitiveMessageFiles)) {
    if (PRIMITIVE_MESSAGE_LANGUAGE.exec(path)?.[1] === language) {
      Object.assign(merged, extractTranslations(messages));
    }
  }
  // `bun run i18n:check` guarantees each fragment has every locale with exactly its en keys.
  return merged as Translation;
}

export const TRANSLATIONS: Record<AppLanguage, Translation> = {
  en: buildTranslations('en'),
  zh: buildTranslations('zh'),
  zh_TW: buildTranslations('zh_TW'),
  ja: buildTranslations('ja'),
  fr: buildTranslations('fr'),
  es: buildTranslations('es'),
  pt: buildTranslations('pt'),
  ar: buildTranslations('ar'),
  ru: buildTranslations('ru'),
  ko: buildTranslations('ko'),
};

export function isTranslationKey(value: string): value is TranslationKey {
  return value in TRANSLATIONS.en;
}
