// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationReference } from '@/core/types/folder';

import { openChatGptConversation, readCurrentConversation } from '../chatgptPage';

const A = '68a1f2c3-0b4d-8001-9e2f-1a2b3c4d5e6f';
const B = '68a1f2c3-0b4d-8001-9e2f-aaaaaaaaaaaa';

function entry(path: string): ConversationReference {
  return { conversationId: 'x', title: 't', url: `https://chatgpt.com${path}`, addedAt: 1 };
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
    const link = (event.target as Element).closest('a[data-router-link]');
    if (!(link instanceof HTMLAnchorElement)) return;
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

/** The real window, except that any full-load navigation is recorded instead. */
function guardedWindow() {
  const fullLoads = { assign: vi.fn(), replace: vi.fn(), reload: vi.fn() };
  const win = {
    get location() {
      return { ...fullLoads, href: window.location.href };
    },
    history: window.history,
    dispatchEvent: (event: Event) => window.dispatchEvent(event),
  } as unknown as Window;
  return { win, fullLoads };
}

let router: ReturnType<typeof installRouter>;

beforeEach(() => {
  history.replaceState(null, '', '/');
  document.title = 'ChatGPT';
  router = installRouter();
});

afterEach(() => {
  router.dispose();
  document.body.innerHTML = '';
});

describe('openChatGptConversation', () => {
  it('pushes the path and lets the router render it from popstate when no link is rendered', () => {
    const { win, fullLoads } = guardedWindow();

    expect(openChatGptConversation(entry(`/g/g-p-abc/c/${A}`), document, win)).toBe(true);

    expect(location.href).toBe(`https://chatgpt.com/g/g-p-abc/c/${A}`);
    expect(router.routes).toEqual([`/g/g-p-abc/c/${A}`]);
    expect(fullLoads.assign).not.toHaveBeenCalled();
    expect(fullLoads.replace).not.toHaveBeenCalled();
    expect(fullLoads.reload).not.toHaveBeenCalled();
  });

  it('clicks ChatGPT’s own link for the conversation, even under another route', () => {
    document.body.innerHTML = `
      <nav aria-label="Chat history">
        <a data-router-link href="/c/${B}">Other</a>
        <a data-router-link href="/g/g-p-abc/c/${A}">Trip plan</a>
      </nav>`;
    const { win, fullLoads } = guardedWindow();
    const popstate = vi.fn();
    window.addEventListener('popstate', popstate);

    openChatGptConversation(entry(`/c/${A}`), document, win);
    window.removeEventListener('popstate', popstate);

    expect(router.routes).toEqual([`/g/g-p-abc/c/${A}`]);
    expect(popstate).not.toHaveBeenCalled();
    expect(fullLoads.assign).not.toHaveBeenCalled();
  });

  it('never clicks a link to the conversation outside the sidebar', () => {
    document.body.innerHTML = `
      <nav aria-label="Chat history"><a data-router-link target="_blank" href="/c/${A}">New tab</a></nav>
      <main><a data-router-link href="https://chatgpt.com/c/${A}">Linked in a message</a></main>`;
    const clicked = vi.fn((event: Event) => event.preventDefault());
    for (const link of document.querySelectorAll('a')) link.addEventListener('click', clicked);
    const { win } = guardedWindow();

    openChatGptConversation(entry(`/c/${A}`), document, win);

    expect(clicked).not.toHaveBeenCalled();
    expect(router.routes).toEqual([`/c/${A}`]);
  });

  it('stays put on the conversation already open', () => {
    history.replaceState(null, '', `/c/${A}`);
    const pushState = vi.spyOn(history, 'pushState');
    openChatGptConversation(entry(`/c/${A}`));
    expect(pushState).not.toHaveBeenCalled();
    expect(router.routes).toEqual([]);
    pushState.mockRestore();
  });

  it('refuses an entry that is not a ChatGPT conversation', () => {
    const pushState = vi.spyOn(history, 'pushState');
    const foreign = { ...entry('/'), url: 'https://gemini.google.com/app/abc' };
    expect(openChatGptConversation(foreign)).toBe(false);
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });
});

describe('readCurrentConversation', () => {
  it('files the open conversation under its id with the page title', () => {
    history.replaceState(null, '', `/g/g-p-abc/c/${A}?model=gpt-5`);
    document.title = 'Trip plan';
    expect(readCurrentConversation('Untitled', document, location.href, 5)).toEqual({
      conversationId: `chatgpt:conv:${A}`,
      title: 'Trip plan',
      url: `https://chatgpt.com/g/g-p-abc/c/${A}`,
      addedAt: 5,
    });
  });

  it('falls back to the active sidebar link, then to the untitled label', () => {
    history.replaceState(null, '', `/c/${A}`);
    document.body.innerHTML = `<nav aria-label="Chat history"><a aria-current="page" href="/c/${A}"> Sidebar title </a></nav>`;
    expect(readCurrentConversation('Untitled')?.title).toBe('Sidebar title');
    document.body.innerHTML = '';
    expect(readCurrentConversation('Untitled')?.title).toBe('Untitled');
  });

  it.each([
    ['the home page', '/'],
    ['a temporary chat', `/c/${A}?temporary-chat=true`],
    ['a Project overview', '/g/g-p-abc/project'],
  ])('reads nothing on %s', (_name, path) => {
    history.replaceState(null, '', path);
    expect(readCurrentConversation('Untitled')).toBeNull();
  });
});
