import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ForkNode } from '../forkTypes';
import { startFork } from '../index';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: { get: vi.fn().mockResolvedValue({}) },
      local: {
        get: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue(undefined),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  },
}));

describe('startFork style injection', () => {
  let cleanup: (() => void) | null = null;
  let sendMessageMock: ReturnType<typeof vi.fn>;

  const flushMicrotasks = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');

    sendMessageMock = vi.fn();
    chrome.runtime.sendMessage = sendMessageMock as unknown as typeof chrome.runtime.sendMessage;
    Object.defineProperty(chrome.runtime, 'lastError', { value: null, configurable: true });
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }

    vi.clearAllTimers();
    vi.useRealTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    sessionStorage.clear();
  });

  it('uses non-layout-shifting visibility transitions for fork button reveal', () => {
    cleanup = startFork();

    const style = document.getElementById('gemini-voyager-fork-style');
    expect(style).not.toBeNull();

    const css = style?.textContent ?? '';

    expect(css).toMatch(/\.gv-fork-btn\s*\{[\s\S]*display:\s*inline-flex;/);
    expect(css).toMatch(/\.gv-fork-btn\s*\{[\s\S]*position:\s*absolute;/);
    expect(css).toMatch(/\.gv-fork-btn\s*\{[\s\S]*opacity:\s*0;/);
    expect(css).toMatch(/\.gv-fork-btn\s*\{[\s\S]*visibility:\s*hidden;/);
    expect(css).toMatch(/\.gv-fork-btn\s*\{[\s\S]*pointer-events:\s*none;/);
    expect(css).toMatch(/\.gv-fork-btn\s*\{[\s\S]*right:\s*calc\(100%\s*\+\s*8px\);/);
    expect(css).not.toMatch(/\.gv-fork-btn\s*\{[\s\S]*display:\s*none;/);

    const revealRule = css.match(
      /\.user-query-bubble-with-background:hover \.gv-fork-btn,[\s\S]*?\.gv-fork-btn:focus-visible\s*\{([\s\S]*?)\}/,
    );
    expect(revealRule).not.toBeNull();
    const revealDeclarations = revealRule?.[1] ?? '';
    expect(revealDeclarations).toContain('opacity: 1;');
    expect(revealDeclarations).toContain('pointer-events: auto;');
    expect(revealDeclarations).not.toContain('display:');

    expect(css).toMatch(/body\.gv-rtl \.gv-fork-btn[\s\S]*left:\s*calc\(100%\s*\+\s*8px\);/);
  });

  it('anchors fork button beside the native copy button when available', () => {
    document.body.innerHTML = `
      <main>
        <div class="user-query-container">
          <div class="user-query-bubble-with-background">user-1</div>
          <div class="actions">
            <div id="copy-anchor">
              <button data-test-id="copy-button" class="action-button" aria-label="Copy prompt">
                <mat-icon fonticon="content_copy"></mat-icon>
              </button>
            </div>
          </div>
        </div>
        <div class="response-container">
          <div class="markdown-main-panel">assistant-1</div>
        </div>
      </main>
    `;

    const userContainer = document.querySelector<HTMLElement>('.user-query-container');
    const responseContainer = document.querySelector<HTMLElement>('.response-container');
    expect(userContainer).not.toBeNull();
    expect(responseContainer).not.toBeNull();

    Object.defineProperty(userContainer!, 'offsetTop', { value: 0, configurable: true });
    Object.defineProperty(responseContainer!, 'offsetTop', { value: 100, configurable: true });

    cleanup = startFork();
    vi.advanceTimersByTime(1000);

    const forkButton = document.querySelector<HTMLElement>('.gv-fork-btn');
    expect(forkButton).not.toBeNull();
    expect(forkButton?.parentElement?.id).toBe('copy-anchor');
  });

  it.each([
    ['/u/1/app/conv-source', '/u/1/app'],
    ['/u/2/app/conv-source', '/u/2/app'],
    ['/u/12/app/conv-source', '/u/12/app'],
    ['/app/conv-source', '/app'],
  ])(
    'opens the fork draft under the matching Gemini account route for %s',
    async (currentPath, expectedPath) => {
      window.history.replaceState({}, '', currentPath);
      document.body.innerHTML = `
        <main>
          <div class="user-query-container">
            <div class="user-query-bubble-with-background">user-1</div>
            <div class="actions">
              <div id="copy-anchor">
                <button data-test-id="copy-button" class="action-button" aria-label="Copy prompt">
                  <mat-icon fonticon="content_copy"></mat-icon>
                </button>
              </div>
            </div>
          </div>
          <div class="response-container">
            <div class="markdown-main-panel">assistant-1</div>
          </div>
        </main>
      `;

      const userContainer = document.querySelector<HTMLElement>('.user-query-container');
      const responseContainer = document.querySelector<HTMLElement>('.response-container');
      if (!userContainer || !responseContainer) {
        throw new Error('test DOM setup failed');
      }

      Object.defineProperty(userContainer, 'offsetTop', { value: 0, configurable: true });
      Object.defineProperty(responseContainer, 'offsetTop', { value: 100, configurable: true });

      sendMessageMock.mockImplementation(
        (
          rawMessage: unknown,
          callback: (response: { ok: boolean; [key: string]: unknown }) => void,
        ) => {
          const message = rawMessage as { type?: string };
          if (message.type === 'gv.fork.getForConversation') {
            callback({ ok: true, nodes: [] });
            return;
          }
          callback({ ok: true });
        },
      );

      const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);

      cleanup = startFork();
      vi.advanceTimersByTime(1000);
      await flushMicrotasks();

      const forkButton = document.querySelector<HTMLElement>('.gv-fork-btn');
      expect(forkButton).not.toBeNull();
      forkButton?.click();

      const confirmButton = document.querySelector<HTMLElement>('.gv-fork-primary');
      expect(confirmButton).not.toBeNull();
      confirmButton?.click();

      expect(openSpy).toHaveBeenCalledWith(`${window.location.origin}${expectedPath}`, '_blank');
      openSpy.mockRestore();
    },
  );

  it('avoids duplicate branch indicator groups when concurrent refreshes happen', async () => {
    window.history.replaceState({}, '', '/app/conv-source');
    document.body.innerHTML = `
      <main>
        <a href="/app/conv-source">source</a>
        <a href="/app/conv-fork">fork</a>
        <div class="user-query-container">
          <div class="user-query-bubble-with-background">user-1</div>
          <div class="actions">
            <div id="copy-anchor">
              <button data-test-id="copy-button" class="action-button" aria-label="Copy prompt">
                <mat-icon fonticon="content_copy"></mat-icon>
              </button>
            </div>
          </div>
        </div>
        <div class="response-container">
          <div class="markdown-main-panel">assistant-1</div>
        </div>
      </main>
    `;

    const userContainer = document.querySelector<HTMLElement>('.user-query-container');
    const responseContainer = document.querySelector<HTMLElement>('.response-container');
    const host = document.querySelector<HTMLElement>('.user-query-bubble-with-background');
    if (!userContainer || !responseContainer || !host) {
      throw new Error('test DOM setup failed');
    }

    Object.defineProperty(userContainer, 'offsetTop', { value: 0, configurable: true });
    Object.defineProperty(responseContainer, 'offsetTop', { value: 100, configurable: true });

    const sourceNode: ForkNode = {
      turnId: 'u-0',
      conversationId: 'conv-source',
      conversationUrl: 'https://gemini.google.com/app/conv-source',
      conversationTitle: 'Source',
      forkGroupId: 'group-1',
      forkIndex: 0,
      createdAt: 1,
    };
    const forkNode: ForkNode = {
      ...sourceNode,
      conversationId: 'conv-fork',
      conversationUrl: 'https://gemini.google.com/app/conv-fork',
      conversationTitle: 'Fork',
      forkIndex: 1,
      createdAt: 2,
    };

    sendMessageMock.mockImplementation(
      (
        rawMessage: unknown,
        callback: (response: { ok: boolean; [key: string]: unknown }) => void,
      ) => {
        const message = rawMessage as { type?: string };
        if (message.type === 'gv.fork.getForConversation') {
          callback({ ok: true, nodes: [sourceNode] });
          return;
        }
        if (message.type === 'gv.fork.getGroup') {
          setTimeout(() => {
            callback({ ok: true, nodes: [sourceNode, forkNode] });
          }, 1200);
          return;
        }
        callback({ ok: true });
      },
    );

    cleanup = startFork();

    // Initial setup injection.
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();

    // Trigger a second concurrent refresh via mutation observer debounce.
    document.body.appendChild(document.createElement('div'));
    await flushMicrotasks();
    vi.advanceTimersByTime(500);
    await flushMicrotasks();

    // Allow both async indicator fetch rounds to finish.
    vi.advanceTimersByTime(3000);
    for (let i = 0; i < 6; i++) {
      await flushMicrotasks();
    }

    const sentTypes = sendMessageMock.mock.calls.map(
      ([rawMessage]) => (rawMessage as { type?: string }).type,
    );
    expect(sentTypes).toContain('gv.fork.getForConversation');
    expect(sentTypes).toContain('gv.fork.getGroup');

    expect(host.querySelectorAll('.gv-fork-indicator-group')).toHaveLength(1);
    expect(host.querySelectorAll('.gv-fork-indicator')).toHaveLength(2);
  });
});
