import { StorageKeys } from '@/core/types/common';
import { getTranslationSync } from '@/utils/i18n';

const NUDGE_CLASS = 'gv-sidebar-collapse-nudge';
const BASE_NUDGE_CLASS = 'gv-hide-archived-nudge';
const SHOW_CLASS = `${BASE_NUDGE_CLASS}--show`;

type TranslationKey = Parameters<typeof getTranslationSync>[0];

function getBooleanStorageValue(key: string, fallback: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.get({ [key]: fallback }, (result) => {
        resolve(result?.[key] === true);
      });
    } catch {
      resolve(localStorage.getItem(key) === 'true');
    }
  });
}

function setBooleanStorageValue(key: string, value: boolean): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.set({ [key]: value }, () => resolve());
    } catch {
      localStorage.setItem(key, String(value));
      resolve();
    }
  });
}

function t(key: TranslationKey, fallback: string): string {
  return getTranslationSync(key) || fallback;
}

export function removeSidebarCollapseNudge(): void {
  document.querySelectorAll(`.${NUDGE_CLASS}`).forEach((element) => element.remove());
}

/** Removes this card, its listener and its pending reveal, wherever the host moved it. */
export type RemoveSidebarCollapseNudge = () => void;

function mountSidebarCollapseNudge(anchor: HTMLElement): RemoveSidebarCollapseNudge {
  const parent = anchor.parentElement ?? document.body;
  removeSidebarCollapseNudge();

  const card = document.createElement('div');
  card.className = `${BASE_NUDGE_CLASS} ${NUDGE_CLASS}`;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');

  const title = document.createElement('div');
  title.className = `${BASE_NUDGE_CLASS}__title`;
  title.textContent = t('sidebarCollapseNudgeTitle', 'Collapsed sections are still here');

  const body = document.createElement('div');
  body.className = `${BASE_NUDGE_CLASS}__body`;
  body.textContent = t(
    'sidebarCollapseNudgeBody',
    'A slim bar stays in the sidebar. Click it anytime to expand this section again.',
  );

  const actions = document.createElement('div');
  actions.className = `${BASE_NUDGE_CLASS}__actions`;

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = `${BASE_NUDGE_CLASS}__btn ${BASE_NUDGE_CLASS}__btn--primary`;
  dismissBtn.textContent = t('sidebarCollapseNudgeDismiss', 'Got it');

  actions.appendChild(dismissBtn);
  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(actions);

  const listeners = new AbortController();
  dismissBtn.addEventListener(
    'click',
    (event) => {
      event.stopPropagation();
      removeSidebarCollapseNudge();
    },
    { signal: listeners.signal },
  );

  parent.insertBefore(card, anchor.nextSibling);
  const reveal = requestAnimationFrame(() => card.classList.add(SHOW_CLASS));
  return () => {
    cancelAnimationFrame(reveal);
    listeners.abort();
    card.remove();
  };
}

/**
 * `isCurrent` lets the caller cancel across the two storage round-trips: once it
 * returns false the nudge neither records itself as shown nor mounts. A flag
 * already written stays written. Resolves to the card's remover when it
 * mounted, so a caller can take it down even after the host detached it.
 */
export async function showSidebarCollapseNudgeOnce(
  anchor: HTMLElement,
  isCurrent: () => boolean = () => true,
): Promise<RemoveSidebarCollapseNudge | null> {
  const hasSeenNudge = await getBooleanStorageValue(
    StorageKeys.SIDEBAR_COLLAPSE_NUDGE_SHOWN,
    false,
  );
  if (hasSeenNudge || !isCurrent()) return null;

  await setBooleanStorageValue(StorageKeys.SIDEBAR_COLLAPSE_NUDGE_SHOWN, true);
  // A stopped caller already removed the anchor; mounting now would fall back to <body>.
  if (!isCurrent()) return null;
  return mountSidebarCollapseNudge(anchor);
}
