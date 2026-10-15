import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireBundledSiteAdapter } from '../../catalog/sites';
import { PluginScope } from '../../runtime/pluginScope';
import type { SiteAdapter } from '../../types';
import { sendShortcutPrimitive } from '../sendShortcut';
import { draftSavePrimitive } from './index';
import { DRAFT_RESTORE_DELAY_MS, DRAFT_SAVE_DEBOUNCE_MS, SEND_INTENT_TIMEOUT_MS } from './session';

// jsdom events are never trusted: `type` marks the ones a person would have caused.
const userEvents = vi.hoisted(() => new WeakSet<Event>());
vi.mock('@/core/utils/userEvent', () => ({ isUserEvent: (event: Event) => userEvents.has(event) }));

/** The shared route watcher polls at this interval. */
const ROUTE_POLL_MS = 400;

interface SiteFixture {
  readonly name: string;
  readonly adapter: SiteAdapter;
  readonly markup: string;
  readonly conversationPath: (id: string) => string;
  readonly newChatPath: string;
}

const sites: readonly SiteFixture[] = [
  {
    name: 'ChatGPT (ProseMirror)',
    adapter: requireBundledSiteAdapter('chatgpt'),
    markup:
      '<form id="root"><div contenteditable="true" class="ProseMirror" data-composer-markdown="" id="prompt"><p><br></p></div>' +
      '<button type="submit" id="send"></button></form>',
    conversationPath: (id) => `/c/${id}`,
    newChatPath: '/',
  },
  {
    name: 'Claude (ProseMirror)',
    adapter: requireBundledSiteAdapter('claude'),
    markup:
      '<div data-composer-card-holder><div id="root">' +
      '<div><div contenteditable="true" class="ProseMirror" data-testid="chat-input" id="prompt"><p><br></p></div></div>' +
      '<button data-testid="chat-input-send" id="send"></button></div></div>',
    conversationPath: (id) => `/chat/${id}`,
    newChatPath: '/new',
  },
  {
    name: 'DeepSeek (textarea)',
    adapter: requireBundledSiteAdapter('deepseek'),
    markup:
      '<div id="root"><div><textarea class="ds-scroll-area" id="prompt"></textarea></div>' +
      '<div><div class="ds-button ds-button--primary ds-button--circle" role="button" id="send"></div></div></div>',
    conversationPath: (id) => `/a/chat/s/${id}`,
    newChatPath: '/',
  },
];

let records: Record<string, unknown>;
let scopes: PluginScope[];

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const paragraphs = (text: string) =>
  text
    .split('\n')
    .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : '<p><br></p>'))
    .join('');

/**
 * jsdom has no editing engine. Emulates what ChatGPT and Claude do live: a
 * full-selection insertText becomes one paragraph per line (an empty line an
 * empty paragraph) and a full-selection delete leaves one empty paragraph.
 */
function installProseMirrorEditing(): void {
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    writable: true,
    value: vi.fn((name: string, _ui?: boolean, value?: string) => {
      const range = window.getSelection()?.getRangeAt(0);
      const node = range?.commonAncestorContainer;
      const editor = (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>(
        '[contenteditable="true"]',
      );
      if (!editor || (name !== 'insertText' && name !== 'delete')) return false;
      editor.innerHTML = name === 'delete' ? '<p><br></p>' : paragraphs(value ?? '');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }),
  });
}

function prompt(): HTMLTextAreaElement | HTMLElement {
  return document.getElementById('prompt')!;
}

/** The user typing: the field changes and fires `input`. */
function type(text: string): void {
  const field = prompt();
  if (field instanceof HTMLTextAreaElement) field.value = text;
  else field.innerHTML = paragraphs(text);
  const event = new Event('input', { bubbles: true });
  userEvents.add(event);
  field.dispatchEvent(event);
}

/** The host emptying its composer after a send: an editor transaction with no `input` event. */
function hostClears(): void {
  const field = prompt();
  if (field instanceof HTMLTextAreaElement) field.value = '';
  else field.innerHTML = '<p><br></p>';
}

function text(): string {
  const field = prompt();
  if (field instanceof HTMLTextAreaElement) return field.value;
  return Array.from(field.children, (p) => p.textContent ?? '').join('\n');
}

function pressEnter(init: KeyboardEventInit = {}): void {
  prompt().dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init }),
  );
}

async function navigate(path: string): Promise<void> {
  window.history.pushState({}, '', path);
  await vi.advanceTimersByTimeAsync(ROUTE_POLL_MS);
}

