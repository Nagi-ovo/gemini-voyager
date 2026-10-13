import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { confirmDriver } from '@/tests/confirmDriver';
import { toastDriver } from '@/tests/toastDriver';

import { historyTimestampStore } from '../../timestamp/historyTimestamps';
import type { ForkNode } from '../forkTypes';
import { startFork } from '../index';
import { startForkLinkFinisher } from '../linkFinisher';

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
  let stopCore: () => void;
  let sendMessageMock: ReturnType<typeof vi.fn>;

  const flushMicrotasks = async (): Promise<void> => {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    stopCore = startForkLinkFinisher();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.mocked(browser.storage.sync.get).mockResolvedValue({});
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    vi.mocked(browser.storage.local.remove).mockResolvedValue(undefined);
    vi.mocked(browser.storage.local.set).mockResolvedValue(undefined);

    sendMessageMock = vi.fn();
    chrome.runtime.sendMessage = sendMessageMock as unknown as typeof chrome.runtime.sendMessage;
    Object.defineProperty(chrome.runtime, 'lastError', { value: null, configurable: true });
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }

    stopCore();
    vi.clearAllTimers();
    vi.useRealTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    sessionStorage.clear();
  });

  it('keeps fork controls out of flow with a visibility-only focus reveal', () => {
    window.history.replaceState({}, '', '/app/conv-source');
    document.body.innerHTML = '<div class="user-query-container">A user message</div>';
    cleanup = startFork();
    vi.advanceTimersByTime(1000);

    const button = document.querySelector<HTMLButtonElement>('.gv-fork-btn')!;
    const hidden = getComputedStyle(button);
    expect(hidden.display).toBe('inline-flex');
    expect(hidden.position).toBe('absolute');
    expect(hidden.opacity).toBe('0');
    expect(hidden.visibility).toBe('hidden');
    expect(hidden.pointerEvents).toBe('none');
    expect(hidden.right).toBe('calc(100% + 8px)');

    // jsdom does not recompute pseudo-class styles on focus; inspect parsed rules.
    const sheet = (document.getElementById('gemini-voyager-fork-style') as HTMLStyleElement).sheet!;
    const reveal = Array.from(sheet.cssRules).find(
      (rule): rule is CSSStyleRule =>
        rule instanceof CSSStyleRule && rule.selectorText.includes('.gv-fork-btn:focus-visible'),
    )!;
    expect(reveal.selectorText.split(',').map((selector) => selector.trim())).toContain(
      '.user-query-bubble-with-background:hover .gv-fork-btn',
    );
    expect(reveal.style.getPropertyValue('display')).toBe('');
    expect(reveal.style.getPropertyValue('opacity')).toBe('1');
    expect(reveal.style.getPropertyValue('visibility')).toBe('visible');
    expect(reveal.style.getPropertyValue('pointer-events')).toBe('auto');

    document.body.classList.add('gv-rtl');
    expect(getComputedStyle(button).left).toBe('calc(100% + 8px)');
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

  it('a stopped run does not leave fork buttons behind', () => {
    window.history.replaceState({}, '', '/app/conv-source');
    document.body.innerHTML = '<div class="user-query-container">A user message</div>';

    cleanup = startFork();
    cleanup();
    cleanup = null;
    vi.advanceTimersByTime(1000);

    expect(document.querySelector('.gv-fork-btn')).toBeNull();
  });

  it('dismisses controls from delayed setup after the feature restarts', async () => {
    window.history.replaceState({}, '', '/app/conv-source');
    document.body.innerHTML = '<div class="user-query-container">A user message</div>';
    sendMessageMock.mockImplementation(
      (_message: unknown, callback: (response: unknown) => void) => {
        callback({ ok: true, nodes: [] });
      },
    );

    cleanup = startFork();
    cleanup();
    cleanup = startFork();
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();

    document.querySelector<HTMLElement>('.gv-fork-btn')!.click();
    expect(confirmDriver.isOpen()).toBe(true);
    confirmDriver.pressOutside();
    expect(confirmDriver.isOpen()).toBe(false);

    document.querySelector<HTMLElement>('.gv-fork-btn')!.click();
    cleanup();
    cleanup = null;
    expect(confirmDriver.isOpen()).toBe(false);
    expect(document.querySelector('.gv-fork-btn')).toBeNull();
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
          <div class="conversation-container" id="1111111111111111">
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

      confirmDriver.answer('Fork');
      await flushMicrotasks();

      expect(openSpy).toHaveBeenCalledWith(`${window.location.origin}${expectedPath}`, '_blank');
      openSpy.mockRestore();
    },
  );

  it('does not fork when the conversation changes while the fork confirm is open', async () => {
    window.history.replaceState({}, '', '/app/conv-source');
    document.body.innerHTML = `
      <main>
        <div class="conversation-container" id="1111111111111111">
          <div class="user-query-container">
            <div class="user-query-bubble-with-background">user-1</div>
          </div>
          <div class="response-container">
            <div class="markdown-main-panel">assistant-1</div>
          </div>
        </div>
      </main>
    `;
    const userContainer = document.querySelector<HTMLElement>('.user-query-container')!;
    const responseContainer = document.querySelector<HTMLElement>('.response-container')!;
    Object.defineProperty(userContainer, 'offsetTop', { value: 0, configurable: true });
    Object.defineProperty(responseContainer, 'offsetTop', { value: 100, configurable: true });
    sendMessageMock.mockImplementation(
      (_message: unknown, callback: (response: { ok: boolean; nodes?: [] }) => void) =>
        callback({ ok: true, nodes: [] }),
    );
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    cleanup = startFork();
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();

    document.querySelector<HTMLElement>('.gv-fork-btn')!.click();
    // A keyboard back navigation swaps the route without a press or a scroll.
    window.history.replaceState({}, '', '/app/conv-other');
    confirmDriver.answer('Fork');
    await flushMicrotasks();

    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('downloads a Markdown fork and stores a manual upload pending fork', async () => {
    window.history.replaceState({}, '', '/u/1/app/conv-source');
    document.title = 'Source / Long:Title';
    document.body.innerHTML = `
      <main>
        <div class="conversation-container" id="1111111111111111">
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
    const createObjectURL = vi.fn().mockReturnValue('blob:fork-md');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    cleanup = startFork();
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();

    document.querySelector<HTMLElement>('.gv-fork-btn')?.click();
    confirmDriver.answer('Download MD');
    for (let i = 0; i < 4; i++) {
      await flushMicrotasks();
    }

    const storageSet = vi.mocked(browser.storage.local.set);
    const pendingPayload = storageSet.mock.calls[0]?.[0] as
      | { gvPendingFork?: Record<string, unknown> }
      | undefined;
    const pendingFork = pendingPayload?.gvPendingFork;

    expect(openSpy).toHaveBeenCalledWith(`${window.location.origin}/u/1/app`, '_blank');
    expect(pendingFork?.mode).toBe('fileUpload');
    expect(pendingFork?.filename).toMatch(/^gemini-voyager-fork-Source - Long-Title-\d+\.md$/);
    expect(pendingFork?.markdown).toContain('You are continuing a branched conversation.');
    expect(pendingFork?.markdown).toContain('user-1');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchorClickSpy).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLAnchorElement>('a[download]')?.download).toBe(
      pendingFork?.filename,
    );

    vi.advanceTimersByTime(100);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fork-md');

    openSpy.mockRestore();
    anchorClickSpy.mockRestore();
  });

  it('does not fork a mounted positional turn even when a legacy map may exist', async () => {
    window.history.replaceState({}, '', '/app/conv-source');
    document.body.innerHTML = `
      <main>
        <div class="user-query-container">
          <div class="user-query-bubble-with-background">mounted tail turn</div>
        </div>
        <div class="response-container">
          <div class="markdown-main-panel">assistant</div>
        </div>
      </main>
    `;

    const userContainer = document.querySelector<HTMLElement>('.user-query-container');
    const responseContainer = document.querySelector<HTMLElement>('.response-container');
    if (!userContainer || !responseContainer) throw new Error('test DOM setup failed');
    Object.defineProperty(userContainer, 'offsetTop', { value: 0, configurable: true });
    Object.defineProperty(responseContainer, 'offsetTop', { value: 100, configurable: true });

    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    cleanup = startFork();
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();

    document.querySelector<HTMLElement>('.gv-fork-btn')?.click();
    confirmDriver.answer('Fork');
    await flushMicrotasks();

    expect(openSpy).not.toHaveBeenCalled();
    expect(vi.mocked(browser.storage.local.set)).not.toHaveBeenCalledWith(
      expect.objectContaining({ gvPendingFork: expect.anything() }),
    );
    openSpy.mockRestore();
  });

  it('links a manual Markdown fork when the new conversation starts inside the upload window', async () => {
    window.history.replaceState({}, '', '/app');
    document.body.innerHTML = `
      <main>
        <div class="text-input-field"><rich-textarea>
          <div id="chat-input" contenteditable="true"></div>
        </rich-textarea><button id="send" aria-label="Send">Send</button></div>
      </main>
    `;
    const uploadInput = document.querySelector<HTMLElement>('#chat-input');
    if (!uploadInput) {
      throw new Error('test DOM setup failed');
    }
    Object.defineProperty(uploadInput, 'getBoundingClientRect', {
      value: () => ({ height: 24 }),
      configurable: true,
    });
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });

    vi.mocked(browser.storage.local.get).mockResolvedValue({
      gvPendingFork: {
        sourceConversationId: 'conv-source',
        sourceTurnId: 'u-2',
        sourceUrl: `${location.origin}/app/conv-source`,
        sourceTitle: 'Source',
        forkGroupId: 'group-1',
        sourceForkIndex: 0,
        nextForkIndex: 1,
        markdown: '# Source\n\nmanual context',
        mode: 'fileUpload',
        filename: 'gemini-voyager-fork-source.md',
        createdAt: Date.now() - 30000,
      },
    });

    sendMessageMock.mockImplementation(
      (
        rawMessage: unknown,
        callback: (response: { ok: boolean; [key: string]: unknown }) => void,
      ) => {
        const message = rawMessage as { type?: string };
        if (message.type === 'gv.fork.add') {
          callback({ ok: true, added: true });
          return;
        }
        callback({ ok: true, nodes: [] });
      },
    );

    cleanup = startFork();
    await flushMicrotasks();

    const input = document.querySelector<HTMLElement>('#chat-input');
    const hint = () => toastDriver.all()[0];
    expect(input?.textContent).toContain('gemini-voyager-fork-source.md');
    expect(input?.textContent).toContain('context from the previous conversation');
    expect(input?.textContent).toContain('New request:');
    expect(input?.textContent).not.toContain('manual context');
    expect(input?.textContent).not.toContain('best practices');
    expect(input?.textContent).not.toContain('Anthropic');
    expect(input?.textContent).not.toContain('OpenAI');
    expect(hint().message).toContain('gemini-voyager-fork-source.md');
    expect(hint().detail).toBe('01:30');
    expect(vi.mocked(browser.storage.local.remove)).toHaveBeenCalledWith('gvPendingFork');

    vi.advanceTimersByTime(1000);
    expect(hint().detail).toBe('01:29');

    const sentText = input!.textContent!;
    const sendButton = document.querySelector<HTMLButtonElement>('#send')!;
    Object.defineProperty(sendButton, 'offsetParent', { value: document.body, configurable: true });
    sendButton.click();
    window.history.pushState({}, '', '/app/conv-new');
    const user = document.createElement('div');
    user.className = 'user-query-container';
    user.textContent = sentText;
    document.querySelector('main')!.append(user);
    vi.advanceTimersByTime(500);
    for (let i = 0; i < 4; i++) {
      await flushMicrotasks();
    }

    const addPayloads = sendMessageMock.mock.calls
      .map(([rawMessage]) => rawMessage as { type?: string; payload?: ForkNode })
      .filter((message) => message.type === 'gv.fork.add')
      .map((message) => message.payload);

    expect(addPayloads).toHaveLength(2);
    expect(addPayloads[0]?.conversationId).toBe('conv-source');
    expect(addPayloads[0]?.turnId).toBe('u-2');
    expect(addPayloads[1]?.conversationId).toBe('conv-new');
    expect(addPayloads[1]?.turnId).toBe('u-0');
    expect(toastDriver.all()).toEqual([]);
  });

  it('avoids duplicate branch indicator groups when concurrent refreshes happen', async () => {
    window.history.replaceState({}, '', '/app/conv-source');
    document.body.innerHTML = `
      <main>
        <a href="/app/conv-source">source</a>
        <a href="/app/conv-fork">fork</a>
        <div class="conversation-container" id="6060606060606060">
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
      turnId: 's-6060606060606060',
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

  const mountSourceConversation = (path: string): void => {
    window.history.replaceState({}, '', path);
    document.body.innerHTML = `
      <main>
        <div class="conversation-container" id="1111111111111111">
          <div class="user-query-container">
            <div class="user-query-bubble-with-background">user-1</div>
          </div>
          <div class="response-container">
            <div class="markdown-main-panel">assistant-1</div>
          </div>
        </div>
      </main>
    `;
    const userContainer = document.querySelector<HTMLElement>('.user-query-container')!;
    const responseContainer = document.querySelector<HTMLElement>('.response-container')!;
    Object.defineProperty(userContainer, 'offsetTop', { value: 0, configurable: true });
    Object.defineProperty(responseContainer, 'offsetTop', { value: 100, configurable: true });
    sendMessageMock.mockImplementation(
      (_message: unknown, callback: (response: { ok: boolean; nodes?: [] }) => void) =>
        callback({ ok: true, nodes: [] }),
    );
  };

  const holdLanguageRead = (): (() => void) => {
    let release!: () => void;
    vi.mocked(browser.storage.sync.get).mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve({});
      }),
    );
    return release;
  };

  const storedPendingFork = (): Record<string, unknown> | undefined =>
    (
      vi.mocked(browser.storage.local.set).mock.calls[0]?.[0] as
        | { gvPendingFork?: Record<string, unknown> }
        | undefined
    )?.gvPendingFork;

  it('records the source url and title captured when the fork button was clicked', async () => {
    mountSourceConversation('/u/1/app/conv-source');
    document.title = 'Source title';
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn().mockReturnValue('blob:fork-md'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const releaseLanguage = holdLanguageRead();
    cleanup = startFork();
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();

    document.querySelector<HTMLElement>('.gv-fork-btn')!.click();
    confirmDriver.answer('Download MD');
    await flushMicrotasks();
    expect(openSpy).toHaveBeenCalledWith(`${window.location.origin}/u/1/app`, '_blank');
    // The source tab moves on while the launch is still resolving its language and group.
    window.history.pushState({}, '', '/u/1/app/conv-other');
    document.title = 'Other title';
    releaseLanguage();
    for (let i = 0; i < 4; i++) await flushMicrotasks();

    const pendingFork = storedPendingFork();
    expect(pendingFork?.sourceConversationId).toBe('conv-source');
    expect(pendingFork?.sourceUrl).toBe(`${window.location.origin}/u/1/app/conv-source`);
    expect(pendingFork?.sourceTitle).toBe('Source title');
    expect(pendingFork?.filename).toMatch(/^gemini-voyager-fork-Source title-\d+\.md$/);
    expect(pendingFork?.markdown).toContain('Source title');
    expect(pendingFork?.markdown).not.toContain('Other title');
    openSpy.mockRestore();
    anchorClickSpy.mockRestore();
  });

  it('joins the fork group of the clicked conversation when the tab moves on before the group lookup', async () => {
    mountSourceConversation('/app/conv-source');
    // Each conversation maps the legacy `u-0` to its own first turn.
    const turnMaps: Record<string, string[]> = {
      'conv-source': ['s-1111111111111111'],
      'conv-other': ['s-2222222222222222'],
    };
    vi.spyOn(historyTimestampStore, 'resolveCanonicalTurnId').mockImplementation(
      (conversationId, turnId) =>
        turnId.startsWith('u-')
          ? (turnMaps[conversationId]?.[Number(turnId.slice(2))] ?? null)
          : turnId,
    );
    // The source was forked before under its legacy id.
    const legacyNode: ForkNode = {
      turnId: 'u-0',
      conversationId: 'conv-source',
      conversationUrl: 'https://gemini.google.com/app/conv-source',
      conversationTitle: 'Source',
      forkGroupId: 'group-source',
      forkIndex: 0,
      createdAt: 1,
    };
    const branchNode: ForkNode = {
      ...legacyNode,
      turnId: 's-9999999999999999',
      conversationId: 'conv-branch',
      conversationUrl: 'https://gemini.google.com/app/conv-branch',
      forkIndex: 1,
    };
    sendMessageMock.mockImplementation(
      (rawMessage: unknown, callback: (response: { ok: boolean; nodes: ForkNode[] }) => void) => {
        const message = rawMessage as { type?: string };
        if (message.type === 'gv.fork.getForConversation') {
          callback({ ok: true, nodes: [legacyNode] });
          return;
        }
        callback({ ok: true, nodes: [legacyNode, branchNode] });
      },
    );
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const releaseLanguage = holdLanguageRead();
    cleanup = startFork();
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();

    document.querySelector<HTMLElement>('.gv-fork-btn')!.click();
    confirmDriver.answer('Fork');
    await flushMicrotasks();
    window.history.pushState({}, '', '/app/conv-other');
    releaseLanguage();
    for (let i = 0; i < 6; i++) await flushMicrotasks();

    const pendingFork = storedPendingFork();
    expect(pendingFork?.sourceConversationId).toBe('conv-source');
    expect(pendingFork?.forkGroupId).toBe('group-source');
    expect(pendingFork?.nextForkIndex).toBe(2);
    openSpy.mockRestore();
  });

  it('finishes writing the pending fork after launch even if fork turns off meanwhile', async () => {
    mountSourceConversation('/app/conv-source');
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const releaseLanguage = holdLanguageRead();
    cleanup = startFork();
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();

    document.querySelector<HTMLElement>('.gv-fork-btn')!.click();
    confirmDriver.answer('Fork');
    await flushMicrotasks();
    expect(openSpy).toHaveBeenCalledOnce();
    cleanup();
    cleanup = null;
    releaseLanguage();
    for (let i = 0; i < 4; i++) await flushMicrotasks();

    const pendingFork = storedPendingFork();
    expect(pendingFork?.sourceConversationId).toBe('conv-source');
    expect(pendingFork?.mode).toBe('paste');
    expect(pendingFork?.markdown).toContain('user-1');
    openSpy.mockRestore();
  });

  it('keeps the new fork runtime observing when the previous one stops late', async () => {
    mountSourceConversation('/app/conv-source');
    const stopPrevious = startFork();
    cleanup = startFork();
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();
    stopPrevious();
    expect(document.querySelector('.gv-fork-btn')).toBeNull();

    // New messages stream in; only the live run may answer them.
    document.querySelector('main')!.appendChild(document.createElement('div'));
    await flushMicrotasks();
    vi.advanceTimersByTime(500);
    await flushMicrotasks();

    document.querySelector<HTMLElement>('.gv-fork-btn')!.click();
    expect(confirmDriver.isOpen()).toBe(true);
    confirmDriver.pressOutside();
  });

  it('keeps the newer fork run its stylesheet and buttons when an older run stops late', async () => {
    mountSourceConversation('/app/conv-source');
    const stopPrevious = startFork();
    cleanup = startFork();
    vi.advanceTimersByTime(1000);
    await flushMicrotasks();
    stopPrevious();
    expect(document.getElementById('gemini-voyager-fork-style')).not.toBeNull();

    // The live run puts its own buttons back once the page settles.
    document.querySelector('main')!.appendChild(document.createElement('div'));
    await flushMicrotasks();
    vi.advanceTimersByTime(500);
    await flushMicrotasks();
    expect(document.querySelector('.gv-fork-btn')).not.toBeNull();

    // Teardown may reach the older run's stop a second time.
    stopPrevious();
    expect(document.querySelector('.gv-fork-btn')).not.toBeNull();
    expect(document.getElementById('gemini-voyager-fork-style')).not.toBeNull();

    cleanup();
    cleanup = null;
    expect(document.querySelector('.gv-fork-btn')).toBeNull();
    expect(document.getElementById('gemini-voyager-fork-style')).toBeNull();
  });
});
