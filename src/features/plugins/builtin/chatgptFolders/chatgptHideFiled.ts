import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { listSidebarConversations } from './chatgptSidebarDom';

/** The plugin setting that turns hiding on; absent means off. */
export const HIDE_FILED_SETTING = 'hideFiledChats';
export const FILED_ROW_ATTRIBUTE = 'data-gv-chatgpt-filed';

/** Recents only: a filed chat stays visible inside its Project. */
const HISTORY_ROW = '[data-sidebar-project-container-id="chats"] [role="listitem"]';
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// The current-page exception responds to navigation without waiting for a row
// pass. A row holding focus (ChatGPT's own rename field) stays shown until it lets go.
const HIDE_FILED_CSS = `${HISTORY_ROW}[${FILED_ROW_ATTRIBUTE}]:not([aria-current="page"]):not(:has([aria-current="page"])):not(:focus-within) { display: none !important; }`;

/**
 * Keep CSS constant so style recalculation does not grow with every filed chat.
 * The existing sidebar watcher reconciles recycled rows and pagination.
 */
export class ChatGptHideFiled {
  private readonly style: HTMLStyleElement;
  private filed: ReadonlySet<string> = new Set();
  private marked = new Set<HTMLElement>();
  private readonly revealed = new Set<string>();

  constructor(
    scope: PluginScope,
    private readonly doc: Document = document,
  ) {
    this.style = doc.createElement('style');
    this.style.setAttribute('data-gv-chatgpt-hide-filed', '');
    this.style.textContent = HIDE_FILED_CSS;
    scope.effect(() => {
      doc.head.append(this.style);
      return () => {
        this.style.remove();
        this.sync(null);
        this.filed = new Set();
      };
    }, 'chatgpt-folders:hide-filed');
  }

  update(ids: Iterable<string>): void {
    this.filed = new Set([...ids].filter((id) => ID_PATTERN.test(id)));
  }

  /**
   * Shows filed chat `id`'s rows until the returned release, which marks them
   * again; a row pass in between leaves them shown.
   */
  reveal(id: string): () => void {
    this.revealed.add(id);
    const lifted = [...this.marked].filter((row) =>
      listSidebarConversations(row).some((conversation) => conversation.id === id),
    );
    for (const row of lifted) {
      row.removeAttribute(FILED_ROW_ATTRIBUTE);
      this.marked.delete(row);
    }
    return () => {
      this.revealed.delete(id);
      if (!this.filed.has(id)) return;
      for (const row of lifted) {
        if (!row.isConnected) continue;
        row.setAttribute(FILED_ROW_ATTRIBUTE, '');
        this.marked.add(row);
      }
    };
  }

  sync(sidebar: HTMLElement | null): void {
    // Include cloned marks and tracked rows React has detached. A row pass only
    // sweeps the sidebar (marks elsewhere are inert); teardown sweeps the page.
    const stale = new Set([
      ...this.marked,
      ...(sidebar ?? this.doc).querySelectorAll<HTMLElement>(`[${FILED_ROW_ATTRIBUTE}]`),
    ]);
    this.marked = new Set();
    for (const row of sidebar?.querySelectorAll<HTMLElement>(HISTORY_ROW) ?? []) {
      const ids = listSidebarConversations(row).map(({ id }) => id);
      if (!ids.some((id) => this.filed.has(id) && !this.revealed.has(id))) continue;
      if (!row.hasAttribute(FILED_ROW_ATTRIBUTE)) row.setAttribute(FILED_ROW_ATTRIBUTE, '');
      this.marked.add(row);
      stale.delete(row);
    }
    for (const row of stale) row.removeAttribute(FILED_ROW_ATTRIBUTE);
  }
}
