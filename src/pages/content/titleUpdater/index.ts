/**
 * Feature: Auto Update Tab Title
 * Description: Automatically updates the browser tab title to match the current Gemini chat title.
 * Performance: Targeted observer on top-bar-actions + History API interception.
 */
import { StorageKeys } from '@/core/types/common';

let lastTitle = '';
let lastUrl = '';
let observer: MutationObserver | null = null;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let active = false;
let cleanupController: (() => void) | null = null;
let popstateAttached = false;
let originalPushState: History['pushState'] | null = null;
let originalReplaceState: History['replaceState'] | null = null;
let wrappedPushState: History['pushState'] | null = null;
let wrappedReplaceState: History['replaceState'] | null = null;

type StorageChanges = Record<string, chrome.storage.StorageChange>;

/**
 * Starts the title updater service.
 * Uses targeted MutationObserver + History API interception for best performance.
 */
export async function startTitleUpdater(): Promise<() => void> {
  if (cleanupController) return cleanupController;

  chrome.storage?.onChanged?.addListener(handleStorageChange);

  const { gvTabTitleUpdateEnabled } = await chrome.storage.sync.get({
    [StorageKeys.TAB_TITLE_UPDATE_ENABLED]: true,
  });

  if (gvTabTitleUpdateEnabled !== false) {
    enableTitleUpdater();
  }

  cleanupController = () => {
    chrome.storage?.onChanged?.removeListener(handleStorageChange);
    disableTitleUpdater({ restoreTitle: false });
    restoreHistoryPatchIfTopLevel();
    cleanupController = null;
  };

  return cleanupController;
}

function handleStorageChange(changes: StorageChanges, area: string): void {
  if (area !== 'sync') return;

  const change = changes[StorageKeys.TAB_TITLE_UPDATE_ENABLED];
  if (!change) return;

  if (change.newValue === false) {
    disableTitleUpdater({ restoreTitle: true });
  } else {
    enableTitleUpdater();
  }
}

function enableTitleUpdater(): void {
  if (active) return;

  active = true;

  lastUrl = location.href;
  patchHistory();

  if (!popstateAttached) {
    window.addEventListener('popstate', handleUrlChange);
    popstateAttached = true;
  }

  attachObserver();
  tryUpdateTitle();
}

function disableTitleUpdater({ restoreTitle }: { restoreTitle: boolean }): void {
  active = false;

  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  if (popstateAttached) {
    window.removeEventListener('popstate', handleUrlChange);
    popstateAttached = false;
  }

  if (restoreTitle) {
    restoreDefaultTitleIfOwned();
  }

  lastTitle = '';
}

function throttledUpdate(): void {
  if (!active || throttleTimer) return;
  throttleTimer = setTimeout(() => {
    throttleTimer = null;
    if (active) tryUpdateTitle();
  }, 500);
}

function handleUrlChange(): void {
  if (!active || location.href === lastUrl) return;

  lastUrl = location.href;
  lastTitle = '';
  attachObserver();
  tryUpdateTitle();
}

function attachObserver(): void {
  if (!active) return;
  if (observer) observer.disconnect();

  // Target the most specific container: top-bar-actions or conversation-title-container
  const target =
    document.querySelector('top-bar-actions') ||
    document.querySelector('.conversation-title-container') ||
    document.querySelector('.center-section') ||
    document.querySelector('header');

  if (!target) {
    // Container not ready yet, watch for it
    observer = new MutationObserver(() => {
      if (!active) return;
      if (document.querySelector('top-bar-actions') || document.querySelector('header')) {
        attachObserver();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return;
  }

  observer = new MutationObserver(throttledUpdate);
  observer.observe(target, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function patchHistory(): void {
  if (wrappedPushState && wrappedReplaceState) return;

  if (!wrappedPushState) {
    originalPushState = history.pushState;
    wrappedPushState = function pushStateWrapper(
      this: History,
      ...args: Parameters<History['pushState']>
    ): void {
      originalPushState?.apply(this, args);
      handleUrlChange();
    };
    history.pushState = wrappedPushState;
  }

  if (!wrappedReplaceState) {
    originalReplaceState = history.replaceState;
    wrappedReplaceState = function replaceStateWrapper(
      this: History,
      ...args: Parameters<History['replaceState']>
    ): void {
      originalReplaceState?.apply(this, args);
      handleUrlChange();
    };
    history.replaceState = wrappedReplaceState;
  }
}

function restoreHistoryPatchIfTopLevel(): void {
  if (wrappedPushState && history.pushState === wrappedPushState && originalPushState) {
    history.pushState = originalPushState;
    wrappedPushState = null;
    originalPushState = null;
  }

  if (wrappedReplaceState && history.replaceState === wrappedReplaceState && originalReplaceState) {
    history.replaceState = originalReplaceState;
    wrappedReplaceState = null;
    originalReplaceState = null;
  }
}

function restoreDefaultTitleIfOwned(): void {
  if (lastTitle && document.title === `${lastTitle} - Gemini`) {
    document.title = 'Google Gemini';
  }
}

/**
 * Updates document title based on current chat.
 * Restores default title when not on a conversation page.
 */
function tryUpdateTitle() {
  const currentTitle = findChatTitle();

  // Restore default title if not on conversation page
  if (!currentTitle) {
    if (document.title !== 'Google Gemini') {
      document.title = 'Google Gemini';
      lastTitle = '';
    }
    return;
  }

  // Update only if title actually changed
  if (currentTitle !== lastTitle) {
    document.title = `${currentTitle} - Gemini`;
    lastTitle = currentTitle;
  }
}

/**
 * Extracts chat title from top bar area only.
 * Returns null if not on a conversation page or title not found.
 */
function findChatTitle(): string | null {
  // Only run on conversation pages: /app/<id> or /gem/<name>/<id>
  // Also support multi-user prefix: /u/0/, /u/1/, etc.
  if (!/^(?:\/u\/\d+)?\/(?:app|gem\/[a-zA-Z0-9%\-_]+)\/[a-zA-Z0-9%\-_]+/.test(location.pathname)) {
    return null;
  }

  // Target the title using the stable data-test-id attribute, with class-based fallbacks
  const titleEl = document.querySelector(
    '.conversation-title-container [data-test-id="conversation-title"], ' +
      'top-bar-actions [data-test-id="conversation-title"], ' +
      '.top-bar-actions [data-test-id="conversation-title"], ' +
      '.conversation-title-container .conversation-title.gds-title-m, ' +
      'top-bar-actions .conversation-title.gds-title-m',
  );

  if (titleEl) {
    const text = titleEl.textContent?.trim();
    if (text && text !== 'New chat' && text !== 'Gemini' && text !== 'Google Gemini') {
      return text;
    }
  }

  return null;
}
