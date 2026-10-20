import React, { type CSSProperties, useEffect, useState } from 'react';

import { Pin, X } from 'lucide-react';
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { useToolbarPinState } from '@/features/onboarding/useToolbarPinState';

import { Card } from '../../../components/ui/card';
import { useLanguage } from '../../../contexts/LanguageContext';

/**
 * Reminder for users who open the popup from the extensions menu: the toolbar
 * pin state is read live, so the card disappears on its own once pinned.
 */
export function ToolbarPinHint({ style }: { style?: CSSProperties }) {
  const { t } = useLanguage();
  const pin = useToolbarPinState();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    browser.storage.local
      .get({ [StorageKeys.TOOLBAR_PIN_HINT_DISMISSED]: false })
      .then((stored) => {
        if (!cancelled) setDismissed(stored[StorageKeys.TOOLBAR_PIN_HINT_DISMISSED] === true);
      })
      .catch(() => {
        if (!cancelled) setDismissed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (pin.browser === 'unsupported' || !pin.ready || pin.pinned !== false || dismissed !== false) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    void browser.storage.local
      .set({ [StorageKeys.TOOLBAR_PIN_HINT_DISMISSED]: true })
      .catch(() => {});
  };

  return (
    <Card style={style} className="p-3" role="status">
      <div className="flex items-center gap-3">
        <Pin className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="flex-1 text-sm leading-snug">{t('popupPinHint')}</p>
        <button
          type="button"
          onClick={dismiss}
          className="text-muted-foreground hover:bg-secondary hover:text-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors"
          aria-label={t('popupPinHintDismiss')}
          title={t('popupPinHintDismiss')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </Card>
  );
}
