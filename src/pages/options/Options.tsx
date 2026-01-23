import React from 'react';

import { LanguageProvider, useLanguage } from '../../contexts/LanguageContext';
import '@pages/options/Options.css';

function OptionsContent() {
  const { t } = useLanguage();

  return (
    <div className="max-w-4xl mx-auto p-8 bg-background text-foreground min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('extName')}</h1>
        <p className="text-muted-foreground">{t('optionsPageSubtitle')}</p>
      </div>

      <div className="p-6 rounded-lg border border-border bg-card">
        <p className="text-muted-foreground">{t('optionsComingSoon')}</p>
      </div>
    </div>
  );
}

export default function Options() {
  return (
    <LanguageProvider>
      <OptionsContent />
    </LanguageProvider>
  );
}
