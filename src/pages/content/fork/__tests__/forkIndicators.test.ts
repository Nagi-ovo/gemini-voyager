import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmDriver } from '@/tests/confirmDriver';

import { ForkNodesService } from '../ForkNodesService';
import { collectForkChatPairs } from '../chatPairs';
import { createForkIndicators } from '../forkIndicators';
import type { ForkNode } from '../forkTypes';

vi.mock('../ForkNodesService', () => ({
  ForkNodesService: {
    getForConversation: vi.fn(),
    getGroup: vi.fn(),
    removeForkNode: vi.fn(),
  },
}));
vi.mock('../chatPairs', () => ({ collectForkChatPairs: vi.fn() }));

describe('fork indicators', () => {
  let indicators: ReturnType<typeof createForkIndicators>;
  let source: ForkNode;
  let branch: ForkNode;
  let sequence = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sequence += 1;
    source = {
      conversationId: `source-${sequence}`,
      conversationUrl: `https://gemini.google.com/app/source-${sequence}`,
      conversationTitle: 'Source',
      turnId: 's-1111111111111111',
      forkGroupId: `group-${sequence}`,
      forkIndex: 0,
      createdAt: 1,
    };
    branch = {
      ...source,
      conversationId: `branch-${sequence}`,
      conversationUrl: `https://gemini.google.com/app/branch-${sequence}`,
      forkIndex: 1,
    };
    document.body.innerHTML = '<div id="user">A turn</div>';
    const userElement = document.querySelector<HTMLElement>('#user')!;
    vi.mocked(collectForkChatPairs).mockReturnValue([
      { turnId: source.turnId, user: 'A turn', assistant: '', userElement },
    ]);
    vi.mocked(ForkNodesService.getForConversation).mockResolvedValue([source]);
    vi.mocked(ForkNodesService.getGroup).mockResolvedValue([source, branch]);
    vi.mocked(ForkNodesService.removeForkNode).mockResolvedValue(true);
    indicators = createForkIndicators({
      getConversationId: () => source.conversationId,
      resolveTurnId: (turnId) => turnId,
      ensureTurnId: () => source.turnId,
      resolveUserMessageHost: (element) => element,
    });
  });

  afterEach(() => {
    indicators.stop();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('keeps a branch when verification fails instead of deleting its data', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('CSP blocked'));
    await indicators.inject();

    expect(document.querySelectorAll('.gv-fork-indicator')).toHaveLength(2);
    expect(ForkNodesService.removeForkNode).not.toHaveBeenCalled();
    const current = document.querySelector<HTMLButtonElement>('.gv-current')!;
    expect(current.disabled).toBe(true);
    expect(current.getAttribute('aria-current')).toBe('true');
  });

  it('prunes a branch whose URL redirects to a different conversation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      url: 'https://gemini.google.com/app/different',
    } as Response);
    await indicators.inject();

    expect(ForkNodesService.removeForkNode).toHaveBeenCalledWith(
      branch.conversationId,
      branch.turnId,
      branch.forkGroupId,
    );
    expect(document.querySelector('.gv-fork-indicator-group')).toBeNull();
  });

  it('uses native sidebar events and reuses successful existence checks across a stop', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      url: branch.conversationUrl,
    } as Response);
    await indicators.inject();
    indicators.stop();
    indicators = createForkIndicators({
      getConversationId: () => source.conversationId,
      resolveTurnId: (turnId) => turnId,
      ensureTurnId: () => source.turnId,
      resolveUserMessageHost: (element) => element,
    });
    await indicators.inject();
    expect(fetch).toHaveBeenCalledOnce();

    // jsdom rejects Vitest's window proxy in view; omit only that realm field.
    const NativeMouseEvent = MouseEvent;
    vi.stubGlobal(
      'MouseEvent',
      class extends NativeMouseEvent {
        constructor(type: string, options?: MouseEventInit) {
          super(type, { ...options, view: null });
        }
      },
    );
    const link = document.createElement('a');
    link.href = branch.conversationUrl;
    document.body.appendChild(link);
    const events: string[] = [];
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
      link.addEventListener(type, (event) => {
        events.push(type);
        event.preventDefault();
      });
    }
    document.querySelectorAll<HTMLButtonElement>('.gv-fork-indicator')[1].click();
    expect(events).toEqual(['pointerdown', 'mousedown', 'mouseup', 'click']);
  });

  it('removes a branch link only after the user confirms', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await indicators.inject();
    const deleteBranch = () =>
      document.querySelectorAll<HTMLButtonElement>('.gv-fork-indicator-delete')[1].click();

    deleteBranch();
    expect(confirmDriver.message()).toContain('Delete this branch link?');
    confirmDriver.answer('Cancel');
    await vi.advanceTimersByTimeAsync(0);
    expect(ForkNodesService.removeForkNode).not.toHaveBeenCalled();

    deleteBranch();
    confirmDriver.answer('Delete');
    await vi.advanceTimersByTimeAsync(0);
    expect(ForkNodesService.removeForkNode).toHaveBeenCalledWith(
      branch.conversationId,
      branch.turnId,
      branch.forkGroupId,
    );
  });

  it('keeps a branch link when the conversation changes while its delete confirm is open', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await indicators.inject();

    document.querySelectorAll<HTMLButtonElement>('.gv-fork-indicator-delete')[1].click();
    source.conversationId = 'another-conversation';
    confirmDriver.answer('Delete');
    await vi.advanceTimersByTimeAsync(0);

    expect(ForkNodesService.removeForkNode).not.toHaveBeenCalled();
  });

  it('closes an open delete confirm when stopped', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await indicators.inject();

    document.querySelectorAll<HTMLButtonElement>('.gv-fork-indicator-delete')[1].click();
    indicators.stop();
    await vi.advanceTimersByTimeAsync(0);

    expect(confirmDriver.isOpen()).toBe(false);
    expect(ForkNodesService.removeForkNode).not.toHaveBeenCalled();
  });

  it('cancels a queued storage refresh when stopped', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await indicators.inject();
    indicators.refresh();
    indicators.stop();
    await vi.advanceTimersByTimeAsync(500);

    expect(document.querySelector('.gv-fork-indicator-group')).toBeNull();
    expect(ForkNodesService.getForConversation).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
