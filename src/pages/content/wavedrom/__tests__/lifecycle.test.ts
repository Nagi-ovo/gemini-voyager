import { describe, expect, it, vi } from 'vitest';

import * as waveRenderer from '../renderer';
import { createWaveDromFixture } from './fixture';

const fixture = createWaveDromFixture();
const WAVEJSON = '{"signal": [{"name":"clk","wave":"p..."}]}';
const LATEST = '{"signal": [{"name":"data","wave":"x.34"}]}';
const SVG = '<svg viewBox="0 0 100 50"><text>diagram</text></svg>';

function addWaveDromBlock(code = WAVEJSON): HTMLElement {
  const block = document.createElement('code-block');
  block.innerHTML =
    '<div class="code-block-decoration"><span>wavedrom</span></div><pre><code data-test-id="code-content"></code></pre>';
  const codeEl = block.querySelector<HTMLElement>('code')!;
  codeEl.textContent = code;
  document.querySelector('model-response')!.append(block);
  return codeEl;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe('WaveDrom plugin scope lifecycle', () => {
  it('clears a queued rescan when disabled', async () => {
    vi.useFakeTimers();
    const scope = fixture.activate();
    addWaveDromBlock();
    await flush();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await scope.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1500);
    const renderAnyMod = await import('wavedrom/render-any');
    expect(renderAnyMod.default).not.toHaveBeenCalled();
    expect(document.querySelector('.gv-diagram-panel')).toBeNull();
  });

  it('drops an in-flight render that resolves after disable', async () => {
    let finish!: (svg: string) => void;
    const render = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    vi.spyOn(waveRenderer, 'createWaveDromRenderer').mockReturnValue({
      load: async () => true,
      render,
    });
    const code = addWaveDromBlock();
    const scope = fixture.activate();
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
    await scope.dispose();
    finish(SVG);
    await flush();
    expect(fixture.panelOf(code)).toBeNull();
    expect(code.closest('code-block')?.hasAttribute('data-gv-diagram-hidden')).toBe(false);
    expect(code.closest('code-block')?.hasAttribute('data-gv-diagram-owner')).toBe(false);
  });

  it('renders the latest source once when the block changes before the renderer is ready', async () => {
    let ready!: (loaded: boolean) => void;
    const render = vi.fn(async () => SVG);
    vi.spyOn(waveRenderer, 'createWaveDromRenderer').mockReturnValue({
      load: () =>
        new Promise<boolean>((resolve) => {
          ready = resolve;
        }),
      render,
    });
    const code = addWaveDromBlock();
    fixture.activate();
    await vi.waitFor(() => expect(ready).toBeTypeOf('function'));
    code.textContent = LATEST;
    ready(true);
    await vi.waitFor(() => expect(fixture.diagramOf(code)?.querySelector('svg')).toBeTruthy(), {
      timeout: 3000,
    });
    expect(render).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledWith(LATEST, false);
  });

  it('drops a stale SVG and rerenders the latest source after an await', async () => {
    let finish!: (svg: string) => void;
    const render = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue('<svg viewBox="0 0 100 50"><text>latest</text></svg>');
    vi.spyOn(waveRenderer, 'createWaveDromRenderer').mockReturnValue({
      load: async () => true,
      render,
    });
    const code = addWaveDromBlock();
    fixture.activate();
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
    code.textContent = LATEST;
    finish('<svg viewBox="0 0 100 50"><text>stale</text></svg>');
    await vi.waitFor(() => expect(fixture.diagramOf(code)?.textContent).toContain('latest'), {
      timeout: 3000,
    });
    expect(fixture.diagramOf(code)?.textContent).not.toContain('stale');
    expect(render).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith(LATEST, false);
  });

  it('leaves no panel for a source block removed while rendering', async () => {
    let finish!: (svg: string) => void;
    const render = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    vi.spyOn(waveRenderer, 'createWaveDromRenderer').mockReturnValue({
      load: async () => true,
      render,
    });
    const code = addWaveDromBlock();
    const block = code.closest('code-block')!;
    fixture.activate();
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
    block.remove();
    finish(SVG);
    await vi.waitFor(() => expect(document.querySelector('.gv-diagram-panel')).toBeNull(), {
      timeout: 3000,
    });
    expect(block.hasAttribute('data-gv-diagram-hidden')).toBe(false);
    expect(block.hasAttribute('data-gv-diagram-owner')).toBe(false);
  });

  it('keeps native controls and inline styles through Code view, disable and re-enable', async () => {
    const code = addWaveDromBlock();
    const block = code.closest<HTMLElement>('code-block')!;
    block.setAttribute('style', 'display: block; color: red;');
    const decoration = block.querySelector<HTMLElement>('.code-block-decoration')!;
    const nativeButtons = document.createElement('div');
    nativeButtons.className = 'buttons';
    nativeButtons.setAttribute(
      'style',
      'position: absolute; top: 8px; right: 12px; margin-top: 3px; color: red;',
    );
    decoration.append(
      document.createElement('span'),
      nativeButtons,
      document.createElement('span'),
    );
    const originalChildren = Array.from(decoration.childNodes);
    const originalStyle = nativeButtons.getAttribute('style');
    const originalBlockStyle = block.getAttribute('style');
    const scope = fixture.activate();
    await vi.waitFor(() => expect(fixture.diagramOf(code)?.querySelector('svg')).toBeTruthy());
    const panel = fixture.panelOf(code)!;
    panel.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!.click();
    expect(panel.dataset.view).toBe('code');
    expect(getComputedStyle(block).display).toBe('block');
    expect(decoration.contains(nativeButtons)).toBe(true);
    expect(Array.from(decoration.childNodes)).toEqual(originalChildren);
    expect(nativeButtons.getAttribute('style')).toBe(originalStyle);
    panel.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!.click();
    fixture.diagramOf(code)!.click();
    expect(document.querySelector('.gv-wavedrom-modal')).not.toBeNull();
    await scope.dispose();
    expect(fixture.panelOf(code)).toBeNull();
    expect(document.querySelector('.gv-wavedrom-modal')).toBeNull();
    expect(document.getElementById('gv-wavedrom-styles')).toBeNull();
    expect(block.getAttribute('style')).toBe(originalBlockStyle);
    expect(Array.from(decoration.childNodes)).toEqual(originalChildren);
    expect(nativeButtons.getAttribute('style')).toBe(originalStyle);
    fixture.activate();
    await vi.waitFor(() => expect(fixture.diagramOf(code)?.querySelector('svg')).toBeTruthy());
    expect(block.getAttribute('style')).toBe(originalBlockStyle);
  });
});
