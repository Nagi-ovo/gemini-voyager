import { describe, expect, it, vi } from 'vitest';

import { requestEChartsDataUrl } from '../exportBridge';
import { makeFakeInstance, PIE_OPTION, createEChartsFixture, waitFor } from './fixture';

const fixture = createEChartsFixture();
function block(source = PIE_OPTION, language = 'echarts'): HTMLElement {
  const host = document.createElement('code-block');
  host.innerHTML = `<div class="code-block-decoration"><span>${language}</span><button class="copy-button" style="position:absolute;top:8px">Copy</button></div><code data-test-id="code-content"></code>`;
  host.querySelector('code')!.textContent = source;
  document.body.append(host);
  return host;
}
const chart = () => fixture.query<HTMLElement>('.gv-echarts-diagram');
async function drawn(): Promise<void> {
  await waitFor(() => expect(chart()).not.toBeNull());
}

describe('ECharts primitive render flow', () => {
  it('disposes a new instance when applying the option throws and restores source', async () => {
    const runtime = await import('../runtime');
    const failed = makeFakeInstance();
    failed.setOption.mockImplementationOnce(() => {
      throw new Error('unsupported option');
    });
    vi.mocked(runtime.init).mockImplementationOnce(
      () => failed as unknown as ReturnType<typeof runtime.init>,
    );
    const host = block();
    fixture.start();
    await waitFor(() => expect(failed.dispose).toHaveBeenCalledTimes(1));
    expect(fixture.query('.gv-diagram-panel')).toBeNull();
    expect(host.hasAttribute('data-gv-diagram-hidden')).toBe(false);
  });
  it('keeps the native copy button in place with its original positioning', async () => {
    const host = block();
    const native = host.querySelector('button')!;
    const parent = native.parentNode;
    const style = native.getAttribute('style');
    fixture.start();
    await drawn();
    expect(native.parentNode).toBe(parent);
    expect(native.getAttribute('style')).toBe(style);
    await fixture.stop();
    expect(native.parentNode).toBe(parent);
    expect(native.getAttribute('style')).toBe(style);
  });
  it('provides the composited PNG from the live chart with a deterministic backdrop', async () => {
    block();
    fixture.start();
    await drawn();
    const runtime = await import('../runtime');
    const instance = vi.mocked(runtime.init).mock.results.at(-1)!.value;
    expect(requestEChartsDataUrl(chart()!)).toEqual({
      handled: true,
      dataUrl: 'data:image/png;base64,COMPOSITED',
    });
    expect(instance.getDataURL).toHaveBeenCalledWith({
      type: 'png',
      pixelRatio: 1,
      backgroundColor: '#f9fafb',
    });
  });
  it('re-renders with a fresh instance when the source changes', async () => {
    const host = block();
    fixture.start();
    await drawn();
    const runtime = await import('../runtime');
    const first = vi.mocked(runtime.init).mock.results[0]!.value;
    host.querySelector('code')!.textContent = PIE_OPTION.replace('"value": 1', '"value": 9');
    await waitFor(() => expect(runtime.init).toHaveBeenCalledTimes(2));
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runtime.init).mock.results[1]!.value.setOption).toHaveBeenCalledWith(
      expect.objectContaining({ series: [{ type: 'pie', data: [{ value: 9, name: 'a' }] }] }),
      true,
    );
  });
  it('settles on the latest source when it changes during async parsing', async () => {
    const host = block();
    fixture.start();
    host.querySelector('code')!.textContent = PIE_OPTION.replace('"value": 1', '"value": 9');
    const runtime = await import('../runtime');
    await waitFor(() =>
      expect(vi.mocked(runtime.init).mock.results.at(-1)?.value.setOption).toHaveBeenCalledWith(
        expect.objectContaining({ series: [{ type: 'pie', data: [{ value: 9, name: 'a' }] }] }),
        true,
      ),
    );
    expect(fixture.query('.gv-echarts-diagram')).not.toBeNull();
    expect(runtime.init).toHaveBeenCalledTimes(1);
  });
  it('retries an incomplete source once the streamed chart becomes valid', async () => {
    const host = block('{ "series": [{ "type": "pie", "data": [');
    fixture.start();
    host.querySelector('code')!.textContent = PIE_OPTION;
    await drawn();
    const runtime = await import('../runtime');
    expect(runtime.init).toHaveBeenCalledTimes(1);
  });
  it('abandons an in-flight generic render when Gemini finalizes a specific label', async () => {
    const host = block(PIE_OPTION, '代码段');
    fixture.start();
    host.querySelector('span')!.textContent = 'json';
    await waitFor(() => expect(host.hasAttribute('data-gv-diagram-owner')).toBe(false));
    const runtime = await import('../runtime');
    expect(runtime.init).not.toHaveBeenCalled();
    expect(fixture.query('.gv-diagram-panel')).toBeNull();
    expect(host.hasAttribute('data-gv-diagram-hidden')).toBe(false);
  });
  it.each(['source', 'label'])(
    'restores source when rendered chart loses its %s match',
    async (kind) => {
      const host = block();
      fixture.start();
      await drawn();
      const runtime = await import('../runtime');
      const instance = vi.mocked(runtime.init).mock.results[0]!.value;
      if (kind === 'source') host.querySelector('code')!.textContent = '{ "ordinary": true }';
      else host.querySelector('span')!.textContent = 'json';
      await waitFor(() => expect(fixture.query('.gv-diagram-panel')).toBeNull());
      expect(host.hasAttribute('data-gv-diagram-hidden')).toBe(false);
      expect(instance.dispose).toHaveBeenCalledTimes(1);
    },
  );
});
