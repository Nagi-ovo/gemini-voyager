import { useEffect, useRef, useState } from 'react';

import { BookOpen, RefreshCw, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { GV_RTL_CLASS, isRTLLanguage } from '@/core/utils/rtl';
import { SavedLibraryItemCard } from '@/features/savedLibrary/SavedLibraryItemCard';
import {
  type SavedLibraryItem,
  buildSavedLibraryItemUrl,
  savedLibraryItemKey,
} from '@/features/savedLibrary/model';
import {
  formatSavedLibraryAccount,
  savedLibraryEmptyKey,
} from '@/features/savedLibrary/presentation';
import { useSavedLibrary } from '@/features/savedLibrary/useSavedLibrary';
import { ALL_FILTER, UNKNOWN_SITE } from '@/features/savedLibrary/viewModel';
import { cn } from '@/lib/utils';

/** The tab follows system appearance without changing the popup's saved preference. */
function useLibraryAppearance(language: string, title: string): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.classList.toggle('dark', media.matches);
      document.documentElement.dataset.gvScheme = media.matches ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    document.title = title;
    document.documentElement.lang = language.replace('_', '-');
    const rtl = isRTLLanguage(language);
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.body.classList.toggle(GV_RTL_CLASS, rtl);
  }, [language, title]);
}

export function Library() {
  const { t, language } = useLanguage();
  const library = useSavedLibrary({ highlightScope: ALL_FILTER });
  const [openError, setOpenError] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ id?: string } | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  useLibraryAppearance(language, t('starredHistory'));

  useEffect(() => {
    if (!focusTarget) return;
    const next = focusTarget.id
      ? mainRef.current?.querySelector<HTMLElement>(
          `[data-library-item-id="${CSS.escape(focusTarget.id)}"] [data-library-open]`,
        )
      : null;
    const heading =
      mainRef.current?.querySelector<HTMLElement>('h2') ??
      mainRef.current?.querySelector<HTMLElement>('h1');
    (next ?? heading)?.focus();
    setFocusTarget(null);
  }, [focusTarget, library.groups]);

  const openItem = async (item: SavedLibraryItem) => {
    setOpenError(false);
    try {
      if (!(await library.confirmOpen(item))) return;
      await chrome.tabs.create({ url: buildSavedLibraryItemUrl(item) });
    } catch {
      setOpenError(true);
    }
  };

  const deleteItem = async (item: SavedLibraryItem) => {
    const position = library.items.findIndex(
      (candidate) => savedLibraryItemKey(candidate) === savedLibraryItemKey(item),
    );
    const neighbor = library.items[position + 1] ?? library.items[position - 1];
    if (await library.remove(item))
      setFocusTarget({ id: neighbor ? savedLibraryItemKey(neighbor) : undefined });
  };

  const emptyText = t(savedLibraryEmptyKey(library.selection.kind, library.selection.query));

  return (
    <main ref={mainRef} className="gv-library min-h-screen">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BookOpen className="text-primary h-7 w-7" aria-hidden="true" />
          <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight">
            {t('starredHistory')}
          </h1>
        </div>
        <Button variant="outline" disabled={library.loading} onClick={() => void library.reload()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('savedLibraryRefresh')}
        </Button>
      </header>

      <div className="gv-library-layout">
        <aside className="gv-library-filters space-y-6" aria-label={t('savedLibraryFilters')}>
          <div>
            <label htmlFor="library-search" className="mb-2 block text-sm font-medium">
              {t('savedLibrarySearchPlaceholder')}
            </label>
            <div className="bg-card border-input flex items-center gap-2 rounded-lg border px-3">
              <Search className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
              <input
                id="library-search"
                type="search"
                name="library-search"
                value={library.selection.query}
                onChange={(event) => library.setSelection({ query: event.target.value })}
                className="min-w-0 flex-1 bg-transparent text-sm"
              />
            </div>
          </div>

          <div
            role="group"
            aria-label={t('savedLibraryTypeFilter')}
            className="flex flex-wrap gap-2"
          >
            {(
              [
                [ALL_FILTER, t('savedLibraryAll')],
                ['starred', t('savedLibraryStars')],
                ['highlights', t('savedLibraryHighlights')],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                aria-pressed={library.selection.kind === kind}
                onClick={() => library.setSelection({ kind })}
                className={cn(
                  'min-h-11 rounded-lg border px-3 text-sm font-medium',
                  library.selection.kind === kind
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'bg-card text-muted-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="library-site" className="mb-2 block text-sm font-medium">
              {t('savedLibrarySite')}
            </label>
            <select
              id="library-site"
              value={library.selection.site}
              onChange={(event) => library.setSelection({ site: event.target.value })}
              className="bg-card border-input w-full rounded-lg border px-3 text-sm"
            >
              <option value={ALL_FILTER}>{t('savedLibraryAllSites')}</option>
              {library.sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.id === UNKNOWN_SITE ? t('savedLibraryUnknownSite') : site.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="library-account" className="mb-2 block text-sm font-medium">
              {t('savedLibraryAccount')}
            </label>
            <select
              id="library-account"
              value={library.selection.account}
              onChange={(event) => library.setSelection({ account: event.target.value })}
              className="bg-card border-input w-full rounded-lg border px-3 text-sm"
            >
              <option value={ALL_FILTER}>{t('savedLibraryAllAccounts')}</option>
              {library.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {formatSavedLibraryAccount(t, account.number)}
                </option>
              ))}
            </select>
          </div>
        </aside>

        <div className="min-w-0 space-y-8" aria-busy={library.loading}>
          {library.error && (
            <p role="alert" className="text-destructive text-sm">
              {t('pm_starred_load_error')}
            </p>
          )}
          {(openError || library.notice) && (
            <p
              role={openError || library.notice?.error ? 'alert' : 'status'}
              className={cn(
                'text-sm',
                openError || library.notice?.error ? 'text-destructive' : '',
              )}
            >
              {openError ? t('savedLibraryConversationOpenFailed') : library.notice?.text}
            </p>
          )}
          {library.loading && library.items.length === 0 ? (
            <p role="status" className="text-muted-foreground py-8 text-sm">
              {t('loading')}
            </p>
          ) : library.items.length === 0 ? (
            <p role="status" className="text-muted-foreground py-8 text-sm">
              {emptyText}
            </p>
          ) : (
            library.groups.map((group, index) => (
              <section key={group.id} aria-labelledby={`library-group-${index}`}>
                <div className="mb-3">
                  <h2
                    id={`library-group-${index}`}
                    tabIndex={-1}
                    className="text-lg font-semibold break-words"
                  >
                    {group.title || t('pm_starred_untitled')}
                  </h2>
                  <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span>{group.siteLabel || t('savedLibraryUnknownSite')}</span>
                    {group.accountNumber !== undefined && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{formatSavedLibraryAccount(t, group.accountNumber)}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <SavedLibraryItemCard
                      key={savedLibraryItemKey(item)}
                      item={item}
                      onOpen={(selected) => void openItem(selected)}
                      onDelete={(selected) => void deleteItem(selected)}
                      t={t}
                      language={language}
                      expanded
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
