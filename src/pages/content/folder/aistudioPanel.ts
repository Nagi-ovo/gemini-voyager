import { isLibraryPath } from './aistudioLibraryTable';
import { openLibraryInApp } from './aistudioNavigation';
/**
 * The folder panel's frame in AI Studio's left nav: the header with its
 * actions, where the panel goes in the legacy or V2 nav, and a watch that
 * notices when Angular rebuilds the nav and drops it.
 */
import { ensureFolderHeaderStyle } from './folderHeader/folderHeader';

const NAV_SELECTOR = '.nav-content.v3-left-nav';
const REINJECT_THROTTLE_MS = 250;
const CLOUD_UPLOAD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H520q-33 0-56.5-23.5T440-240v-206l-64 62-56-56 160-160 160 160-56 56-64-62v206h220q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-83-58.5-141.5T480-720q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h100v80H260Zm220-280Z"/></svg>`;
const CLOUD_SYNC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q17-72 85-137t145-65q33 0 56.5 23.5T520-716v242l64-62 56 56-160 160-160-160 56-56 64 62v-242q-76 14-118 73.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h480q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-48-22-89.5T600-680v-93q74 35 117 103.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H260Zm220-358Z"/></svg>`;

/** Stable insertion anchors: Angular renders the nav shell before its children. */
const PANEL_ANCHOR_SELECTOR = [
  'ms-prompt-history-v3',
  `${NAV_SELECTOR} > nav > .empty-space`,
  `${NAV_SELECTOR} > nav > .bottom-actions`,
].join(', ');

export type PanelActions = {
  t: (key: string) => string;
  onCloudUpload: () => void;
  onCloudSync: () => void;
  uploadTooltip: () => Promise<string>;
  syncTooltip: () => Promise<string>;
  onCreateFolder: () => void;
};

export type FolderPanelFrame = {
  container: HTMLElement;
  /** V2 nav only: the shortcut to /library, hidden while there. */
  libraryButton: HTMLButtonElement | null;
};

function createIcon(name: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'google-symbols';
  span.dataset.icon = name;
  span.textContent = name;
  return span;
}

function cloudButton(
  icon: string,
  title: string,
  onClick: () => void,
  tooltip: () => Promise<string>,
) {
  const button = document.createElement('button');
  button.className = 'gv-folder-action-btn';
  button.innerHTML = icon;
  button.title = title;
  button.addEventListener('click', onClick);
  button.addEventListener('mouseenter', async () => {
    button.title = await tooltip();
  });
  return button;
}

/**
 * Builds the panel frame, styled by the shared folder header sheet. The V2 nav,
 * which has no inline history (`legacyNav` false), gets a /library shortcut.
 */
export function buildFolderPanel(actions: PanelActions, legacyNav: boolean): FolderPanelFrame {
  const { t } = actions;
  ensureFolderHeaderStyle();
  const container = document.createElement('div');
  // `.gv-aistudio` scopes AI Studio's styles away from Gemini's.
  container.className = 'gv-folder-container gv-aistudio';
  const header = document.createElement('div');
  header.className = 'gv-folder-header';
  const title = document.createElement('div');
  title.className = 'gv-folder-title gds-label-l';
  title.textContent = t('folder_title');
  const buttons = document.createElement('div');
  buttons.className = 'gv-folder-header-actions';
  header.append(title, buttons);

  buttons.append(
    cloudButton(
      CLOUD_UPLOAD_ICON,
      t('folder_cloud_upload'),
      actions.onCloudUpload,
      actions.uploadTooltip,
    ),
    cloudButton(CLOUD_SYNC_ICON, t('folder_cloud_sync'), actions.onCloudSync, actions.syncTooltip),
  );
  const addButton = document.createElement('button');
  addButton.className = 'gv-folder-add-btn';
  addButton.title = t('folder_create');
  addButton.appendChild(createIcon('add'));
  addButton.addEventListener('click', actions.onCreateFolder);
  buttons.appendChild(addButton);

  let libraryButton: HTMLButtonElement | null = null;
  if (!legacyNav) {
    libraryButton = document.createElement('button');
    libraryButton.className = 'gv-folder-action-btn gv-folder-library-btn';
    libraryButton.title = t('folder_manage_in_library');
    libraryButton.appendChild(createIcon('library_books'));
    libraryButton.addEventListener('click', openLibraryInApp);
    buttons.appendChild(libraryButton);
  }
  container.appendChild(header);
  return { container, libraryButton };
}

/** The /library shortcut is hidden on /library itself. */
export function updateLibraryShortcut(button: HTMLButtonElement | null): void {
  if (button) button.style.display = isLibraryPath() ? 'none' : '';
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
