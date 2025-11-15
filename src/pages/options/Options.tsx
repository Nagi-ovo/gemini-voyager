import React from 'react';

import { LanguageProvider, useLanguage } from '../../contexts/LanguageContext';
import '@pages/options/Options.css';

function OptionsContent() {
  const { t } = useLanguage();

  return (
    <div className="max-w-4xl mx-auto p-8 bg-background text-foreground min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('extName')}</h1>
        <p className="text-muted-foreground">Extension Options</p>
      </div>

      <div className="p-6 rounded-lg border border-border bg-card">
        <h2 className="text-xl font-semibold mb-4">💾 {t('backupOptions')}</h2>
        <div className="space-y-4 text-sm">
          <p>
            <strong className="text-primary">✓ {t('pm_backup')}</strong> {t('pm_backup_hint_options')}
          </p>
          <ol className="list-decimal list-inside space-y-2 ml-4">
            <li>{t('pm_backup_step1')}</li>
            <li>{t('pm_backup_step2')}</li>
            <li>{t('pm_backup_step3')}</li>
          </ol>
          <p className="mt-4 p-3 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            💡 {t('pm_backup_note')}
          </p>
        </div>
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
