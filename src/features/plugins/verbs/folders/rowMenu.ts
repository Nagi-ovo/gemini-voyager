/**
 * "Move to folder" in a site's own sidebar row menu, from the `rowMenu` part of
 * its `folders` section (`sites/sections/foldersData.ts`): the row's menu
 * `trigger` (inside a row), the open `menu` (anywhere in the page) and its
 * `item`s, the `template` item the entry is cloned from (else the first one
 * without a submenu), where the entry goes (`after`), the site's own wiring
 * attributes to `strip`, and the `iconHolder` whose glyph the folder icon
 * replaces. The entry itself is `moveMenuEntry.ts`'s clone.
 *
 * `open: "press"` (Claude): opening the menu changes nothing in the sidebar
 * (Claude's Base UI trigger keeps `aria-expanded="false"`) and the menu is
 * portaled to `body`, so no sidebar pass sees it open. A press or key inside the
 * sidebar starts a short frame-by-frame look for an open menu labelled by a
 * row's trigger instead. A closed menu may stay mounted and be reused for
 * another row, so an entry is kept only while it names that menu's row.
 * `open: "expanded"` (ChatGPT) and `rename` are not read yet.
 */
import type { ConversationReference } from '@/core/types/folder';
import type { FoldersRowMenu } from '@/features/plugins/sites/sections/foldersData';

import { MenuCloseWait, buildMenuEntry, wireMenuKeyboard } from './moveMenuEntry';
import type { SectionDom } from './sectionDom';
import type { SidebarConversation, SiteMoveMenu, SiteMoveMenuOptions } from './types';

/** Frames to look for the menu a press in the sidebar opens. */
const MENU_WAIT_FRAMES = 20;
const OPENING_EVENTS = ['pointerdown', 'keydown', 'contextmenu'] as const;
const SUBMENU_ITEM = '[aria-haspopup]';

/** What a row menu needs of its site besides the `rowMenu` recipe. */
export interface RowMenuSite {
  readonly dom: Pick<SectionDom, 'find' | 'rowOf' | 'title'>;
  /** Marks an entry; its value is the bare id of the row it files. */
  readonly entryAttribute: string;
  /** The stored folder id of a bare route id. */
  storedId(id: string): string;
}

interface OpenRowMenu {
  readonly menu: HTMLElement;
  readonly trigger: HTMLElement;
  readonly row: SidebarConversation;
}

/** `menu`'s own items, in order, leaving out those of a submenu inside it. */
function itemsOf(menu: HTMLElement, selector: string): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>(selector)].filter((item) => {
    const nested = item.parentElement?.closest('[role="menu"]');
    return !nested || nested === menu || nested.contains(menu);
  });
}

/** Closes a menu with the Escape its library listens for, which returns focus to its trigger. */
function closeMenu(menu: HTMLElement): void {
  menu.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
}

/** A cloned item's keyboard shortcut is the template's, never the entry's. */
function dropShortcuts(entry: HTMLElement): void {
  for (const key of entry.querySelectorAll('kbd')) {
    // Its holder goes too, once nothing is left in it (`buildMenuEntry` dropped the key's text).
    const holder = key.closest('[aria-hidden="true"]');
    const empty = holder && holder !== entry && !holder.textContent?.trim();
    (empty && !holder.querySelector('svg') ? holder : key).remove();
  }
}

/**
 * The site sizes its own glyph through `holder` (Claude's `[data-cds="Icon"]`
 * span, from its font size); the folder icon takes that size in its place.
 */
function fitIcon(entry: HTMLElement, holderSelector: string, doc: Document): void {
  const holder = entry.querySelector<HTMLElement>(holderSelector);
  const icon = entry.querySelector('svg');
  if (!holder || !icon) return;
  const span = doc.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  span.setAttribute('style', holder.getAttribute('style') ?? '');
  span.style.display = 'inline-flex';
  icon.setAttribute('width', '1em');
  icon.setAttribute('height', '1em');
  span.append(icon);
  holder.replaceWith(span);
}

/** Where the entry goes among `items`; `null` when the menu has none. */
function placementOf(spec: FoldersRowMenu, items: readonly HTMLElement[]): HTMLElement | null {
  const submenus = items.filter((item) => item.matches(SUBMENU_ITEM));
  const last = items.at(-1) ?? null;
  if (spec.after === 'firstSubmenu') return submenus[0] ?? last;
  if (spec.after === 'lastSubmenu') return submenus.at(-1) ?? last;
  return last;
}

