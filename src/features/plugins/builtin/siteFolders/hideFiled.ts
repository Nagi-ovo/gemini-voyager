import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import type { HideFiledDom, SidebarRows } from './types';

/** The plugin setting that turns hiding on; absent means off. */
export const HIDE_FILED_SETTING = 'hideFiledChats';

/**
 * Hides filed chats from the site's history list. The CSS stays constant, so
 * style recalculation does not grow with every filed chat; rows are marked by
 * attribute instead. The sidebar watcher reconciles recycled rows and pagination.
 */
export class SidebarHideFiled {
  private readonly style: HTMLStyleElement;
  private filed: ReadonlySet<string> = new Set();
  private marked = new Set<HTMLElement>();
  private readonly revealed = new Set<string>();

  /** `label` names the plugin's effects, e.g. `chatgpt-folders`. */
  constructor(
    scope: PluginScope,
    private readonly dom: HideFiledDom,
    private readonly rows: Pick<SidebarRows, 'list'>,
    label: string,
    private readonly doc: Document = document,
  ) {
    this.style = doc.createElement('style');
    this.style.setAttribute(dom.styleAttribute, '');
    this.style.textContent = dom.css;
    scope.effect(() => {
      doc.head.append(this.style);
      return () => {
        this.style.remove();
        this.sync(null);
        this.filed = new Set();
      };
    }, `${label}:hide-filed`);
  }

  update(ids: Iterable<string>): void {
    this.filed = new Set([...ids].filter((id) => this.dom.idPattern.test(id)));
  }

  /**
   * Shows filed chat `id`'s rows until the returned release, which marks them
   * again; a row pass in between leaves them shown.
   */
  reveal(id: string): () => void {
    const attribute = this.dom.filedAttribute;
    this.revealed.add(id);
    const lifted = [...this.marked].filter((row) =>
      this.rows.list(row).some((conversation) => conversation.id === id),
    );
    for (const row of lifted) {
      row.removeAttribute(attribute);
      this.marked.delete(row);
    }
    return () => {
      this.revealed.delete(id);
      if (!this.filed.has(id)) return;
      for (const row of lifted) {
        if (!row.isConnected) continue;
        row.setAttribute(attribute, '');
        this.marked.add(row);
      }
    };
  }

  sync(sidebar: HTMLElement | null): void {
    const attribute = this.dom.filedAttribute;
    // Include cloned marks and tracked rows React has detached. A row pass only
    // sweeps the sidebar (marks elsewhere are inert); teardown sweeps the page.
    const stale = new Set([
      ...this.marked,
      ...(sidebar ?? this.doc).querySelectorAll<HTMLElement>(`[${attribute}]`),
    ]);
    this.marked = new Set();
    for (const row of sidebar?.querySelectorAll<HTMLElement>(this.dom.rowSelector) ?? []) {
      const ids = this.rows.list(row).map(({ id }) => id);
      if (!ids.some((id) => this.filed.has(id) && !this.revealed.has(id))) continue;
      if (!row.hasAttribute(attribute)) row.setAttribute(attribute, '');
      this.marked.add(row);
      stale.delete(row);
    }
    for (const row of stale) row.removeAttribute(attribute);
  }
}
