/**
 * How AI Studio's folder tree opens a prompt and the /library shortcut: native
 * links first, then the History API, never a page load.
 */
import { describe, expect, it, vi } from 'vitest';

import { logger } from '@/core/services/LoggerService';

import { flush, mountTree as mount, installAIStudioFolderPage } from './aistudioFolderHarness';
import { tree } from './aistudioTreeDriver';

vi.mock('webextension-polyfill', () => ({ default: chrome }));

installAIStudioFolderPage();

describe('AI Studio folder tree: navigation', () => {
  it('opens a prompt through the native link when the page shows one', async () => {
    await mount();
    const anchor = document.createElement('a');
    anchor.className = 'prompt-link';
    anchor.href = '/prompts/c4';
    const history = document.createElement('ms-prompt-history-v3');
    history.appendChild(anchor);
    document.body.appendChild(history);
    const clicked = vi.fn((event: Event) => event.preventDefault());
    anchor.addEventListener('click', clicked);

    tree.openConversation('a', 'c4');
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('otherwise opens a prompt through the History API, without a page load', async () => {
    await mount();
    const pushState = vi.spyOn(history, 'pushState');
    const popstate = vi.fn();
    window.addEventListener('popstate', popstate);

    tree.openConversation('a', 'c4');

    expect(pushState).toHaveBeenCalledWith({}, '', 'https://aistudio.google.com/prompts/c4');
    expect(popstate).toHaveBeenCalledTimes(1);
    expect(location.pathname).toBe('/prompts/c4');
    window.removeEventListener('popstate', popstate);
  });

  it('stays on the page and logs when the History API refuses the prompt', async () => {
    await mount();
    const before = location.href;
    const refusal = new DOMException('blocked', 'SecurityError');
    vi.spyOn(history, 'pushState').mockImplementation(() => {
      throw refusal;
    });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    // jsdom reports a page load it cannot perform through console.error.
    const pageLoad = vi.spyOn(console, 'error').mockImplementation(() => {});

    tree.openConversation('a', 'c4');

    expect(location.href).toBe(before);
    expect(pageLoad).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.any(String), {
      url: 'https://aistudio.google.com/prompts/c4',
      error: refusal,
    });
  });

  it("opens /library through the nav's own Library link when the nav has one", async () => {
    await mount();
    const nav = document.querySelector('.nav-content nav')!;
    const native = document.createElement('a');
    native.href = '/library';
    nav.appendChild(native);
    const clicked = vi.fn((event: Event) => event.preventDefault());
    native.addEventListener('click', clicked);
    const pushState = vi.spyOn(history, 'pushState');

    tree.libraryButton()!.click();

    expect(clicked).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();
  });

  it('otherwise opens /library through the History API, without a page load', async () => {
    await mount();
    const popstate = vi.fn();
    window.addEventListener('popstate', popstate);

    tree.libraryButton()!.click();

    expect(location.pathname).toBe('/library');
    expect(popstate).toHaveBeenCalledTimes(1);
    window.removeEventListener('popstate', popstate);
  });

  it('offers the Library shortcut away from /library and hides it there', async () => {
    await mount();
    expect(tree.libraryButton()?.style.display).toBe('');

    history.pushState({}, '', '/library');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();
    expect(tree.libraryButton()?.style.display).toBe('none');
  });
});
