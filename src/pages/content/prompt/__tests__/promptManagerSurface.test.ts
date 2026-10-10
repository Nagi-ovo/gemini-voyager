import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { PromptItem } from '@/core/types/sync';
import { SiteRegistry } from '@/features/plugins/sites/registry';
import { confirmDriver } from '@/tests/confirmDriver';
import { toastDriver } from '@/tests/toastDriver';

import { ensureScheme, stopScheme } from '../../platformTheme/scheme';
import { startPromptManager } from '../index';
import { resolvePromptSiteAdapter } from '../resolvePromptSiteAdapter';

vi.mock('webextension-polyfill', () => ({ default: globalThis.chrome }));

let manager: Awaited<ReturnType<typeof startPromptManager>> | undefined;

function storageGet(values: Record<string, unknown>): typeof chrome.storage.sync.get {
  const get = (
    keys: string | string[] | Record<string, unknown> | null = null,
    callback?: (items: Record<string, unknown>) => void,
  ): Promise<Record<string, unknown>> => {
    const defaults = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
    const names =
      keys === null
        ? Object.keys(values)
        : typeof keys === 'string'
          ? [keys]
          : Array.isArray(keys)
            ? keys
            : Object.keys(keys);
    const result = Object.fromEntries(names.map((key) => [key, values[key] ?? defaults[key]]));
    callback?.(result);
    return Promise.resolve(result);
  };
  return get as typeof chrome.storage.sync.get;
}

async function openManager(items: PromptItem[]): Promise<HTMLElement> {
  vi.mocked(chrome.storage.local.get).mockImplementation(
    storageGet({ [StorageKeys.PROMPT_ITEMS]: items }),
  );
  manager = await startPromptManager(resolvePromptSiteAdapter(location.href));
  document.querySelector<HTMLButtonElement>('#gv-pm-trigger')!.click();
  return document.querySelector<HTMLElement>('#gv-pm-panel')!;
}

function emitStorageChange(changes: Record<string, unknown>, area: string): void {
  for (const [listener] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls) {
    (listener as (changes: object, area: string) => void)(changes, area);
  }
}

