import enMessages from '@locales/en/messages.json';
import zhMessages from '@locales/zh/messages.json';
import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';

const useI18n = () => {
  const normalizeLang = (lang: string | undefined) =>
    (lang && lang.toLowerCase().startsWith('zh')) ? 'zh' : 'en';

  const initialUiLang = (() => {
    try {
      return browser.i18n.getUILanguage();
    } catch {
      return 'en';
    }
  })();

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

  const dictionaries: Record<string, Record<string, string>> = {
    en: extract(enMessages as any),
    zh: extract(zhMessages as any),
  };

  const [language, setLanguage] = useState<string>(normalizeLang(initialUiLang));
  const [dict, setDict] = useState<Record<string, string>>(dictionaries[normalizeLang(initialUiLang)] || dictionaries.en);

  useEffect(() => {
    const getLanguage = async () => {
      const stored = await browser.storage.sync.get('language');
      const lang = typeof stored?.language === 'string' ? stored.language : undefined;
      if (lang) {
        setLanguage(normalizeLang(lang));
      }
    };
    getLanguage();
  }, []);

  useEffect(() => {
    setDict(dictionaries[language] || dictionaries.en);
  }, [language]);

  const setLanguageWrapper = async (lang: string) => {
    const norm = normalizeLang(lang);
    await browser.storage.sync.set({ language: norm });
    setLanguage(norm);
  };

  const t = (key: string) => {
    return dict[key] ?? dictionaries.en[key] ?? key;
  };

  return { t, setLanguage: setLanguageWrapper, language };
};

export default useI18n;
