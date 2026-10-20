// @vitest-environment-options { "url": "https://gemini.google.com/u/0/app/test" }
/** The real builtin activation must not cancel a download waiting for engine assets. */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CleanupManager } from '@/core/utils/cleanupManager';
import { WATERMARK_STORAGE_KEYS } from '@/core/utils/watermarkSettings';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';

import { createGeminiBuiltinStartup } from '../geminiBuiltinStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { installLifecycleHarness, type LifecycleHarness } from './lifecycleHarness';

const createEngine = vi.hoisted(() => vi.fn());
vi.mock('../watermarkRemover/watermarkEngine', () => ({
  WatermarkEngine: { create: createEngine },
}));

let host: PluginHost | undefined;
let harness: LifecycleHarness | undefined;
let cleanup: CleanupManager | undefined;
async function flush(): Promise<void> {
  for (let round = 0; round < 100; round++) await Promise.resolve();
}

beforeAll(registerBuiltinNativeHandlers);
afterEach(async () => {
  host?.stop();
  cleanup?.executeCleanups();
  await flush();
  harness?.restore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.getElementById('gv-watermark-bridge')?.remove();
});

describe('NanoBanana engine load through the real builtin host', () => {
  it('finishes an accepted download once after live off while its engine assets are still loading', async () => {
    const [downloadKey, previewKey] = WATERMARK_STORAGE_KEYS;
    harness = installLifecycleHarness();
    harness.storage.sync.set(downloadKey, true);
    harness.storage.sync.set(previewKey, false);
    cleanup = new CleanupManager();
    document.body.innerHTML =
      '<download-generated-image-button><button></button></download-generated-image-button>';
    vi.stubGlobal(
      'Image',
      class AutoLoadingImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        crossOrigin = '';
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const removeWatermark = vi.fn(async () => document.createElement('canvas'));
    let finishEngine!: (engine: { removeWatermarkFromImage: typeof removeWatermark }) => void;
    createEngine.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishEngine = resolve;
        }),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,cHJvY2Vzc2Vk',
    );
    const admission = createOfficialAdmission();
    await createGeminiBuiltinStartup(admission, cleanup).startWatermarkRemover();
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
    expect(createEngine).toHaveBeenCalledOnce();
    const bridge = document.getElementById('gv-watermark-bridge')!;
    expect(bridge.dataset.enabled).toBe('true');
    document.querySelector('button')!.click();
    bridge.dataset.request = JSON.stringify({
      requestId: 'waiting-for-engine',
      base64: 'data:image/png;base64,b3JpZ2luYWw=',
      intentToken: bridge.dataset.downloadIntentToken,
    });
    await flush();
    expect(removeWatermark).not.toHaveBeenCalled();
    harness.storage.sync.set(downloadKey, false);
    harness.emitStorageChange({ [downloadKey]: { oldValue: true, newValue: false } }, 'sync');
    await flush();
    expect(bridge.dataset.enabled).toBe('false');
    expect(
      host.getStatuses().find(({ id }) => id === OFFICIAL_PLUGIN_IDS.geminiWatermarkDownload)?.kind,
    ).not.toBe('mounted');
    finishEngine({ removeWatermarkFromImage: removeWatermark });
    await flush();
    expect(JSON.parse(bridge.dataset.response ?? '{}')).toMatchObject({
      requestId: 'waiting-for-engine',
      base64: 'data:image/png;base64,cHJvY2Vzc2Vk',
    });
    expect(removeWatermark).toHaveBeenCalledOnce();
    expect(createEngine).toHaveBeenCalledOnce();
    expect(bridge.dataset.enabled).toBe('false');
    expect(document.querySelector('.gv-watermark-indicator')).toBeNull();
  });
});
