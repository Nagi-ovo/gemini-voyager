/**
 * The ChatGPT page behind the catalog timeline message-time tests: chat one
 * with one earlier exchange, a composer, the "message timestamps" setting on, an
 * in-memory `chrome.storage` and a fresh background send-time handler, with
 * ChatGPT's timeline mounted.
 *
 * Each test file imports `./testSetup` first, mocks `@/utils/i18n` and
 * `@/features/timeline/timelineStyleCoachmark`, and calls `installChatGPTSendTimes()`.
 */
import { afterEach, beforeEach, expect, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { requireBundledSiteAdapter } from '@/features/plugins/catalog/sites';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { turnNavigatorPrimitive } from '@/features/plugins/verbs/turnNavigator';
import { SEND_TIME_RECORD_MESSAGE } from '@/features/timeline/adapters/catalog/sendTimesMessages';
import { createSendTimeMessageHandler } from '@/pages/background/sendTimeMessages';
import { TimestampService } from '@/pages/content/timestamp/TimestampService';
import { type MemoryStorage, createMemoryStorage } from '@/tests/memoryStorage';

export const SENT_AT = new Date(2026, 9, 5, 12, 34, 56).getTime();
export const SENT_LABEL = new TimestampService().formatAbsoluteTime(SENT_AT);

export let storage: MemoryStorage;
export let scope: PluginScope;
export let thread: HTMLElement;
export let composer: HTMLElement;
let background: ReturnType<typeof createSendTimeMessageHandler>;
/** The background's replies reach this page once `replies.gate` resolves. */
export const replies: { gate: Promise<void> } = { gate: Promise.resolve() };

/** A top-frame content script of ours on `url`. */
function tabOn(url: string): chrome.runtime.MessageSender {
  return { id: chrome.runtime.id, tab: { url } as chrome.tabs.Tab, frameId: 0 };
}

/** Another ChatGPT tab on chat one saves a send through the background. */
export async function saveFromAnotherTab(turnKey: string, sentAt: number): Promise<void> {
  const payload = { site: 'chatgpt', conversationId: 'one', turnKey, sentAt };
  await background({ type: SEND_TIME_RECORD_MESSAGE, payload }, tabOn('https://chatgpt.com/c/one'));
}

export async function flush(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

export const ONE_KEY = 'gvMessageTimestamps:chatgpt:conv:one';
export const INDEX_KEY = 'gvMessageTimestamps:chatgpt:index';

/** Every stored key holding message times, Gemini's or a catalog site's. */
export function storedTimeKeys(): string[] {
  return [...storage.values.local.keys()].filter((key) => key.startsWith('gvMessageTimestamps'));
}

/** Lets timer-scheduled storage writes land. */
export const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * One exchange as ChatGPT renders it (see `chatgptThreadFixture`): an item keyed
 * by `data-turn-key`, the prompt in its bubble, then the reply, if any.
 */
export function exchange(key: string, prompt: string, reply?: string): HTMLElement {
  const item = document.createElement('div');
  item.setAttribute('data-turn-key', key);
  item.innerHTML = `<h4 class="sr-only">You said:</h4>
    <div data-chatgpt-search-unit-key="${key}-u" data-chatgpt-search-message-ids="${key}">
      <div class="group/user-message flex flex-col items-end">
        <div data-user-message-bubble="true"><div dir="auto"></div></div>
        <div><span data-state="closed"><button aria-label="Copy message">Copy</button></span></div>
      </div>
    </div>`;
  item.querySelector('[dir="auto"]')!.textContent = prompt;
  if (reply !== undefined) {
    item.insertAdjacentHTML(
      'beforeend',
      `<div data-chatgpt-search-unit-key="${key}-a" data-chatgpt-search-message-ids="${key}-a">
         <h4 data-conversation-role="assistant">ChatGPT said:</h4>
         <div data-chatgpt-selection-conversation-id="one" data-chatgpt-selection-message-id="${key}-a">
           <div data-markdown-text-style="assistant-message" dir="auto"><p></p></div>
         </div>
       </div>`,
    );
    item.querySelector('p')!.textContent = reply;
  }
  return item;
}

export function itemOf(key: string): HTMLElement {
  const item = document.querySelector<HTMLElement>(`[data-turn-key="${key}"]`);
  if (!item) throw new Error(`no turn "${key}"`);
  return item;
}

/** The send times shown in the thread, inside turn `key` or anywhere. */
export function inlineTimes(key?: string): string[] {
  const root = key === undefined ? document : itemOf(key);
  return Array.from(root.querySelectorAll('.gv-timestamp'), (label) => label.textContent ?? '');
}

export function dotFor(prompt: string): HTMLElement {
  const dot = Array.from(document.querySelectorAll<HTMLElement>('.timeline-dot')).find(
    (candidate) => candidate.getAttribute('aria-label') === prompt,
  );
  if (!dot) throw new Error(`no dot for "${prompt}"`);
  return dot;
}

/** The tooltip the rail shows when the pointer rests on `prompt`'s dot. */
export async function tooltipOf(prompt: string): Promise<string> {
  const tip = document.querySelector<HTMLElement>('.timeline-tooltip')!;
  tip.textContent = '';
  dotFor(prompt).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  await vi.waitFor(() => expect(tip.textContent).toContain(prompt));
  return tip.textContent ?? '';
}

/** Mounts ChatGPT's timeline on the current thread, as a page load does. */
export async function openTimeline(): Promise<void> {
  scope = new PluginScope();
  turnNavigatorPrimitive.activate(
    scope,
    {},
    {
      doc: document,
      adapter: requireBundledSiteAdapter('chatgpt'),
      pluginId: 'voyager.chatgpt-timeline',
      settings: {},
      setTargetCounter: () => {},
    },
  );
  await vi.waitFor(() => dotFor('Earlier question'));
}

/** The user sends `prompt` at `at` and ChatGPT renders it as turn `key`. */
export async function send(
  prompt: string,
  key: string,
  at = SENT_AT,
  reply?: string,
): Promise<void> {
  composer.textContent = prompt;
  vi.setSystemTime(at);
  composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  composer.textContent = '';
  vi.setSystemTime(at + 5_000);
  thread.append(exchange(key, prompt, reply));
  await vi.waitFor(() => dotFor(prompt));
}

export function installChatGPTSendTimes(): void {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SENT_AT);
    history.replaceState({}, '', '/c/one');
    document.body.innerHTML =
      '<main></main><form><div data-composer-markdown contenteditable="true"></div></form>';
    thread = document.querySelector('main')!;
    composer = document.querySelector('[data-composer-markdown]')!;
    thread.append(exchange('turn-1', 'Earlier question'));
    storage = createMemoryStorage();
    storage.values.sync.set(StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS, true);
    vi.stubGlobal('chrome', { ...chrome, storage: storage.api });
    // The background owns writes; each test gets a fresh worker.
    background = createSendTimeMessageHandler();
    replies.gate = Promise.resolve();
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      request: { type: string },
      callback: (value: unknown) => void,
    ) => {
      if (request.type === 'gv.starred.getForConversation') callback({ ok: true, messages: [] });
      const reply = background(request, tabOn(location.href));
      void reply?.then((value) => replies.gate.then(() => callback(value)));
    }) as typeof chrome.runtime.sendMessage);
    await openTimeline();
  });

  afterEach(async () => {
    await scope.dispose();
    document.body.innerHTML = '';
    history.replaceState({}, '', '/');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
}
