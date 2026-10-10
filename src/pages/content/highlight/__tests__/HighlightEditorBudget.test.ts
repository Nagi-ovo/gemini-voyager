import { afterEach, describe, expect, it, vi } from 'vitest';

import { HighlightAnnotationService } from '@/core/services/HighlightAnnotationService';
import type { HighlightMessage } from '@/core/types/highlight';
import { createByteStore } from '@/features/storage/__tests__/byteStore';
import { createStorageBudget, storedItemBytes } from '@/features/storage/storageBudget';

import { HighlightEditor } from '../HighlightEditor';
import { HighlightClient } from '../client';
import { makeRecord } from './fixtures';

const scope = { platform: 'gemini' as const, accountHash: 'account-hash' };
const palette = ['yellow', 'green'] as const;

function controls() {
  const popover = document.querySelector<HTMLElement>('.gv-highlight-popover')!;
  return {
    popover,
    note: popover.querySelector<HTMLTextAreaElement>('.gv-highlight-note')!,
    save: popover.querySelector<HTMLButtonElement>('.gv-highlight-popover-button-primary')!,
    cancel: popover.querySelectorAll<HTMLButtonElement>('.gv-highlight-popover-button')[1],
    status: popover.querySelector<HTMLElement>('.gv-highlight-save-status')!,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('highlight editor behind a hung copy', () => {
  it('shows an unknown outcome, keeps a closable draft without retrying, and accepts a late save', async () => {
    const store = createByteStore();
    const budget = createStorageBudget({
      measure: async (keys) => ({
        bytesInUse: await store.area.getBytesInUse(null),
        keyBytes: await store.area.getBytesInUse(keys),
        limitBytes: 25 * 1024 * 1024,
        quotaBytes: null,
      }),
      quota: async () => null,
      barrier: () => store.area.get('barrier'),
    });
    const service = new HighlightAnnotationService({
      storage: { ...store.area, getEffectiveQuotaBytes: async () => null },
      budget,
    });
    const input = makeRecord({
      quote: { exact: 'target', prefix: 'Before ', suffix: ' after' },
      position: { start: 7, end: 13 },
      sourceTextHash: 'source',
    });
    const { record } = await service.add(scope, input);
    let copyEntered!: () => void;
    const entered = new Promise<void>((resolve) => (copyEntered = resolve));
    const copy = budget.run(
      { kind: 'copy', keys: ['copy'], bytes: storedItemBytes('copy', 'backup') },
      () => {
        store.hold();
        copyEntered();
        return store.area.set({ copy: 'backup' });
      },
    );
    await entered;

    const send = vi.mocked(chrome.runtime.sendMessage);
    send.mockImplementation((...args: unknown[]) => {
      const message = args[0] as Extract<HighlightMessage, { type: 'gv.highlight.update' }>;
      const reply = args[1] as (response: unknown) => void;
      const { conversationId, id, patch } = message.payload;
      void service.update(scope, conversationId, id, patch).then(
        (updated) => reply({ ok: true, record: updated }),
        (error: Error) => reply({ ok: false, error: error.message }),
      );
    });
    const client = new HighlightClient();
    const announce = vi.fn();
    const editor = new HighlightEditor({
      save: async (saved, patch) => {
        await client.update(
          { platform: 'gemini', accountKey: 'user@example.com', accountId: 1, routeUserId: '0' },
          saved.conversationId,
          saved.id,
          patch,
        );
      },
      delete: vi.fn(),
      announce,
    });
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    vi.useFakeTimers();
    try {
      editor.open(record, anchor, palette);
      const first = controls();
      first.note.value = 'Keep this draft';
      first.popover.querySelectorAll<HTMLButtonElement>('.gv-highlight-swatch')[1].click();
      first.save.click();
      await vi.advanceTimersByTimeAsync(15_000);

      expect(first.status?.hidden).toBe(false);
      expect(first.status.textContent).toContain('Still waiting for confirmation');
      expect(first.save.disabled).toBe(true);
      expect(first.cancel.disabled).toBe(false);
      expect(first.cancel.textContent).toBe('Close');
      expect(announce).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('Still waiting for confirmation'),
      );
      expect(store.has('copy')).toBe(false);
      first.cancel.click();
      expect(first.popover.isConnected).toBe(false);

      editor.open({ ...record }, anchor, palette);
      const reopened = controls();
      expect(reopened.note.value).toBe('Keep this draft');
      expect(reopened.status.hidden).toBe(false);
      expect(reopened.save.disabled).toBe(true);
      expect(
        reopened.popover.querySelectorAll('.gv-highlight-swatch')[1].getAttribute('aria-pressed'),
      ).toBe('true');
      reopened.save.click();
      expect(send).toHaveBeenCalledTimes(1);

      store.release();
      await copy;
      await vi.advanceTimersByTimeAsync(0);
      expect(reopened.popover.isConnected).toBe(false);
      expect(announce).toHaveBeenCalledWith('Highlight saved');
      expect(await service.getConversation(scope, record.conversationId)).toEqual([
        expect.objectContaining({ note: 'Keep this draft', color: 'green' }),
      ]);
    } finally {
      store.release();
      editor.close();
    }
  });
});