function activate(adapter: SiteAdapter): PluginScope {
  const scope = new PluginScope();
  scopes.push(scope);
  void draftSavePrimitive.activate(
    scope,
    {},
    {
      doc: document,
      adapter,
      pluginId: 'test.draft-save',
      settings: {},
      setTargetCounter: () => {},
    },
  );
  return scope;
}

function activateSendShortcut(adapter: SiteAdapter): void {
  const scope = new PluginScope();
  scopes.push(scope);
  void sendShortcutPrimitive.activate(
    scope,
    {},
    {
      doc: document,
      adapter,
      pluginId: 'test.send-shortcut',
      settings: {},
      setTargetCounter: () => {},
    },
  );
}

/** Enabling one plugin after the other at runtime mounts them in either order. */
const mountOrders = [
  {
    order: 'sendShortcut first',
    mountBoth: (adapter: SiteAdapter) => {
      activateSendShortcut(adapter);
      activate(adapter);
    },
  },
  {
    order: 'draftSave first',
    mountBoth: (adapter: SiteAdapter) => {
      activate(adapter);
      activateSendShortcut(adapter);
    },
  },
];

const draftKey = (adapter: SiteAdapter, key: string) => `gvDraft:${adapter.id}:${key}`;
const stored = (adapter: SiteAdapter, key: string) =>
  (records[draftKey(adapter, key)] as { content?: string } | undefined)?.content;

beforeEach(() => {
  vi.useFakeTimers();
  records = {};
  scopes = [];
  vi.spyOn(chrome.storage.local, 'set').mockImplementation((items, callback) => {
    Object.assign(records, items);
    callback?.();
    return Promise.resolve();
  });
  const get = vi.spyOn(chrome.storage.local, 'get') as unknown as ReturnType<typeof vi.fn>;
  get.mockImplementation(
    (keys: string | null, callback: (items: Record<string, unknown>) => void) => {
      callback(typeof keys === 'string' ? { [keys]: records[keys] } : { ...records });
    },
  );
  vi.spyOn(chrome.storage.local, 'remove').mockImplementation((keys) => {
    for (const key of typeof keys === 'string' ? [keys] : keys) delete records[key];
    return Promise.resolve();
  });
  Object.defineProperty(chrome.runtime, 'lastError', { get: () => undefined, configurable: true });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 40),
  );
  installProseMirrorEditing();
});

