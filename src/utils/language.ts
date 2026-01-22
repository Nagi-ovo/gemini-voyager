export const APP_LANGUAGES = ['en', 'zh', 'ja', 'fr'] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const APP_LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  zh: '中文',
  ja: '日本語',
  fr: 'Français',
};

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (APP_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeLanguage(lang: string | undefined | null): AppLanguage {
  if (!lang) return 'en';
  const lower = lang.toLowerCase();
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('fr')) return 'fr';
  return 'en';
}

export function getNextLanguage(current: AppLanguage): AppLanguage {
  const idx = APP_LANGUAGES.indexOf(current);
  if (idx < 0) return 'en';
  return APP_LANGUAGES[(idx + 1) % APP_LANGUAGES.length];
}
