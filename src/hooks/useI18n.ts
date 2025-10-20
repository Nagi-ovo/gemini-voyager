import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';

const useI18n = () => {
  const [language, setLanguage] = useState(browser.i18n.getUILanguage());

  useEffect(() => {
    const getLanguage = async () => {
      const { language } = await browser.storage.sync.get('language');
      if (language) {
        setLanguage(language);
      }
    };
    getLanguage();
  }, []);

  const setLanguageWrapper = async (lang: string) => {
    await browser.storage.sync.set({ language: lang });
    setLanguage(lang);
  };

  const t = (key: string) => {
    return browser.i18n.getMessage(key);
  };

  return { t, setLanguage: setLanguageWrapper, language };
};

export default useI18n;
