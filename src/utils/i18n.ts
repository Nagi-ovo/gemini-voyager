import browser from 'webextension-polyfill';

import { normalizeLanguage, type AppLanguage } from './language';
import { isTranslationKey, TRANSLATIONS, type TranslationKey } from './translations';

import { StorageKeys } from '@/core/types/common';

/**
 * Get the current language preference
 * 1. First check user's saved preference in storage
 * 2. Fall back to browser UI language
 * 3. Default to English
 */
export async function getCurrentLanguage(): Promise<AppLanguage> {
  try {
    // Try to get user's saved language preference
    const stored = await browser.storage.sync.get(StorageKeys.LANGUAGE);
    const raw = (stored as Record<string, unknown> | null | undefined)?.[StorageKeys.LANGUAGE];
    if (typeof raw === 'string') {
      return normalizeLanguage(raw);
    }
  } catch (error) {
    console.warn('[i18n] Failed to get saved language:', error);
  }

  // Fall back to browser UI language
  try {
    const browserLang = browser.i18n.getUILanguage();
    return normalizeLanguage(browserLang);
  } catch {
    return 'en';
  }
}

/**
 * Get translation for a key using the current language preference
 * This function works in both React and non-React contexts (e.g., content scripts)
 */
export async function getTranslation(key: TranslationKey): Promise<string> {
  const language = await getCurrentLanguage();
  return TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key;
}

/**
 * Get translation synchronously using cached language
 * This is less accurate but faster for scenarios where async is not possible
 */
let cachedLanguage: AppLanguage | null = null;

export function getTranslationSync(key: TranslationKey): string {
  const language = cachedLanguage || 'en';
  return TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key;
}

export function getTranslationSyncUnsafe(key: string): string {
  if (!isTranslationKey(key)) return key;
  return getTranslationSync(key);
}

/**
 * Initialize the i18n system and cache the current language
 * Should be called early in the application lifecycle
 */
export async function initI18n(): Promise<void> {
  cachedLanguage = await getCurrentLanguage();

  // Listen for language changes
  browser.storage.onChanged.addListener((changes, areaName) => {
    const next = changes[StorageKeys.LANGUAGE]?.newValue;
    if (areaName === 'sync' && typeof next === 'string') {
      cachedLanguage = normalizeLanguage(next);
    }
  });
}

/**
 * Create a translator function that uses cached language
 * This is useful for classes that need a simple t() function
 */
export function createTranslator(): (key: string) => string {
  return (key: string) => getTranslationSyncUnsafe(key);
}
