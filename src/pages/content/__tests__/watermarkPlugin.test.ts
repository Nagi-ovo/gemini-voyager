// @vitest-environment-options { "url": "https://gemini.google.com/u/0/app/test" }
/** NanoBanana ownership through the packaged source, host and native admission point. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { WATERMARK_STORAGE_KEYS } from '@/core/utils/watermarkSettings';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';

import { createGeminiBuiltinStartup } from '../geminiBuiltinStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

const removeWatermark = vi.hoisted(() => vi.fn());
const fetchImage = vi.hoisted(() => vi.fn());
vi.mock('@/core/utils/runtimeImageFetch', () => ({ fetchImageViaExtensionRuntime: fetchImage }));
vi.mock('../watermarkRemover/watermarkEngine', () => ({
  WatermarkEngine: { create: async () => ({ removeWatermarkFromImage: removeWatermark }) },
}));

const [DOWNLOAD, PREVIEW, LEGACY] = WATERMARK_STORAGE_KEYS;
const DOWNLOAD_ID = OFFICIAL_PLUGIN_IDS.geminiWatermarkDownload;
const PREVIEW_ID = OFFICIAL_PLUGIN_IDS.geminiWatermarkPreview;
const ORIGINAL = 'https://lh3.googleusercontent.com/generated=s1024';
let harness: LifecycleHarness;
let cleanupManager: CleanupManager;
let host: PluginHost | null;
let preview: HTMLImageElement;
let button: HTMLButtonElement;

async function flush(): Promise<void> {
  for (let round = 0; round < 100; round++) await Promise.resolve();
}

function canvas(): HTMLCanvasElement {
  const result = document.createElement('canvas');
  result.toBlob = (callback) => callback(new Blob(['processed'], { type: 'image/png' }));
  return result;
}

const mounted = (id: string): boolean =>
  host?.getStatuses().find((entry) => entry.id === id)?.kind === 'mounted';
const bridge = (): HTMLElement | null => document.getElementById('gv-watermark-bridge');

async function start(admit = true): Promise<void> {
  const admission = createOfficialAdmission();
  if (admit) await createGeminiBuiltinStartup(admission, cleanupManager).startWatermarkRemover();
  admission.close();
  host = new PluginHost({
    url: location.href,
    sources: [new BuiltinPluginSource()],
    doc: document,
    admission,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
  await host.start();
  await flush();
}

async function setSwitch(key: string, enabled: boolean | undefined): Promise<void> {
  const oldValue = harness.storage.sync.get(key);
  if (enabled === undefined) harness.storage.sync.delete(key);
  else harness.storage.sync.set(key, enabled);
  harness.emitStorageChange({ [key]: { oldValue, newValue: enabled } }, 'sync');
  await flush();
}

function expectModes(download: boolean, inPreview: boolean): void {
  expect(mounted(DOWNLOAD_ID)).toBe(download);
  expect(mounted(PREVIEW_ID)).toBe(inPreview);
  expect(bridge()?.dataset.enabled === 'true').toBe(download);
  expect(document.querySelectorAll('.nanobanana-indicator')).toHaveLength(download ? 1 : 0);
  expect(preview.src).toBe(inPreview ? 'blob:processed-preview' : ORIGINAL);
}

beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = `<generated-image><img src="${ORIGINAL}">
    <download-generated-image-button><button></button></download-generated-image-button>
    </generated-image>`;
  preview = document.querySelector('img')!;
  button = document.querySelector('button')!;
  harness = installLifecycleHarness();
  cleanupManager = new CleanupManager();
  host = null;
  removeWatermark.mockReset().mockImplementation(async () => canvas());
  fetchImage.mockReset().mockResolvedValue({ base64: 'cHJldmlldw==', contentType: 'image/png' });
  vi.stubGlobal(
    'Image',
    class AutoLoadingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = '';
      private source = '';
      get src(): string {
        return this.source;
      }
      set src(value: string) {
        this.source = value;
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:processed-preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,cHJvY2Vzc2Vk',
  );
});

afterEach(async () => {
  host?.stop();
  cleanupManager.executeCleanups();
  await flush();
  harness.restore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  bridge()?.remove();
});

describe('Gemini NanoBanana through its registered official plugins', () => {
  it.each([
    ['both missing', {}, false, false],
    ['download false, preview missing', { [DOWNLOAD]: false }, false, true],
    ['download true, preview missing', { [DOWNLOAD]: true }, true, true],
    ['preview false, download missing', { [PREVIEW]: false }, true, false],
    ['preview true, download missing', { [PREVIEW]: true }, true, true],
    ['both false', { [DOWNLOAD]: false, [PREVIEW]: false }, false, false],
    ['download only', { [DOWNLOAD]: true, [PREVIEW]: false }, true, false],
    ['preview only', { [DOWNLOAD]: false, [PREVIEW]: true }, false, true],
    ['both true', { [DOWNLOAD]: true, [PREVIEW]: true }, true, true],
    ['legacy false', { [LEGACY]: false }, false, false],
    ['legacy true', { [LEGACY]: true }, true, true],
    [
      'split false beats legacy true',
      { [DOWNLOAD]: false, [PREVIEW]: false, [LEGACY]: true },
      false,
      false,
    ],
    [
      'split true beats legacy false',
      { [DOWNLOAD]: true, [PREVIEW]: true, [LEGACY]: false },
      true,
      true,
    ],
    [
      'partial download false beats legacy true',
      { [DOWNLOAD]: false, [LEGACY]: true },
      false,
      true,
    ],
    ['partial preview false beats legacy true', { [PREVIEW]: false, [LEGACY]: true }, true, false],
    ['partial download true beats legacy false', { [DOWNLOAD]: true, [LEGACY]: false }, true, true],
    ['partial preview true beats legacy false', { [PREVIEW]: true, [LEGACY]: false }, true, true],
  ] as const)(
    'keeps %s authoritative over stale plugins state',
    async (_name, settings, download, inPreview) => {
      for (const [key, value] of Object.entries(settings)) harness.storage.sync.set(key, value);
      const staleState = {
        [DOWNLOAD_ID]: { enabled: !download, installedAt: 1, settings: {} },
        [PREVIEW_ID]: { enabled: !inPreview, installedAt: 1, settings: {} },
      };
      harness.storage.local.set(StorageKeys.PLUGINS_STATE, staleState);
      await start();
      expectModes(download, inPreview);
      expect(Object.fromEntries(harness.storage.sync)).toEqual(settings);
      expect(harness.storage.local.get(StorageKeys.PLUGINS_STATE)).toEqual(staleState);
      expect(
        vi
          .mocked(chrome.storage.local.set)
          .mock.calls.some(([values]) => Object.hasOwn(values, StorageKeys.PLUGINS_STATE)),
      ).toBe(false);
    },
  );

  it.each([DOWNLOAD, PREVIEW])(
    'live off for %s is independent and repeated off→on does not duplicate effects',
    async (key) => {
      harness.storage.sync.set(DOWNLOAD, true);
      harness.storage.sync.set(PREVIEW, true);
      await start();
      expectModes(true, true);
      const observerCount = harness.ledger.openObservers().length;
      const listenerCount = harness.ledger.openListeners({ includeDetached: true }).length;
      const storageListeners = harness.ledger.openStorageListeners();
      for (let cycle = 0; cycle < 3; cycle++) {
        await setSwitch(key, false);
        expectModes(key !== DOWNLOAD, key !== PREVIEW);
        if (key === PREVIEW)
          expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:processed-preview');
        await setSwitch(key, true);
        expectModes(true, true);
        expect(harness.ledger.openObservers()).toHaveLength(observerCount);
        expect(harness.ledger.openListeners({ includeDetached: true })).toHaveLength(listenerCount);
        expect(harness.ledger.openStorageListeners()).toBe(storageListeners);
      }
    },
  );

  it('re-evaluates both controls on legacy changes and split key deletion', async () => {
    harness.storage.sync.set(LEGACY, true);
    await start();
    expectModes(true, true);
    await setSwitch(LEGACY, false);
    expectModes(false, false);
    await setSwitch(DOWNLOAD, false);
    expectModes(false, true);
    await setSwitch(DOWNLOAD, undefined);
    expectModes(false, false);
    await setSwitch(LEGACY, undefined);
    expectModes(false, false);
    expect(Object.fromEntries(harness.storage.sync)).toEqual({});
  });

  it('preview off preserves a source that Gemini replaced after processing', async () => {
    harness.storage.sync.set(DOWNLOAD, false);
    harness.storage.sync.set(PREVIEW, true);
    await start();
    expect(preview.src).toBe('blob:processed-preview');
    const replacement = 'https://lh3.googleusercontent.com/replacement=s1024';
    preview.src = replacement;
    await setSwitch(PREVIEW, false);
    expect(preview.src).toBe(replacement);
    expect(preview.dataset.watermarkProcessed).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:processed-preview');
  });

  it.each([false, true])(
    'preview off restores owned srcset and preserves host replacement=%s',
    async (hostReplaced) => {
      harness.storage.sync.set(DOWNLOAD, false);
      harness.storage.sync.set(PREVIEW, true);
      const originalSrcset = `${ORIGINAL} 1x, https://lh3.googleusercontent.com/generated=s2048 2x`;
      const replacementSrcset = 'https://lh3.googleusercontent.com/replacement=s2048 2x';
      preview.srcset = originalSrcset;
      await start();
      expect(preview.src).toBe('blob:processed-preview');
      expect(preview.hasAttribute('srcset')).toBe(false);
      if (hostReplaced) preview.srcset = replacementSrcset;
      await setSwitch(PREVIEW, false);
      expect(preview.src).toBe(hostReplaced ? 'blob:processed-preview' : ORIGINAL);
      expect(preview.srcset).toBe(hostReplaced ? replacementSrcset : originalSrcset);
      if (hostReplaced) expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      else expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:processed-preview');
    },
  );

  it('finishes one accepted download across live off while new downloads remain disabled', async () => {
    harness.storage.sync.set(DOWNLOAD, true);
    harness.storage.sync.set(PREVIEW, false);
    await start();
    let finish!: (result: HTMLCanvasElement) => void;
    removeWatermark.mockImplementationOnce(
      () =>
        new Promise<HTMLCanvasElement>((resolve) => {
          finish = resolve;
        }),
    );
    button.click();
    const channel = bridge()!;
    channel.dataset.request = JSON.stringify({
      requestId: 'accepted-download',
      base64: 'data:image/png;base64,b3JpZ2luYWw=',
      intentToken: channel.dataset.downloadIntentToken,
    });
    await flush();
    expect(removeWatermark).toHaveBeenCalledOnce();
    await setSwitch(DOWNLOAD, false);
    expect(channel.dataset.enabled).toBe('false');
    expect(document.querySelector('.nanobanana-indicator')).toBeNull();
    finish(canvas());
    await flush();
    expect(JSON.parse(channel.dataset.response ?? '{}')).toMatchObject({
      requestId: 'accepted-download',
      base64: 'data:image/png;base64,cHJvY2Vzc2Vk',
    });
    expect(removeWatermark).toHaveBeenCalledOnce();
    expect(mounted(DOWNLOAD_ID)).toBe(false);
  });

  it('does not remove anything without native admission even when both switches are true', async () => {
    harness.storage.sync.set(DOWNLOAD, true);
    harness.storage.sync.set(PREVIEW, true);
    await start(false);
    expectModes(false, false);
    expect(removeWatermark).not.toHaveBeenCalled();
    expect(fetchImage).not.toHaveBeenCalled();
    expect(harness.ledger.openObservers()).toEqual([]);
  });

  it('the old native start point starts only health inspection before PluginHost', async () => {
    harness.storage.sync.set(DOWNLOAD, true);
    harness.storage.sync.set(PREVIEW, true);
    const admission = createOfficialAdmission();
    await createGeminiBuiltinStartup(admission, cleanupManager).startWatermarkRemover();
    admission.close();
    await flush();
    expect(admission.stateOf(DOWNLOAD_ID)).toBe('admitted');
    expect(admission.stateOf(PREVIEW_ID)).toBe('admitted');
    expectModes(false, false);
    expect(removeWatermark).not.toHaveBeenCalled();
    expect(fetchImage).not.toHaveBeenCalled();
  });
});
