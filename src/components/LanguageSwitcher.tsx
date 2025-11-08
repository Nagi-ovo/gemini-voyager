import { Globe } from 'lucide-react';
import React from 'react';

import { useLanguage } from '../contexts/LanguageContext';

import { Button } from './ui/button';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'zh' : 'en');
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleLanguage}
      title={language === 'en' ? 'Switch to 中文' : 'Switch to English'}
      className="h-9 w-9"
    >
      <Globe className="h-4 w-4" />
      <span className="sr-only">Toggle language</span>
    </Button>
  );
};
