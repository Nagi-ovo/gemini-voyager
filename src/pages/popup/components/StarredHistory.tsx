import React, { useCallback, useMemo, useRef, useState } from 'react';

import { Download, ExternalLink, FileUp, Highlighter, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  accountIsolationService,
  detectAccountPlatformFromUrl,
  extractRouteUserIdFromUrl,
} from '@/core/services/AccountIsolationService';
import { type HighlightAccountScope } from '@/core/types/highlight';
import { SavedLibraryItemCard } from '@/features/savedLibrary/SavedLibraryItemCard';
import {
  type SavedLibraryItem,
  buildSavedLibraryItemUrl,
  isSavedLibraryItemConversationUrl,
  savedLibraryItemKey,
} from '@/features/savedLibrary/model';
import { openLibraryPage } from '@/features/savedLibrary/openLibraryPage';
import { savedLibraryEmptyKey } from '@/features/savedLibrary/presentation';
import { useSavedLibrary } from '@/features/savedLibrary/useSavedLibrary';
import { ALL_FILTER } from '@/features/savedLibrary/viewModel';
import { cn } from '@/lib/utils';

interface StarredHistoryProps {
  onClose: () => void;
  sourceTabId?: number;
}

export function shouldOpenStarredMessageInCurrentTab(
  currentUrl: string | undefined,
  item: SavedLibraryItem,
): boolean {
  if (!currentUrl) return false;
  try {
    const target = new URL(item.conversationUrl);
    return (
      new URL(currentUrl).origin === target.origin &&
      isSavedLibraryItemConversationUrl(item, target)
    );
  } catch {
    return false;
  }
}

