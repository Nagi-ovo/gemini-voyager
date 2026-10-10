import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';

import { buildFolderPanel } from '../aistudioPanel';
import { FLOATING_PANEL_CLASS } from '../floatingTree/shared';
import { destroyMountedPanels, mountPanel, panelRoot } from './floatingPanelHarness';
import { createFolderViewHarness, resetFolderViewBrowserMocks } from './folderViewHarness';

// Safari syncs folders through Google Drive (native bridge) or iCloud, so every
// folder surface offers the same cloud actions it does elsewhere.
vi.mock('@/core/utils/browser', () => ({
  isSafari: () => true,
  getVoyagerBuildTarget: () => 'safari',
}));

vi.mock('webextension-polyfill', () => ({ default: chrome }));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

describe('Safari folder cloud actions', () => {
  let harness: Awaited<ReturnType<typeof createFolderViewHarness>> | null = null;

  beforeEach(() => {
    resetFolderViewBrowserMocks();
    vi.mocked(chrome.storage.local.get).mockImplementation(
      async (_keys: unknown, callback?: (items: unknown) => void) => {
        callback?.({});
        return {};
      },
    );
    vi.spyOn(accountIsolationService, 'isIsolationEnabled').mockResolvedValue(false);
  });

  afterEach(() => {
    harness?.destroy();
    harness = null;
    destroyMountedPanels();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('Safari shows the folder cloud menu in the Gemini sidebar', async () => {
    harness = await createFolderViewHarness({ folders: [], folderContents: {} });
    const upload = vi.spyOn(harness.transfer, 'upload').mockResolvedValue(undefined);
    const sync = vi.spyOn(harness.transfer, 'sync').mockResolvedValue(undefined);
    const cloud = harness.runtime.panel!.querySelector<HTMLButtonElement>(
      'button[aria-label="folder_cloud"]',
    );
    expect(cloud).not.toBeNull();

    for (const [label, action] of [
      ['folder_cloud_upload', upload],
      ['folder_cloud_sync', sync],
    ] as const) {
      cloud!.click();
      const item = [...document.querySelectorAll<HTMLButtonElement>('.gv-folder-menu-item')].find(
        (candidate) => candidate.textContent?.endsWith(label),
      );
      item!.click();
      expect(action).toHaveBeenCalledTimes(1);
    }
  });

  it('Safari shows cloud upload and sync in the floating panel', () => {
    const onCloudUpload = vi.fn();
    const onCloudSync = vi.fn();
    const handle = mountPanel({ onCloudUpload, onCloudSync });

    panelRoot(handle)
      .querySelector<HTMLButtonElement>(`.${FLOATING_PANEL_CLASS}__icon-button--cloud-upload`)!
      .click();
    panelRoot(handle)
      .querySelector<HTMLButtonElement>(`.${FLOATING_PANEL_CLASS}__icon-button--cloud-sync`)!
      .click();

    expect(onCloudUpload).toHaveBeenCalledTimes(1);
    expect(onCloudSync).toHaveBeenCalledTimes(1);
  });

  it('Safari shows cloud upload and sync in AI Studio', () => {
    const onCloudUpload = vi.fn();
    const onCloudSync = vi.fn();
    const { container } = buildFolderPanel(
      {
        t: (key) => key,
        onCloudUpload,
        onCloudSync,
        uploadTooltip: async () => '',
        syncTooltip: async () => '',
        onCreateFolder: vi.fn(),
      },
      true,
    );
    const button = (title: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.title === title);

    button('folder_cloud_upload')!.click();
    button('folder_cloud_sync')!.click();

    expect(onCloudUpload).toHaveBeenCalledTimes(1);
    expect(onCloudSync).toHaveBeenCalledTimes(1);
  });
});
