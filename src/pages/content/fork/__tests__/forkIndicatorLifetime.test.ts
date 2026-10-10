import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmDriver } from '@/tests/confirmDriver';

import { createForkIndicators } from '../forkIndicators';
import type { ForkNode } from '../forkTypes';
import { makeTurnId, normalizeTurnId } from '../turnId';

const owners: ReturnType<typeof createForkIndicators>[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  owners.splice(0).forEach((owner) => owner.stop());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('fork indicator lifetime', () => {
  it.each([
    ...['conversation nodes', 'group nodes', 'conversation verification'].map((boundary) => [
      `branch-link Delete still asks after fork goes off and back on during a delayed load (${boundary})`,
      boundary,
    ]),
    [
      'a fork restart keeps fresh controls while an earlier confirmed removal finishes',
      'branch removal',
    ],
  ])('%s', async (_symptom, delayedBoundary) => {
    const source: ForkNode = {
      conversationId: `source-${delayedBoundary.replaceAll(' ', '-')}`,
      conversationUrl: 'https://gemini.google.com/app/source',
      turnId: 's-1111111111111111',
      forkGroupId: `group-${delayedBoundary}`,
      forkIndex: 0,
      createdAt: 1,
    };
    const branch: ForkNode = {
      ...source,
      conversationId: `branch-${delayedBoundary.replaceAll(' ', '-')}`,
      conversationUrl: `https://gemini.google.com/app/branch-${delayedBoundary.replaceAll(' ', '-')}`,
      forkIndex: 1,
    };
    let stored = [source, branch];
    const removed: unknown[] = [];
    const deferred: { release?: () => void } = {};
    let delayed = false;
    document.body.innerHTML = `
        <main><div class="conversation-container" id="1111111111111111">
          <div class="user-query-container"><div class="user-query-bubble-with-background">A prompt</div></div>
          <div class="response-container"><div class="markdown-main-panel">An answer</div></div>
        </div></main>`;

    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      message: { type: string; payload?: { conversationId?: string } },
      callback: (response: unknown) => void,
    ) => {
      const reply = () => {
        if (message.type === 'gv.fork.getForConversation') {
          callback({
            ok: true,
            nodes: stored.filter((node) => node.conversationId === source.conversationId),
          });
        } else if (message.type === 'gv.fork.getGroup') {
          callback({ ok: true, nodes: stored });
        } else if (message.type === 'gv.fork.remove') {
          removed.push(message.payload);
          stored = stored.filter((node) => node.conversationId !== message.payload?.conversationId);
          callback({ ok: true, removed: true });
        } else {
          throw new Error(`Unexpected fork request: ${message.type}`);
        }
      };
      const shouldDelay =
        !delayed &&
        ((delayedBoundary === 'conversation nodes' &&
          message.type === 'gv.fork.getForConversation') ||
          (delayedBoundary === 'group nodes' && message.type === 'gv.fork.getGroup') ||
          (delayedBoundary === 'branch removal' && message.type === 'gv.fork.remove'));
      if (shouldDelay) {
        delayed = true;
        deferred.release = reply;
      } else reply();
    }) as typeof chrome.runtime.sendMessage);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const response = { ok: true, url: branch.conversationUrl } as Response;
      if (delayedBoundary === 'conversation verification' && !delayed) {
        delayed = true;
        return new Promise<Response>((resolve) => {
          deferred.release = () => resolve(response);
        });
      }
      return response;
    });
    const start = () => {
      const owner = createForkIndicators({
        getConversationId: () => source.conversationId,
        resolveTurnId: normalizeTurnId,
        ensureTurnId: makeTurnId,
        resolveUserMessageHost: (element) =>
          element.querySelector<HTMLElement>('.user-query-bubble-with-background') ?? element,
      });
      owners.push(owner);
      return owner;
    };

    const stopped = start();
    const pending = stopped.inject();
    if (delayedBoundary === 'branch removal') {
      await pending;
      const previousDelete = document.querySelectorAll<HTMLButtonElement>(
        '.gv-fork-indicator-delete',
      )[1];
      previousDelete.getBoundingClientRect = () => new DOMRect(10, 10, 20, 20);
      previousDelete.click();
      confirmDriver.answer('Delete');
    }
    for (let index = 0; index < 20; index++) await Promise.resolve();
    expect(deferred.release).toBeDefined();
    stopped.stop();
    const active = start();
    if (delayedBoundary === 'branch removal') {
      await active.inject();
      const freshGroup = document.querySelector('.gv-fork-indicator-group')!;
      deferred.release!();
      await vi.advanceTimersByTimeAsync(0);
      expect(freshGroup.isConnected).toBe(true);
    } else {
      deferred.release!();
      await pending;
      await active.inject();
    }
    expect(document.querySelectorAll('.gv-fork-indicator-group')).toHaveLength(1);
    const deleteButton = document.querySelectorAll<HTMLButtonElement>(
      '.gv-fork-indicator-delete',
    )[1];
    deleteButton.getBoundingClientRect = () => new DOMRect(10, 10, 20, 20);
    deleteButton.click();
    expect(confirmDriver.isOpen()).toBe(true);
    expect(confirmDriver.message()).toContain('Delete this branch link?');
    confirmDriver.answer('Cancel');
    await vi.advanceTimersByTimeAsync(0);
    if (delayedBoundary === 'branch removal') {
      expect(removed).toHaveLength(1);
      expect(stored).toEqual([source]);
      return;
    }
    expect(removed).toEqual([]);
    expect(stored).toEqual([source, branch]);

    deleteButton.click();
    confirmDriver.answer('Delete');
    await vi.advanceTimersByTimeAsync(0);
    expect(removed).toEqual([
      {
        conversationId: branch.conversationId,
        turnId: branch.turnId,
        forkGroupId: branch.forkGroupId,
      },
    ]);
    expect(stored).toEqual([source]);
    expect(confirmDriver.isOpen()).toBe(false);
  });
});
