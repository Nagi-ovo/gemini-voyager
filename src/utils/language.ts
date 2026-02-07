export const APP_LANGUAGES = [
  'en',
  'zh',
  'zh_TW',
  'ja',
  'fr',
  'es',
  'pt',
  'ar',
  'ru',
  'ko',
] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const APP_LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  zh: '简体中文',
  zh_TW: '繁體中文',
  ja: '日本語',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
  ar: 'العربية',
  ru: 'Русский',
  ko: '한국어',
};

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (APP_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeLanguage(lang: string | undefined | null): AppLanguage {
  if (!lang) return 'en';
  const lower = lang.toLowerCase();
  // Check for Traditional Chinese first (zh-TW, zh-HK, zh-Hant)
  if (
    lower.startsWith('zh-tw') ||
    lower.startsWith('zh_tw') ||
    lower.startsWith('zh-hk') ||
    lower.includes('hant')
  )
    return 'zh_TW';
  // Then check for Simplified Chinese
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('fr')) return 'fr';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('pt')) return 'pt';
  if (lower.startsWith('ar')) return 'ar';
  if (lower.startsWith('ru')) return 'ru';
  if (lower.startsWith('ko')) return 'ko';
  return 'en';
}

export function getNextLanguage(current: AppLanguage): AppLanguage {
  const idx = APP_LANGUAGES.indexOf(current);
  if (idx < 0) return 'en';
  return APP_LANGUAGES[(idx + 1) % APP_LANGUAGES.length];
}
