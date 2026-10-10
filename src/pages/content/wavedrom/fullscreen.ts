import { createChartFullscreen } from '../chartFullscreen';

const t = (key: string, fallback: string): string => {
  try {
    return chrome.i18n.getMessage(key) || fallback;
  } catch {
    return fallback;
  }
};

// Only the viewBox retains intrinsic dimensions once the overlay forces 100% SVG sizing.
export const parseViewBoxSize = (svgEl: SVGSVGElement): { w: number; h: number } | null => {
  const vb = svgEl.getAttribute('viewBox')?.trim().split(/\s+/).map(Number);
  if (!vb || vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0)) return null;
  return { w: vb[2], h: vb[3] };
};

export const computeAutoFitScale = (
  intrinsicW: number,
  intrinsicH: number,
  viewportW: number,
  viewportH: number,
): number => {
  if (intrinsicW <= 0 || intrinsicH <= 0 || viewportW <= 0 || viewportH <= 0) return 1;
  return Math.min(Math.max(Math.min(viewportW / intrinsicW, viewportH / intrinsicH), 0.1), 10);
};

const fitSvg = (svgEl: SVGSVGElement | null): boolean => {
  if (svgEl) {
    const padding = 80;
    const vw = window.innerWidth - padding * 2;
    const vh = window.innerHeight - padding * 2;
    const intrinsic = parseViewBoxSize(svgEl);
    const w = intrinsic?.w ?? (svgEl.scrollWidth || svgEl.clientWidth);
    const h = intrinsic?.h ?? (svgEl.scrollHeight || svgEl.clientHeight);
    if (w > 0 && h > 0) {
      const fitScale = computeAutoFitScale(w, h, vw, vh);
      // A definite pixel box prevents the 100% SVG from falling back to 300×150.
      svgEl.style.width = `${w * fitScale}px`;
      svgEl.style.height = `${h * fitScale}px`;
      return true;
    }
  }

  return false;
};

export const createWaveDromFullscreen = () => {
  const fullscreen = createChartFullscreen();
  return {
    open(svgHtml: string, panelBg: string) {
      fullscreen.open(() => {
        const card = document.createElement('div');
        card.dataset.testid = 'wavedrom-zoom-card';
        card.style.background = panelBg;
        card.style.borderRadius = '8px';
        card.style.padding = '12px';
        card.style.flexShrink = '0';

        const content = document.createElement('div');
        content.className = 'gv-wavedrom-modal-content';
        // The render path already sanitised this cloned SVG markup.
        content.innerHTML = svgHtml;
        const svg = content.querySelector('svg');
        if (svg?.hasAttribute('viewBox')) {
          svg.setAttribute('width', '100%');
          svg.setAttribute('height', '100%');
        }
        card.appendChild(content);

        return {
          prefix: 'gv-wavedrom',
          body: card,
          closeLabel: t('wavedromCloseFullscreen', 'Close (ESC)'),
          hint: t('wavedromFullscreenHint', 'Scroll to zoom • Drag to pan • ESC to close'),
          panZoom: {
            content,
            labels: [
              t('wavedromZoomIn', 'Zoom In'),
              t('wavedromZoomOut', 'Zoom Out'),
              t('wavedromResetView', 'Reset'),
            ],
            fit: () => (fitSvg(svg) ? 1 : null),
          },
        };
      });
    },
    close: fullscreen.close,
  };
};

export type WaveDromFullscreen = ReturnType<typeof createWaveDromFullscreen>;
