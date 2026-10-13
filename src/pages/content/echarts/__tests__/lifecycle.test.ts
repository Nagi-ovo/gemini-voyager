import { describe, expect, it, vi } from 'vitest';

import { PIE_OPTION, createEChartsFixture, waitFor } from './fixture';

const fixture = createEChartsFixture();
function block(): HTMLElement {
  const host = document.createElement('code-block');
  host.innerHTML =
    '<div class="code-block-decoration"><span>echarts</span></div><code data-test-id="code-content"></code>';
  host.querySelector('code')!.textContent = PIE_OPTION;
  document.body.append(host);
  return host;
}
async function drawn(): Promise<void> {
  await waitFor(() => expect(fixture.query('.gv-echarts-diagram')).not.toBeNull());
}

describe('ECharts scope lifecycle', () => {
  it('cancels a queued debounced render when its plugin turns off', async () => {
    vi.useFakeTimers();
    fixture.start();
    block();
    await Promise.resolve();
    await fixture.stop();
    await vi.advanceTimersByTimeAsync(1500);
    const runtime = await import('../runtime');
    expect(runtime.init).not.toHaveBeenCalled();
    expect(fixture.query('.gv-diagram-panel')).toBeNull();
  });
  it('drops an in-flight first draw after scope disposal', async () => {
    const host = block();
    fixture.start();
    await fixture.stop();
    const runtime = await import('../runtime');
    await Promise.resolve();
    expect(runtime.init).not.toHaveBeenCalled();
    expect(fixture.query('.gv-diagram-panel')).toBeNull();
    expect(host.hasAttribute('data-gv-diagram-owner')).toBe(false);
    expect(host.hasAttribute('data-gv-diagram-hidden')).toBe(false);
  });
  it('drops a first draw when its source host detaches during async loading', async () => {
    const host = block();
    fixture.start();
    host.remove();
    await Promise.resolve();
    await Promise.resolve();
    const runtime = await import('../runtime');
    expect(runtime.init).not.toHaveBeenCalled();
    expect(fixture.query('.gv-diagram-panel')).toBeNull();
    await waitFor(() => expect(host.hasAttribute('data-gv-diagram-owner')).toBe(false));
  });
  it('lets a rapid off and on render the source exactly once', async () => {
    block();
    fixture.start();
    await fixture.stop();
    fixture.start();
    await drawn();
    const runtime = await import('../runtime');
    expect(runtime.init).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('.gv-diagram-panel')).toHaveLength(1);
  });
  it('disposes and unobserves the chart when its source host is removed', async () => {
    const observe = vi.fn();
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        unobserve = unobserve;
        disconnect = disconnect;
      },
    );
    try {
      const host = block();
      fixture.start();
      await drawn();
      const chart = fixture.query('.gv-echarts-diagram');
      const runtime = await import('../runtime');
      const instance = vi.mocked(runtime.init).mock.results.at(-1)!.value;
      expect(observe).toHaveBeenCalledWith(chart);
      host.remove();
      await waitFor(() => expect(fixture.query('.gv-diagram-panel')).toBeNull());
      expect(unobserve).toHaveBeenCalledWith(chart);
      expect(instance.dispose).toHaveBeenCalledTimes(1);
      await fixture.stop();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('does not resize a hidden chart when its code view has zero dimensions', async () => {
    let callback: ResizeObserverCallback | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(next: ResizeObserverCallback) {
          callback = next;
        }
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    try {
      block();
      fixture.start();
      await drawn();
      fixture.query<HTMLButtonElement>('[aria-label="Code"]')!.click();
      const chart = fixture.query<HTMLElement>('.gv-echarts-diagram')!;
      const runtime = await import('../runtime');
      const instance = vi.mocked(runtime.init).mock.results.at(-1)!.value;
      instance.resize.mockClear();
      callback?.(
        [{ target: chart, contentRect: { width: 0, height: 0 } } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
      expect(document.querySelector<HTMLElement>('.gv-diagram-panel')!.dataset.view).toBe('code');
      expect(instance.resize).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('leaves native source nodes and styles untouched through off and reopening', async () => {
    const host = block();
    const decoration = host.querySelector('.code-block-decoration')!;
    const native = document.createElement('div');
    native.className = 'buttons';
    native.setAttribute('style', 'position:absolute;top:8px;right:12px;margin-top:3px;color:red;');
    decoration.append(document.createTextNode('before'), native, document.createTextNode('after'));
    const children = Array.from(decoration.childNodes);
    const style = native.getAttribute('style');
    fixture.start();
    await drawn();
    expect(document.getElementById('gv-echarts-styles')).not.toBeNull();
    await fixture.stop();
    expect(fixture.query('.gv-diagram-panel')).toBeNull();
    expect(document.getElementById('gv-echarts-styles')).toBeNull();
    expect(host.hasAttribute('data-gv-diagram-hidden')).toBe(false);
    expect(Array.from(decoration.childNodes)).toEqual(children);
    expect(native.getAttribute('style')).toBe(style);
    expect(host.querySelector('code')!.textContent).toBe(PIE_OPTION);
    fixture.start();
    await drawn();
    expect(Array.from(decoration.childNodes)).toEqual(children);
    expect(native.getAttribute('style')).toBe(style);
  });
});
