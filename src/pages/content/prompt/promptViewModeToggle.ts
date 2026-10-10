/**
 * The compact / comfortable switch for the prompt list.
 *
 * The choice is remembered (sync storage, local fallback) and follows changes
 * made in other tabs. The panel carries it as `data-gv-view`.
 */
import browser from 'webextension-polyfill';

import { createLayoutGridIcon, createListIcon } from '@/core/icons/promptManagerIcons';
import { StorageKeys } from '@/core/types/common';
import type { TranslationKey } from '@/utils/translations';

import { readSyncedChoice, writeSyncedChoice } from './promptPrefs';

export type PromptViewMode = 'compact' | 'comfortable';

function isViewMode(value: unknown): value is PromptViewMode {
  return value === 'compact' || value === 'comfortable';
}

export interface ViewModeToggle {
  readonly mode: PromptViewMode;
  /** Updates the button's icon and labels and the panel's `data-gv-view`. */
  applyTexts: () => void;
  /** Follows a mode chosen in another tab. */
  applyStorageChange: (
    area: string,
    changes: Record<string, browser.Storage.StorageChange>,
  ) => void;
}

export interface ViewModeToggleOptions {
  button: HTMLButtonElement;
  panel: HTMLElement;
  t: (key: TranslationKey) => string;
  /** The button does nothing while this is false. */
  isEnabled: () => boolean;
  /** The mode changed; the list should be rendered again. */
  onChange: () => void;
}

/** Starts in compact mode, then restores the saved mode once it is read. */
export function createViewModeToggle({
  button,
  panel,
  t,
  isEnabled,
  onChange,
}: ViewModeToggleOptions): ViewModeToggle {
  let mode: PromptViewMode = 'compact';

  function applyTexts(): void {
    panel.setAttribute('data-gv-view', mode);
    const isCompact = mode === 'compact';
    button.classList.toggle('gv-pm-view-mode-compact', isCompact);
    button.replaceChildren(isCompact ? createLayoutGridIcon(15) : createListIcon(15));
    // Tooltip describes the action the click will perform, not the current state.
    const nextTip = isCompact
      ? t('pm_view_comfortable') || 'Switch to comfortable view'
      : t('pm_view_compact') || 'Switch to compact list';
    button.title = nextTip;
    button.setAttribute('aria-label', nextTip);
    button.setAttribute('aria-pressed', isCompact ? 'true' : 'false');
  }

  applyTexts();

  void readSyncedChoice(StorageKeys.PROMPT_VIEW_MODE, isViewMode).then((saved) => {
    if (saved) {
      mode = saved;
      applyTexts();
      onChange();
    }
  });

  button.addEventListener('click', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!isEnabled()) return;
    mode = mode === 'compact' ? 'comfortable' : 'compact';
    applyTexts();
    onChange();
    await writeSyncedChoice(StorageKeys.PROMPT_VIEW_MODE, mode);
    try {
      (ev.currentTarget as HTMLButtonElement)?.blur?.();
    } catch {}
  });

  return {
    get mode() {
      return mode;
    },
    applyTexts,
    applyStorageChange: (area, changes) => {
      if ((area === 'sync' || area === 'local') && changes[StorageKeys.PROMPT_VIEW_MODE]) {
        const nextMode = changes[StorageKeys.PROMPT_VIEW_MODE].newValue;
        if (isViewMode(nextMode) && nextMode !== mode) {
          mode = nextMode;
          applyTexts();
          onChange();
        }
      }
    },
  };
}
