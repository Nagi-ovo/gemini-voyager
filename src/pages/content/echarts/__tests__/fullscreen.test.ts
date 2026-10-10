import { describe, expect, it, vi } from 'vitest';

import { PIE_OPTION, createEChartsFixture } from './fixture';

const fixture = createEChartsFixture();

describe('fullscreen overlay', () => {
  const addRenderedEChartsBlock = async (): Promise<HTMLElement> => {
    const codeBlock = document.createElement('code-block');
    const decoration = document.createElement('div');
    decoration.className = 'code-block-decoration';
    const span = document.createElement('span');
    span.textContent = 'echarts';
    decoration.appendChild(span);
    const codeEl = document.createElement('code');
    codeEl.setAttribute('data-test-id', 'code-content');
    codeEl.textContent = PIE_OPTION;
    codeBlock.append(decoration, codeEl);
    document.body.appendChild(codeBlock);

    fixture.blocks.process();
    await vi.waitFor(() => {
      expect(document.querySelector('.gv-echarts-diagram')).not.toBeNull();
    });
    return document.querySelector('.gv-echarts-diagram') as HTMLElement;
  };

  it('moves the container into the modal, resizes it, and restores it on ESC', async () => {
    vi.useFakeTimers();
    const diagramContainer = await addRenderedEChartsBlock();
    const wrapper = diagramContainer.parentElement as HTMLElement;

    document.querySelector<HTMLButtonElement>('[data-action="fullscreen"]')!.click();
    const modal = document.querySelector('.gv-echarts-modal') as HTMLElement;
    expect(modal).not.toBeNull();
    expect(diagramContainer.parentElement?.classList.contains('gv-echarts-modal-card')).toBe(true);

    // The rAF after open resizes the canvas against the card.
    vi.runAllTimers();
    const echartsMod = await import('../runtime');
    const fakeInstance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;
    expect(fakeInstance.resize).toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // The modal removes itself after a 300 ms CSS transition.
    vi.advanceTimersByTime(400);
    expect(document.querySelector('.gv-echarts-modal')).toBeNull();
    expect(diagramContainer.parentElement).toBe(wrapper);
    expect(fakeInstance.resize).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('exposes modal semantics, traps focus, and restores the fullscreen trigger', async () => {
    await addRenderedEChartsBlock();
    const fullscreenBtn = document.querySelector<HTMLButtonElement>('[data-action="fullscreen"]')!;
    fullscreenBtn.focus();
    fullscreenBtn.click();

    const modal = document.querySelector<HTMLElement>('.gv-echarts-modal')!;
    const closeBtn = modal.querySelector<HTMLButtonElement>('button')!;
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.getAttribute('aria-label')).toBe('echartsFullscreenButton');
    expect(closeBtn.getAttribute('aria-label')).toBe('echartsCloseFullscreen');
    expect(document.activeElement).toBe(closeBtn);

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(closeBtn);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(closeBtn);

    fixture.fullscreen.close();
    expect(document.activeElement).toBe(fullscreenBtn);
  });

  it('opens a modal with the chart panel background colour', async () => {
    const diagramContainer = document.createElement('div');
    diagramContainer.style.setProperty('--gv-echarts-panel-bg', '#1a1a1a');
    fixture.fullscreen.open(diagramContainer);
    const card = document.querySelector('.gv-echarts-modal-card') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.style.getPropertyValue('--gv-echarts-panel-bg')).toBe('#1a1a1a');
    expect(document.querySelector('.gv-echarts-modal-hint')).not.toBeNull();
    fixture.fullscreen.close();
  });

  it('keeps canvas clicks available for inline ECharts interactions', async () => {
    const diagramContainer = await addRenderedEChartsBlock();

    diagramContainer.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelector('.gv-echarts-modal')).toBeNull();
  });

  it('disables fullscreen while the source view is visible', async () => {
    await addRenderedEChartsBlock();
    const codeBtn = document.querySelector<HTMLButtonElement>('[data-view="code"]')!;
    const fullscreenBtn = document.querySelector<HTMLButtonElement>('[data-action="fullscreen"]')!;

    codeBtn.click();
    expect(fullscreenBtn.disabled).toBe(true);
    fullscreenBtn.click();

    expect(document.querySelector('.gv-echarts-modal')).toBeNull();
  });

  it('closes the fullscreen chart and disposes it when Gemini removes its host', async () => {
    const diagramContainer = await addRenderedEChartsBlock();
    const wrapper = diagramContainer.parentElement as HTMLElement;
    document.querySelector<HTMLButtonElement>('[data-action="fullscreen"]')!.click();
    const echartsMod = await import('../runtime');
    const instance = vi.mocked(echartsMod.init).mock.results.at(-1)?.value;

    wrapper.remove();
    fixture.blocks.process();

    expect(document.querySelector('.gv-echarts-modal')).toBeNull();
    expect(instance.dispose).toHaveBeenCalledTimes(1);
  });

  it('does not let an old close timer remove a newer modal', async () => {
    vi.useFakeTimers();
    await addRenderedEChartsBlock();
    document.querySelector<HTMLButtonElement>('[data-action="fullscreen"]')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.fullscreen.close();

    const secondContainer = document.createElement('div');
    fixture.fullscreen.open(secondContainer);
    vi.advanceTimersByTime(400);

    expect(document.querySelector('.gv-echarts-modal')).not.toBeNull();
    fixture.fullscreen.close();
    vi.useRealTimers();
  });
});
