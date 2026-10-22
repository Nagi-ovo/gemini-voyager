/**
 * ChatGPT's sidebar as it rendered on 2026-10-01, rebuilt from a sanitized live
 * capture: classes, styles and SVG paths dropped, titles replaced and ids
 * randomized. Only the structure, roles and `data-*`/`aria-*` attributes are kept.
 *
 * Observed live:
 * - Two `nav[aria-label]`: the 52px app rail (no conversations) and the sidebar,
 *   which holds `[data-app-action-sidebar-scroll]`.
 * - Recents is `[data-chatgpt-project-conversation-drop-target]` >
 *   `[data-sidebar-project-container-id="chats"]` > `section` > `[role=list]`; each
 *   row a `[role=listitem]` keyed `data-sidebar-chatgpt-conversation-key`.
 * - Older history loads in pages of 10 rows appended to the same list; nothing
 *   unmounts. The row link is `draggable="false"`.
 * - (2026-10-03) Rows are dnd-kit draggables, which is how a chat is dragged into
 *   a Project. That drag runs on pointer events. While it runs, dnd-kit cancels
 *   any HTML5 `dragstart` on the window, and the sidebar scroll area gets
 *   `pointer-events: none`. The fixture leaves dnd-kit out.
 * - "Chat actions" opens a Radix menu portaled under `body`, labelled by its trigger.
 *
 * Modelled, not captured: the trigger opens its menu on a primary pointerdown
 * (Radix's documented trigger), and Rename closes the menu and, a frame later,
 * puts a focused name field in the row that saves on Enter or blur and cancels
 * on Escape.
 * Project rows were not observable (the account had none); tests give a row a
 * Project route with `move`, which only changes its link.
 */

export interface FixtureRow {
  readonly id: string;
  readonly title: string;
  /** Defaults to `/c/<id>`. */
  readonly path?: string;
}

let triggerCount = 0;

