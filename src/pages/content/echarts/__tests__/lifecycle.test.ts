import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { PIE_OPTION, createEChartsFixture } from './fixture';

const fixture = createEChartsFixture();

describe('runtime disable lifecycle', () => {
  const PIE_OPTION_SRC = PIE_OPTION;

  type StorageChangeListener = (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    areaName: string,
  ) => void;

  const startEnabled = (): StorageChangeListener => {
    const storageGet = chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>;
    storageGet.mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) =>
        callback({ [StorageKeys.ECHARTS_ENABLED]: true }),
    );
    fixture.feature.start();
    const addListener = chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>;
    return addListener.mock.calls.at(-1)?.[0] as StorageChangeListener;
  };

  const addEChartsBlock = (code = PIE_OPTION_SRC): HTMLElement => {
    const codeBlock = document.createElement('code-block');
    codeBlock.innerHTML = `
      <div class="code-block-decoration"><span>echarts</span></div>
      <pre><code data-test-id="code-content"></code></pre>
    `;
    const codeEl = codeBlock.querySelector<HTMLElement>('code')!;
    codeEl.textContent = code;
    document.body.appendChild(codeBlock);
    return codeEl;
  };

  const disable = (listener: StorageChangeListener): void => {
    listener(
      {
        [StorageKeys.ECHARTS_ENABLED]: { oldValue: true, newValue: false },
      },
      'sync',
    );
  };

  const enable = (listener: StorageChangeListener): void => {
    listener(
      {
        [StorageKeys.ECHARTS_ENABLED]: { oldValue: false, newValue: true },
      },
      'sync',
    );
  };

  it('does not let a late storage snapshot overwrite a newer disable event', async () => {
    let storageCallback: ((result: Record<string, unknown>) => void) | undefined;
    const storageGet = chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>;
    storageGet.mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        storageCallback = callback;
      },
    );
    fixture.feature.start();
    const addListener = chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>;
    const onStorageChanged = addListener.mock.calls.at(-1)?.[0] as StorageChangeListener;
    addEChartsBlock();

    disable(onStorageChanged);
    storageCallback?.({ [StorageKeys.ECHARTS_ENABLED]: true });
    fixture.blocks.process();
    await Promise.resolve();

    expect(document.querySelector('.gv-echarts-wrapper')).toBeNull();
  });

  it('clears a queued debounced render when disabled', async () => {
    vi.useFakeTimers();
    const onStorageChanged = startEnabled();
    addEChartsBlock();
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    disable(onStorageChanged);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);

    const echartsMod = await import('../runtime');
    expect(echartsMod.init).not.toHaveBeenCalled();
    expect(document.querySelector('.gv-echarts-wrapper')).toBeNull();
  });

  it('drops an in-flight render that resolves after disable', async () => {
    const onStorageChanged = startEnabled();
    const codeEl = addEChartsBlock();

    fixture.blocks.process();
    expect(codeEl.dataset.echartsProcessing).toBe('true');
    disable(onStorageChanged);

    await vi.waitFor(() => {
      expect(codeEl.dataset.echartsProcessing).toBe('false');
    });
    expect(document.querySelector('.gv-echarts-wrapper')).toBeNull();
  });

  it('drops an in-flight render whose Gemini host detaches during async loading', async () => {
    startEnabled();
    const codeEl = addEChartsBlock();
    const codeBlockHost = codeEl.closest<HTMLElement>('code-block')!;

    fixture.blocks.process();
    expect(codeEl.dataset.echartsProcessing).toBe('true');
    codeBlockHost.remove();

    await vi.waitFor(() => {
      expect(codeEl.dataset.echartsProcessing).toBe('false');
    });
    const echartsMod = await import('../runtime');
    expect(echartsMod.init).not.toHaveBeenCalled();
    expect(document.querySelector('.gv-echarts-wrapper')).toBeNull();
  });

  it('restarts an in-flight render after a rapid disable and re-enable', async () => {
    const onStorageChanged = startEnabled();
    const codeEl = addEChartsBlock();

    fixture.blocks.process();
    expect(codeEl.dataset.echartsProcessing).toBe('true');
    disable(onStorageChanged);
    enable(onStorageChanged);

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-wrapper')).not.toBeNull();
    });
    expect(codeEl.dataset.echartsProcessing).toBe('false');
    const echartsMod = await import('../runtime');
    expect(echartsMod.init).toHaveBeenCalledTimes(1);
  });

  it('disposes and unobserves a chart whose Gemini host was removed', async () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    const observe = vi.fn();
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    class ResizeObserverMock {
      constructor(_callback: ResizeObserverCallback) {}
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    }
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    try {
      startEnabled();
      addEChartsBlock();
      fixture.blocks.process();
      await vi.waitFor(() => {
        expect(document.querySelector('.gv-echarts-wrapper')).not.toBeNull();
      });
      const diagramContainer = document.querySelector('.gv-echarts-diagram') as HTMLElement;
      const echartsMod = await import('../runtime');
      const instance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;
      expect(observe).toHaveBeenCalledWith(diagramContainer);

      document.querySelector('.gv-echarts-wrapper')?.remove();
      fixture.blocks.process();

      expect(unobserve).toHaveBeenCalledWith(diagramContainer);
      expect(instance.dispose).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it('tears down a connected wrapper after Gemini removes only its source host', async () => {
    startEnabled();
    const codeEl = addEChartsBlock();
    const codeBlockHost = codeEl.closest<HTMLElement>('code-block')!;
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-wrapper')).not.toBeNull();
    });
    const wrapper = document.querySelector<HTMLElement>('.gv-echarts-wrapper')!;
    const echartsMod = await import('../runtime');
    const instance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;

    codeBlockHost.remove();
    expect(wrapper.isConnected).toBe(true);
    fixture.blocks.process();

    expect(wrapper.isConnected).toBe(false);
    expect(instance.dispose).toHaveBeenCalledTimes(1);
  });

  it('does not resize a chart to zero while Code view is visible', async () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    let resizeCallback: ResizeObserverCallback | undefined;
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

    try {
      startEnabled();
      addEChartsBlock();
      fixture.blocks.process();
      await vi.waitFor(() => {
        expect(document.querySelector('.gv-echarts-diagram')).not.toBeNull();
      });
      const diagram = document.querySelector<HTMLElement>('.gv-echarts-diagram')!;
      const echartsMod = await import('../runtime');
      const fakeInstance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;

      document.querySelector<HTMLButtonElement>('[data-view="code"]')!.click();
      fakeInstance.resize.mockClear();
      resizeCallback?.(
        [
          {
            target: diagram,
            contentRect: { width: 0, height: 0 },
          } as unknown as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );

      expect(diagram.style.display).toBe('none');
      expect(fakeInstance.resize).not.toHaveBeenCalled();
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it('restores rendered source and can render again after re-enable', async () => {
    const onStorageChanged = startEnabled();
    const codeEl = addEChartsBlock();
    const codeBlockHost = codeEl.closest<HTMLElement>('code-block')!;
    const decoration = codeBlockHost.querySelector<HTMLElement>('.code-block-decoration')!;
    const nativeButtons = document.createElement('div');
    nativeButtons.className = 'buttons';
    nativeButtons.setAttribute(
      'style',
      'position: absolute; top: 8px; right: 12px; margin-top: 3px; color: red;',
    );
    const beforeButtons = document.createElement('span');
    beforeButtons.textContent = 'before';
    const afterButtons = document.createElement('span');
    afterButtons.textContent = 'after';
    decoration.append(beforeButtons, nativeButtons, afterButtons);
    const originalChildren = Array.from(decoration.childNodes);
    const originalStyle = nativeButtons.getAttribute('style');

    fixture.blocks.process();
    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-wrapper')).not.toBeNull();
    });
    expect(document.querySelector('.gv-echarts-toggle')?.contains(nativeButtons)).toBe(true);
    expect(document.getElementById('gv-echarts-styles')).not.toBeNull();

    disable(onStorageChanged);

    expect(document.querySelector('.gv-echarts-wrapper')).toBeNull();
    expect(document.getElementById('gv-echarts-styles')).toBeNull();
    expect(codeBlockHost.style.display).toBe('');
    expect(Array.from(decoration.childNodes)).toEqual(originalChildren);
    expect(nativeButtons.getAttribute('style')).toBe(originalStyle);
    expect(codeEl.dataset.echartsCode).toBeUndefined();

    enable(onStorageChanged);
    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-wrapper')).not.toBeNull();
    });
    expect(document.getElementById('gv-echarts-styles')).not.toBeNull();
  });
});
