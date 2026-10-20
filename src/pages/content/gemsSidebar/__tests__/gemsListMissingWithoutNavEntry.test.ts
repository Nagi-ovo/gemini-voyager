import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { PluginScope } from '@/features/plugins/runtime/pluginScope';

const storageState = vi.hoisted(() => ({
  catalog: [] as Array<{ id: string; href: string; name: string }>,
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: {
        get: vi.fn(async (defaults: Record<string, unknown>) => ({ ...defaults })),
        set: vi.fn(async () => {}),
      },
      local: {
        get: vi.fn(async (key: unknown) => {
          if (key === 'gvGemsListCache') {
            return { [key]: { items: storageState.catalog, cachedAt: 1 } };
          }
          return typeof key === 'object' && key !== null ? key : {};
        }),
        set: vi.fn(async () => {}),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  },
}));

/** The top nav as Gemini renders it once Gems moved into the More popover. */
function topNav(): string {
  return `
    <mat-nav-list class="gds-sidenav-list top-action-list-scrollable top-nav-expanded">
      <gem-nav-list-item data-test-id="library-side-nav-entry-button"></gem-nav-list-item>
      <gem-nav-list-item data-test-id="images-side-nav-entry-button"></gem-nav-list-item>
      <gem-nav-list-item data-test-id="learn-side-nav-entry-button"></gem-nav-list-item>
      <div>
        <gem-nav-list-item data-test-id="overflow-side-nav-entry-button" class="overflow-nav-item">
          <button type="button" aria-haspopup="menu" aria-expanded="false">More</button>
        </gem-nav-list-item>
        <gem-popover data-test-id="overflow-popover-menu"></gem-popover>
      </div>
    </mat-nav-list>`;
}

function mountRedesignedSidebar(): void {
  document.body.innerHTML = `
    <side-navigation-content>
      <div class="sidenav-with-history-container expanded">
        <div data-test-id="overflow-container">
          <div class="top-action-list">
            <mat-nav-list class="gds-sidenav-list">
              <gem-nav-list-item data-test-id="new-chat-button"></gem-nav-list-item>
            </mat-nav-list>
            <mat-nav-list class="gds-sidenav-list top-action-list-pinned top-nav-collapsed">
              <gem-nav-list-item data-test-id="library-side-nav-entry-button"></gem-nav-list-item>
              <gem-nav-list-item data-test-id="images-side-nav-entry-button"></gem-nav-list-item>
            </mat-nav-list>
          </div>
          <infinite-scroller>
            <div class="top-gradient-container"></div>
            ${topNav()}
            <div class="loading-content-spinner-container"></div>
            <expandable-section storagekey="notebooks"></expandable-section>
            <div class="section-divider"></div>
            <expandable-section data-test-id="chats-expandable-section">
              <div class="conversations"></div>
            </expandable-section>
          </infinite-scroller>
        </div>
      </div>
    </side-navigation-content>`;
}

const scrollableNav = () =>
  document.querySelector<HTMLElement>('infinite-scroller > .top-action-list-scrollable')!;
const section = () => document.querySelector<HTMLElement>('.gv-gems-section');
const header = () => section()!.querySelector<HTMLButtonElement>('.gv-gems-section-header')!;
const names = () =>
  Array.from(document.querySelectorAll('.gv-gems-item-name')).map((el) => el.textContent);

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await nextFrame();
}

