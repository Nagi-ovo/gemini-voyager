import enMessages from '@locales/en/messages.json';
import zhMessages from '@locales/zh/messages.json';
import jaMessages from '@locales/ja/messages.json';
import browser from 'webextension-polyfill';

type Language = 'en' | 'zh' | 'ja';

const normalizeLang = (lang: string | undefined): Language => {
  if (!lang) return 'en';
  const lower = lang.toLowerCase();
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('ja')) return 'ja';
  return 'en';
};

const extract = (raw: any): Record<string, string> => {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach((k) => {
      const v = (raw as any)[k];
      if (v && typeof v.message === 'string') out[k] = v.message;
    });
  }
  return out;
};

const dictionaries: Record<Language, Record<string, string>> = {
  en: extract(enMessages as any),
  zh: extract(zhMessages as any),
  ja: extract(jaMessages as any),
};

/**
 * Get the current language preference
 * 1. First check user's saved preference in storage
 * 2. Fall back to browser UI language
 * 3. Default to English
 */
export async function getCurrentLanguage(): Promise<Language> {
  try {
    // Try to get user's saved language preference
    const stored = await browser.storage.sync.get('language');
    if (stored?.language && typeof stored.language === 'string') {
      return normalizeLang(stored.language);
    }
  } catch (error) {
    console.warn('[i18n] Failed to get saved language:', error);
  }

  // Fall back to browser UI language
  try {
    const browserLang = browser.i18n.getUILanguage();
    return normalizeLang(browserLang);
  } catch {
    return 'en';
  }
}

/**
 * Get translation for a key using the current language preference
 * This function works in both React and non-React contexts (e.g., content scripts)
 */
export async function getTranslation(key: string): Promise<string> {
  const language = await getCurrentLanguage();
  return dictionaries[language][key] ?? dictionaries.en[key] ?? key;
}

/**
 * Get translation synchronously using cached language
 * This is less accurate but faster for scenarios where async is not possible
 */
let cachedLanguage: Language | null = null;

export function getTranslationSync(key: string): string {
  const language = cachedLanguage || 'en';
  return dictionaries[language][key] ?? dictionaries.en[key] ?? key;
}

/**
 * Initialize the i18n system and cache the current language
 * Should be called early in the application lifecycle
 */
export async function initI18n(): Promise<void> {
  cachedLanguage = await getCurrentLanguage();

  // Listen for language changes
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.language?.newValue && typeof changes.language.newValue === 'string') {
      cachedLanguage = normalizeLang(changes.language.newValue);
    }
  });
}

/**
 * Create a translator function that uses cached language
 * This is useful for classes that need a simple t() function
 */
export function createTranslator(): (key: string) => string {
  return (key: string) => getTranslationSync(key);
}
