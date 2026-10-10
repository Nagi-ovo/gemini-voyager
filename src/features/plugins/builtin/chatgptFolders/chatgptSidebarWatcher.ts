import type { Dispose, PluginScope } from '@/features/plugins/runtime/pluginScope';

import { FILED_ROW_ATTRIBUTE } from './chatgptHideFiled';
import { findChatGptSidebar } from './chatgptSidebarDom';

export type SidebarListener = (sidebar: HTMLElement | null) => void;

/**
 * Rows appear (pagination), are renamed in place (text or `href` changes), and
 * the whole sidebar can be remounted. A row's menu trigger flips `aria-expanded`
 * when its menu opens, and the open conversation's row carries `aria-current`. Text and attribute changes only matter inside it.
 */
const SIDEBAR_OBSERVER_OPTIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: [
    'href',
    'target',
    'role',
    'data-sidebar-project-container-id',
    'aria-expanded',
    // Moves to the open conversation's row when the route changes.
    'aria-current',
    FILED_ROW_ATTRIBUTE,
  ],
};

/**
 * Follows ChatGPT's sidebar and calls its listeners at most once per frame after
 * it changes. The page-wide observer only checks whether the sidebar it holds is
 * still connected, so streaming replies cost one property read per batch.
 */
export class ChatGptSidebarWatcher {
  private sidebar: HTMLElement | null = null;
  private stopSidebar: Dispose | null = null;
  private pending = false;
  private readonly listeners: SidebarListener[] = [];

  constructor(
    private readonly scope: PluginScope,
    private readonly doc: Document = document,
  ) {}

  /** Listeners run in registration order on every pass. */
  onChange(listener: SidebarListener): void {
    this.listeners.push(listener);
  }

  start(): void {
    this.scope.observe(this.doc.body, { childList: true, subtree: true }, () => {
      if (!this.sidebar?.isConnected) this.schedule();
    });
    this.scope.effect(
      () => () => {
        this.sidebar = null;
        this.stopSidebar = null;
      },
      'chatgpt-folders:sidebar-watcher',
    );
    this.run();
  }

  /** Runs every listener on the next frame; repeated calls coalesce. */
  schedule(): void {
    if (this.pending || this.scope.isDisposed) return;
    this.pending = true;
    this.scope.frame(() => {
      this.pending = false;
      this.run();
    });
  }

  private run(): void {
    const sidebar = findChatGptSidebar(this.doc);
    if (sidebar !== this.sidebar) {
      void this.stopSidebar?.();
      this.sidebar = sidebar;
      this.stopSidebar = sidebar
        ? this.scope.observe(sidebar, SIDEBAR_OBSERVER_OPTIONS, () => this.schedule())
        : null;
    }
    for (const listener of this.listeners) listener(sidebar);
  }
}
