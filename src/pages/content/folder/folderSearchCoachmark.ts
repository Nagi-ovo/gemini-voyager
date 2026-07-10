import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { getTranslationSync, initI18n } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

import { showCoachmark } from '../coachmark';
import { keepSidebarExpanded } from '../sidebarAutoHide';

const COACH_ID = 'folder-search-intro';
const SIDEBAR_EXPAND_WAIT_MS = 320;
export const FOLDER_SEARCH_COACHMARK_DEBUG_EVENT = 'gv:debug:folderSearchCoachmark';

const t = (key: TranslationKey, fallback: string): string => {
  try {
    const v = getTranslationSync(key);
    return v && v !== key ? v : fallback;
  } catch {
    return fallback;
  }
};

async function loadFolderSearchEnabled(): Promise<boolean> {
  try {
    const got = (await browser.storage.sync.get({
      [StorageKeys.FOLDER_SEARCH_ENABLED]: true,
    })) as Record<string, unknown>;
    return got[StorageKeys.FOLDER_SEARCH_ENABLED] !== false;
  } catch {
    return true;
  }
}

async function setFolderSearchEnabled(on: boolean): Promise<void> {
  try {
    await browser.storage.sync.set({ [StorageKeys.FOLDER_SEARCH_ENABLED]: on });
  } catch {
    /* non-critical */
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function getVisibleSearchInput(): HTMLElement | null {
  const input = document.querySelector<HTMLElement>('.gv-folder-search-input');
  if (!input) return null;
  const rect = input.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? input : null;
}

export async function maybeShowFolderSearchCoachmark(
  opts: { force?: boolean } = {},
): Promise<void> {
  if (location.hostname !== 'gemini.google.com') return;
  const enabled = await loadFolderSearchEnabled();
  if (!enabled && !opts.force) return;

  try {
    await initI18n();
  } catch {
    /* fall back to literals */
  }

  const releaseSidebar = keepSidebarExpanded();
  try {
    await wait(SIDEBAR_EXPAND_WAIT_MS);
    await showCoachmark({
      id: COACH_ID,
      once: !opts.force,
      scrim: true,
      title: t('folderSearchCoachmarkTitle', 'New: folder search'),
      body: t(
        'folderSearchCoachmarkBody',
        'Search folder and chat titles right from the Folders section.',
      ),
      placement: 'bottom',
      anchor: getVisibleSearchInput,
      toggle: {
        label: t('folderSearchCoachmarkToggle', 'Show folder search'),
        initial: enabled,
        onChange: (on) => setFolderSearchEnabled(on),
      },
      dismissLabel: t('coachmarkDismiss', 'Done'),
    });
  } finally {
    releaseSidebar();
  }
}

const showDebugFolderSearchCoachmark = () => void maybeShowFolderSearchCoachmark({ force: true });

// Debug: from the normal page console, run:
// document.dispatchEvent(new Event('gv:debug:folderSearchCoachmark'))
try {
  (window as unknown as Record<string, unknown>).__gvFolderSearchCoachmark =
    showDebugFolderSearchCoachmark;
  document.addEventListener(FOLDER_SEARCH_COACHMARK_DEBUG_EVENT, showDebugFolderSearchCoachmark);
} catch {
  /* ignore */
}
