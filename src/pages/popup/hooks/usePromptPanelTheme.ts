import { useCallback, useEffect, useState } from 'react';

import { StorageKeys } from '@/core/types/common';

/** `'auto'` follows the page's theme; the panel's own switch saves light or dark. */
export type PromptPanelTheme = 'auto' | 'light' | 'dark';

const toPanelTheme = (value: unknown): PromptPanelTheme =>
  value === 'light' || value === 'dark' ? value : 'auto';

/** The Prompt Manager panel theme, kept where the panel's switch keeps it. */
export function usePromptPanelTheme() {
  const [value, setValue] = useState<PromptPanelTheme>('auto');

  useEffect(() => {
    let alive = true;
    const read = async (): Promise<void> => {
      try {
        const synced = (await chrome.storage.sync.get(StorageKeys.PROMPT_THEME))[
          StorageKeys.PROMPT_THEME
        ];
        // The panel falls back to local storage when sync is unavailable.
        const saved =
          synced ??
          (await chrome.storage.local.get(StorageKeys.PROMPT_THEME))[StorageKeys.PROMPT_THEME];
        if (alive) setValue(toPanelTheme(saved));
      } catch {
        // Keep 'auto' when storage is unavailable.
      }
    };
    void read();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>): void => {
      if (StorageKeys.PROMPT_THEME in changes) {
        setValue(toPanelTheme(changes[StorageKeys.PROMPT_THEME].newValue));
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const onChange = useCallback((next: PromptPanelTheme) => {
    setValue(next);
    chrome.storage.sync
      .set({ [StorageKeys.PROMPT_THEME]: next })
      .catch(() => chrome.storage.local.set({ [StorageKeys.PROMPT_THEME]: next }))
      .catch(() => undefined);
  }, []);

  return { value, onChange };
}