describe('gems list missing once Gemini moves Gems into the More menu', () => {
  let scope: PluginScope | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.mocked(browser.storage.local.set).mockClear();
    storageState.catalog = [
      { id: 'g1', href: '/gem/g1', name: 'Writer' },
      { id: 'g2', href: '/gem/g2', name: 'Coder' },
    ];
  });

  afterEach(() => {
    void scope?.dispose();
    scope = null;
    document.body.innerHTML = '';
  });

  async function start(): Promise<void> {
    const { activateGeminiGemsSidebar } = await import('../pluginHandler');
    scope = new PluginScope();
    activateGeminiGemsSidebar(scope, { count: 3 });
    for (let i = 0; i < 12; i++) await Promise.resolve();
    await settle();
  }

  it('shows the list in its own section right after the top nav', async () => {
    mountRedesignedSidebar();
    await start();

    expect(scrollableNav().nextElementSibling).toBe(section());
    expect(header().textContent).toBe('Gems');
    expect(header().getAttribute('aria-expanded')).toBe('true');
    expect(names()).toEqual(['Writer', 'Coder']);
    expect(section()!.querySelector<HTMLAnchorElement>('.gv-gems-item')!.href).toBe(
      'https://gemini.google.com/gem/g1',
    );
    // Nothing lands in the More entry, its popover or the pinned copy of the nav.
    expect(document.querySelector('.gv-gems-expand-toggle')).toBeNull();
    expect(document.querySelector('.top-action-list .gv-gems-inline-list')).toBeNull();
    expect(document.querySelector('gem-popover .gv-gems-inline-list')).toBeNull();
  });

  it('collapses and expands the list from its header', async () => {
    mountRedesignedSidebar();
    await start();
    const list = section()!.querySelector('.gv-gems-inline-list')!;

    header().click();
    expect(list.classList.contains('gv-collapsed')).toBe(true);
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(browser.storage.local.set).toHaveBeenCalledWith({ gvGemsSidebarExpanded: false });

    header().click();
    expect(list.classList.contains('gv-collapsed')).toBe(false);
    expect(header().getAttribute('aria-expanded')).toBe('true');
  });

  it('follows Gemini when it re-renders the top nav', async () => {
    mountRedesignedSidebar();
    await start();

    const replacement = document.createElement('template');
    replacement.innerHTML = topNav();
    scrollableNav().replaceWith(replacement.content);
    await settle();

    expect(scrollableNav().nextElementSibling).toBe(section());
    expect(document.querySelectorAll('.gv-gems-section')).toHaveLength(1);
    expect(names()).toEqual(['Writer', 'Coder']);
  });

  it('moves back when Gemini inserts a node between the nav and the section', async () => {
    mountRedesignedSidebar();
    await start();
    const mounted = section();

    scrollableNav().insertAdjacentElement('afterend', document.createElement('div'));
    await settle();

    expect(scrollableNav().nextElementSibling).toBe(mounted);
  });

  it('remounts the section when Gemini removes it', async () => {
    mountRedesignedSidebar();
    await start();

    section()!.remove();
    await settle();

    expect(scrollableNav().nextElementSibling).toBe(section());
    expect(names()).toEqual(['Writer', 'Coder']);
  });

  it('stays put while conversation rows stream in', async () => {
    mountRedesignedSidebar();
    await start();
    const mounted = section();
    const conversations = document.querySelector('.conversations')!;

    for (let i = 0; i < 10; i++) {
      const row = document.createElement('div');
      row.setAttribute('data-test-id', 'conversation');
      conversations.appendChild(row);
      await settle();
    }

    expect(section()).toBe(mounted);
    expect(scrollableNav().nextElementSibling).toBe(mounted);
  });

  it('goes back under a native Gems entry when Gemini shows one again', async () => {
    mountRedesignedSidebar();
    await start();

    const entry = document.createElement('gem-nav-list-item');
    entry.setAttribute('data-test-id', 'gems-side-nav-entry-button');
    Object.defineProperty(entry, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, right: 200, bottom: 40, width: 200, height: 40 }),
    });
    scrollableNav().appendChild(entry);
    await settle();

    expect(section()).toBeNull();
    expect(entry.nextElementSibling?.classList.contains('gv-gems-inline-list')).toBe(true);
    expect(entry.querySelector('.gv-gems-expand-toggle')).not.toBeNull();
    expect(document.querySelectorAll('.gv-gems-inline-list')).toHaveLength(1);
  });

  it('removes the section when the plugin stops', async () => {
    mountRedesignedSidebar();
    await start();
    expect(section()).not.toBeNull();

    await scope!.dispose();
    scope = null;

    expect(section()).toBeNull();
    expect(document.querySelector('.gv-gems-inline-list')).toBeNull();
  });

  it('shows nothing when there are no gems to list', async () => {
    storageState.catalog = [];
    mountRedesignedSidebar();
    await start();

    expect(section()).toBeNull();
    expect(document.querySelector('.gv-gems-inline-list')).toBeNull();
  });
});
