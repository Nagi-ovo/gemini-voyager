/**
 * Claude's sidebar as observed live (2026-10-19), reduced to the attributes
 * the folders read: test ids, row keys, router links, the row's menu trigger,
 * and the Base UI row menu portaled to `body`. Classes are left out on
 * purpose: nothing may depend on them.
 */
export interface ClaudeRow {
  readonly id: string;
  readonly title: string;
}

export function claudeRows(count: number, from = 0): ClaudeRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `0000000${from + i}-f3df-4f6e-b536-f875148e3766`,
    title: `Chat ${from + i}`,
  }));
}

function row({ id, title }: ClaudeRow): string {
  return `<div data-row-key="chat:${id}"><div><div id="base-ui-row-${id}"><div data-row>
    <a href="/chat/${id}" draggable="false" data-row-main-button><span data-row-label="iconless"><span dir="auto">${title}</span></span></a>
    <div><button type="button" id="trigger-${id}" aria-haspopup="menu" aria-expanded="false" data-row-action aria-label="More options for ${title}"></button></div>
  </div></div></div></div>`;
}

export interface ClaudeSidebarFixture {
  readonly sidebar: HTMLElement;
  readonly recents: HTMLElement;
  /** Opens conversation `id`'s row menu as Base UI does: portaled, labelled by the trigger. */
  openMenu(id: string): HTMLElement;
  /** Marks conversation `id` as the open one. */
  setCurrent(id: string): void;
  destroy(): void;
}

const MENU_ITEMS = [
  ['star-chat-trigger', 'Pin', 'P', false],
  ['toggle-chat-read-trigger', 'Mark as unread', 'U', false],
  ['rename-chat-trigger', 'Rename', 'R', false],
  ['move-to-project-trigger', 'Add to project', '', true],
  ['move-to-group-trigger', 'Move to group', '', true],
  ['delete-chat-trigger', 'Delete', 'D', false],
] as const;

function menuMarkup(): string {
  return MENU_ITEMS.map(
    ([testid, label, key, submenu]) =>
      `<div role="menuitem" tabindex="-1" data-testid="${testid}" data-cds-icon-row${submenu ? ' aria-haspopup="menu"' : ''}${key ? ` aria-keyshortcuts="${key.toLowerCase()}"` : ''}><span><span data-cds="Icon" aria-hidden="true" style="font-size: 16px"></span></span><span>${label}</span>${key ? `<span aria-hidden="true" data-cds="Shortcut"><kbd>${key}</kbd></span>` : ''}</div>`,
  ).join('');
}

export function mountClaudeSidebar(
  pinned: readonly ClaudeRow[],
  recents: readonly ClaudeRow[],
): ClaudeSidebarFixture {
  const aside = document.createElement('aside');
  aside.setAttribute('aria-label', 'Sidebar');
  aside.innerHTML = `<div data-testid="sidebar"><div><div data-mode="cowork">
    <div data-testid="sidebar-pinned">${pinned.map(row).join('')}</div>
    <div data-testid="sidebar-recents"><div><div data-row-key="label:recents"><span data-group-name>Recents</span></div>${recents.map(row).join('')}</div></div>
  </div></div></div>`;
  document.body.append(aside);
  const sidebar = aside.querySelector<HTMLElement>('[data-testid="sidebar"]')!;
  return {
    sidebar,
    recents: aside.querySelector<HTMLElement>('[data-testid="sidebar-recents"]')!,
    openMenu(id) {
      const trigger = document.getElementById(`trigger-${id}`)!;
      trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      const portal = document.createElement('div');
      portal.setAttribute('data-base-ui-portal', '');
      portal.innerHTML = `<div role="presentation"><div role="menu" data-open aria-labelledby="trigger-${id}"><div data-cds-sheet-scroll>${menuMarkup()}</div></div></div>`;
      document.body.append(portal);
      const menu = portal.querySelector<HTMLElement>('[role="menu"]')!;
      menu.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        menu.removeAttribute('data-open');
        menu.setAttribute('data-closed', '');
        trigger.focus();
      });
      return menu;
    },
    setCurrent(id) {
      for (const link of aside.querySelectorAll('a[aria-current]'))
        link.removeAttribute('aria-current');
      aside.querySelector(`a[href="/chat/${id}"]`)?.setAttribute('aria-current', 'page');
    },
    destroy() {
      aside.remove();
    },
  };
}
