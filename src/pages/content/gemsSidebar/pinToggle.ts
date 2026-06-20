/**
 * Pin Toggle for native Gems management page.
 *
 * Injects a pin/unpin toggle button into each `bot-list-row` on the
 * Gemini /gems/view page. The button reads/writes the `GV_GEMS_PINNED`
 * list in chrome.storage.sync so the sidebar injector can render
 * pinned gems first, in pin order (the order they were pinned).
 *
 * Because the scraper (in index.ts) also observes the same
 * `[data-test-id="your-gems-list"]` container, this module relies on
 * the scraper's existing MutationObserver — a separate re-injection
 * cycle is triggered after each scrape.
 */
import { StorageKeys } from '@/core/types/common';

const PIN_BTN_CLASS = 'gv-gem-pin-toggle';
const PIN_STYLE_ID = 'gv-gem-pin-style';

let styledInjected = false;
let currentPinned: string[] = [];

/**
 * Inject a small style sheet that sizes and colours the pin toggle
 * to match Gemini's native action buttons (Share, Edit, More).
 */
function injectStyle(): void {
  if (styledInjected) return;
  const style = document.createElement('style');
  style.id = PIN_STYLE_ID;
  style.textContent = `
    .${PIN_BTN_CLASS} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: #8e918f;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      flex-shrink: 0;
    }
    .${PIN_BTN_CLASS}:hover {
      background: rgba(255,255,255,0.08);
      color: #e8eaed;
    }
    .${PIN_BTN_CLASS}.gv-pinned {
      color: #a8c7fa;
    }
    .${PIN_BTN_CLASS}.gv-pinned:hover {
      color: #d2e3fc;
    }
  `;
  document.head.appendChild(style);
  styledInjected = true;
}

/** Load pinned ids from chrome.storage.sync. */
async function loadPinned(): Promise<string[]> {
  try {
    const result = await chrome.storage?.sync?.get({ [StorageKeys.GV_GEMS_PINNED]: [] });
    const raw = result?.[StorageKeys.GV_GEMS_PINNED];
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Persist pinned ids to chrome.storage.sync. */
async function savePinned(ids: string[]): Promise<void> {
  try {
    await chrome.storage?.sync?.set({ [StorageKeys.GV_GEMS_PINNED]: ids });
  } catch {
    // harmless
  }
}

/** Extract gem id from a row's anchor href. */
function gemIdFromRow(row: Element): string | null {
  const anchor = row.querySelector<HTMLAnchorElement>('a.bot-row, a[href*="/gem/"]');
  if (!anchor) return null;
  const href = anchor.getAttribute('href');
  if (!href) return null;
  const match = href.match(/\/gem\/([^/?#]+)/);
  return match?.[1] ?? null;
}

const SVG_FILLED =
  '<path d="m640-480 80 80v80H520v240l-40 40-40-40v-240H240v-80l80-80v-280h-40v-80h400v80h-40v280Z"/>';
const SVG_OUTLINE =
  '<path d="m640-480 80 80v80H520v240l-40 40-40-40v-240H240v-80l80-80v-280h-40v-80h400v80h-40v280Zm-286 80h252l-46-46v-314H400v314l-46 46Z"/>';
const SVG_WRAP = (inner: string) =>
  `<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" width="18" height="18">${inner}</svg>`;

function toggleBtn(btn: HTMLElement, pinned: boolean): void {
  btn.classList.toggle('gv-pinned', pinned);
  btn.title = pinned ? 'Unpin from sidebar' : 'Pin to sidebar';
  btn.setAttribute('aria-label', pinned ? 'Unpin gem' : 'Pin gem');
  btn.innerHTML = SVG_WRAP(pinned ? SVG_FILLED : SVG_OUTLINE);
}

function createPinButton(id: string, isPinned: boolean): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = PIN_BTN_CLASS;
  btn.dataset.gemId = id;
  toggleBtn(btn, isPinned);

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();

    const wasPinned = btn.classList.contains('gv-pinned');
    let next = [...currentPinned];

    if (wasPinned) {
      next = next.filter((gid) => gid !== id);
    } else {
      // Append to the end — first pinned gem stays at the top.
      next = [...next.filter((gid) => gid !== id), id];
    }

    currentPinned = next;
    await savePinned(next);
    toggleBtn(btn, !wasPinned);
  });

  // Prevent Gemini's action-bar tooltip delegation from catching
  // hover events on our button (it would show "Share" or similar).
  btn.addEventListener('mouseover', (e) => e.stopImmediatePropagation());
  btn.addEventListener('mouseout', (e) => e.stopImmediatePropagation());

  return btn;
}

/**
 * Iterate every `bot-list-row` on the page and inject a pin toggle
 * button if one doesn't already exist. Idempotent — safe to call
 * repeatedly (e.g. after a DOM mutation).
 */
export async function injectPinButtons(): Promise<void> {
  injectStyle();
  currentPinned = await loadPinned();
  const pinnedSet = new Set(currentPinned);

  const list = document.querySelector('[data-test-id="your-gems-list"]');
  if (!list) return;

  const rows = list.querySelectorAll('bot-list-row');
  for (const row of rows) {
    if (row.querySelector(`.${PIN_BTN_CLASS}`)) continue;

    const id = gemIdFromRow(row);
    if (!id) continue;

    const btn = createPinButton(id, pinnedSet.has(id));

    // Insert the pin button as a sibling of the anchor, before the
    // native action bar.  The anchor is a flex container so the button
    // naturally aligns to the right when its parent is flex.
    const anchor = row.querySelector<HTMLAnchorElement>('a.bot-row, a[href*="/gem/"]');
    if (anchor?.parentElement) {
      // Insert right after the anchor's own content wrapper
      anchor.parentElement.insertBefore(btn, anchor.nextElementSibling);
    } else {
      row.insertBefore(btn, row.firstChild);
    }
  }
}

/**
 * Listen for cross-tab changes to GV_GEMS_PINNED so the pin state
 * stays in sync if another window modifies it.
 */
export function listenPinnedChanges(): void {
  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    if (!changes[StorageKeys.GV_GEMS_PINNED]) return;
    const raw = changes[StorageKeys.GV_GEMS_PINNED].newValue;
    currentPinned = Array.isArray(raw)
      ? raw.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const pinnedSet = new Set(currentPinned);
    document.querySelectorAll(`.${PIN_BTN_CLASS}`).forEach((btn) => {
      const id = (btn as HTMLElement).dataset.gemId;
      if (!id) return;
      toggleBtn(btn as HTMLElement, pinnedSet.has(id));
    });
  });
}
