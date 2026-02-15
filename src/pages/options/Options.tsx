import React from 'react';

import '@pages/options/Options.css';

import { LanguageProvider, useLanguage } from '../../contexts/LanguageContext';

function OptionsContent() {
  const { t } = useLanguage();

  return (
    <div className="bg-background text-foreground mx-auto min-h-screen max-w-4xl p-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">{t('extName')}</h1>
        <p className="text-muted-foreground">{t('optionsPageSubtitle')}</p>
      </div>

      <div className="border-border bg-card rounded-lg border p-6">
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
