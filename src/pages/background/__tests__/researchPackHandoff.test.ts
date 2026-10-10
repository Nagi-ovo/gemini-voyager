import { describe, expect, it, vi } from 'vitest';

import {
  HANDOFF_MESSAGES,
  type HandoffBroker,
  type HandoffClaimResult,
  type HandoffOpenResult,
} from '@/features/researchPack/services/handoff';

import {
  handleResearchPackHandoffMessage,
  handoffArea,
  isHandoffReceiverReady,
} from '../researchPackHandoff';

vi.mock('webextension-polyfill', () => ({ default: {} }));

const EXTENSION_ID = chrome.runtime.id;

function fakeBroker() {
  return {
    status: vi.fn(async () => ({ chatgpt: true, claude: false })),
    open: vi.fn(async (): Promise<HandoffOpenResult> => ({ ok: true })),
    peek: vi.fn(async () => true),
    claim: vi.fn(async (): Promise<HandoffClaimResult> => ({ ok: true, markdown: 'pack' })),
    discard: vi.fn(async () => undefined),
    expire: vi.fn(async () => undefined),
    sweep: vi.fn(async () => undefined),
  } satisfies HandoffBroker;
}

const geminiSender = {
  id: EXTENSION_ID,
  frameId: 0,
  tab: { id: 7, index: 3, windowId: 1, url: 'https://gemini.google.com/app/x' },
} as chrome.runtime.MessageSender;
const chatgptSender = (tabId: number, frameId = 0) =>
  ({
    id: EXTENSION_ID,
    frameId,
    tab: { id: tabId, url: 'https://chatgpt.com/' },
  }) as chrome.runtime.MessageSender;
const isGemini = (sender: chrome.runtime.MessageSender) =>
  sender.tab?.url?.startsWith('https://gemini.google.com/') === true;

describe('research pack handoff messages in the background', () => {
  it('opens only for a Gemini sender, next to its tab', async () => {
    const broker = fakeBroker();
    const message = { type: HANDOFF_MESSAGES.open, target: 'claude', markdown: 'pack' };

    await expect(
      handleResearchPackHandoffMessage(broker, message, chatgptSender(9), isGemini),
    ).resolves.toMatchObject({ ok: false });
    expect(broker.open).not.toHaveBeenCalled();

    await handleResearchPackHandoffMessage(broker, message, geminiSender, isGemini);
    expect(broker.open).toHaveBeenCalledWith('claude', 'pack', { tabId: 7, index: 3, windowId: 1 });
  });

  it('claims for the sending tab, never a tab the page names', async () => {
    const broker = fakeBroker();

    await handleResearchPackHandoffMessage(
      broker,
      { type: HANDOFF_MESSAGES.claim, tabId: 1 },
      chatgptSender(42),
      isGemini,
    );
    expect(broker.claim).toHaveBeenCalledWith(42, 'https://chatgpt.com/');
  });

  it('refuses a claim from a subframe or another extension', async () => {
    const broker = fakeBroker();
    const claim = { type: HANDOFF_MESSAGES.claim };

    await expect(
      handleResearchPackHandoffMessage(broker, claim, chatgptSender(42, 2), isGemini),
    ).resolves.toEqual({ ok: false });
    await expect(
      handleResearchPackHandoffMessage(
        broker,
        claim,
        { ...chatgptSender(42), id: 'other-extension' },
        isGemini,
      ),
    ).resolves.toEqual({ ok: false });
    expect(broker.claim).not.toHaveBeenCalled();
  });

  it('ignores messages that are not its own', () => {
    expect(
      handleResearchPackHandoffMessage(
        fakeBroker(),
        { type: 'gv.researchPack.apply' },
        geminiSender,
        isGemini,
      ),
    ).toBeNull();
  });
});

describe('whether Voyager can receive on the target', () => {
  const api = (granted: boolean, registrations: string[][] | undefined) => ({
    containsOrigin: vi.fn(async () => granted),
    registeredMatches: vi.fn(async () => registrations),
  });

  it('needs the host permission and a registered content script covering the new chat', async () => {
    await expect(
      isHandoffReceiverReady('chatgpt', api(true, [['https://chatgpt.com/*']])),
    ).resolves.toBe(true);
    await expect(
      isHandoffReceiverReady('claude', api(true, [['https://*.frame.claudeusercontent.com/*']])),
    ).resolves.toBe(false);
    await expect(
      isHandoffReceiverReady('chatgpt', api(false, [['https://chatgpt.com/*']])),
    ).resolves.toBe(false);
  });

  it('reads a browser that cannot list registrations as not ready', async () => {
    await expect(isHandoffReceiverReady('claude', api(true, undefined))).resolves.toBe(false);
  });
});

describe('where the pending pack is kept', () => {
  it('uses storage.session and never falls back to storage.local', () => {
    const local = { get: vi.fn(), set: vi.fn(), remove: vi.fn() };
    expect(handoffArea({ local } as unknown as typeof chrome.storage)).toBeNull();

    const session = { get: vi.fn(async () => ({})), set: vi.fn(), remove: vi.fn() };
    const area = handoffArea({ local, session } as unknown as typeof chrome.storage);
    void area?.set({ k: 1 });
    expect(session.set).toHaveBeenCalledWith({ k: 1 });
    expect(local.set).not.toHaveBeenCalled();
  });
});
