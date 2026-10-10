import { resolveMermaidTheme } from '../mermaid/renderer';
import { sanitizeEChartsOption } from './source';

type EChartsModule = typeof import('./runtime');
type EChartsInstance = ReturnType<EChartsModule['init']>;

/** ECharts theme policy (follows the app theme). */
export type EChartsThemeMode = 'auto';

/** Resolve the effective chart render theme from the policy + app theme. */
export const resolveEChartsRenderTheme = (
  mode: EChartsThemeMode,
  appTheme: 'light' | 'dark',
): 'light' | 'dark' => (mode === 'auto' ? appTheme : 'light');

/** Deterministic backdrop colours for the chart panel (mirrors WaveDrom). */
export const PANEL_BG: Record<'light' | 'dark', string> = {
  light: '#f9fafb',
  dark: '#1a1a1a',
};

export const CHART_HEIGHT = 360;

export const getAppTheme = (): 'light' | 'dark' =>
  resolveMermaidTheme(document, window.matchMedia('(prefers-color-scheme: dark)').matches) ===
  'dark'
    ? 'dark'
    : 'light';

export function createEChartsRenderer() {
  let echartsModule: EChartsModule | null = null;
  let echartsLoadFailed = false;
  const chartInstances = new Map<HTMLElement, EChartsInstance>();
  let chartResizeObserver: ResizeObserver | null = null;
  /**
   * Dynamically load ECharts. Result is cached after the first successful load;
   * a failed load also short-circuits further attempts. The local modular entry
   * registers supported chart/component primitives without pulling ECharts'
   * unused geo parser into the extension bundle.
   */
  const loadECharts = async (): Promise<EChartsModule | null> => {
    if (echartsModule) return echartsModule;
    if (echartsLoadFailed) return null;

    try {
      echartsModule = await import('./runtime');
      return echartsModule;
    } catch (err) {
      echartsLoadFailed = true;
      console.error('[Gemini Voyager] Failed to load ECharts library:', err);
      return null;
    }
  };

  /**
   * (Re)render an option into a container: disposes the previous instance (the
   * render theme may have changed), then inits a fresh canvas chart with the
   * deterministic panel backdrop merged under the user option.
   */
  const renderChartToContainer = (
    container: HTMLElement,
    parsed: Record<string, unknown>,
    renderTheme: 'light' | 'dark',
  ) => {
    const existing = chartInstances.get(container);
    if (existing) {
      existing.dispose();
      chartInstances.delete(container);
    }
    if (!echartsModule) return;

    const theme = renderTheme === 'dark' ? 'dark' : undefined;
    const instance = echartsModule.init(container, theme, { renderer: 'canvas' });
    try {
      // `backgroundColor` from the chart option would otherwise paint over the
      // panel; keep the deterministic backdrop so text stays readable.
      instance.setOption(sanitizeEChartsOption(parsed, PANEL_BG[renderTheme]), true);
      chartInstances.set(container, instance);
    } catch (error) {
      // `setOption` can reject malformed LLM output or an option that requires a
      // component outside the intentionally narrow runtime. The instance is not
      // in `chartInstances` yet, so dispose it here before the outer teardown.
      instance.dispose();
      throw error;
    }
  };

  function disposeChartContainer(container: HTMLElement): void {
    chartResizeObserver?.unobserve(container);
    chartInstances.get(container)?.dispose();
    chartInstances.delete(container);
  }

  function startResizeObserver(): void {
    if (!chartResizeObserver && typeof ResizeObserver !== 'undefined') {
      chartResizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const container = entry.target as HTMLElement;
          if (
            container.style.display === 'none' ||
            entry.contentRect.width <= 0 ||
            entry.contentRect.height <= 0
          ) {
            continue;
          }
          chartInstances.get(container)?.resize();
        }
      });
    }
  }
  return {
    load: loadECharts,
    render: renderChartToContainer,
    resize(container: HTMLElement) {
      chartInstances.get(container)?.resize();
    },
    getDataUrl(container: HTMLElement): string | null {
      try {
        const instance = chartInstances.get(container);
        if (!instance) return null;
        return instance.getDataURL({
          type: 'png',
          pixelRatio: 1,
          backgroundColor:
            container.style.getPropertyValue('--gv-echarts-panel-bg') || PANEL_BG.light,
        });
      } catch {
        return null;
      }
    },
    observe(container: HTMLElement) {
      chartResizeObserver?.observe(container);
    },
    startResizeObserver,
    stopResizeObserver() {
      chartResizeObserver?.disconnect();
      chartResizeObserver = null;
    },
    dispose: disposeChartContainer,
    containers: () => chartInstances.keys(),
  };
}
