import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SYNC_STATE, type SyncState } from '@/core/types/sync';

import { CloudSyncSettings } from '../CloudSyncSettings';
import { createCloudSyncChromeMock } from './cloudSyncChromeMock';

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn(), t: (key: string) => key }),
}));

vi.mock('@/core/utils/browser', () => ({
  getVoyagerBuildTarget: () => 'firefox',
  isSafari: () => false,
}));

const manualState: SyncState = { ...DEFAULT_SYNC_STATE, mode: 'manual', isAuthenticated: false };

describe('CloudSyncSettings on Firefox for Android', () => {
  let container: HTMLDivElement;
  let root: Root;
  let sendMessage: Mock<(message: { type?: string }) => Promise<unknown>>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    sendMessage = vi.fn(async (message: { type?: string }) =>
      message.type === 'gv.sync.getState' ? { ok: true, state: manualState } : { ok: true },
    );
    const chromeMock = createCloudSyncChromeMock(sendMessage);
    (chromeMock.runtime as { getPlatformInfo?: unknown }).getPlatformInfo = async () => ({
      os: 'android',
    });
    (globalThis as { chrome: typeof chrome }).chrome = chromeMock;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('says why Google Drive sync is off and offers nothing to press', async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('syncGoogleDriveUnavailableAndroid');
    // The stored manual mode stays as it is; its upload and restore buttons are gone.
    expect(container.textContent).not.toContain('syncUpload');
    expect(container.textContent).not.toContain('syncMerge');
    const modeButtons = [...container.querySelectorAll<HTMLButtonElement>('fieldset button')];
    expect(modeButtons.length).toBeGreaterThan(0);
    expect(container.querySelector('fieldset')?.disabled).toBe(true);
    for (const button of modeButtons) button.click();
    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gv.sync.setMode' }),
    );
  });
});