const prompt = (id: string, name: string, text = `${name} body`): PromptItem => ({
  id,
  name,
  text,
  tags: [],
  createdAt: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
  vi.mocked(chrome.storage.sync.get).mockImplementation(
    storageGet({ [StorageKeys.LANGUAGE]: 'en' }),
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // startPromptManager wraps console.warn for KaTeX; let restoreAllMocks undo it.
  vi.spyOn(console, 'warn');
});

afterEach(() => {
  manager?.destroy();
  manager = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('prompt manager footer', () => {
  it('keeps the secondary footer row to settings and the sponsor link', async () => {
    const panel = await openManager([prompt('a', 'Alpha')]);

    const secondary = panel.querySelector('.gv-pm-footer-secondary')!;
    expect(Array.from(secondary.children).map((child) => child.className)).toEqual([
      'gv-pm-settings',
      'gv-pm-support',
    ]);
  });

  it('renders the sponsor link as an icon plus a text label', async () => {
    const panel = await openManager([prompt('a', 'Alpha')]);

    const support = panel.querySelector<HTMLAnchorElement>('.gv-pm-support')!;
    expect(support.querySelector('svg')).not.toBeNull();
    const label = support.querySelector('.gv-pm-support-label');
    expect(label?.textContent?.trim()).toBeTruthy();
    expect(support.textContent).toBe(label?.textContent);
  });

  it('gives the Saved Library a back action and an export menu with two formats', async () => {
    const panel = await openManager([prompt('a', 'Alpha')]);

    const savedFooter = panel.querySelector('.gv-pm-saved-footer-actions')!;
    expect(savedFooter.querySelector('.gv-pm-saved-footer-primary svg')).not.toBeNull();
    const exportTrigger = savedFooter.querySelector('.gv-pm-saved-export-trigger')!;
    expect(exportTrigger.getAttribute('aria-haspopup')).toBe('menu');
    const options = Array.from(
      savedFooter.querySelectorAll<HTMLButtonElement>('.gv-pm-saved-export-option'),
    );
    expect(options.map((option) => option.textContent)).toEqual(['JSON', 'Markdown']);
    expect(options.every((option) => option.querySelector('svg'))).toBe(true);
    // Filters sit above the list; the saved footer offers no import.
    const toolbar = panel.querySelector('.gv-pm-saved-toolbar')!;
    const list = panel.querySelector('.gv-pm-list')!;
    expect(toolbar.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(savedFooter.querySelectorAll('button')).toHaveLength(4);
  });

  it('draws its controls with icons rather than emoji', async () => {
    const panel = await openManager([prompt('a', 'Alpha')]);

    expect(panel.querySelector('.gv-pm-lock svg')).not.toBeNull();
    expect(panel.querySelector('.gv-pm-backup-btn svg')).not.toBeNull();
    expect(panel.textContent).not.toMatch(/[💬★🔒🔓]/u);
  });
});

describe('prompt manager list', () => {
  it('marks every prompt of a duplicate-name group with a non-blocking badge', async () => {
    const panel = await openManager([
      prompt('a', 'Same'),
      prompt('b', 'same '),
      prompt('c', 'Unique'),
    ]);

    const rows = Array.from(panel.querySelectorAll<HTMLElement>('.gv-pm-item'));
    expect(rows).toHaveLength(3);
    const flagged = rows.map((row) => row.classList.contains('gv-pm-item-name-conflict'));
    expect(flagged.filter(Boolean)).toHaveLength(2);
    for (const row of rows) {
      const badge = row.querySelector('.gv-pm-name-conflict');
      expect(Boolean(badge)).toBe(row.classList.contains('gv-pm-item-name-conflict'));
      if (badge) expect(badge.textContent?.trim()).toBeTruthy();
    }
  });

  it('opens links in the hover preview in a new tab', async () => {
    vi.useFakeTimers();
    const panel = await openManager([
      prompt('a', 'Linked', 'Read [the docs](https://example.com/docs) first'),
    ]);

    const row = panel.querySelector<HTMLElement>('.gv-pm-item-text')!;
    row.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(300);

    const link = await vi.waitFor(() => {
      const found = document.querySelector<HTMLAnchorElement>('.gv-pm-tooltip a[href]');
      if (!found) throw new Error('preview not rendered yet');
      return found;
    });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('prompt manager settings', () => {
  it('is not hidden by the slash completion setting', async () => {
    const panel = await openManager([prompt('a', 'Alpha')]);
    const trigger = document.querySelector<HTMLElement>('#gv-pm-trigger')!;

    emitStorageChange(
      { [StorageKeys.SLASH_PROMPT_ENABLED]: { oldValue: true, newValue: false } },
      'sync',
    );

    expect(trigger.style.display).not.toBe('none');
    expect(panel.classList.contains('gv-hidden')).toBe(false);
  });
});

describe('prompt row press', () => {
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = vi.fn(async (_text: string) => {});

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  });

  afterEach(() => {
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
    else Reflect.deleteProperty(navigator, 'clipboard');
  });

  function pressFirstRow(panel: HTMLElement): void {
    panel
      .querySelector<HTMLElement>('.gv-pm-item-text')!
      .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
  }

  function mountVisibleTextarea(): HTMLTextAreaElement {
    const composer = document.createElement('textarea');
    // jsdom lays nothing out; the composer lookup only takes a visible input.
    composer.getBoundingClientRect = () => new DOMRect(0, 600, 600, 48);
    document.body.appendChild(composer);
    return composer;
  }

  it('inserts the whole multi-line body into the composer when insert-on-click is on', async () => {
    vi.mocked(chrome.storage.sync.get).mockImplementation(
      storageGet({ [StorageKeys.LANGUAGE]: 'en', [StorageKeys.PROMPT_INSERT_ON_CLICK]: true }),
    );
    const composer = mountVisibleTextarea();
    const panel = await openManager([prompt('a', 'Alpha', 'line one\nline two')]);

    pressFirstRow(panel);

    await vi.waitFor(() => expect(toastDriver.messages()).toEqual(['Inserted']));
    expect(composer.value).toBe('line one\nline two');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the body when insert-on-click is on but the page has no composer', async () => {
    vi.mocked(chrome.storage.sync.get).mockImplementation(
      storageGet({ [StorageKeys.LANGUAGE]: 'en', [StorageKeys.PROMPT_INSERT_ON_CLICK]: true }),
    );
    const panel = await openManager([prompt('a', 'Alpha', 'line one\nline two')]);

    pressFirstRow(panel);

    await vi.waitFor(() => expect(toastDriver.messages()).toEqual(['Copied']));
    expect(writeText).toHaveBeenCalledExactlyOnceWith('line one\nline two');
  });

  it('copies rather than inserts while insert-on-click is off', async () => {
    const composer = mountVisibleTextarea();
    const panel = await openManager([prompt('a', 'Alpha')]);

    pressFirstRow(panel);

    await vi.waitFor(() => expect(toastDriver.messages()).toEqual(['Copied']));
    expect(writeText).toHaveBeenCalledExactlyOnceWith('Alpha body');
    expect(composer.value).toBe('');
  });
});

describe('prompt manager starting theme', () => {
  function stubOsDark(dark: boolean): void {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: dark && query.includes('dark'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
  }

  it("starts in Gemini's dark theme even when the OS is light", async () => {
    stubOsDark(false);
    document.body.insertAdjacentHTML('afterbegin', '<div class="theme-host dark-theme"></div>');

    const panel = await openManager([prompt('a', 'Alpha')]);

    expect(panel.getAttribute('data-gv-theme')).toBe('dark');
  });

  it("starts in Gemini's light theme even when the OS is dark", async () => {
    stubOsDark(true);
    document.body.insertAdjacentHTML('afterbegin', '<div class="theme-host light-theme"></div>');

    const panel = await openManager([prompt('a', 'Alpha')]);

    expect(panel.getAttribute('data-gv-theme')).toBe('light');
  });

  it('follows the OS on a page that marks no theme', async () => {
    stubOsDark(true);

    const panel = await openManager([prompt('a', 'Alpha')]);

    expect(panel.getAttribute('data-gv-theme')).toBe('dark');
  });

  it('takes the saved panel theme over the page theme', async () => {
    stubOsDark(false);
    vi.mocked(chrome.storage.sync.get).mockImplementation(
      storageGet({ [StorageKeys.LANGUAGE]: 'en', [StorageKeys.PROMPT_THEME]: 'dark' }),
    );
    document.body.insertAdjacentHTML('afterbegin', '<div class="theme-host light-theme"></div>');

    const panel = await openManager([prompt('a', 'Alpha')]);

    await vi.waitFor(() => expect(panel.getAttribute('data-gv-theme')).toBe('dark'));
  });

  it("starts in DeepSeek's dark theme even when the OS is light", async () => {
    stubOsDark(false);
    const url = 'https://chat.deepseek.com/';
    vi.stubGlobal('location', new URL(url));
    document.body.classList.add('dark');
    ensureScheme(SiteRegistry.createDefault().resolveByUrl(url)?.theme ?? null);

    try {
      const panel = await openManager([prompt('a', 'Alpha')]);

      expect(panel.getAttribute('data-gv-theme')).toBe('dark');
    } finally {
      stopScheme();
      document.body.classList.remove('dark');
      document.documentElement.removeAttribute('data-gv-scheme');
    }
  });
});

describe('Saved Library highlight scope', () => {
  function answerRuntimeMessages(): ReturnType<typeof vi.fn> {
    const sendMessage = vi.fn((message: { type: string }, callback?: (r: unknown) => void) => {
      const response =
        message.type === 'gv.highlight.list'
          ? { ok: true, records: [] }
          : { ok: true, messages: [], data: { messages: {} } };
      callback?.(response);
      return Promise.resolve(response);
    });
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(sendMessage as never);
    return sendMessage;
  }

  async function requestedHighlightPlatform(url: string): Promise<unknown> {
    vi.stubGlobal('location', new URL(url));
    const sendMessage = answerRuntimeMessages();
    const panel = await openManager([prompt('a', 'Alpha')]);
    panel.querySelector<HTMLButtonElement>('.gv-pm-backup-btn')!.click();
    const call = await vi.waitFor(() => {
      const found = sendMessage.mock.calls.find(
        ([message]) => message.type === 'gv.highlight.list',
      );
      if (!found) throw new Error('highlights not requested yet');
      return found;
    });
    return (call[0] as { payload: { scope: { platform: unknown } } }).payload.scope.platform;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['https://gemini.google.com/app', 'gemini'],
    ['https://gemini.google.com/u/1/app', 'gemini'],
    ['https://aistudio.google.com/prompts/new_chat', 'aistudio'],
    ['https://aistudio.google.cn/prompts/new_chat', 'aistudio'],
    ['https://chatgpt.com/', 'gemini'],
    ['https://chat.deepseek.com/', 'gemini'],
  ])('asks for highlights of %s under platform %s', async (url, platform) => {
    expect(await requestedHighlightPlatform(url)).toBe(platform);
  });
});

describe('prompt manager shared feedback', () => {
  const deleteFirst = (panel: HTMLElement) =>
    panel.querySelector<HTMLButtonElement>('.gv-pm-del')!.click();

  it('keeps the panel open when pressing its confirm (F17)', async () => {
    const panel = await openManager([prompt('a', 'Alpha')]);
    deleteFirst(panel);
    expect(confirmDriver.message()).toBe('Delete this prompt?');
    expect(confirmDriver.focusedLabel()).toBe('Cancel');

    confirmDriver.pressInside();

    expect(panel.classList.contains('gv-hidden')).toBe(false);
    expect(confirmDriver.isOpen()).toBe(true);
    confirmDriver.answer('Cancel');
    expect(panel.querySelector('.gv-pm-item')?.textContent).toContain('Alpha');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps the panel open when pressing a toast (F17)', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: false } as never);
    const panel = await openManager([prompt('a', 'Alpha')]);
    panel.querySelector<HTMLButtonElement>('.gv-pm-settings')!.click();
    const toast = await vi.waitFor(() => {
      const found = toastDriver.all()[0];
      if (!found) throw new Error('settings notice not shown');
      return found;
    });

    toast.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));

    expect(panel.classList.contains('gv-hidden')).toBe(false);
    expect(toast.tone).toBe('error');
    expect(toast.role).toBe('alert');
  });

  it('dismisses the confirm on Escape without closing the panel or deleting', async () => {
    const panel = await openManager([prompt('a', 'Alpha')]);
    deleteFirst(panel);
    confirmDriver.pressEscape();
    await Promise.resolve();

    expect(confirmDriver.isOpen()).toBe(false);
    expect(panel.classList.contains('gv-hidden')).toBe(false);
    expect(panel.querySelector('.gv-pm-item')?.textContent).toContain('Alpha');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it.each(['close', 'hide', 'destroy', 'replace'])(
    'cannot delete through an unanswered confirm after %s',
    async (action) => {
      const panel = await openManager([prompt('a', 'Alpha')]);
      deleteFirst(panel);
      if (action === 'close') document.querySelector<HTMLButtonElement>('#gv-pm-trigger')!.click();
      if (action === 'hide') emitStorageChange({ gvHidePromptManager: { newValue: true } }, 'sync');
      if (action === 'destroy') manager!.destroy();
      if (action === 'replace')
        emitStorageChange(
          { [StorageKeys.PROMPT_ITEMS]: { newValue: [prompt('b', 'Beta')] } },
          'local',
        );
      await Promise.resolve();

      expect(confirmDriver.isOpen()).toBe(false);
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
      expect(toastDriver.messages()).not.toContain('Deleted');
    },
  );

  it('does not delete if the panel closes immediately after answering', async () => {
    const panel = await openManager([prompt('a', 'Alpha')]);
    deleteFirst(panel);
    confirmDriver.answer('Delete');
    document.querySelector<HTMLButtonElement>('#gv-pm-trigger')!.click();
    await Promise.resolve();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(panel.querySelector('.gv-pm-item')?.textContent).toContain('Alpha');
  });

  it.each(['light', 'dark'] as const)(
    'keeps the confirm in the panel’s %s theme when the page theme changes',
    async (scheme) => {
      vi.mocked(chrome.storage.sync.get).mockImplementation(
        storageGet({ [StorageKeys.LANGUAGE]: 'en', [StorageKeys.PROMPT_THEME]: scheme }),
      );
      const panel = await openManager([prompt('a', 'Alpha')]);
      deleteFirst(panel);
      document.documentElement.setAttribute(
        'data-gv-scheme',
        scheme === 'light' ? 'dark' : 'light',
      );
      document.body.classList.add('gv-rtl');
      await Promise.resolve();

      expect(confirmDriver.scheme()).toBe(scheme);
      confirmDriver.answer('Cancel');
      panel.querySelector<HTMLButtonElement>('.gv-pm-theme-toggle')!.click();
      deleteFirst(panel);
      expect(confirmDriver.scheme()).toBe(scheme === 'light' ? 'dark' : 'light');
      document.body.classList.remove('gv-rtl');
      document.documentElement.removeAttribute('data-gv-scheme');
    },
  );

  it('replaces the notice, expires it after 1800 ms, and clears it on teardown', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ ok: false } as never);
    const panel = await openManager([prompt('a', 'Alpha')]);
    const settings = panel.querySelector<HTMLButtonElement>('.gv-pm-settings')!;
    settings.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(toastDriver.all()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    settings.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(toastDriver.all()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1798);
    expect(toastDriver.all()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(toastDriver.all()).toHaveLength(0);
    settings.click();
    await vi.advanceTimersByTimeAsync(1);
    expect(toastDriver.all()).toHaveLength(1);
    manager!.destroy();
    expect(toastDriver.all()).toHaveLength(0);
  });

  it('does not resurrect a settings notice after teardown', async () => {
    let finish!: (value: { ok: false }) => void;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }) as never,
    );
    const panel = await openManager([prompt('a', 'Alpha')]);
    panel.querySelector<HTMLButtonElement>('.gv-pm-settings')!.click();
    manager!.destroy();
    finish({ ok: false });
    await Promise.resolve();

    expect(toastDriver.messages()).toEqual([]);
  });
});
