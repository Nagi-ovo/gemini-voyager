import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLanguage } from '@/contexts/LanguageContext';
import {
  HIGHLIGHT_STORAGE_NAMESPACE,
  type HighlightAccountScope,
  type HighlightRecordV1,
} from '@/core/types/highlight';
import { askConfirm } from '@/core/ui/confirm';

import { StarredMessagesService } from './StarredMessagesService';
import { confirmSavedLibraryOpen } from './confirmSavedLibraryOpen';
import { listLibraryHighlights, removeLibraryItem } from './libraryClient';
import { type SavedLibraryItem, savedLibraryItemKey, toSavedLibraryItems } from './model';
import type { StarredMessage } from './starTypes';
import { ALL_FILTER, type SavedLibrarySelection, getSavedLibraryView } from './viewModel';

type HighlightSource = typeof ALL_FILTER | (() => Promise<HighlightAccountScope | null>);
interface LibrarySources {
  stars: StarredMessage[];
  highlights: HighlightRecordV1[];
  highlightScope: string | null;
}

function withoutItem(sources: LibrarySources, item: SavedLibraryItem): LibrarySources {
  return item.kind === 'starred'
    ? {
        ...sources,
        stars: sources.stars.filter(
          (star) => star.conversationId !== item.conversationId || star.turnId !== item.turnId,
        ),
      }
    : {
        ...sources,
        highlights: sources.highlights.filter(
          (record) =>
            record.id !== item.id ||
            record.platform !== item.platform ||
            record.accountHash !== item.accountHash ||
            record.conversationId !== item.conversationId,
        ),
      };
}

/** Reads and mutations belong here; popup and full-page views only present the result. */
export function useSavedLibrary({
  highlightScope,
  confirmRemoval = true,
}: {
  highlightScope: HighlightSource;
  confirmRemoval?: boolean;
}) {
  const { t } = useLanguage();
  const [sources, setSources] = useState<LibrarySources>({
    stars: [],
    highlights: [],
    highlightScope: null,
  });
  const [selection, updateSelection] = useState<SavedLibrarySelection>({
    kind: ALL_FILTER,
    query: '',
    site: ALL_FILTER,
    account: ALL_FILTER,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const generation = useRef(0);
  const lifetime = useRef(new AbortController());
  const allItems = useMemo(() => toSavedLibraryItems(sources.stars, sources.highlights), [sources]);
  const currentItems = useRef(allItems);
  useEffect(() => {
    currentItems.current = allItems;
  }, [allItems]);
  const view = useMemo(() => getSavedLibraryView(allItems, selection), [allItems, selection]);

  const reload = useCallback(async () => {
    const session = lifetime.current;
    if (session.signal.aborted) return;
    const request = ++generation.current;
    let requestedScope: string | null = null;
    setLoading(true);
    const [stars, highlights] = await Promise.allSettled([
      StarredMessagesService.getAllStarredMessagesSorted(),
      (async () => {
        const scope =
          typeof highlightScope === 'function' ? await highlightScope() : highlightScope;
        requestedScope = JSON.stringify(
          scope && scope !== ALL_FILTER ? [scope.platform, scope.accountKey] : scope,
        );
        return listLibraryHighlights(scope);
      })(),
    ]);
    if (session.signal.aborted || request !== generation.current) return;
    setSources((previous) => ({
      stars: stars.status === 'fulfilled' ? stars.value : previous.stars,
      // Failed reads can retain data only when its resolved platform/account is unchanged.
      highlights:
        highlights.status === 'fulfilled'
          ? highlights.value
          : requestedScope !== null && requestedScope === previous.highlightScope
            ? previous.highlights
            : [],
      highlightScope: requestedScope,
    }));
    setError(stars.status === 'rejected' || highlights.status === 'rejected');
    setLoading(false);
  }, [highlightScope]);

  useEffect(() => {
    const session = new AbortController();
    lifetime.current = session;
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const stars = StarredMessagesService.decodeStorageChange(area, changes);
      const highlights =
        area === 'local' &&
        Object.keys(changes).some((key) => key.startsWith(`${HIGHLIGHT_STORAGE_NAMESPACE}:`));
      if (stars !== undefined || highlights) void reload();
    };
    chrome.storage.onChanged.addListener(changed);
    void reload();
    return () => {
      session.abort();
      chrome.storage.onChanged.removeListener(changed);
    };
  }, [reload]);

  const setSelection = useCallback((next: Partial<SavedLibrarySelection>) => {
    updateSelection((previous) => ({
      ...previous,
      ...next,
      ...(next.site !== undefined && next.site !== previous.site ? { account: ALL_FILTER } : {}),
    }));
  }, []);

  const remove = useCallback(
    async (item: SavedLibraryItem): Promise<boolean> => {
      const session = lifetime.current;
      setNotice(null);
      if (confirmRemoval) {
        const answer = await askConfirm({
          message: t(
            item.kind === 'starred'
              ? 'savedLibraryRemoveStarConfirm'
              : 'savedLibraryDeleteHighlightConfirm',
          ),
          tone: 'danger',
          cancelLabel: t('pm_cancel'),
          choices: [
            { id: 'remove', label: t(item.kind === 'starred' ? 'removeFromStarred' : 'pm_delete') },
          ],
          signal: session.signal,
        });
        if (answer !== 'remove') return false;
      }
      const key = savedLibraryItemKey(item);
      if (
        session.signal.aborted ||
        !currentItems.current.some((candidate) => savedLibraryItemKey(candidate) === key)
      )
        return false;
      let removed = false;
      try {
        await removeLibraryItem(item);
        removed = true;
        // A failed follow-up read retains previous rows, so drop the acknowledged item from them first.
        if (!session.signal.aborted) setSources((previous) => withoutItem(previous, item));
      } catch {
        if (!session.signal.aborted) {
          setNotice({
            text: t(item.kind === 'highlight' ? 'highlightDeleteFailed' : 'starredDeleteFailed'),
            error: true,
          });
        }
      } finally {
        // Storage is authoritative after both committed and failed removals, including other tabs' edits.
        if (!session.signal.aborted) await reload();
      }
      return removed && !session.signal.aborted;
    },
    [confirmRemoval, reload, t],
  );

  const confirmOpen = useCallback(
    (item: SavedLibraryItem) =>
      confirmSavedLibraryOpen(item, currentItems.current, t, lifetime.current.signal),
    [t],
  );

  return {
    ...view,
    allItems,
    selection,
    setSelection,
    loading,
    error,
    notice,
    reload,
    remove,
    confirmOpen,
  };
}
