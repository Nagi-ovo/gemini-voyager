import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import { startWatermarkRemover, stopWatermarkRemover } from '../index';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
}));

vi.mock('../downloadButton', () => ({
  DOWNLOAD_ICON_SELECTOR: '.gv-test-download-icon',
  findNativeDownloadButton: (target: unknown) =>
    target instanceof HTMLButtonElement ? target : null,
}));

vi.mock('../watermarkEngine', () => ({
  WatermarkEngine: {
    create: vi.fn(async () => ({
      removeWatermarkFromImage: vi.fn(async () => document.createElement('canvas')),
    })),
  },
}));

const flushMutationObservers = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('watermarkRemover download toasts', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.useFakeTimers();
    vi.mocked(chrome.storage.sync.get).mockImplementation(async () => ({
      gvWatermarkDownloadEnabled: true,
      gvWatermarkPreviewEnabled: true,
    }));
  });

  afterEach(() => {
    stopWatermarkRemover();
    vi.useRealTimers();
  });

  it('does not show large file warning until DOWNLOADING_LARGE arrives', async () => {
    await startWatermarkRemover();

    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(toastDriver.messages()).toEqual(['正在下载原始图片']);

    const bridge = document.getElementById('gv-watermark-bridge');
    expect(bridge).not.toBeNull();
    if (!bridge) return;
    const intentTtlMs =
      Number((bridge as HTMLElement).dataset.downloadIntentExpiresAt) - Date.now();
    expect(intentTtlMs).toBeGreaterThanOrEqual(59000);
    expect(intentTtlMs).toBeLessThanOrEqual(60000);

    (bridge as HTMLElement).dataset.status = JSON.stringify({
      type: 'DOWNLOADING_LARGE',
      intentToken: (bridge as HTMLElement).dataset.downloadIntentToken,
    });
    await flushMutationObservers();

    expect(toastDriver.find('大文件警告')?.tone).toBe('warning');

    vi.advanceTimersByTime(8000);
    expect(toastDriver.find('大文件警告')).toBeUndefined();
  });

  it('turns the processing toast into the result beside the clicked button', async () => {
    await startWatermarkRemover();
    const button = document.createElement('button');
    document.body.appendChild(button);
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 200,
      right: 140,
      bottom: 240,
      width: 40,
      height: 40,
    } as DOMRect);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const bridge = document.getElementById('gv-watermark-bridge') as HTMLElement;
    const send = async (type: string) => {
      bridge.dataset.status = JSON.stringify({
        type,
        intentToken: bridge.dataset.downloadIntentToken,
      });
      await flushMutationObservers();
    };

    vi.advanceTimersByTime(3000);
    expect(toastDriver.all().map(({ message, pending }) => [message, pending])).toEqual([
      ['正在处理水印中', true],
    ]);
    await send('SUCCESS');

    const [result] = toastDriver.all();
    expect(toastDriver.all()).toHaveLength(1);
    expect(result).toMatchObject({ message: '正在下载', tone: 'success', pending: false });
    // Beside the button: the anchored container carries viewport coordinates.
    expect(result.element.parentElement!.style.left).toBe('154px');
    vi.advanceTimersByTime(2500);
    expect(toastDriver.all()).toEqual([]);
  });

  it('ignores a late status from an older download sequence', async () => {
    await startWatermarkRemover();

    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const bridge = document.getElementById('gv-watermark-bridge') as HTMLElement;
    bridge.dataset.status = JSON.stringify({
      type: 'SUCCESS',
      intentToken: 'stale-download-token',
    });
    await flushMutationObservers();

    expect(toastDriver.messages()).toEqual(['正在下载原始图片']);
  });

  it('shows only a Google corruption warning when watermark removal is disabled', async () => {
    vi.mocked(chrome.storage.sync.get).mockImplementation(async () => ({
      gvWatermarkDownloadEnabled: false,
      gvWatermarkPreviewEnabled: false,
    }));
    await startWatermarkRemover();

    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(toastDriver.all()).toEqual([]);
    const bridge = document.getElementById('gv-watermark-bridge') as HTMLElement;
    bridge.dataset.status = JSON.stringify({
      type: 'GOOGLE_IMAGE_CORRUPTED',
      intentToken: bridge.dataset.downloadIntentToken,
    });
    await flushMutationObservers();

    const toasts = toastDriver.all();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      message: 'Google 返回的原图已损坏（并非 Voyager 导致）；下载结果可能模糊或内容缺失',
      tone: 'warning',
    });
  });
});