/** A row menu that opens without any sidebar change; see the header. */
class PressRowMenu implements SiteMoveMenu {
  private readonly closeWait: MenuCloseWait;
  private frame: number | null = null;
  private framesLeft = 0;
  private listening = false;
  /** Entries this menu added, each with the removal of its listener on the site's menu. */
  private readonly entries = new Map<Element, () => void>();

  constructor(
    private readonly spec: FoldersRowMenu,
    private readonly site: RowMenuSite,
    private readonly options: SiteMoveMenuOptions,
    private readonly doc: Document,
  ) {
    this.closeWait = new MenuCloseWait(doc);
  }

  /** The sidebar is (re)found; listen for presses that may open a row menu. */
  check(sidebar: HTMLElement | null): boolean {
    if (sidebar && !this.listening) {
      this.listening = true;
      for (const type of OPENING_EVENTS) this.doc.addEventListener(type, this.onPress, true);
    }
    return false;
  }

  dispose(): void {
    this.closeWait.cancel();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.listening) {
      for (const type of OPENING_EVENTS) this.doc.removeEventListener(type, this.onPress, true);
      this.listening = false;
    }
    for (const entry of this.entries.keys()) this.drop(entry);
  }

  /** Removes `entry` and, when it is one of ours, its listener on the menu the site keeps. */
  private drop(entry: Element): void {
    this.entries.get(entry)?.();
    this.entries.delete(entry);
    entry.remove();
  }

  private readonly onPress = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node) || !this.site.dom.find(this.doc)?.contains(target)) return;
    this.framesLeft = MENU_WAIT_FRAMES;
    if (this.frame === null) this.frame = requestAnimationFrame(this.look);
  };

  private readonly look = (): void => {
    this.frame = null;
    let injected = false;
    if (this.options.canFile()) {
      for (const open of this.openMenus()) injected = this.inject(open) || injected;
    }
    this.framesLeft -= 1;
    if (!injected && this.framesLeft > 0) this.frame = requestAnimationFrame(this.look);
  };

  /**
   * Every open row menu: the menu, the trigger it is labelled by, and the
   * conversation whose sidebar row holds that trigger. Any other menu (a
   * Project's, a group's, the account menu) is left out.
   */
  private openMenus(): OpenRowMenu[] {
    const open: OpenRowMenu[] = [];
    for (const menu of this.doc.querySelectorAll<HTMLElement>(this.spec.menu)) {
      const ids = (menu.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
      for (const id of ids) {
        const trigger = this.doc.getElementById(id);
        const row = trigger?.matches(this.spec.trigger)
          ? this.site.dom.rowOf(trigger, this.doc)
          : null;
        if (trigger && row) {
          open.push({ menu, trigger, row });
          break;
        }
      }
    }
    return open;
  }

  /** Adds the entry to `menu` unless it already holds one for this row; true once it has one. */
  private inject({ menu, trigger, row }: OpenRowMenu): boolean {
    const { entryAttribute } = this.site;
    for (const stale of menu.querySelectorAll(`[${entryAttribute}]`)) {
      if (stale.getAttribute(entryAttribute) === row.id) return true;
      this.drop(stale);
    }
    const items = itemsOf(menu, this.spec.item);
    const template =
      (this.spec.template ? items.find((item) => item.matches(this.spec.template!)) : undefined) ??
      items.find((item) => !item.matches(SUBMENU_ITEM));
    const anchor = placementOf(this.spec, items);
    if (!template || !anchor) return false;

    const conversation: ConversationReference = {
      conversationId: this.site.storedId(row.id),
      title: this.site.dom.title(row) || this.options.untitled(),
      url: `${this.doc.location.origin}${row.path}`,
      addedAt: 0,
    };
    const entry = buildMenuEntry(
      template,
      this.options.label(),
      entryAttribute,
      this.spec.strip ?? [],
    );
    entry.setAttribute(entryAttribute, row.id);
    dropShortcuts(entry);
    if (this.spec.iconHolder) fitIcon(entry, this.spec.iconHolder, this.doc);
    const activate = (): void => {
      closeMenu(menu);
      this.closeWait.run(trigger, () =>
        this.options.onMove({ ...conversation, addedAt: Date.now() }),
      );
    };
    entry.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      activate();
    });
    this.entries.set(
      entry,
      wireMenuKeyboard(menu, entry, () => itemsOf(menu, this.spec.item), activate),
    );
    anchor.after(entry);
    return true;
  }
}

/** The row menu `spec` describes, or `null` for a way of opening not read yet. */
export function createRowMenu(
  spec: FoldersRowMenu,
  site: RowMenuSite,
  options: SiteMoveMenuOptions,
  doc: Document = document,
): SiteMoveMenu | null {
  return spec.open === 'press' ? new PressRowMenu(spec, site, options, doc) : null;
}