afterEach(async () => {
  await Promise.all(scopes.map((scope) => scope.dispose()));
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each(sites)('draftSave on $name', (site) => {
  const { adapter } = site;
  const mount = (path: string) => {
    window.history.replaceState({}, '', path);
    document.body.innerHTML = `<button id="elsewhere"></button>${site.markup}`;
  };

  it('saves typing after a pause under the site and conversation, never as a Gemini draft', async () => {
    mount(site.conversationPath('abc'));
    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);

    type('half-written question');
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS - 1);
    expect(stored(adapter, 'conv:abc')).toBeUndefined();
    type('half-written question, finished');
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);

    expect(stored(adapter, 'conv:abc')).toBe('half-written question, finished');
    expect(Object.keys(records).filter((key) => key.startsWith('gvDraft_'))).toEqual([]);
  });

  it('restores a saved draft into the empty composer when the conversation reopens', async () => {
    records[draftKey(adapter, 'conv:abc')] = { content: 'Draft\n\nwith a blank line' };
    records[`gvDraft_${site.conversationPath('abc')}`] = { content: 'Gemini-shaped entry' };
    mount(site.conversationPath('abc'));
    document.getElementById('elsewhere')!.focus();

    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);

    expect(text()).toBe('Draft\n\nwith a blank line');
    // Restore leaves focus with the user.
    expect(document.activeElement?.id).toBe('elsewhere');
    expect(records[`gvDraft_${site.conversationPath('abc')}`]).toEqual({
      content: 'Gemini-shaped entry',
    });
  });

  it('restores into a composer the host mounts late with its own empty input event', async () => {
    records[draftKey(adapter, 'conv:abc')] = { content: 'Late draft' };
    mount(site.conversationPath('abc'));
    const field = prompt();
    const parent = field.parentElement!;
    field.remove();

    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);
    parent.appendChild(field);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);

    expect(text()).toBe('Late draft');
  });

  it('keeps the composer empty when the user typed and cleared it before the saved draft loaded', async () => {
    records[draftKey(adapter, 'conv:abc')] = { content: 'Old draft' };
    mount(site.conversationPath('abc'));
    const pendingReads: (() => void)[] = [];
    const get = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    get.mockImplementation(
      (keys: string | null, callback: (items: Record<string, unknown>) => void) => {
        pendingReads.push(() =>
          callback(typeof keys === 'string' ? { [keys]: records[keys] } : { ...records }),
        );
      },
    );

    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);
    type('Something new');
    type('');
    pendingReads.splice(0).forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS * 10 + DRAFT_SAVE_DEBOUNCE_MS);

    expect(text()).toBe('');
    // The clear reaches storage too, so a reload does not bring the old draft back.
    expect(stored(adapter, 'conv:abc')).toBeUndefined();
  });

  it('a late draft load does not refill a composer cleared after it started', async () => {
    records[draftKey(adapter, 'conv:b')] = { content: 'Old draft for B' };
    mount(site.conversationPath('a'));
    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);
    const pendingReads: (() => void)[] = [];
    const get = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    get.mockImplementation(
      (keys: string | null, callback: (items: Record<string, unknown>) => void) => {
        pendingReads.push(() =>
          callback(typeof keys === 'string' ? { [keys]: records[keys] } : { ...records }),
        );
      },
    );

    await navigate(site.conversationPath('b'));
    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS);
    expect(pendingReads).toHaveLength(1);
    type('Something new');
    type('');
    pendingReads.splice(0).forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS * 10 + DRAFT_SAVE_DEBOUNCE_MS);

    expect(text()).toBe('');
    // The clear reaches storage too, so reopening B does not bring the old draft back.
    expect(stored(adapter, 'conv:b')).toBeUndefined();
  });

  it('exhausted restore retries leave the session settled', async () => {
    records[draftKey(adapter, 'conv:abc')] = { content: 'Never placed' };
    records[draftKey(adapter, 'conv:next')] = { content: 'Draft for next' };
    mount(site.conversationPath('abc'));
    const field = prompt();
    const parent = field.parentElement!;
    field.remove();

    activate(adapter);
    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS * 20);
    // The composer shows up only after the retry budget: the restore has given up on it.
    parent.appendChild(field);
    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS * 20);
    expect(text()).toBe('');

    // The session itself keeps working: typing saves, and the next conversation restores.
    type('Typed after the restore gave up');
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);
    expect(stored(adapter, 'conv:abc')).toBe('Typed after the restore gave up');
    await navigate(site.conversationPath('next'));
    hostClears();
    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS);
    expect(text()).toBe('Draft for next');
  });

  it('keeps blank lines identical through save, restore and save again', async () => {
    mount(site.conversationPath('abc'));
    const first = activate(adapter);
    await vi.advanceTimersByTimeAsync(0);
    type('First\n\nThird\n\n\nSixth');
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);
    expect(stored(adapter, 'conv:abc')).toBe('First\n\nThird\n\n\nSixth');

    // Refresh: a new page with an empty composer.
    await first.dispose();
    mount(site.conversationPath('abc'));
    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);
    expect(text()).toBe('First\n\nThird\n\n\nSixth');
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);

    expect(stored(adapter, 'conv:abc')).toBe('First\n\nThird\n\n\nSixth');
  });

  it('never writes a draft over text already in the composer', async () => {
    records[draftKey(adapter, 'conv:abc')] = { content: 'Old draft' };
    mount(site.conversationPath('abc'));
    const field = prompt();
    if (field instanceof HTMLTextAreaElement) field.value = 'Typed first';
    else field.innerHTML = '<p>Typed first</p>';

    activate(adapter);
    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS * 10);

    expect(text()).toBe('Typed first');
    expect(stored(adapter, 'conv:abc')).toBe('Old draft');
  });

  it('drops a stored draft the user clears after the host restored its own copy first', async () => {
    records[draftKey(adapter, 'conv:abc')] = { content: 'Old draft' };
    mount(site.conversationPath('abc'));
    // ChatGPT keeps its own composer drafts and fills the field before the plugin restores.
    const field = prompt();
    if (field instanceof HTMLTextAreaElement) field.value = 'Old draft';
    else field.innerHTML = '<p>Old draft</p>';

    activate(adapter);
    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS);
    type('');
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);

    expect(stored(adapter, 'conv:abc')).toBeUndefined();
  });

  it('drops the draft once Enter sends it and the host empties the composer', async () => {
    mount(site.conversationPath('abc'));
    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);
    type('Send me');
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);
    expect(stored(adapter, 'conv:abc')).toBe('Send me');

    pressEnter();
    hostClears();
    await vi.advanceTimersByTimeAsync(SEND_INTENT_TIMEOUT_MS);

    expect(records).not.toHaveProperty(draftKey(adapter, 'conv:abc'));
  });

  it('drops the draft once the send button sends it', async () => {
    mount(site.conversationPath('abc'));
    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);
    type('Send by click');
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);

    // The host handles the click itself; jsdom would otherwise try to submit the form.
    document.addEventListener('click', (event) => event.preventDefault(), { once: true });
    document.getElementById('send')!.click();
    hostClears();
    await vi.advanceTimersByTimeAsync(SEND_INTENT_TIMEOUT_MS);

    expect(records).not.toHaveProperty(draftKey(adapter, 'conv:abc'));
  });

  it.each(mountOrders)(
    'drops the draft when sendShortcut sends it on Ctrl+Enter ($order)',
    async ({ mountBoth }) => {
      mount(site.conversationPath('abc'));
      mountBoth(adapter);
      await vi.advanceTimersByTimeAsync(0);
      type('Send with the shortcut');
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);

      document.addEventListener('click', (event) => event.preventDefault(), { once: true });
      pressEnter({ ctrlKey: true });
      hostClears();
      await vi.advanceTimersByTimeAsync(SEND_INTENT_TIMEOUT_MS);

      expect(records).not.toHaveProperty(draftKey(adapter, 'conv:abc'));
    },
  );

  it.each(mountOrders)(
    'keeps the draft when sendShortcut turns Enter into a newline and the user opens a chat ($order)',
    async ({ mountBoth }) => {
      // From the new-chat page, the one route change that could pass for a first send.
      mount(site.newChatPath);
      mountBoth(adapter);
      await vi.advanceTimersByTimeAsync(0);
      type('Keep me');
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);
      expect(stored(adapter, 'new')).toBe('Keep me');

      pressEnter();
      // Within the send window: the host gives the opened chat an empty composer.
      await navigate(site.conversationPath('other'));
      hostClears();
      await vi.advanceTimersByTimeAsync(SEND_INTENT_TIMEOUT_MS + DRAFT_SAVE_DEBOUNCE_MS);

      expect(stored(adapter, 'new')).toBe('Keep me');
    },
  );

  it.each(mountOrders)(
    'does not save a first message sent with sendShortcut back to the new-chat draft ($order)',
    async ({ mountBoth }) => {
      mount(site.newChatPath);
      mountBoth(adapter);
      await vi.advanceTimersByTimeAsync(0);
      type('An older new-chat draft');
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);
      type('First message');

      document.addEventListener('click', (event) => event.preventDefault(), { once: true });
      pressEnter({ ctrlKey: true });
      await navigate(site.conversationPath('fresh'));
      hostClears();
      await vi.advanceTimersByTimeAsync(SEND_INTENT_TIMEOUT_MS + DRAFT_SAVE_DEBOUNCE_MS);

      expect(records).not.toHaveProperty(draftKey(adapter, 'new'));
      expect(records).not.toHaveProperty(draftKey(adapter, 'conv:fresh'));
    },
  );

  it('keeps the draft when the composer empties without a send, or Enter only confirms IME text', async () => {
    mount(site.conversationPath('abc'));
    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);
    type('Keep me');
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);

    pressEnter({ isComposing: true });
    pressEnter({ shiftKey: true });
    hostClears();
    await vi.advanceTimersByTimeAsync(SEND_INTENT_TIMEOUT_MS * 2);

    expect(stored(adapter, 'conv:abc')).toBe('Keep me');
  });

  it('does not save a first message back to the new-chat draft when sending opens its conversation', async () => {
    mount(site.newChatPath);
    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);
    type('An older new-chat draft');
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);
    type('First message');

    pressEnter();
    // The host routes to the new conversation before it clears the composer.
    await navigate(site.conversationPath('fresh'));
    hostClears();
    await vi.advanceTimersByTimeAsync(SEND_INTENT_TIMEOUT_MS + DRAFT_SAVE_DEBOUNCE_MS);

    expect(records).not.toHaveProperty(draftKey(adapter, 'new'));
    expect(records).not.toHaveProperty(draftKey(adapter, 'conv:fresh'));
  });

  it('keeps the draft when the host ignores Enter and the user switches chats within the send window', async () => {
    mount(site.conversationPath('abc'));
    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);
    type('Keep me');
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);
    type('Keep me, edited');

    // The host is still answering, so Enter sends nothing; the other chat opens empty.
    pressEnter();
    await navigate(site.conversationPath('other'));
    hostClears();
    await vi.advanceTimersByTimeAsync(SEND_INTENT_TIMEOUT_MS + DRAFT_SAVE_DEBOUNCE_MS);

    expect(stored(adapter, 'conv:abc')).toBe('Keep me, edited');
  });

  it('keeps a clear made just before a reload, so the old draft does not come back', async () => {
    records[draftKey(adapter, 'conv:abc')] = { content: 'Old draft' };
    mount(site.conversationPath('abc'));
    activate(adapter);
    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS);
    expect(text()).toBe('Old draft');

    type('');
    window.dispatchEvent(new Event('pagehide'));

    expect(stored(adapter, 'conv:abc')).toBeUndefined();
  });

  it('switches drafts with in-app navigation, saving the one left behind', async () => {
    records[draftKey(adapter, 'conv:b')] = { content: 'Draft for B' };
    mount(site.conversationPath('a'));
    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);
    type('Unsaved A');

    // Leave before the pause elapses; the host gives B an empty composer.
    await navigate(site.conversationPath('b'));
    hostClears();
    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS);
    expect(stored(adapter, 'conv:a')).toBe('Unsaved A');
    expect(text()).toBe('Draft for B');

    await navigate(site.conversationPath('a'));
    hostClears();
    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS);
    expect(text()).toBe('Unsaved A');
    expect(stored(adapter, 'conv:b')).toBe('Draft for B');
  });

  it('cancels a pending restore when the user moves on before it runs', async () => {
    records[draftKey(adapter, 'conv:b')] = { content: 'Draft for B' };
    mount(site.conversationPath('a'));
    activate(adapter);
    await vi.advanceTimersByTimeAsync(0);

    window.history.pushState({}, '', site.conversationPath('b'));
    await vi.advanceTimersByTimeAsync(ROUTE_POLL_MS);
    window.history.pushState({}, '', site.conversationPath('c'));
    await vi.advanceTimersByTimeAsync(DRAFT_RESTORE_DELAY_MS * 10);

    expect(text()).toBe('');
  });

  it('stops on disable without deleting drafts, and leaves no listener or timer behind', async () => {
    records[draftKey(adapter, 'conv:abc')] = { content: 'Saved earlier' };
    mount(site.conversationPath('abc'));
    const scope = activate(adapter);
    await vi.advanceTimersByTimeAsync(0);
    type('Saved earlier, edited');
    pressEnter();

    await scope.dispose();
    expect(scope.getEffects()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);

    hostClears();
    type('Typed while off');
    await vi.advanceTimersByTimeAsync(SEND_INTENT_TIMEOUT_MS + DRAFT_SAVE_DEBOUNCE_MS);
    expect(stored(adapter, 'conv:abc')).toBe('Saved earlier');
  });
});