function el(tag: string, attrs: Record<string, string> = {}, ...children: Node[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function icon(): Element {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  return svg;
}

function button(label: string, attrs: Record<string, string> = {}): HTMLElement {
  return el('button', { type: 'button', 'aria-label': label, ...attrs }, el('span', {}, icon()));
}

/** One Recents row, as captured. */
export function buildRow({ id, title, path = `/c/${id}` }: FixtureRow): HTMLElement {
  const text = el('span', {}, document.createTextNode(title));
  const link = el(
    'a',
    {
      draggable: 'false',
      'data-interactive-row-link': 'true',
      'aria-label': title,
      href: path,
      'data-discover': 'true',
    },
    el(
      'span',
      { 'data-thread-title': 'true', 'data-marquee-text': 'true', draggable: 'false' },
      el(
        'span',
        {},
        el(
          'span',
          {},
          el('span', { 'data-marquee-content': 'true' }, el('span', { dir: 'auto' }, text)),
        ),
      ),
    ),
  );
  const actions = el(
    'div',
    { 'data-hover-card-open-immediately': 'true' },
    el(
      'div',
      {},
      el(
        'div',
        { role: 'presentation' },
        button('Chat actions', {
          'aria-haspopup': 'menu',
          'aria-expanded': 'false',
          id: `radix-trigger-${++triggerCount}`,
          'data-state': 'closed',
        }),
      ),
      el('span', { 'data-state': 'closed' }, button('Pin chat')),
    ),
  );
  const group = el(
    'div',
    { 'aria-label': title, role: 'group' },
    el(
      'div',
      {},
      el('div', {}, el('div', { 'data-thread-title-trigger': 'true' }, link)),
      el('div'),
    ),
    actions,
  );
  return el(
    'div',
    { 'data-sidebar-chatgpt-conversation-key': `chatgpt:conversation:${id}`, role: 'listitem' },
    el('div', {}, group),
  );
}

function section(heading: string, body: HTMLElement): HTMLElement {
  return el(
    'section',
    {
      'data-app-action-sidebar-section': '',
      'data-app-action-sidebar-section-collapsed': 'false',
      'data-app-action-sidebar-section-heading': heading,
    },
    el(
      'div',
      {},
      el(
        'div',
        { 'aria-expanded': 'false', 'data-state': 'closed' },
        el(
          'button',
          {
            'data-app-action-sidebar-section-toggle': '',
            'aria-roledescription': 'sortable',
            type: 'button',
          },
          el('span', {}, document.createTextNode(heading)),
        ),
      ),
      el(
        'div',
        { 'aria-hidden': 'false' },
        el('div', {}, el('div', { 'data-appearance': 'plain' }, body)),
      ),
    ),
  );
}

function recentsList(rows: readonly FixtureRow[]): HTMLElement {
  return el('div', { role: 'list', tabindex: '-1' }, ...rows.map(buildRow));
}

function buildSidebar(rows: readonly FixtureRow[]): HTMLElement {
  const projects = section(
    'Projects',
    el(
      'div',
      { role: 'list', tabindex: '-1' },
      el('div', { role: 'listitem' }, document.createTextNode('No projects')),
    ),
  );
  const recents = el(
    'div',
    { 'data-chatgpt-project-conversation-drop-target': '' },
    el(
      'div',
      { 'data-sidebar-project-container-id': 'chats' },
      section('Recents', recentsList(rows)),
    ),
  );
  return el(
    'nav',
    { role: 'navigation', 'aria-label': 'Home' },
    el(
      'div',
      {},
      el(
        'div',
        {},
        el('a', { 'aria-label': 'Home', href: '/' }),
        button('Toggle sidebar', { 'aria-controls': 'app-shell-sidebar', 'aria-expanded': 'true' }),
      ),
      el(
        'div',
        { 'data-appearance': 'plain' },
        el('button', { type: 'button' }, document.createTextNode('New chat')),
      ),
    ),
    el(
      'div',
      { 'data-app-action-sidebar-scroll': '' },
      el('div', {}, el('div', {}, el('div', {}, projects), recents)),
    ),
  );
}

/** The "Chat actions" menu as captured; `null` is a separator. */
const MENU_ITEMS: readonly (string | null)[] = [
  'Rename',
  'Pin',
  'Move to project',
  null,
  'Share',
  null,
  'Archive',
  'Delete',
];

function menuItem(label: string): HTMLElement {
  const submenu = label === 'Move to project';
  return el(
    'div',
    {
      class: 'gv-test-native-menu-item',
      role: 'menuitem',
      tabindex: '-1',
      'data-orientation': 'vertical',
      'data-radix-collection-item': '',
      ...(submenu
        ? { 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-state': 'closed' }
        : {}),
    },
    el(
      'div',
      { 'data-menu-row-content': 'true' },
      el(
        'span',
        {},
        el(
          'span',
          {},
          el('span', {}, el('span', { 'aria-hidden': 'true' }, icon())),
          el('span', {}, document.createTextNode(label)),
        ),
      ),
    ),
  );
}

export interface SidebarFixture {
  readonly rail: HTMLElement;
  /** The sidebar `nav`; `replaceSidebar` swaps it. */
  sidebar: HTMLElement;
  list(): HTMLElement;
  rowIds(): string[];
  row(id: string): HTMLElement;
  /** The next page of older history, appended to the same list. */
  appendPage(rows: readonly FixtureRow[]): void;
  /** React re-rendering one row's title in place. */
  rename(id: string, title: string): void;
  /** React re-rendering a row under a new route (moved into a Project). */
  move(id: string, path: string): void;
  setActive(id: string | null): void;
  /** React remounting the Recents list with the same rows. */
  rerenderList(): void;
  /** React remounting the whole sidebar, which drops anything injected into it. */
  replaceSidebar(): HTMLElement;
  removeSidebar(): void;
  /** Opens a row's "Chat actions" Radix menu in a portal under `body`. */
  /**
   * Opens a row's "Chat actions" menu. `exitFrames` keeps a closed menu mounted
   * for that many frames, as Radix does while an exit animation runs.
   */
  openMenu(id: string, options?: { exitFrames?: number }): HTMLElement;
  /** ChatGPT's own name field, while a row is being renamed. */
  nameField(): HTMLInputElement | null;
  destroy(): void;
}

export interface SidebarFixtureOptions {
  /** The "Chat actions" menu's items in order, for a build that orders them differently. */
  readonly menuItems?: readonly (string | null)[];
}

export function mountSidebarFixture(
  rows: readonly FixtureRow[],
  { menuItems = MENU_ITEMS }: SidebarFixtureOptions = {},
): SidebarFixture {
  const rail = el(
    'nav',
    { role: 'navigation', 'aria-label': 'App navigation' },
    el('a', { href: '/' }),
  );
  const current: FixtureRow[] = [...rows];
  const portals: HTMLElement[] = [];
  let active: string | null = null;
  const fixture: SidebarFixture = {
    rail,
    sidebar: buildSidebar(current),
    list: () =>
      fixture.sidebar.querySelector<HTMLElement>(
        '[data-sidebar-project-container-id="chats"] [role="list"]',
      )!,
    rowIds: () =>
      [...fixture.list().querySelectorAll('[data-sidebar-chatgpt-conversation-key]')].map((row) =>
        row
          .getAttribute('data-sidebar-chatgpt-conversation-key')!
          .replace('chatgpt:conversation:', ''),
      ),
    row: (id) =>
      fixture.sidebar.querySelector<HTMLElement>(
        `[data-sidebar-chatgpt-conversation-key="chatgpt:conversation:${id}"]`,
      )!,
    appendPage(page) {
      current.push(...page);
      fixture.list().append(...page.map(buildRow));
    },
    rename(id, title) {
      const row = fixture.row(id);
      row.querySelector('[role="group"]')!.setAttribute('aria-label', title);
      const link = row.querySelector('a')!;
      link.setAttribute('aria-label', title);
      link.querySelector('[dir="auto"] > span')!.firstChild!.nodeValue = title;
    },
    move(id, path) {
      fixture.row(id).querySelector('a')!.setAttribute('href', path);
    },
    setActive(id) {
      active = id;
      for (const node of fixture.sidebar.querySelectorAll('[aria-current]'))
        node.removeAttribute('aria-current');
      if (!id) return;
      const row = fixture.row(id);
      row.querySelector('[role="group"]')!.setAttribute('aria-current', 'page');
      row.querySelector('a')!.setAttribute('aria-current', 'page');
    },
    rerenderList() {
      const list = fixture.list();
      list.replaceWith(recentsList(current));
      if (active) fixture.setActive(active);
    },
    replaceSidebar() {
      const next = buildSidebar(current);
      fixture.sidebar.replaceWith(next);
      fixture.sidebar = next;
      if (active) fixture.setActive(active);
      return next;
    },
    removeSidebar() {
      fixture.sidebar.remove();
    },
    openMenu(id, { exitFrames = 0 } = {}) {
      const trigger = fixture.row(id).querySelector<HTMLElement>('button[aria-haspopup="menu"]')!;
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('data-state', 'open');
      const menu = el(
        'div',
        {
          role: 'menu',
          'data-state': 'open',
          'data-radix-menu-content': '',
          'aria-labelledby': trigger.id,
          tabindex: '-1',
        },
        ...menuItems.map((label) => (label ? menuItem(label) : el('div', {}, el('div')))),
      );
      const close = (): void => {
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('data-state', 'closed');
      };
      const portal = el(
        'div',
        {},
        el('div', {}, el('div', { 'data-radix-popper-content-wrapper': '' }, menu)),
      );
      // Radix (observed live): Escape unmounts the menu, then returns focus to
      // the trigger a task later. Any item but Rename does the same here.
      for (const item of menu.querySelectorAll('[role="menuitem"]:not([aria-haspopup])')) {
        item.addEventListener('click', () => {
          close();
          portal.remove();
          if (item.textContent === 'Rename') requestAnimationFrame(() => startRename(id));
          else setTimeout(() => trigger.focus(), 0);
        });
      }
      menu.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        close();
        const unmount = (framesLeft: number): void => {
          if (framesLeft > 0) {
            requestAnimationFrame(() => unmount(framesLeft - 1));
            return;
          }
          portal.remove();
          setTimeout(() => trigger.focus(), 0);
        };
        unmount(exitFrames);
      });
      document.body.append(portal);
      portals.push(portal);
      return menu;
    },
    nameField: () => document.querySelector<HTMLInputElement>('input[data-gv-test-name-field]'),
    destroy() {
      document.removeEventListener('pointerdown', onPointerDown, true);
      rail.remove();
      fixture.sidebar.remove();
      for (const portal of portals) portal.remove();
    },
  };
  function startRename(id: string): void {
    const row = fixture.row(id);
    const field = el('input', {
      type: 'text',
      'data-gv-test-name-field': '',
      value: row.querySelector('a')!.textContent ?? '',
    }) as HTMLInputElement;
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      field.remove();
      if (save && field.value.trim()) fixture.rename(id, field.value.trim());
    };
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Escape') finish(event.key === 'Enter');
    });
    field.addEventListener('blur', () => finish(true));
    row.querySelector('[role="group"]')!.append(field);
    field.focus();
  }
  function onPointerDown(event: Event): void {
    const trigger = (event.target as Element).closest?.('button[aria-haspopup="menu"]');
    const key = trigger
      ?.closest('[data-sidebar-chatgpt-conversation-key]')
      ?.getAttribute('data-sidebar-chatgpt-conversation-key');
    if (!key || !(event instanceof MouseEvent) || event.button !== 0) return;
    fixture.openMenu(key.replace('chatgpt:conversation:', ''));
  }
  document.addEventListener('pointerdown', onPointerDown, true);
  document.body.append(rail, fixture.sidebar);
  return fixture;
}

/** `count` rows with distinct ids and titles, starting at `from`. */
export function makeRows(count: number, from = 0): FixtureRow[] {
  return Array.from({ length: count }, (_, index) => {
    const n = from + index;
    const hex = n.toString(16).padStart(12, '0');
    return { id: `6a0f${hex.slice(0, 4)}-1c2d-4e5f-8a9b-${hex}`, title: `Conversation ${n + 1}` };
  });
}
