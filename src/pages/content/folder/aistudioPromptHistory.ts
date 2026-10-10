import {
  PROMPT_LINK_SELECTOR,
  UNBOUND_PROMPT_LINK_SELECTOR,
  collectNativePromptTitles,
  mutationAddsPromptLinks,
  mutationMayAffectPromptTitles,
  nodeContainsPromptLink,
  promptDragData,
  writePromptDragData,
} from './aistudioPromptLinks';
/**
 * AI Studio's prompt history as a drag source and a title source: the legacy
 * inline list (`ms-prompt-history-v3`) and the V2 nav's body-level hover
 * popovers. Each watcher returns the stop that removes what it started.
 */
import { applyNativeTitle } from './conversationTitleSync';
import type { FolderData } from './types';

const PROMPT_LIST_BIND_DEBOUNCE_MS = 120;
const PROMPT_TITLE_SYNC_DEBOUNCE_MS = 280;
const PROMPT_DRAG_HOST_SELECTORS = [
  '[data-test-id^="history-item"]',
  '[role="listitem"]',
  '.mat-mdc-list-item',
  'li',
];
const BODY_PROMPT_POPOVER_SELECTOR = [
  '.cdk-overlay-container',
  '.cdk-overlay-pane',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="dialog"]',
].join(', ');

type DragBoundHost = HTMLElement & { _gvDragBound?: boolean };

function promptDragHost(anchor: HTMLAnchorElement): HTMLElement {
  for (const selector of PROMPT_DRAG_HOST_SELECTORS) {
    const match = anchor.closest<HTMLElement>(selector);
    if (match) return match;
  }
  return anchor.parentElement || anchor;
}

/** The anchor a drag on `host` started from: the one under the pointer, else the host's own. */
function draggedAnchor(event: DragEvent, host: HTMLElement): HTMLAnchorElement | null {
  const target = event.target;
  if (target instanceof Element) {
    const anchor = target.closest<HTMLAnchorElement>(PROMPT_LINK_SELECTOR);
    if (anchor) return anchor;
  }
  if (host.matches(PROMPT_LINK_SELECTOR)) return host as HTMLAnchorElement;
  return host.querySelector<HTMLAnchorElement>(PROMPT_LINK_SELECTOR);
}

function bindDragHost(host: DragBoundHost): void {
  if (host._gvDragBound) return;
  host._gvDragBound = true;
  host.draggable = true;
  if (!host.style.cursor) host.style.cursor = 'grab';
  host.addEventListener('dragstart', (event) => {
    const anchor = draggedAnchor(event, host);
    if (anchor) writePromptDragData(event, promptDragData(anchor), host);
  });
}

/**
 * Makes each not-yet-bound prompt link under `root` (or `root` itself) drag its
 * prompt, from the row that holds it. Links are marked, so a second pass is free.
 */
export function bindPromptDragSources(root: ParentNode): void {
  const anchors: HTMLAnchorElement[] = [];
  if (root instanceof Element && root.matches(UNBOUND_PROMPT_LINK_SELECTOR)) {
    anchors.push(root as HTMLAnchorElement);
  }
  root.querySelectorAll<HTMLAnchorElement>(UNBOUND_PROMPT_LINK_SELECTOR).forEach((anchor) => {
    anchors.push(anchor);
  });
  for (const anchor of anchors) {
    const host = promptDragHost(anchor);
    anchor.dataset.gvDragBound = '1';
    bindDragHost(host);
  }
}

export type PromptHistoryHooks = {
  /** Whether any folder holds a prompt; title syncs are skipped while none does. */
  hasStoredPrompts: () => boolean;
  /** Reads native titles into folder data; one runs at a time. */
  syncTitles: () => Promise<void>;
  /** A prompt link in the list was clicked (an in-app navigation). */
  onPromptClick: () => void;
};

/**
 * Watches the inline history list: new links become drag sources and title
 * changes reach the folders, each debounced. Returns the stop.
 */
export function watchPromptHistory(root: HTMLElement, hooks: PromptHistoryHooks): () => void {
  let bindTimer: number | null = null;
  let titleTimer: number | null = null;
  let syncing = false;

  const runTitleSync = async () => {
    if (syncing) return;
    syncing = true;
    try {
      await hooks.syncTitles();
    } finally {
      syncing = false;
    }
  };
  const scheduleBinding = () => {
    if (bindTimer !== null) return;
    bindTimer = window.setTimeout(() => {
      bindTimer = null;
      bindPromptDragSources(root);
    }, PROMPT_LIST_BIND_DEBOUNCE_MS);
  };
  const scheduleTitleSync = () => {
    if (!hooks.hasStoredPrompts() || titleTimer !== null) return;
    titleTimer = window.setTimeout(() => {
      titleTimer = null;
      void runTitleSync();
    }, PROMPT_TITLE_SYNC_DEBOUNCE_MS);
  };

  const observer = new MutationObserver((mutations) => {
    if (mutationAddsPromptLinks(mutations)) scheduleBinding();
    if (mutationMayAffectPromptTitles(mutations)) scheduleTitleSync();
  });
  try {
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'href'],
    });
  } catch {}

  const onClick = (event: Event) => {
    const link = (event.target as HTMLElement | null)?.closest?.('a.prompt-link');
    if (link && /\/prompts\//.test(link.getAttribute('href') || '')) {
      setTimeout(hooks.onPromptClick, 0);
    }
  };
  root.addEventListener('click', onClick, true);

  return () => {
    observer.disconnect();
    if (bindTimer !== null) clearTimeout(bindTimer);
    if (titleTimer !== null) clearTimeout(titleTimer);
    bindTimer = titleTimer = null;
    root.removeEventListener('click', onClick, true);
  };
}

function isBodyPromptPopover(element: Element): boolean {
  return (
    element.matches(BODY_PROMPT_POPOVER_SELECTOR) || !!element.closest(BODY_PROMPT_POPOVER_SELECTOR)
  );
}

/**
 * The V2 nav renders History recents in body-level hover popovers, not inline
 * rows. Binds the links already open, then each popover as it appears.
 */
export function watchBodyPromptPopovers(): () => void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        // The cheap overlay gate runs before the subtree scan for prompt links.
        if (!(node instanceof Element) || !isBodyPromptPopover(node)) continue;
        if (nodeContainsPromptLink(node)) bindPromptDragSources(node);
      }
    }
  });
  try {
    observer.observe(document.body, { childList: true, subtree: true });
  } catch {}
  document.querySelectorAll(BODY_PROMPT_POPOVER_SELECTOR).forEach(bindPromptDragSources);
  return () => observer.disconnect();
}

/**
 * Gives filed prompts the titles the page shows, in one document scan; a
 * user's own title is kept. Returns whether any title changed.
 */
export function applyNativePromptTitles(data: FolderData, at: number): boolean {
  const titles = collectNativePromptTitles();
  if (titles.size === 0) return false;
  let changed = false;
  for (const conversations of Object.values(data.folderContents)) {
    for (const conversation of conversations) {
      const title = titles.get(conversation.conversationId);
      if (title && applyNativeTitle([conversation], title, at)) changed = true;
    }
  }
  return changed;
}

/** Whether any bucket, Uncategorized included, holds a prompt. */
export function hasStoredPrompts(data: FolderData): boolean {
  return Object.values(data.folderContents).some((conversations) => conversations.length > 0);
}
