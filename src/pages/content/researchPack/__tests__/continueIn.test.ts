import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import {
  HANDOFF_MESSAGES,
  type HandoffMessage,
  type HandoffStatus,
} from '@/features/researchPack/services/handoff';
import { toastDriver } from '@/tests/toastDriver';

import { startResearchPack } from '../index';
import { clickAdd, flush, sharedStorage, turn } from './fixtures';

const KEY = StorageKeys.RESEARCH_PACK;

function continueButton(target: 'chatgpt' | 'claude'): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`.gv-rp-continue-btn[data-target="${target}"]`)!;
}

function shownMessage(): string {
  const status = document.querySelector('.gv-rp-status')?.textContent ?? '';
  return status || (toastDriver.all()[0]?.message ?? '');
}

describe('research pack: continue in ChatGPT / Claude', () => {
  let stop: (() => void) | null = null;
  let status: HandoffStatus;
  let openReply: unknown;
  let send: ReturnType<typeof vi.fn<(message: HandoffMessage) => Promise<unknown>>>;
  let writeClipboard: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
  /** Whether this browser has the Navigation API the receiver needs. */
  let hasNavigationApi: boolean;
  /** What had been asked of the extension when the clipboard was written. */
  let sentBeforeCopy: string[];

  const opens = () =>
    send.mock.calls
      .map(([message]) => message)
      .filter(({ type }) => type === HANDOFF_MESSAGES.open);

  async function startWithOneItem(): Promise<void> {
    const host = turn('<p>Answer about Rayleigh scattering.</p>');
    stop = startResearchPack({
      store: sharedStorage().store,
      resolveKey: async () => KEY,
      continueIn: { send, writeClipboard, hasNavigationApi: () => hasNavigationApi },
    });
    clickAdd(host);
    await flush();
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    status = { chatgpt: false, claude: false };
    openReply = { ok: true };
    sentBeforeCopy = [];
    hasNavigationApi = true;
    send = vi.fn(async (message: HandoffMessage) =>
      message.type === HANDOFF_MESSAGES.status ? status : openReply,
    );
    writeClipboard = vi.fn(async () => {
      sentBeforeCopy = send.mock.calls.map(([message]) => message.type);
    });
  });

  afterEach(() => {
    stop?.();
    stop = null;
    document.body.innerHTML = '';
  });

  it('stays disabled until the pack has something to hand over', async () => {
    stop = startResearchPack({
      store: sharedStorage().store,
      resolveKey: async () => KEY,
      continueIn: { send, writeClipboard, hasNavigationApi: () => hasNavigationApi },
    });
    await flush();
    expect(continueButton('chatgpt').disabled).toBe(true);
    expect(continueButton('chatgpt').textContent).toBe('Continue in ChatGPT');
    expect(continueButton('claude').textContent).toBe('Continue in Claude');
  });

  it('copies inside the click and only then opens the new chat when Voyager cannot run there', async () => {
    await startWithOneItem();

    continueButton('claude').click();
    // Synchronously, in the gesture, before anything is asked of the background.
    expect(writeClipboard).toHaveBeenCalledOnce();
    expect(writeClipboard.mock.calls[0][0]).toContain('Answer about Rayleigh scattering.');
    expect(sentBeforeCopy).not.toContain(HANDOFF_MESSAGES.open);
    expect(opens()).toEqual([]);

    await flush();
    // The background only opens the chat: the pack does not leave this page.
    expect(opens()).toEqual([{ type: HANDOFF_MESSAGES.open, target: 'claude' }]);
    expect(shownMessage()).toBe('Pack copied. Paste it into the new Claude chat.');
  });

  it('opens nothing when the copy fails', async () => {
    writeClipboard.mockRejectedValue(new Error('denied'));
    await startWithOneItem();

    continueButton('chatgpt').click();
    await flush();

    expect(opens()).toEqual([]);
    expect(shownMessage()).toBe('Couldn’t copy. Use Download instead.');
  });

  it('hands the pack to the background when Voyager runs on the target, without the clipboard', async () => {
    status = { chatgpt: true, claude: false };
    await startWithOneItem();

    continueButton('chatgpt').click();
    await flush();

    expect(writeClipboard).not.toHaveBeenCalled();
    const [open] = opens();
    expect(open).toMatchObject({ type: HANDOFF_MESSAGES.open, target: 'chatgpt' });
    expect((open as { markdown?: string }).markdown).toContain('Answer about Rayleigh scattering.');
    expect(shownMessage()).toBe('Opening ChatGPT. The pack will be in the message box, unsent.');
  });

  it('asks for a fresh click when the target stopped being ready, and that click copies', async () => {
    status = { chatgpt: true, claude: false };
    await startWithOneItem();
    status = { chatgpt: false, claude: false };
    openReply = { ok: false, reason: 'unavailable' };

    continueButton('chatgpt').click();
    await flush();
    expect(writeClipboard).not.toHaveBeenCalled();
    expect(shownMessage()).toContain('Click again to copy the pack and open ChatGPT');

    openReply = { ok: true };
    continueButton('chatgpt').click();
    expect(writeClipboard).toHaveBeenCalledOnce();
  });

  it('opens one tab for a double click, then accepts the next click', async () => {
    status = { chatgpt: true, claude: false };
    await startWithOneItem();

    continueButton('chatgpt').click();
    continueButton('chatgpt').click();
    await flush();
    expect(opens()).toHaveLength(1);

    continueButton('claude').click();
    continueButton('claude').click();
    await flush();
    expect(writeClipboard).toHaveBeenCalledOnce();
    expect(opens()).toHaveLength(2);

    continueButton('chatgpt').click();
    await flush();
    expect(opens()).toHaveLength(3);
  });

  it('checks the targets again whenever the panel opens', async () => {
    await startWithOneItem();
    const statusChecks = () =>
      send.mock.calls.filter(([message]) => message.type === HANDOFF_MESSAGES.status).length;
    const before = statusChecks();

    document.querySelector<HTMLButtonElement>('.gv-rp-launcher')!.click();
    await flush();
    expect(statusChecks()).toBe(before + 1);
  });

  it('removes its buttons on stop and stays quiet about replies that land afterwards', async () => {
    status = { chatgpt: true, claude: true };
    await startWithOneItem();
    let reply!: (value: unknown) => void;
    send.mockImplementationOnce(() => new Promise((resolve) => (reply = resolve)));

    continueButton('claude').click();
    await vi.waitFor(() => expect(opens()).toHaveLength(1));
    stop!();
    stop = null;
    reply({ ok: true });
    await flush();

    expect(document.querySelector('.gv-rp-continue-btn')).toBeNull();
    expect(document.querySelector('.gv-rp-root')).toBeNull();
  });

  it('copies instead of handing off in a browser without the Navigation API', async () => {
    status = { chatgpt: true, claude: true };
    hasNavigationApi = false;
    await startWithOneItem();

    continueButton('chatgpt').click();
    expect(writeClipboard).toHaveBeenCalledOnce();
    await flush();

    expect(opens()).toEqual([{ type: HANDOFF_MESSAGES.open, target: 'chatgpt' }]);
    expect(shownMessage()).toBe('Pack copied. Paste it into the new ChatGPT chat.');
  });
});
