import { createChartFullscreen } from '../chartFullscreen';
import { PANEL_BG } from './renderer';

const t = (key: string, fallback: string): string => {
  try {
    return chrome.i18n.getMessage(key) || fallback;
  } catch {
    return fallback;
  }
};

export function createEChartsFullscreen(resize: (container: HTMLElement) => void) {
  const fullscreen = createChartFullscreen();
  let fullscreenWrapper: HTMLElement | null = null;
  const open = (chartContainer: HTMLElement) => {
    fullscreen.open(() => {
      const card = document.createElement('div');
      card.className = 'gv-echarts-modal-card';
      card.style.background = `var(--gv-echarts-panel-bg, ${PANEL_BG.light})`;
      card.style.setProperty(
        '--gv-echarts-panel-bg',
        chartContainer.style.getPropertyValue('--gv-echarts-panel-bg') || PANEL_BG.light,
      );
      // Move the live canvas; cloning would lose its ECharts instance.
      fullscreenWrapper = chartContainer.parentElement;
      card.appendChild(chartContainer);
      return {
        prefix: 'gv-echarts',
        body: card,
        closeLabel: t('echartsCloseFullscreen', 'Close (ESC)'),
        hint: t('echartsFullscreenHint', 'Press ESC to close'),
        dialogLabel: t('echartsFullscreenButton', 'Fullscreen'),
        onReveal: () => resize(chartContainer),
        onDestroy: () => {
          if (fullscreenWrapper) {
            fullscreenWrapper.appendChild(chartContainer);
            fullscreenWrapper = null;
          }
          resize(chartContainer);
        },
      };
    });
  };

  return {
    open,
    close: fullscreen.close,
    findContainer(wrapper: HTMLElement): HTMLElement | null {
      return (
        wrapper.querySelector<HTMLElement>('.gv-echarts-diagram') ??
        (fullscreenWrapper === wrapper
          ? (fullscreen.modal?.querySelector<HTMLElement>('.gv-echarts-diagram') ?? null)
          : null)
      );
    },
    ownerOf(container: HTMLElement): HTMLElement | null {
      return (
        container.closest<HTMLElement>('.gv-echarts-wrapper') ??
        (fullscreen.modal?.contains(container) ? fullscreenWrapper : null)
      );
    },
    closeForWrapper(wrapper: HTMLElement) {
      if (fullscreenWrapper === wrapper) fullscreen.close();
    },
    closeDetached() {
      if (fullscreenWrapper && !fullscreenWrapper.isConnected) fullscreen.close();
    },
  };
}
