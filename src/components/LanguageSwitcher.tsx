import { Globe } from 'lucide-react';
import React from 'react';

import { useLanguage } from '../contexts/LanguageContext';

import { Button } from './ui/button';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    if (language === 'en') {
      setLanguage('zh');
    } else if (language === 'zh') {
      setLanguage('ja');
    } else {
      setLanguage('en');
    }
  };

  const getNextLangLabel = () => {
    if (language === 'en') return '中文';
    if (language === 'zh') return '日本語';
    return 'English';
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleLanguage}
      title={`Switch to ${getNextLangLabel()}`}
      className="h-9 w-9"
    >
      <Globe className="h-4 w-4" />
      <span className="sr-only">Toggle language</span>
    </Button>
  );
};
