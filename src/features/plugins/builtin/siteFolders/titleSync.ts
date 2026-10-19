import type { FolderCommands } from '@/features/folder/commands/folderCommands';

import type { FiledConversations, SidebarRows } from './types';

/** The filed conversations the sync reads, once the store has loaded. */
export type TitleSyncStore = FiledConversations & { readonly ready: boolean };

/** How the sync reads the site's rows and names their conversations. */
export interface TitleSyncSite {
  readonly rows: SidebarRows;
  /** A title the site shows before it names a conversation. */
  isPlaceholderTitle(title: string): boolean;
  /** The stored folder id of a row's bare id. */
  storedId(bareId: string): string;
}

/**
 * Gives filed conversations the titles the site's sidebar shows. Reads a row's
 * title only when the row is filed, and ignores the placeholder the site shows
 * before it names a new conversation. Stored URLs keep the route they were
 * filed under.
 *
 * A title is written only when this tab sees it change (or sees the row for the
 * first time). Another tab's save reloads the store here too; if this tab's
 * sidebar still shows an older cached title, writing it back would start a
 * write → reload → write loop between the two tabs.
 *
 * A reference that is new to this tab (an add, a move or an import) may carry an
 * older title than the row shows, so its conversation is reconciled once against
 * the row even when the row's text has not changed. A reload of unchanged data
 * adds no reference, so it replays nothing.
 */
export class SidebarTitleSync {
  /** The title this tab last read from each filed row, by bare id. */
  private readonly seen = new Map<string, string>();
  /** Filing keys from the last pass that read the store. */
  private known: ReadonlySet<string> = new Set();
  /** Bare ids with a new reference whose row has not been read since. */
  private readonly unreconciled = new Set<string>();

  constructor(
    private readonly store: TitleSyncStore,
    private readonly commands: FolderCommands,
    private readonly site: TitleSyncSite,
  ) {}

  sync(sidebar: HTMLElement | null): void {
    const store = this.store;
    if (!sidebar || !store.ready) return;
    const filings = store.filings();
    for (const [key, id] of filings) if (!this.known.has(key)) this.unreconciled.add(id);
    this.known = new Set(filings.keys());
    const filed = new Set(filings.values());
    for (const id of this.unreconciled) if (!filed.has(id)) this.unreconciled.delete(id);
    if (filed.size === 0) return;
    const titles = new Map<string, string>();
    const read = new Set<string>();
    for (const row of this.site.rows.list(sidebar)) {
      if (!filed.has(row.id) || read.has(row.id)) continue;
      read.add(row.id);
      const title = this.site.rows.title(row);
      if (!title || this.site.isPlaceholderTitle(title)) continue;
      const fresh = this.unreconciled.delete(row.id);
      if (!fresh && this.seen.get(row.id) === title) continue;
      this.seen.set(row.id, title);
      titles.set(row.id, title);
    }
    if (titles.size === 0) return;
    const entries = [...titles].map(([id, title]) => ({
      conversationId: this.site.storedId(id),
      title,
    }));
    void this.commands.run({ kind: 'syncNativeTitles', entries });
  }
}
