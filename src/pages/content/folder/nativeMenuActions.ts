import { getTranslationSyncUnsafe } from '@/utils/i18n';

/**
 * Drives Gemini's own conversation menu and delete dialog the way a user does:
 * open the ⋮ menu, find Rename or Delete, confirm. Stateless; a caller passes
 * `isCurrent` so a long wait stops once its action no longer applies.
 */

export const NATIVE_ACTION_TIMING = {
  MENU_APPEAR_DELAY: 300,
  DIALOG_APPEAR_DELAY: 300,
  DELETION_COMPLETE_DELAY: 500,
  MAX_BUTTON_WAIT_TIME: 3000,
  BUTTON_CHECK_INTERVAL: 100,
} as const;

const MORE_BUTTON_SELECTOR = '[data-test-id="actions-menu-button"]';
const DELETE_ICON_NAMES = ['delete', 'delete_forever', 'delete_outline'];

/** A button to click and the debug line that reports how it was found. */
interface FoundButton {
  button: HTMLElement;
  log: unknown[];
}

type PollOutcome = 'clicked' | 'stale' | 'timeout';

export function menuDebug(level: 'log' | 'warn', ...args: unknown[]): void {
  try {
    if (localStorage.getItem('gvFolderDebug') === '1') {
      console[level]('[FolderManager]', ...args);
    }
  } catch {
    // localStorage may be unavailable in private browsing.
  }
}

/** Delete/confirm labels from i18n, so no locale's wording is hardcoded. */
export function getDeleteKeywords(): string[] {
  const rawPatterns = getTranslationSyncUnsafe('batch_delete_match_patterns') || '';
  // Split on both ASCII and CJK fullwidth commas (and a couple of common
  // separators) so locales authored with `，` / `、` / `；` don't end up as
  // one giant unsplittable string.
  return rawPatterns
    .split(/[,，、；;]+/)
    .map((s: string) => s.trim().toLowerCase())
    .filter((s: string) => s.length > 0);
}

/** A short label equal to, or containing, a delete keyword. */
export function matchesDeleteKeyword(text: string, keywords = getDeleteKeywords()): boolean {
  return keywords.some(
    (keyword) => text === keyword || (text.includes(keyword) && text.length < 20),
  );
}

export function isDeleteIconName(name: string | null | undefined): boolean {
  return !!name && DELETE_ICON_NAMES.includes(name);
}

function isVisibleElement(el: HTMLElement): boolean {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    el.offsetParent !== null
  );
}

/** Waits `ms`, or less when `signal` aborts. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const finish = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

export function clickBackdropToCloseMenu(): void {
  const backdrop = document.querySelector('.cdk-overlay-backdrop') as HTMLElement;
  if (backdrop) {
    backdrop.click();
    menuDebug('log', 'Clicked backdrop to close menu');
  }
}

/** Polls `find` until it returns a button, then clicks it. */
async function clickWhenFound(
  find: () => FoundButton | null,
  isCurrent: () => boolean,
  signal?: AbortSignal,
  onMiss?: () => void,
): Promise<PollOutcome> {
  const step = NATIVE_ACTION_TIMING.BUTTON_CHECK_INTERVAL;
  for (let elapsed = 0; elapsed < NATIVE_ACTION_TIMING.MAX_BUTTON_WAIT_TIME; elapsed += step) {
    if (!isCurrent()) return 'stale';
    const found = find();
    if (found) {
      found.button.click();
      menuDebug('log', ...found.log);
      return 'clicked';
    }
    onMiss?.();
    await delay(step, signal);
  }
  return 'timeout';
}

/**
 * The ⋮ button of a native conversation row. In Gemini's lr26 layout it is
 * rendered inside the row host; the sibling-container and `<li>` lookups serve
 * older layouts.
 */
function locateMoreButton(conversationEl: HTMLElement): HTMLElement | null {
  const inside = conversationEl.querySelector<HTMLElement>(MORE_BUTTON_SELECTOR);
  if (inside) return inside;

  const actionsContainer = conversationEl.parentElement?.querySelector(
    '.conversation-actions-container',
  );
  const sibling = actionsContainer?.querySelector<HTMLElement>(MORE_BUTTON_SELECTOR);
  if (sibling) return sibling;

  return conversationEl.closest('li')?.querySelector<HTMLElement>(MORE_BUTTON_SELECTOR) ?? null;
}

/**
 * Finds and clicks a row's ⋮ button. The sidebar virtualizes rows, so a row
 * scrolled far away may not have mounted its trailing actions: scroll it into
 * view and poll briefly.
 */
