/**
 * The folder panel's frame in AI Studio's left nav: the shared folder header
 * with AI Studio's actions, where the panel goes in the legacy or V2 nav, and a
 * watch that notices when Angular rebuilds the nav and drops it.
 */
import { createLibraryIcon } from '@/core/icons/folderIcons';

import { isLibraryPath } from './aistudioLibraryTable';
import { openLibraryInApp } from './aistudioNavigation';
import {
  type FolderHeaderAction,
  createFolderHeader,
  ensureFolderHeaderStyle,
  setFolderHeaderAction,
} from './folderHeader/folderHeader';
import { folderHeaderActions } from './folderHeader/folderHeaderActions';

const NAV_SELECTOR = '.nav-content.v3-left-nav';
const REINJECT_THROTTLE_MS = 250;
const LIBRARY_CLASS = 'gv-folder-library-btn';

/** Stable insertion anchors: Angular renders the nav shell before its children. */
const PANEL_ANCHOR_SELECTOR = [
  'ms-prompt-history-v3',
  `${NAV_SELECTOR} > nav > .empty-space`,
  `${NAV_SELECTOR} > nav > .bottom-actions`,
].join(', ');

export type PanelActions = {
  cloud: { upload: () => void; sync: () => void; tooltip?: () => Promise<string> };
  onCreateFolder: () => void;
};

/** The V2 nav's /library shortcut, which the shared header has no slot for. */
function libraryAction(): FolderHeaderAction {
  return {
    className: LIBRARY_CLASS,
    icon: () => createLibraryIcon(18),
    labelKey: 'folder_manage_in_library',
    hidden: isLibraryPath(),
    onClick: () => openLibraryInApp(),
  };
}

/**
 * Builds the panel frame around the shared folder header. The V2 nav, which has
 * no inline history (`legacyNav` false), gets a /library shortcut.
 */
export function buildFolderPanel(actions: PanelActions, legacyNav: boolean): HTMLElement {
  ensureFolderHeaderStyle();
  const container = document.createElement('div');
  // `.gv-aistudio` scopes AI Studio's styles away from Gemini's.
  container.className = 'gv-folder-container gv-aistudio';
  const header = createFolderHeader({
    title: { tag: 'h2', labelKey: 'folder_title', className: 'gv-folder-title' },
    actions: folderHeaderActions({
      extra: legacyNav ? [] : [libraryAction()],
      cloud: actions.cloud,
      create: { labelKey: 'folder_create', onClick: actions.onCreateFolder },
    }),
  });
  container.appendChild(header);
  return container;
}

/** The /library shortcut is hidden on /library itself. */
export function updateLibraryShortcut(root: ParentNode | null): void {
  if (root) setFolderHeaderAction(root, LIBRARY_CLASS, { hidden: isLibraryPath() });
}

/**
 * Inserts the panel above the legacy history list, or in the V2 nav just
 * above `.empty-space` so `.bottom-actions` stays pinned. Returns false when
 * the nav has no place for it.
 */
export function insertFolderPanel(
  container: HTMLElement,
  historyRoot: HTMLElement | null,
): boolean {
  if (historyRoot) {
    (historyRoot.parentElement ?? historyRoot).insertAdjacentElement('beforebegin', container);
    return true;
  }
  const navContent = document.querySelector(NAV_SELECTOR);
  const nav = navContent?.querySelector(':scope > nav') ?? null;
  const anchor =
    nav?.querySelector(':scope > .empty-space') ?? nav?.querySelector(':scope > .bottom-actions');
  const parent = nav ?? navContent;
  if (anchor) anchor.insertAdjacentElement('beforebegin', container);
  else if (parent) parent.appendChild(container);
  else return false;
  container.classList.add('gv-aistudio-v2');
  return true;
}

/**
 * Calls `onDetached` when an Angular rebuild of the nav has dropped the panel,
 * at most once per burst of mutations. Returns the stop, or null without a nav.
 */
export function watchPanelMount(
  isMounted: () => boolean,
  onDetached: () => void,
): (() => void) | null {
  const navContent = document.querySelector(NAV_SELECTOR);
  if (!navContent) return null;
  let lastReinjectAt = 0;
  const observer = new MutationObserver(() => {
    if (isMounted()) return;
    const now = Date.now();
    if (now - lastReinjectAt < REINJECT_THROTTLE_MS) return;
    lastReinjectAt = now;
    onDetached();
  });
  try {
    observer.observe(navContent, { childList: true, subtree: true });
  } catch {}
  return () => observer.disconnect();
}

/** Resolves with the first panel anchor on the page, or null after `timeoutMs`. */
export function waitForPanelAnchor(timeoutMs = 10000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const found = document.querySelector<HTMLElement>(PANEL_ANCHOR_SELECTOR);
    if (found) return resolve(found);
    const observer = new MutationObserver(() => {
      const anchor = document.querySelector<HTMLElement>(PANEL_ANCHOR_SELECTOR);
      if (!anchor) return;
      observer.disconnect();
      resolve(anchor);
    });
    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch {}
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}
