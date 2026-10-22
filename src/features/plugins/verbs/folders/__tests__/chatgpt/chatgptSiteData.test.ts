// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
/**
 * What the `folders` section of ChatGPT's site.json finds on ChatGPT's page:
 * the sidebar, its conversation rows, the section's place, the open
 * conversation and its title, and opening a filed chat inside the app.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationReference } from '@/core/types/folder';

import type { SiteFoldersAdapter } from '../../types';
import { type SidebarFixture, makeRows, mountSidebarFixture } from './chatgptSidebarFixture';
import { chatgptSite } from './chatgptSite';

const [A, B] = makeRows(2).map((row) => row.id);

function entry(url: string): ConversationReference {
  return { conversationId: 'x', title: 't', url, addedAt: 1 };
}

/**
 * A stand-in for ChatGPT's client router: it renders on `popstate` and
 * intercepts clicks on its own links, as React Router does. It records every
 * route it renders.
 */
function installRouter(): { routes: string[]; dispose: () => void } {
  const routes: string[] = [];
  const onPop = () => routes.push(location.pathname);
  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element).closest('a[href]');
    if (!(link instanceof HTMLAnchorElement) || link.target === '_blank') return;
    event.preventDefault();
    history.pushState({ idx: 1 }, '', link.pathname);
    routes.push(location.pathname);
  };
  window.addEventListener('popstate', onPop);
  document.addEventListener('click', onClick);
  return {
    routes,
    dispose: () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick);
    },
  };
}

let site: SiteFoldersAdapter;
let fixture: SidebarFixture | null = null;
let router: ReturnType<typeof installRouter>;

beforeEach(() => {
  history.replaceState(null, '', '/');
  document.title = 'ChatGPT';
  document.documentElement.lang = 'en-US';
  site = chatgptSite();
  router = installRouter();
});

afterEach(() => {
  router.dispose();
  fixture?.destroy();
  fixture = null;
  document.body.replaceChildren();
});

describe("ChatGPT's sidebar", () => {
  it('is the nav with the scroll area, not the app rail that is also a labelled nav', () => {
    fixture = mountSidebarFixture(makeRows(3));
    expect(document.querySelector('nav[aria-label]')).toBe(fixture.rail);
    expect(site.sidebar.find()).toBe(fixture.sidebar);
  });

  it('is missing while ChatGPT renders none', () => {
    fixture = mountSidebarFixture(makeRows(3));
    fixture.removeSidebar();
    expect(site.sidebar.find()).toBeNull();
  });

  it('lists conversation rows by their links, with ids, Project routes and titles', () => {
    const rows = makeRows(3);
    fixture = mountSidebarFixture(rows);
    fixture.move(rows[1].id, `/g/g-p-67ab12cd34-trip/c/${rows[1].id}`);

    const listed = site.sidebar.list(fixture.sidebar);

    expect(listed.map((row) => row.id)).toEqual(rows.map((row) => row.id));
    expect(listed[1].path).toBe(`/g/g-p-67ab12cd34-trip/c/${rows[1].id}`);
    expect(listed.map((row) => site.sidebar.title(row))).toEqual([
      'Conversation 1',
      'Conversation 2',
      'Conversation 3',
    ]);
  });

  it('leaves out a link that opens elsewhere', () => {
    fixture = mountSidebarFixture(makeRows(1));
    const extra = document.createElement('div');
    extra.setAttribute('role', 'listitem');
    extra.innerHTML = `<a href="/c/${B}" target="_blank">Elsewhere</a>`;
    fixture.list().append(extra);

    expect(site.sidebar.list(fixture.sidebar)).toHaveLength(1);
  });

  it('places the folder section before Recents, outside its Project drop target', () => {
    fixture = mountSidebarFixture(makeRows(2));
    const anchor = site.section.anchor(fixture.sidebar);

    expect(anchor?.matches('[data-chatgpt-project-conversation-drop-target]')).toBe(true);
    expect(anchor?.contains(fixture.list())).toBe(true);
  });
});

