import enMessages from '@locales/en/messages.json';
import zhMessages from '@locales/zh/messages.json';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import browser from 'webextension-polyfill';

type Language = 'en' | 'zh';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const normalizeLang = (lang: string | undefined): Language => {
  return (lang && lang.toLowerCase().startsWith('zh')) ? 'zh' : 'en';
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
};

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Get initial language from browser UI language
  const getInitialLanguage = (): Language => {
    try {
      const browserLang = browser.i18n.getUILanguage();
      return normalizeLang(browserLang);
    } catch {
      return 'en';
    }
  };

  const [language, setLanguageState] = useState<Language>(getInitialLanguage());

  // Load saved language preference on mount
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const stored = await browser.storage.sync.get('language');
        if (stored?.language && typeof stored.language === 'string') {
          setLanguageState(normalizeLang(stored.language));
        }
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
      areaName: string
    ) => {
      if (areaName === 'sync' && changes.language?.newValue && typeof changes.language.newValue === 'string') {
        setLanguageState(normalizeLang(changes.language.newValue));
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const setLanguage = async (lang: Language) => {
    try {
      await browser.storage.sync.set({ language: lang });
      setLanguageState(lang);
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }
  };

  const t = (key: string): string => {
    return dictionaries[language][key] ?? dictionaries.en[key] ?? key;
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
