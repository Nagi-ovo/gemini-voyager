/**
 * What a site's folders put in the page belongs to the runtime that put it
 * there. When the plugin goes off and on, a stopping runtime's teardown can
 * run beside its successor; it must take down only its own button, picker,
 * hidden-row marks and menu listener, never the successor's.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { FLOATING_FAB_CLASS, createFloatingFab } from '@/pages/content/folder/floatingModeFab';

import { FOLDER_PICKER_CLASS, openFolderPicker } from '../folderPicker';
import { SidebarHideFiled } from '../hideFiled';
import { wireMenuKeyboard } from '../moveMenuEntry';
import type { HideFiledDom, SidebarConversation } from '../types';

const FILED = 'data-gv-test-filed';
const DOM: HideFiledDom = {
  rowSelector: 'a.row',
  filedAttribute: FILED,
  styleAttribute: 'data-gv-test-hide-filed',
  css: `a.row[${FILED}] { display: none !important; }`,
  idPattern: /^[a-z0-9]+$/,
};
const ROWS = {
  list: (root: ParentNode): SidebarConversation[] =>
    [
      ...(root instanceof Element && root.matches('a.row')
        ? [root]
        : root.querySelectorAll('a.row')),
    ]
      .filter((link): link is HTMLAnchorElement => link instanceof HTMLAnchorElement)
      .map((link) => ({ id: link.dataset.id!, path: link.getAttribute('href')!, link })),
};

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('a stopping folders runtime beside its successor', () => {
  it('keeps the rows the successor hid hidden', async () => {
    document.body.innerHTML =
      '<nav><a class="row" data-id="one" href="/c/one">One</a><a class="row" data-id="two" href="/c/two">Two</a></nav>';
    const sidebar = document.querySelector<HTMLElement>('nav')!;
    const stopping = new PluginScope();
    const successor = new PluginScope();
    const old = new SidebarHideFiled(stopping, DOM, ROWS, 'old');
    old.update(['one', 'two']);
    old.sync(sidebar);
    const next = new SidebarHideFiled(successor, DOM, ROWS, 'next');
    next.update(['two']);
    next.sync(sidebar);

    await stopping.dispose();
    next.sync(sidebar);

    expect(document.querySelector('[data-id="one"]')!.hasAttribute(FILED)).toBe(false);
    expect(document.querySelector('[data-id="two"]')!.hasAttribute(FILED)).toBe(true);
    expect(document.querySelectorAll(`[${DOM.styleAttribute}]`)).toHaveLength(1);
    await successor.dispose();
    expect(document.querySelectorAll(`[${FILED}]`)).toHaveLength(0);
  });

  it("keeps the successor's floating button", () => {
    const old = createFloatingFab({ onClick: () => {} });
    const next = createFloatingFab({ onClick: () => {} });

    old.destroy();

    expect([...document.querySelectorAll(`.${FLOATING_FAB_CLASS}`)]).toEqual([next.element]);
    next.destroy();
    expect(document.querySelector(`.${FLOATING_FAB_CLASS}`)).toBeNull();
  });

  it("leaves the successor's open picker open", () => {
    const data = { folders: [], folderContents: {} };
    const old = openFolderPicker(data, () => {});
    openFolderPicker(data, () => {});

    expect(document.querySelectorAll(`.${FOLDER_PICKER_CLASS}`)).toHaveLength(2);
    old.close();
    expect(document.querySelectorAll(`.${FOLDER_PICKER_CLASS}`)).toHaveLength(1);
  });
});

describe('a site row menu reused after the entry left it', () => {
  it('no longer steps the arrow keys into the dropped entry', () => {
    document.body.innerHTML =
      '<div role="menu"><div role="menuitem" tabindex="-1">Rename</div></div>';
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    const rename = menu.querySelector<HTMLElement>('[role="menuitem"]')!;
    const entry = document.createElement('div');
    entry.setAttribute('role', 'menuitem');
    entry.tabIndex = -1;
    rename.after(entry);
    const items = (): HTMLElement[] => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const unwire = wireMenuKeyboard(menu, entry, items, () => {});
    const arrowDown = (): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      });
      rename.dispatchEvent(event);
      return event;
    };

    expect(arrowDown().defaultPrevented).toBe(true);
    unwire();
    expect(arrowDown().defaultPrevented).toBe(false);
  });
});
