/** Read-only Gemini sidebar queries that decide where the folder panel mounts. */

export type FolderAnchor = 'above-recents' | 'above-notebooks';

export function findSidebar(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('[data-test-id="overflow-container"]'),
  );
  return (
    candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) ??
    candidates[0] ??
    null
  );
}

export function findNotebooks(sidebar: HTMLElement | null): HTMLElement | null {
  return (
    sidebar?.querySelector<HTMLElement>(
      'expandable-section[data-test-id="notebooks-expandable-section"]',
    ) ?? null
  );
}

export function findAnchor(sidebar: HTMLElement, preference: FolderAnchor): HTMLElement | null {
  if (preference === 'above-notebooks') {
    const notebooks = findNotebooks(sidebar);
    if (notebooks) return notebooks;
  }
  const promote = (element: Element | null): Element | null =>
    element ? (element.closest('expandable-section') ?? element) : null;
  const firstConversation = sidebar.querySelector('[data-test-id="conversation"]');
  const candidate =
    sidebar.querySelector('expandable-section[data-test-id="chats-expandable-section"]') ??
    promote(sidebar.querySelector('[data-test-id="all-conversations"]')) ??
    promote(sidebar.querySelector('.chat-history')) ??
    firstConversation?.closest('expandable-section') ??
    firstConversation?.closest('.chat-history, [class*="conversation"]');
  return candidate instanceof HTMLElement ? candidate : null;
}

export function isSidebarOpen(): boolean {
  if (document.querySelector('chat-app.side-nav-open, #app-root.side-nav-open')) return true;
  const sidebar = document.querySelector('bard-sidenav, side-nav');
  return sidebar instanceof HTMLElement && sidebar.offsetWidth > 120;
}

/** Gemini can clone a panel unknown to us. Remove only direct Gemini folder siblings. */
export function removeStrayFolderPanels(parent: HTMLElement): void {
  for (const sibling of Array.from(parent.children)) {
    if (
      sibling instanceof HTMLElement &&
      sibling.classList.contains('gv-folder-container') &&
      !sibling.classList.contains('gv-aistudio') &&
      !sibling.classList.contains('gv-multi-select-floating-host')
    ) {
      sibling.remove();
    }
  }
}
