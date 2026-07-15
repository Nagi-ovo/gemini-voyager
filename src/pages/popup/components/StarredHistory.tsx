import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Download, FileUp, Highlighter, Search, Star, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  accountIsolationService,
  detectAccountPlatformFromUrl,
  extractRouteUserIdFromUrl,
} from '@/core/services/AccountIsolationService';
import {
  type HighlightAccountScope,
  type HighlightRecordV1,
  getHighlightColorHex,
} from '@/core/types/highlight';
import {
  type SavedLibraryFilter,
  type SavedLibraryItem,
  buildSavedLibraryItemUrl,
  filterSavedLibraryItems,
  toSavedLibraryItems,
} from '@/features/savedLibrary/model';
import { cn } from '@/lib/utils';
import { StarredMessagesService } from '@/pages/content/timeline/StarredMessagesService';

interface StarredHistoryProps {
  onClose: () => void;
  sourceTabId?: number;
}

export function shouldOpenStarredMessageInCurrentTab(
  currentUrl: string | undefined,
  targetUrl: string,
): boolean {
  if (!currentUrl) return false;
  try {
    const currentHost = new URL(currentUrl).hostname;
    const targetHost = new URL(targetUrl).hostname;
    return (
      currentHost === targetHost &&
      (targetHost === 'gemini.google.com' ||
        targetHost === 'aistudio.google.com' ||
        targetHost === 'claude.ai')
    );
  } catch {
    return false;
  }
}

