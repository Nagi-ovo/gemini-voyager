import { extractConversationId } from './nativeConversationIds';
import { getNativeConversationRoot } from './nativeSidebarDom';

const ARCHIVED_CLASS = 'gv-conversation-archived';
const ARCHIVED_ACTIONS_CLASS = 'gv-conversation-archived-actions';
const LEGACY_ACTIONS_PROBE_TTL_MS = 1000;

type NativeArchivedRowsOptions = {
  getSidebar(): HTMLElement | null;
  /** The hide-archived setting: hide native rows already filed in a folder. */
  isHidingArchived(): boolean;
  /** `pass` shares one membership lookup across the rows of one sweep. */
  isInFolders(conversationId: string, pass: object): boolean;
};

/** Hides Gemini's native sidebar rows for chats already filed in a folder (hide-archived). */
export class NativeArchivedRows {
  // Cached result of the legacy `.conversation-actions-container` layout
  // probe — see `hasLegacyActionsContainer` (issue #753).
  private legacyActionsProbe: { present: boolean; at: number } | null = null;

  constructor(private readonly options: NativeArchivedRowsOptions) {}

  /** Applies the setting to every native row. */
  applyAll(rows: Iterable<Element>): void {
    const pass = {}; // one membership lookup for every row
    for (const row of rows) this.apply(row as HTMLElement, pass);
  }

  /** Applies the setting to a single native conversation row. */
  apply(conv: HTMLElement, pass: object): void {
    if (!this.options.isHidingArchived()) {
      if (
        conv.classList.contains(ARCHIVED_CLASS) ||
        this.actionsContainerOf(conv)?.classList.contains(ARCHIVED_ACTIONS_CLASS)
      ) {
        this.setArchived(conv, false);
      }
      return;
    }
    this.setArchived(conv, this.options.isInFolders(extractConversationId(conv), pass));
  }

  /** Shows a hidden row while its native menu is used; the returned function hides it again. */
  reveal(conversationEl: HTMLElement): () => void {
    const wasArchived = conversationEl.classList.contains(ARCHIVED_CLASS);
    const actionsContainer = this.actionsContainerOf(conversationEl);
    const wereActionsArchived =
      actionsContainer?.classList.contains(ARCHIVED_ACTIONS_CLASS) ?? false;
    if (!wasArchived && !wereActionsArchived) return () => {};

    conversationEl.classList.remove(ARCHIVED_CLASS);
    actionsContainer?.classList.remove(ARCHIVED_ACTIONS_CLASS);
    return () => {
      if (this.options.isHidingArchived()) this.setArchived(conversationEl, true);
    };
  }

  private setArchived(conv: HTMLElement, isArchived: boolean): void {
    conv.classList.toggle(ARCHIVED_CLASS, isArchived);
    this.actionsContainerOf(conv)?.classList.toggle(ARCHIVED_ACTIONS_CLASS, isArchived);
  }

  /**
   * `.conversation-actions-container` only exists in Gemini's legacy sidebar
   * layout (lr26 renders the actions button INSIDE the conversation host).
   * Probing per row turned every sidebar-open burst into an O(N²) scan —
   * issue #753 — so probe the root once and cache the answer briefly.
   */
  private hasLegacyActionsContainer(): boolean {
    const now = performance.now();
    if (this.legacyActionsProbe && now - this.legacyActionsProbe.at < LEGACY_ACTIONS_PROBE_TTL_MS) {
      return this.legacyActionsProbe.present;
    }
    const present =
      getNativeConversationRoot(this.options.getSidebar()).querySelector(
        '.conversation-actions-container',
      ) !== null;
    this.legacyActionsProbe = { present, at: now };
    return present;
  }

  private actionsContainerOf(conversationEl: HTMLElement): HTMLElement | null {
    // When no legacy actions container exists anywhere under the conversation
    // root, neither the sibling walk nor the parent querySelector below can
    // match — skip both (issue #753).
    if (!this.hasLegacyActionsContainer()) return null;

    const parent = conversationEl.parentElement;
    if (!parent) return null;

    let sibling = conversationEl.nextElementSibling;
    while (sibling) {
      if (
        sibling instanceof HTMLElement &&
        sibling.classList.contains('conversation-actions-container')
      ) {
        return sibling;
      }
      sibling = sibling.nextElementSibling;
    }

    return parent.querySelector<HTMLElement>('.conversation-actions-container');
  }
}
