import React from 'react';

import { Globe } from 'lucide-react';

import { useLanguage } from '../contexts/LanguageContext';
import { APP_LANGUAGE_LABELS, getNextLanguage } from '../utils/language';
import { Button } from './ui/button';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const nextLanguage = getNextLanguage(language);

  const toggleLanguage = () => {
    setLanguage(nextLanguage);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleLanguage}
      title={`Switch to ${APP_LANGUAGE_LABELS[nextLanguage]}`}
      className="h-9 w-9"
    >
      <Globe className="h-4 w-4" />
      <span className="sr-only">Toggle language</span>
    </Button>
  );
};
