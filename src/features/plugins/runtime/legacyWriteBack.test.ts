/**
 * The shared write-back flow migrated official plugins keep from their
 * native modules: only the latest read writes, only the first read may record
 * a derived switch, and nothing outlives the scope.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type LegacyWriteBackCheck, startLegacyWriteBack } from './legacyWriteBack';
import { PluginScope } from './pluginScope';

const KEY = 'gvExampleWidth';

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

function storageChange(changes: Record<string, { newValue?: unknown }>, area: string): void {
  for (const [listener] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls) {
    (listener as (changes: unknown, area: string) => void)(changes, area);
  }
}

afterEach(() => {
  vi.mocked(chrome.storage.sync.get).mockReset();
  vi.mocked(chrome.storage.sync.set).mockReset();
  vi.mocked(chrome.storage.onChanged.addListener).mockClear();
});

describe('startLegacyWriteBack', () => {
  it('tells the plan only its first unsuperseded read is the first read', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValue({ [KEY]: 1 } as never);
    const scope = new PluginScope();
    const plan = vi.fn((_stored: unknown, _check: LegacyWriteBackCheck) => null);
    const writeBack = startLegacyWriteBack(scope, { keys: [KEY], plan, label: 'Example' });
    await settle();
    storageChange({ [KEY]: { newValue: 2 } }, 'sync');
    await settle();
    writeBack.recheck();
    await settle();
    expect(plan.mock.calls.map(([, check]) => check)).toEqual([
      { firstRead: true },
      { firstRead: false },
      { firstRead: false },
    ]);
    await scope.dispose();
  });

  it('ignores other keys and areas, and checks nothing once the scope is disposed', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValue({} as never);
    const scope = new PluginScope();
    const plan = vi.fn(() => ({ [KEY]: 3 }));
    const writeBack = startLegacyWriteBack(scope, { keys: [KEY], plan, label: 'Example' });
    await settle();
    storageChange({ other: { newValue: 1 } }, 'sync');
    storageChange({ [KEY]: { newValue: 1 } }, 'local');
    await settle();
    expect(plan).toHaveBeenCalledTimes(1);
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ [KEY]: 3 });

    await scope.dispose();
    storageChange({ [KEY]: { newValue: 4 } }, 'sync');
    writeBack.recheck();
    await settle();
    expect(plan).toHaveBeenCalledTimes(1);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(1);
  });
});