export async function clickMoreButton(
  conversationEl: HTMLElement,
  isCurrent: () => boolean,
  signal?: AbortSignal,
): Promise<HTMLElement | null> {
  if (!isCurrent()) return null;
  let moreButton = locateMoreButton(conversationEl);
  if (!moreButton) {
    try {
      conversationEl.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    } catch {
      /* scrollIntoView may throw in some embedded contexts — ignore */
    }
    const step = NATIVE_ACTION_TIMING.BUTTON_CHECK_INTERVAL;
    for (let waited = 0; waited < NATIVE_ACTION_TIMING.MAX_BUTTON_WAIT_TIME; waited += step) {
      await delay(step, signal);
      if (!isCurrent()) return null;
      moreButton = locateMoreButton(conversationEl);
      if (moreButton) break;
    }
  }

  if (!isCurrent()) return null;
  if (moreButton) {
    moreButton.click();
    menuDebug('log', 'Clicked more button');
    return moreButton;
  }
  console.warn(
    '[FolderManager] Could not locate actions-menu-button inside conversation host. ' +
      'Gemini sidebar DOM may have changed.',
    conversationEl,
  );
  return null;
}

/** The first visible menu button whose overlay icon satisfies `matches`. */
function findOverlayItemByIcon(matches: (icon: Element) => boolean): HTMLElement | null {
  const icons = document.querySelectorAll(
    '.cdk-overlay-container mat-icon, .cdk-overlay-container .material-icons',
  );
  for (const icon of icons) {
    if (!matches(icon)) continue;
    const button = icon.closest('button, [role="menuitem"]') as HTMLElement | null;
    if (button && isVisibleElement(button)) return button;
  }
  return null;
}

function findRenameButton(): FoundButton | null {
  const byTestId = document.querySelector('[data-test-id="rename-button"]') as HTMLElement | null;
  if (byTestId && isVisibleElement(byTestId)) {
    return { button: byTestId, log: ['Clicked rename button (by test-id)'] };
  }
  const byIcon = findOverlayItemByIcon((icon) => {
    const text = icon.textContent?.toLowerCase().trim() || '';
    return text === 'edit' || text === 'edit_square';
  });
  return byIcon ? { button: byIcon, log: ['Clicked rename button (by icon)'] } : null;
}

export async function waitForRenameButtonAndClick(): Promise<boolean> {
  return (await clickWhenFound(findRenameButton, () => true)) === 'clicked';
}

interface DeleteSearch {
  testIdCount: number;
  visibleTestIdCount: number;
  overlayPanes: number;
  menuPanels: number;
  menuItemTexts: string[];
}

function findDeleteByTestId(seen: DeleteSearch): FoundButton | null {
  // querySelectorAll: some layouts render hidden template copies that a single
  // match would lock onto, never advancing past an invisible match.
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('[data-test-id="delete-button"]'),
  );
  seen.testIdCount = candidates.length;
  const visible = candidates.filter((el) => isVisibleElement(el));
  seen.visibleTestIdCount = visible.length;
  // Prefer one that lives inside an open menu / overlay panel.
  const button =
    visible.find((el) => el.closest('.mat-mdc-menu-panel, .cdk-overlay-pane')) ?? visible[0];
  return button ? { button, log: ['Clicked delete button (by test-id)'] } : null;
}

function findDeleteByText(keywords: string[], seen: DeleteSearch): FoundButton | null {
  const menuItems = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.cdk-overlay-container button[role="menuitem"], ' +
        '.cdk-overlay-container [role="menuitem"], ' +
        '.mat-mdc-menu-content button, ' +
        '.mat-menu-content button',
    ),
  );
  seen.menuItemTexts = menuItems.map((el) => el.textContent?.trim().slice(0, 20) || '');
  for (const item of menuItems) {
    if (!isVisibleElement(item)) continue;
    const text = item.textContent?.toLowerCase().trim() || '';
    if (text && matchesDeleteKeyword(text, keywords)) {
      return { button: item, log: ['Clicked delete button (by text):', text] };
    }
  }
  return null;
}

/** One look for the open menu's Delete item: by test id, by label, then by icon. */
function findDeleteMenuItem(keywords: string[], seen: DeleteSearch): FoundButton | null {
  const found = findDeleteByTestId(seen) ?? findDeleteByText(keywords, seen);
  if (found) return found;
  const byIcon = findOverlayItemByIcon(
    (icon) =>
      isDeleteIconName(icon.textContent?.toLowerCase().trim()) ||
      isDeleteIconName(icon.getAttribute('fonticon')),
  );
  return byIcon ? { button: byIcon, log: ['Clicked delete button (by icon)'] } : null;
}

