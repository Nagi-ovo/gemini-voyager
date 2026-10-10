import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HANDOFF_MESSAGES } from '@/features/researchPack/services/handoff';

import { startResearchPackOwner } from '../researchPackOwner';

vi.mock('webextension-polyfill', () => ({
  default: { permissions: { contains: vi.fn(async () => true) } },
}));

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => unknown;

/** Chrome's dispatch: every listener sees the message, and the first sendResponse wins. */
function dispatch(
  listeners: Listener[],
  message: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  return new Promise((resolve) => {
    let answered = false;
    const sendResponse = (response: unknown) => {
      if (answered) return;
      answered = true;
      resolve(response);
    };
    const keepsChannelOpen = listeners
      .map((listener) => listener(message, sender, sendResponse))
      .some((result) => result === true);
    if (!keepsChannelOpen && !answered) resolve(undefined);
  });
}

describe('research pack handoff wired into the background', () => {
  const original = {
    runtime: chrome.runtime,
    storage: chrome.storage,
    tabs: chrome.tabs,
    scripting: (chrome as { scripting?: unknown }).scripting,
  };
  let listeners: Listener[];
  const session = new Map<string, unknown>();

  beforeEach(() => {
    listeners = [];
    session.clear();
    Object.assign(chrome, {
      runtime: {
        ...original.runtime,
        id: 'voyager-test',
        onMessage: { addListener: (listener: Listener) => listeners.push(listener) },
      },
      storage: {
        ...original.storage,
        session: {
          get: async (key: string | null) =>
            key === null
              ? Object.fromEntries(session)
              : session.has(key)
                ? { [key]: session.get(key) }
                : {},
          set: async (items: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(items)) session.set(key, value);
          },
          remove: async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) session.delete(key);
          },
        },
      },
      tabs: {
        ...original.tabs,
        create: vi.fn(async () => ({ id: 42 })),
        onRemoved: { addListener: vi.fn() },
      },
      scripting: {
        getRegisteredContentScripts: vi.fn(async () => [{ matches: ['https://chatgpt.com/*'] }]),
      },
    });
  });

  afterEach(() => {
    Object.assign(chrome, original);
  });

  it('answers open from Gemini and claim from the new ChatGPT tab, past the Gemini-only apply gate', async () => {
    startResearchPackOwner();
    const gemini = {
      id: 'voyager-test',
      frameId: 0,
      tab: { id: 7, index: 0, windowId: 1, url: 'https://gemini.google.com/app' },
    } as chrome.runtime.MessageSender;
    const chatgpt = {
      id: 'voyager-test',
      frameId: 0,
      tab: { id: 42, url: 'https://chatgpt.com/' },
    } as chrome.runtime.MessageSender;

    await expect(dispatch(listeners, { type: HANDOFF_MESSAGES.status }, gemini)).resolves.toEqual({
      chatgpt: true,
      claude: false,
    });
    await expect(
      dispatch(
        listeners,
        { type: HANDOFF_MESSAGES.open, target: 'chatgpt', markdown: '# Pack' },
        gemini,
      ),
    ).resolves.toEqual({ ok: true });
    expect(chrome.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://chatgpt.com/', openerTabId: 7 }),
    );

    await expect(dispatch(listeners, { type: HANDOFF_MESSAGES.peek }, chatgpt)).resolves.toEqual({
      ok: true,
      pending: true,
    });
    await expect(dispatch(listeners, { type: HANDOFF_MESSAGES.claim }, chatgpt)).resolves.toEqual({
      ok: true,
      markdown: '# Pack',
    });
    await expect(dispatch(listeners, { type: HANDOFF_MESSAGES.claim }, chatgpt)).resolves.toEqual({
      ok: false,
    });
  });

  it('sends every click down the clipboard path in a browser without storage.session', async () => {
    Object.assign(chrome, { storage: { ...original.storage, session: undefined } });
    startResearchPackOwner();
    const gemini = {
      id: 'voyager-test',
      frameId: 0,
      tab: { id: 7, index: 0, windowId: 1, url: 'https://gemini.google.com/app' },
    } as chrome.runtime.MessageSender;

    await expect(dispatch(listeners, { type: HANDOFF_MESSAGES.status }, gemini)).resolves.toEqual({
      chatgpt: false,
      claude: false,
    });
    await expect(
      dispatch(
        listeners,
        { type: HANDOFF_MESSAGES.open, target: 'chatgpt', markdown: '# Pack' },
        gemini,
      ),
    ).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