describe('draftSave storage', () => {
  const chatgpt = sites[0];

  it('keeps each site to its five newest drafts without touching Gemini or other sites', async () => {
    records['gvDraft_/app/gemini'] = { content: 'Gemini', timestamp: 0 };
    records['gvDraft:claude:conv:x'] = { content: 'Claude', timestamp: 0 };
    window.history.replaceState({}, '', '/c/0');
    document.body.innerHTML = chatgpt.markup;
    activate(chatgpt.adapter);
    for (let index = 0; index < 10; index += 1) {
      vi.setSystemTime(1_000 + index);
      await navigate(`/c/${index}`);
      type(`Draft ${index}`);
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);
    }

    expect(
      Object.keys(records)
        .filter((key) => key.startsWith('gvDraft:chatgpt:'))
        .sort(),
    ).toEqual([5, 6, 7, 8, 9].map((index) => `gvDraft:chatgpt:conv:${index}`));
    expect(records['gvDraft_/app/gemini']).toEqual({ content: 'Gemini', timestamp: 0 });
    expect(records['gvDraft:claude:conv:x']).toEqual({ content: 'Claude', timestamp: 0 });
  });

  it('does not persist a draft in a temporary chat on catalog sites', async () => {
    window.history.replaceState({}, '', '/?temporary-chat=true');
    document.body.innerHTML = chatgpt.markup;
    activate(chatgpt.adapter);
    await vi.advanceTimersByTimeAsync(0);
    type('Off the record');
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS);

    expect(records).toEqual({});
  });

  it('accepts no params', () => {
    expect(draftSavePrimitive.validateParams(undefined).success).toBe(true);
    expect(draftSavePrimitive.validateParams({}).success).toBe(true);
    expect(draftSavePrimitive.validateParams({ composer: 'textarea' })).toEqual({
      success: false,
      error: [{ path: 'params.composer', message: 'unknown parameter' }],
    });
  });
});