/** Waits for the open menu's Delete item and clicks it. */
export async function waitForDeleteButtonAndClick(
  isCurrent: () => boolean,
  signal: AbortSignal,
): Promise<boolean> {
  const keywords = getDeleteKeywords();
  const seen: DeleteSearch = {
    testIdCount: 0,
    visibleTestIdCount: 0,
    overlayPanes: 0,
    menuPanels: 0,
    menuItemTexts: [],
  };
  const recordOverlays = () => {
    seen.overlayPanes = document.querySelectorAll('.cdk-overlay-pane').length;
    seen.menuPanels = document.querySelectorAll('.mat-mdc-menu-panel').length;
  };
  const outcome = await clickWhenFound(
    () => findDeleteMenuItem(keywords, seen),
    isCurrent,
    signal,
    recordOverlays,
  );
  if (outcome !== 'timeout') return outcome === 'clicked';

  // One compact diagnostic users can paste verbatim when reporting failures.
  console.warn(
    '[FolderManager] Batch delete diagnostics on timeout: ' +
      JSON.stringify({
        deleteButtonsFound: seen.testIdCount,
        deleteButtonsVisible: seen.visibleTestIdCount,
        overlayPanes: seen.overlayPanes,
        menuPanels: seen.menuPanels,
        menuItemTexts: seen.menuItemTexts.slice(0, 10),
        keywordsTried: keywords,
      }),
  );
  return false;
}

/** The first visible button matching `selector` whose label satisfies `matches`. */
function findLabelledButton(
  selector: string,
  matches: (text: string) => boolean,
): FoundButton | null {
  for (const button of document.querySelectorAll<HTMLElement>(selector)) {
    if (!isVisibleElement(button)) continue;
    const text = button.textContent?.toLowerCase().trim() || '';
    if (text && matches(text)) return { button, log: [text] };
  }
  return null;
}

/** A two-button dialog puts the destructive action last. */
function findLastDialogAction(): HTMLElement | null {
  const dialogActions = document.querySelector(
    '.mat-mdc-dialog-actions, .cdk-overlay-container .mat-dialog-actions',
  );
  const buttons = dialogActions?.querySelectorAll<HTMLElement>('button');
  if (!buttons || buttons.length < 2) return null;
  const last = buttons[buttons.length - 1];
  return isVisibleElement(last) ? last : null;
}

/** One look for the delete dialog's confirm button. */
function findDeleteConfirmButton(keywords: string[]): FoundButton | null {
  const byTestId = document.querySelector(
    '[data-test-id*="confirm"], [data-test-id*="delete"]:not([data-test-id="delete-button"])',
  ) as HTMLElement;
  if (byTestId && isVisibleElement(byTestId)) {
    return { button: byTestId, log: ['Clicked confirmation button (by test-id)'] };
  }

  const primary = findLabelledButton(
    `
        .mat-mdc-dialog-container button.mat-primary,
        .mat-mdc-dialog-container button.mat-accent,
        .mat-mdc-dialog-container .mat-mdc-dialog-actions button:last-child,
        .cdk-overlay-container .mat-mdc-dialog-actions button:last-child,
        .cdk-overlay-container button[color="primary"],
        .cdk-overlay-container button[color="warn"]
      `,
    (text) => keywords.some((keyword) => text.includes(keyword) || text === keyword),
  );
  if (primary) {
    return { ...primary, log: ['Clicked confirmation button (primary button):', ...primary.log] };
  }

  const overlay = findLabelledButton(
    '.cdk-overlay-container button, .mat-mdc-dialog-container button',
    (text) => keywords.some((keyword) => text === keyword),
  );
  if (overlay) {
    return { ...overlay, log: ['Clicked confirmation button (overlay button):', ...overlay.log] };
  }

  const last = findLastDialogAction();
  return last ? { button: last, log: ['Clicked last button in dialog actions'] } : null;
}

/** Confirms Gemini's delete dialog if one appears; no dialog is fine. */
export async function confirmDeleteIfNeeded(
  isCurrent: () => boolean,
  signal: AbortSignal,
): Promise<void> {
  const keywords = getDeleteKeywords();
  const outcome = await clickWhenFound(() => findDeleteConfirmButton(keywords), isCurrent, signal);
  if (outcome === 'timeout') {
    menuDebug(
      'log',
      'No confirmation dialog detected after',
      NATIVE_ACTION_TIMING.MAX_BUTTON_WAIT_TIME,
      'ms',
    );
  }
}