describe('the open ChatGPT conversation', () => {
  it('is filed under its bare id, keeping its Project route and its title', () => {
    fixture = mountSidebarFixture([{ id: A, title: 'Trip plan' }]);
    fixture.move(A, `/g/g-p-abc/c/${A}`);
    history.replaceState(null, '', `/g/g-p-abc/c/${A}?model=gpt-5`);
    document.title = 'Trip plan';

    expect(site.page.current('Untitled')).toMatchObject({
      conversationId: `chatgpt:conv:${A}`,
      title: 'Trip plan',
      url: `https://chatgpt.com/g/g-p-abc/c/${A}`,
    });
  });

  it('takes the tab title while the sidebar lists no row for it, then the untitled label', () => {
    history.replaceState(null, '', `/c/${A}`);
    document.title = 'From the tab';
    expect(site.page.current('Untitled')?.title).toBe('From the tab');
    document.title = 'New chat';
    expect(site.page.current('Untitled')?.title).toBe('Untitled');
  });

  it.each([
    ['the home page', '/'],
    ['a temporary chat', `/c/${A}?temporary-chat=true`],
    ['a Project overview', '/g/g-p-abc/project'],
  ])('is nothing on %s', (_name, path) => {
    history.replaceState(null, '', path);
    expect(site.page.current('Untitled')).toBeNull();
  });
});

describe("ChatGPT's placeholder titles", () => {
  it("are the page language's own, and ChatGPT's name in any language", () => {
    document.documentElement.lang = 'zh-CN';
    expect(site.page.isPlaceholderTitle('新聊天')).toBe(true);
    expect(site.page.isPlaceholderTitle('ChatGPT')).toBe(true);
    // A chat on a Chinese page may really be named "New chat".
    expect(site.page.isPlaceholderTitle('New chat')).toBe(false);
  });

  it("are English ones on a page whose language ChatGPT's list does not name", () => {
    document.documentElement.lang = 'sw';
    expect(site.page.isPlaceholderTitle('New chat')).toBe(true);
    document.documentElement.lang = '';
    expect(site.page.isPlaceholderTitle('New chat')).toBe(true);
  });
});

describe('opening a filed ChatGPT chat', () => {
  it('pushes its path for the router to render when the sidebar has no link for it', () => {
    site.page.open(entry(`https://chatgpt.com/g/g-p-abc/c/${A}`));

    expect(location.href).toBe(`https://chatgpt.com/g/g-p-abc/c/${A}`);
    expect(router.routes).toEqual([`/g/g-p-abc/c/${A}`]);
  });

  it("clicks ChatGPT's own sidebar link for it, under whatever route it lives now", () => {
    fixture = mountSidebarFixture([
      { id: B, title: 'Other' },
      { id: A, title: 'Trip plan' },
    ]);
    fixture.move(A, `/g/g-p-abc/c/${A}`);
    const popstate = vi.fn();
    window.addEventListener('popstate', popstate);

    site.page.open(entry(`https://chatgpt.com/c/${A}`));
    window.removeEventListener('popstate', popstate);

    expect(router.routes).toEqual([`/g/g-p-abc/c/${A}`]);
    expect(popstate).not.toHaveBeenCalled();
  });

  it('opens a chat filed on chat.openai.com in this page', () => {
    site.page.open(entry(`https://chat.openai.com/c/${A}`));
    expect(location.href).toBe(`https://chatgpt.com/c/${A}`);
  });

  it('never clicks a link to it inside a message', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<main><a href="https://chatgpt.com/c/${A}">Linked in a message</a></main>`,
    );
    const clicked = vi.fn((event: Event) => event.preventDefault());
    document.querySelector('main a')!.addEventListener('click', clicked);

    site.page.open(entry(`https://chatgpt.com/c/${A}`));

    expect(clicked).not.toHaveBeenCalled();
    expect(router.routes).toEqual([`/c/${A}`]);
  });

  it('stays put on the chat already open, and refuses another site’s entry', () => {
    history.replaceState(null, '', `/c/${A}`);
    const pushState = vi.spyOn(history, 'pushState');
    site.page.open(entry(`https://chatgpt.com/c/${A}`));
    site.page.open(entry('https://gemini.google.com/app/abc'));
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });
});