async function loadHighlights(scope: HighlightAccountScope): Promise<HighlightRecordV1[]> {
  const response = (await chrome.runtime.sendMessage({
    type: 'gv.highlight.list',
    payload: { scope, includeDeleted: false },
  })) as { ok?: boolean; records?: HighlightRecordV1[]; error?: string } | undefined;
  if (!response?.ok) throw new Error(response?.error || 'Failed to load highlights');
  return Array.isArray(response.records) ? response.records : [];
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
  const [items, setItems] = useState<SavedLibraryItem[]>([]);
  const [filter, setFilter] = useState<SavedLibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferNotice, setTransferNotice] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const resolveSourceHighlightScope = useCallback(async (): Promise<HighlightAccountScope> => {
    const tab =
      typeof sourceTabId === 'number'
        ? await chrome.tabs.get(sourceTabId).catch(() => undefined)
        : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    const pageUrl = tab?.url ?? '';
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
      platform: detectAccountPlatformFromUrl(pageUrl),
      accountKey: resolved.accountKey,
      accountId: resolved.accountId,
      routeUserId: resolved.routeUserId,
    };
  }, [sourceTabId]);

  const loadSavedItems = useCallback(async () => {
    setLoading(true);
    setError(false);
    const [starredResult, highlightResult] = await Promise.allSettled([
      StarredMessagesService.getAllStarredMessagesSorted(),
      resolveSourceHighlightScope().then(loadHighlights),
    ]);
    const starred = starredResult.status === 'fulfilled' ? starredResult.value : [];
    const highlights = highlightResult.status === 'fulfilled' ? highlightResult.value : [];
    setItems(toSavedLibraryItems(starred, highlights));
    setError(starredResult.status === 'rejected' || highlightResult.status === 'rejected');
    setLoading(false);
  }, [resolveSourceHighlightScope]);

  useEffect(() => {
    void loadSavedItems();
  }, [loadSavedItems]);

  const visibleItems = useMemo(
    () => filterSavedLibraryItems(items, filter, query),
    [filter, items, query],
  );
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
      const currentTab =
        typeof sourceTabId === 'number'
          ? await chrome.tabs.get(sourceTabId).catch(() => undefined)
          : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const targetUrl = buildSavedLibraryItemUrl(item);

      if (shouldOpenStarredMessageInCurrentTab(currentTab?.url, targetUrl) && currentTab?.id) {
        await chrome.tabs.update(currentTab.id, { url: targetUrl });
        window.close();
        return;
      }
      await chrome.tabs.create({ url: targetUrl });
    } catch (openError) {
      console.error('[SavedLibrary] Blocked invalid saved item URL:', openError);
      setTransferNotice({ text: t('pm_starred_load_error'), error: true });
    }
  };

  const exportHighlights = async (format: 'json' | 'markdown') => {
    setTransferring(true);
    setTransferNotice(null);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'gv.highlight.export',
        payload: { format, scope: await resolveSourceHighlightScope() },
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
      const response = (await chrome.runtime.sendMessage({
        type: 'gv.highlight.import',
        payload: { data: await file.text(), scope: await resolveSourceHighlightScope() },
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

  const deleteItem = async (item: SavedLibraryItem, event: React.MouseEvent) => {
    event.stopPropagation();
    setTransferNotice(null);
    try {
      if (item.kind === 'starred') {
        await StarredMessagesService.removeStarredMessage(item.conversationId, item.turnId);
      } else {
        const response = (await chrome.runtime.sendMessage({
          type: 'gv.highlight.deleteStored',
          payload: {
            platform: item.platform,
            accountHash: item.accountHash,
            conversationId: item.conversationId,
            id: item.id,
          },
        })) as { ok?: boolean; error?: string } | undefined;
        if (!response?.ok) throw new Error(response?.error || 'Highlight delete failed');
      }
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (deleteError) {
      console.error('[SavedLibrary] Failed to delete item:', deleteError);
      setTransferNotice({
        text: item.kind === 'highlight' ? t('highlightDeleteFailed') : t('pm_starred_load_error'),
        error: true,
      });
    }
  };

  const formatDate = (timestamp: number): string =>
    new Intl.DateTimeFormat(language.replace('_', '-'), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(timestamp);

  const emptyText = error
    ? t('pm_starred_load_error')
    : query.trim().length > 0
      ? t('pm_starred_no_results')
      : filter === 'highlights'
        ? t('savedLibraryNoHighlights')
        : filter === 'starred'
          ? t('noStarredMessages')
          : t('savedLibraryEmpty');

  return (
    <div className="bg-background text-foreground flex h-[600px] w-[360px] flex-col">
      <header className="border-border/60 bg-background border-b px-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-[15px] leading-none font-semibold tracking-[-0.01em]">
            {t('starredHistory')}
          </h1>
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
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('savedLibrarySearchPlaceholder')}
            aria-label={t('savedLibrarySearchPlaceholder')}
            className="placeholder:text-muted-foreground/80 h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </div>

        <div
          className="border-border/60 mt-1.5 grid grid-cols-3 border-b"
          role="group"
          aria-label={t('starredHistory')}
        >
          {(
            [
              ['all', t('savedLibraryAll')],
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
              onClick={() => setFilter(value)}
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
        {transferNotice && (
          <p
            className={cn(
              'mt-1 pb-2.5 text-xs',
              transferNotice.error ? 'text-destructive' : 'text-muted-foreground',
            )}
            role={transferNotice.error ? 'alert' : 'status'}
            aria-live="polite"
          >
            {transferNotice.text}
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
                {t('usageStatusRefresh')}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleItems.map((item) => (
              <Card
                key={`${item.kind}:${item.id}`}
                className="group hover:border-border/80 hover:bg-card active:bg-muted/45 focus-visible:ring-primary/20 relative cursor-pointer border-transparent bg-transparent p-3 shadow-none transition-all duration-200 focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
                role="button"
                tabIndex={0}
                onClick={() => void openItem(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    void openItem(item);
                  }
                }}
              >
                <button
                  type="button"
                  onClick={(event) => void deleteItem(item, event)}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive absolute top-2 right-2 rounded-md p-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                  title={item.kind === 'starred' ? t('removeFromStarred') : t('pm_delete')}
                  aria-label={item.kind === 'starred' ? t('removeFromStarred') : t('pm_delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>

                <div className="flex items-start gap-2.5 pr-6">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                    {item.kind === 'starred' ? (
                      <Star className="text-primary h-4 w-4 fill-current" aria-hidden="true" />
                    ) : (
                      <span
                        className="h-3.5 w-3.5 rounded-sm"
                        style={{ backgroundColor: getHighlightColorHex(item.color ?? 'yellow') }}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm leading-snug font-medium" dir="auto">
                      {item.content}
                    </p>
                    {item.note && (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs" dir="auto">
                        {item.note}
                      </p>
                    )}
                    <div className="text-muted-foreground mt-2 flex items-center gap-2 text-[11px]">
                      <span className="truncate">
                        {item.conversationTitle || t('pm_starred_untitled')}
                      </span>
                      <span aria-hidden="true">·</span>
                      <time className="shrink-0" dateTime={new Date(item.savedAt).toISOString()}>
                        {formatDate(item.savedAt)}
                      </time>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
