import React, { ReactNode, createContext, useContext, useEffect, useState } from 'react';

import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { getCurrentLanguage, setCachedLanguage } from '@/utils/i18n';
import { type AppLanguage, normalizeLanguage } from '@/utils/language';
import { TRANSLATIONS, type TranslationKey } from '@/utils/translations';

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Get initial language from browser UI language
  const getInitialLanguage = (): AppLanguage => {
    try {
      const browserLang = browser.i18n.getUILanguage();
      return normalizeLanguage(browserLang);
    } catch {
      return 'en';
    }
  };

  const [language, setLanguageState] = useState<AppLanguage>(getInitialLanguage());

  // Load saved language preference on mount
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const current = await getCurrentLanguage();
        setLanguageState(current);
      } catch (error) {
        console.error('Failed to load language preference:', error);
      }
    };
    loadLanguage();
  }, []);

  // Listen for language changes from other tabs/contexts
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: browser.Storage.StorageChange },
      areaName: string,
    ) => {
      const next = changes[StorageKeys.LANGUAGE]?.newValue;
      if ((areaName === 'sync' || areaName === 'local') && typeof next === 'string') {
        setLanguageState(normalizeLanguage(next));
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const setLanguage = async (lang: AppLanguage) => {
    setLanguageState(lang);
    setCachedLanguage(lang);
    try {
      await browser.storage.sync.set({ [StorageKeys.LANGUAGE]: lang });
      return;
    } catch (error) {
      try {
        await browser.storage.local.set({ [StorageKeys.LANGUAGE]: lang });
        return;
      } catch (localError) {
        console.error('Failed to save language preference:', error, localError);
      }
    }
  };

  const t = (key: TranslationKey): string => {
    return TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
