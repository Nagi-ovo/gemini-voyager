import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { startPreventAutoScroll } from '../index';

const BRIDGE_ID = 'gv-prevent-auto-scroll-bridge';
const SCRIPT_ID = 'gv-prevent-auto-scroll-script';

function getBridge(): HTMLElement {
  const bridge = document.getElementById(BRIDGE_ID);
  if (!bridge) throw new Error('Expected prevent-auto-scroll bridge to exist.');
  return bridge;
}

function storageGetMock(): ReturnType<typeof vi.fn> {
  return chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>;
}

function storageListenerMock(): ReturnType<typeof vi.fn> {
  return chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>;
}

describe('startPreventAutoScroll', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.getElementById(BRIDGE_ID)?.remove();
    document.getElementById(SCRIPT_ID)?.remove();
    vi.clearAllMocks();
  });

  it('syncs the initial enabled and Ctrl+Enter bridge state', async () => {
    storageGetMock().mockResolvedValue({
      [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: true,
      [StorageKeys.CTRL_ENTER_SEND]: true,
    });

    await startPreventAutoScroll();

    expect(storageGetMock()).toHaveBeenCalledWith({
      [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: false,
      [StorageKeys.CTRL_ENTER_SEND]: false,
    });
    expect(getBridge().dataset.enabled).toBe('true');
    expect(getBridge().dataset.ctrlEnterSend).toBe('true');
    expect(document.getElementById(SCRIPT_ID)?.getAttribute('src')).toContain(
      'prevent-auto-scroll.js',
    );
  });

  it('updates bridge fields independently from storage changes', async () => {
    storageGetMock().mockResolvedValue({
      [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: true,
      [StorageKeys.CTRL_ENTER_SEND]: false,
    });

    await startPreventAutoScroll();

    const listener = storageListenerMock().mock.calls[0]?.[0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void;

    listener(
      {
        [StorageKeys.CTRL_ENTER_SEND]: { oldValue: false, newValue: true },
      },
      'sync',
    );

    expect(getBridge().dataset.enabled).toBe('true');
    expect(getBridge().dataset.ctrlEnterSend).toBe('true');

    listener(
      {
        [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: { oldValue: true, newValue: false },
      },
      'sync',
    );

    expect(getBridge().dataset.enabled).toBe('false');
    expect(getBridge().dataset.ctrlEnterSend).toBe('true');
  });
});
