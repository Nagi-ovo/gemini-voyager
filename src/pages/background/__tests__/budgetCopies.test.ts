import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WRITE_COPY_MESSAGE } from '@/features/storage/budgetCopyMessage';
import { createStorageBudget } from '@/features/storage/storageBudget';

import { startBudgetCopies } from '../budgetCopies';

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (reply: unknown) => void,
) => boolean | undefined;

const MIB = 1024 * 1024;

function start(bytesInUse = 0) {
  const stored: Record<string, string> = {};
  const budget = createStorageBudget({
    measure: async () => ({ bytesInUse, keyBytes: 0, limitBytes: 25 * MIB, quotaBytes: null }),
    quota: async () => null,
    barrier: async () => undefined,
  });
  vi.mocked(chrome.runtime.onMessage.addListener).mockClear();
  startBudgetCopies({ budget, write: async (items) => void Object.assign(stored, items) });
  const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0][0] as Listener;
  const send = (
    message: unknown,
    sender: chrome.runtime.MessageSender = { id: chrome.runtime.id },
  ) =>
    new Promise<unknown>((resolve) => {
      const handled = listener(message, sender, resolve);
      if (handled !== true) resolve(handled === undefined ? 'unhandled' : handled);
    });
  return { stored, send };
}

const copy = (key: string, value: unknown = 'v') => ({ type: WRITE_COPY_MESSAGE, key, value });

describe('budget copy writer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes a backup slot the budget admits and replies saved', async () => {
    const { stored, send } = start();

    await expect(send(copy('gvBackup_folders_primary', 'data'))).resolves.toEqual({
      status: 'saved',
    });
    expect(stored).toEqual({ gvBackup_folders_primary: 'data' });
  });

  it('replies skipped without writing when the budget refuses the copy', async () => {
    const { stored, send } = start(24 * MIB);

    await expect(send(copy('gvBackup_folders_emergency'))).resolves.toEqual({ status: 'skipped' });
    expect(stored).toEqual({});
  });

  it.each([
    ['a key outside the backup slots', copy('gvFolderData')],
    ['a non-string value', copy('gvBackup_folders_primary', { a: 1 })],
  ])('leaves %s to other listeners and writes nothing', async (_label, message) => {
    const { stored, send } = start();

    await expect(send(message)).resolves.toBe('unhandled');
    expect(stored).toEqual({});
  });

  it('refuses a sender that is not this extension', async () => {
    const { stored, send } = start();

    await expect(
      send(copy('gvBackup_folders_primary'), { id: 'other-extension' }),
    ).resolves.toEqual({ status: 'skipped' });
    expect(stored).toEqual({});
  });
});
