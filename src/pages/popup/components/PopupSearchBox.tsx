import React from 'react';

import { Search, X } from 'lucide-react';

import type { TranslationKey } from '@/utils/translations';

export interface PopupSearchBoxProps {
  query: string;
  onChange: (query: string) => void;
  dir?: 'rtl';
  t: (key: TranslationKey) => string;
}

export function PopupSearchBox({ query, onChange, dir, t }: PopupSearchBoxProps) {
  return (
    <div className="relative" dir={dir}>
      <Search
        className="text-muted-foreground pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2"
        aria-hidden="true"
      />
      <input
        type="search"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('popupSettingsSearchExamples')}
        aria-label={t('popupSettingsSearchPlaceholder')}
        className={`bg-card border-border focus:ring-primary/40 placeholder:text-muted-foreground h-11 w-full rounded-xl border ps-10 text-sm shadow-sm transition-all outline-none focus:ring-2 [&::-webkit-search-cancel-button]:hidden ${query ? 'pe-10' : 'pe-3'}`}
      />
      {query && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-muted-foreground hover:text-foreground absolute end-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
          aria-label={t('popupSettingsSearchClear')}
          title={t('popupSettingsSearchClear')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
