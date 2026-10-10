import { describe, expect, it, vi } from 'vitest';

import { requestEChartsDataUrl } from '../exportBridge';
import { resolveEChartsRenderTheme } from '../renderer';
import { PIE_OPTION, createEChartsFixture } from './fixture';

const fixture = createEChartsFixture();

describe('resolveEChartsRenderTheme', () => {
  it('follows the app theme in auto mode', () => {
    expect(resolveEChartsRenderTheme('auto', 'dark')).toBe('dark');
    expect(resolveEChartsRenderTheme('auto', 'light')).toBe('light');
  });
});

describe('theme switching', () => {
  const addEChartsBlock = (code: string): HTMLElement => {
    const codeBlock = document.createElement('code-block');
    const decoration = document.createElement('div');
    decoration.className = 'code-block-decoration';
    const span = document.createElement('span');
    span.textContent = 'echarts';
    decoration.appendChild(span);
    const codeEl = document.createElement('code');
    codeEl.setAttribute('data-test-id', 'code-content');
    codeEl.textContent = code;
    codeBlock.append(decoration, codeEl);
    document.body.appendChild(codeBlock);
    return codeEl;
  };

  it('re-renders an existing chart when the Gemini theme class changes', async () => {
    const host = document.createElement('div');
    host.className = 'theme-host light-theme';
    document.body.appendChild(host);
    const codeEl = addEChartsBlock(PIE_OPTION);
    fixture.blocks.process();
    await vi.waitFor(() => {
      expect(codeEl.dataset.echartsTheme).toBe('light');
    });
    const echartsMod = await import('../runtime');
    const initMock = vi.mocked(echartsMod.init);
    expect(initMock).toHaveBeenCalledTimes(1);
    const lightInstance = initMock.mock.results[0]?.value;
    const diagramContainer = document.querySelector('.gv-echarts-diagram') as HTMLElement;
    document.querySelector<HTMLButtonElement>('[data-action="fullscreen"]')!.click();
    const modalCard = document.querySelector('.gv-echarts-modal-card') as HTMLElement;
    expect(modalCard.style.getPropertyValue('--gv-echarts-panel-bg')).toBe('#f9fafb');

    host.className = 'theme-host dark-theme';
    // The MutationObserver debounces; a manual pass stands in for it.
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(codeEl.dataset.echartsTheme).toBe('dark');
    });
    expect(initMock).toHaveBeenCalledTimes(2);
    expect(initMock).toHaveBeenLastCalledWith(diagramContainer, 'dark', { renderer: 'canvas' });
    expect(lightInstance.dispose).toHaveBeenCalled();
    expect(diagramContainer.style.getPropertyValue('--gv-echarts-panel-bg')).toBe('#1a1a1a');
    expect(modalCard.style.getPropertyValue('--gv-echarts-panel-bg')).toBe('#1a1a1a');
    fixture.fullscreen.close();
  });

  it('defers a theme rerender until Code view reveals the diagram again', async () => {
    const host = document.createElement('div');
    host.className = 'theme-host light-theme';
    document.body.appendChild(host);
    const codeEl = addEChartsBlock(PIE_OPTION);
    fixture.blocks.process();
    await vi.waitFor(() => {
      expect(codeEl.dataset.echartsTheme).toBe('light');
    });
    const echartsMod = await import('../runtime');
    const initMock = vi.mocked(echartsMod.init);
    const diagram = document.querySelector<HTMLElement>('.gv-echarts-diagram')!;

    document.querySelector<HTMLButtonElement>('[data-view="code"]')!.click();
    host.className = 'theme-host dark-theme';
    fixture.blocks.process();
    await vi.waitFor(() => {
      expect(codeEl.dataset.echartsProcessing).toBe('false');
    });

    expect(diagram.style.display).toBe('none');
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(requestEChartsDataUrl(diagram).dataUrl).toBe('data:image/png;base64,COMPOSITED');

    document.querySelector<HTMLButtonElement>('[data-view="diagram"]')!.click();
    await vi.waitFor(() => {
      expect(codeEl.dataset.echartsTheme).toBe('dark');
    });
    expect(initMock).toHaveBeenCalledTimes(2);
    expect(initMock).toHaveBeenLastCalledWith(diagram, 'dark', { renderer: 'canvas' });
  });

  it('honours an explicit light theme even when the media query is dark', async () => {
    const host = document.createElement('div');
    host.className = 'theme-host light-theme';
    document.body.appendChild(host);
    const codeEl = addEChartsBlock(PIE_OPTION);
    fixture.blocks.process();

    await vi.waitFor(() => {
      expect(codeEl.dataset.echartsTheme).toBe('light');
    });
    const echartsMod = await import('../runtime');
    expect(vi.mocked(echartsMod.init)).toHaveBeenCalledWith(
      document.querySelector('.gv-echarts-diagram'),
      undefined,
      { renderer: 'canvas' },
    );
  });

  it('uses the latest theme when it changes during asynchronous loading', async () => {
    const host = document.createElement('div');
    host.className = 'theme-host light-theme';
    document.body.appendChild(host);
    const codeEl = addEChartsBlock(PIE_OPTION);

    fixture.blocks.process();
    host.className = 'theme-host dark-theme';

    await vi.waitFor(() => {
      expect(codeEl.dataset.echartsTheme).toBe('dark');
    });
    const echartsMod = await import('../runtime');
    expect(vi.mocked(echartsMod.init)).toHaveBeenCalledWith(
      document.querySelector('.gv-echarts-diagram'),
      'dark',
      { renderer: 'canvas' },
    );
  });
});