function downloadTextFile(data: string, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function StarredHistory({ onClose, sourceTabId }: StarredHistoryProps) {
  const { language, t } = useLanguage();
  const [transferring, setTransferring] = useState(false);
  const [transferNotice, setTransferNotice] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const resolveSourceHighlightScope =
    useCallback(async (): Promise<HighlightAccountScope | null> => {
      const tab =
        typeof sourceTabId === 'number'
          ? await chrome.tabs.get(sourceTabId).catch(() => undefined)
          : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const pageUrl = tab?.url ?? '';
      const platform = detectAccountPlatformFromUrl(pageUrl);
      // Sites without their own highlight bucket must not open Gemini's for the same account.
      if (!platform) return null;
      let routeUserId = extractRouteUserIdFromUrl(pageUrl);
      let email: string | null = null;
      if (tab?.id) {
        try {
          const response = (await chrome.tabs.sendMessage(tab.id, {
            type: 'gv.account.getContext',
          })) as
            | { ok?: boolean; context?: { routeUserId?: string | null; email?: string | null } }
            | undefined;
          if (response?.ok && response.context) {
            routeUserId = response.context.routeUserId ?? routeUserId;
            email = response.context.email ?? null;
          }
        } catch {
          // A /u/<index> route remains a usable explicit scope without DOM context.
        }
      }
      if (!routeUserId && !email) throw new Error('Highlight account scope is unavailable');
      const resolved = await accountIsolationService.resolveAccountScope({
        pageUrl,
        routeUserId,
        email,
      });
      return {
        platform,
        accountKey: resolved.accountKey,
        accountId: resolved.accountId,
        routeUserId: resolved.routeUserId,
      };
    }, [sourceTabId]);

  const {
    items: visibleItems,
    allItems: items,
    selection,
    setSelection,
    loading,
    error,
    notice: libraryNotice,
    reload: loadSavedItems,
    remove: deleteItem,
    confirmOpen,
  } = useSavedLibrary({ highlightScope: resolveSourceHighlightScope, confirmRemoval: false });
  const filter = selection.kind;
  const query = selection.query;
  const shownNotice = transferNotice ?? libraryNotice;

  const filterCounts = useMemo(
    () => ({
      all: items.length,
      starred: items.filter((item) => item.kind === 'starred').length,
      highlights: items.filter((item) => item.kind === 'highlight').length,
    }),
    [items],
  );

  const openItem = async (item: SavedLibraryItem) => {
    try {
      if (!(await confirmOpen(item))) return;
      const currentTab =
        typeof sourceTabId === 'number'
          ? await chrome.tabs.get(sourceTabId).catch(() => undefined)
          : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const targetUrl = buildSavedLibraryItemUrl(item);

      if (shouldOpenStarredMessageInCurrentTab(currentTab?.url, item) && currentTab?.id) {
        await chrome.tabs.update(currentTab.id, { url: targetUrl });
        window.close();
        return;
      }
      await chrome.tabs.create({ url: targetUrl });
    } catch (openError) {
      console.error('[SavedLibrary] Blocked invalid saved item URL:', openError);
      setTransferNotice({ text: t('savedLibraryConversationOpenFailed'), error: true });
    }
  };

  const exportHighlights = async (format: 'json' | 'markdown') => {
    setTransferring(true);
    setTransferNotice(null);
    try {
      const scope = await resolveSourceHighlightScope();
      if (!scope) throw new Error('Highlight account scope is unavailable');
      const response = (await chrome.runtime.sendMessage({
        type: 'gv.highlight.export',
        payload: { format, scope },
      })) as { ok?: boolean; data?: string; filename?: string; error?: string } | undefined;
      if (!response?.ok || typeof response.data !== 'string') {
        throw new Error(response?.error || 'Highlight export failed');
      }
      downloadTextFile(
        response.data,
        response.filename || `gemini-voyager-highlights.${format === 'json' ? 'json' : 'md'}`,
        format === 'json' ? 'application/json' : 'text/markdown',
      );
    } catch (exportError) {
      console.error('[SavedLibrary] Failed to export highlights:', exportError);
      setTransferNotice({ text: t('promptExportError'), error: true });
    } finally {
      setTransferring(false);
    }
  };

  const importHighlights = async (file: File) => {
    setTransferring(true);
    setTransferNotice(null);
    try {
      const scope = await resolveSourceHighlightScope();
      if (!scope) throw new Error('Highlight account scope is unavailable');
      const response = (await chrome.runtime.sendMessage({
        type: 'gv.highlight.import',
        payload: { data: await file.text(), scope },
      })) as
        | {
            ok?: boolean;
            stats?: { imported: number; updated: number; duplicates: number };
            error?: string;
          }
        | undefined;
      if (!response?.ok || !response.stats) {
        throw new Error(response?.error || 'Highlight import failed');
      }
      await loadSavedItems();
      setTransferNotice({
        text: t('highlightImportSuccess').replace(
          '{count}',
          String(response.stats.imported + response.stats.updated),
        ),
        error: false,
      });
    } catch (importError) {
      console.error('[SavedLibrary] Failed to import highlights:', importError);
      setTransferNotice({ text: t('promptImportError'), error: true });
    } finally {
      setTransferring(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const emptyText = t(error ? 'pm_starred_load_error' : savedLibraryEmptyKey(filter, query));

  return (
    <div className="bg-background text-foreground flex h-[600px] w-[360px] flex-col">
      <header className="border-border/60 bg-background border-b px-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-[15px] leading-none font-semibold tracking-[-0.01em]">
            {t('starredHistory')}
          </h1>
          <button
            type="button"
            aria-label={t('savedLibraryOpenFull')}
            title={t('savedLibraryOpenFull')}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring ms-auto rounded-md p-1.5 focus-visible:ring-2"
            onClick={() =>
              void openLibraryPage().catch(() =>
                setTransferNotice({ text: t('savedLibraryOpenFailed'), error: true }),
              )
            }
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-all duration-200 hover:rotate-3 focus-visible:ring-2 focus-visible:outline-none active:scale-95"
            aria-label={t('pm_cancel')}
            title={t('pm_cancel')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="bg-muted/55 focus-within:bg-background focus-within:ring-primary/25 mt-2.5 flex items-center gap-2 rounded-xl border border-transparent px-3 transition-all duration-200 focus-within:ring-2">
          <Search className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setSelection({ query: event.target.value })}
            placeholder={t('savedLibrarySearchPlaceholder')}
            aria-label={t('savedLibrarySearchPlaceholder')}
            className="placeholder:text-muted-foreground/80 h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </div>

        <div
          className="border-border/60 mt-1.5 grid grid-cols-3 border-b"
          role="group"
          aria-label={t('savedLibraryTypeFilter')}
        >
          {(
            [
              [ALL_FILTER, t('savedLibraryAll')],
              ['starred', t('savedLibraryStars')],
              ['highlights', t('savedLibraryHighlights')],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={cn(
                'relative flex min-w-0 items-center justify-center gap-1.5 px-1 pt-2 pb-2.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-none',
                filter === value
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground/80',
              )}
              aria-pressed={filter === value}
              onClick={() => setSelection({ kind: value })}
            >
              <span className="truncate">{label}</span>
              {!loading && (
                <span
                  className={cn(
                    'min-w-4 rounded px-1 py-0.5 text-[9px] leading-none font-semibold tabular-nums',
                    filter === value
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground/75',
                  )}
                >
                  {filterCounts[value]}
                </span>
              )}
              {filter === value && (
                <span
                  className="bg-primary absolute right-[28%] bottom-[-1px] left-[28%] h-0.5 rounded-full"
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>

        <div className="flex min-h-10 items-center gap-1 py-1.5" aria-busy={transferring}>
          <span className="text-muted-foreground/75 mr-0.5 text-[10px] font-medium tracking-wide">
            {t('pm_export')}
          </span>
          <button
            type="button"
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-all focus-visible:ring-2 focus-visible:outline-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45"
            disabled={transferring}
            onClick={() => void exportHighlights('json')}
            title={`${t('pm_export')} JSON`}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            JSON
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-all focus-visible:ring-2 focus-visible:outline-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45"
            disabled={transferring}
            onClick={() => void exportHighlights('markdown')}
            title={`${t('pm_export')} Markdown`}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Markdown
          </button>
          <span className="bg-border/80 mx-0.5 h-4 w-px" aria-hidden="true" />
          <button
            type="button"
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring ml-auto inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-all focus-visible:ring-2 focus-visible:outline-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45"
            disabled={transferring}
            onClick={() => importInputRef.current?.click()}
          >
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            {t('pm_import')}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label={t('pm_import')}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importHighlights(file);
            }}
          />
        </div>
        {error && (
          <p className="text-destructive mt-1 pb-2.5 text-xs" role="alert">
            {t('pm_starred_load_error')}
          </p>
        )}
        {shownNotice && (
          <p
            className={cn(
              'mt-1 pb-2.5 text-xs',
              shownNotice.error ? 'text-destructive' : 'text-muted-foreground',
            )}
            role={shownNotice.error ? 'alert' : 'status'}
            aria-live="polite"
          >
            {shownNotice.text}
          </p>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-2.5">
        {loading ? (
          <div className="space-y-2" aria-label={t('loading')} role="status">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="bg-muted h-20 animate-pulse rounded-xl motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <Highlighter className="text-muted-foreground h-8 w-8" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">{emptyText}</p>
            {error && (
              <Button variant="outline" size="sm" onClick={() => void loadSavedItems()}>
                {t('savedLibraryRefresh')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleItems.map((item) => (
              <SavedLibraryItemCard
                key={savedLibraryItemKey(item)}
                item={item}
                t={t}
                language={language}
                onOpen={(saved) => void openItem(saved)}
                onDelete={(saved) => {
                  setTransferNotice(null);
                  void deleteItem(saved);
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
