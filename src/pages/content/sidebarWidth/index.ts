/* Adjust Gemini sidebar (<bard-sidenav>) width: through CSS variable --bard-sidenav-open-width */
const STYLE_ID = 'gv-sidebar-width-style';
const DEFAULT_PERCENT = 26;
const MIN_PERCENT = 15;
const MAX_PERCENT = 45;
const LEGACY_BASELINE_PX = 1200;

const DEFAULT_PX = Math.round((DEFAULT_PERCENT / 100) * LEGACY_BASELINE_PX); // 312px
const MIN_PX = Math.round((MIN_PERCENT / 100) * LEGACY_BASELINE_PX); // 180px
const MAX_PX = Math.round((MAX_PERCENT / 100) * LEGACY_BASELINE_PX); // 540px

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const normalizePercent = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  if (value > MAX_PERCENT) {
    const approx = (value / LEGACY_BASELINE_PX) * 100;
    return clampNumber(approx, MIN_PERCENT, MAX_PERCENT);
  }
  return clampNumber(value, MIN_PERCENT, MAX_PERCENT);
};

const normalizePx = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return clampNumber(value, MIN_PX, MAX_PX);
};

function normalizeWidth(value: number): { normalized: number; unit: 'px' | 'percent' } {
  if (!Number.isFinite(value)) return { normalized: DEFAULT_PX, unit: 'px' };
  if (value > MAX_PERCENT) {
    return { normalized: normalizePx(value, DEFAULT_PX), unit: 'px' };
  }
  return { normalized: normalizePercent(value, DEFAULT_PERCENT), unit: 'percent' };
}

function buildStyle(widthValue: number): string {
  const { normalized, unit } = normalizeWidth(widthValue);

  const clampedWidth = unit === 'px' ? `${normalized}px` : `clamp(200px, ${normalized}vw, 800px)`; // preserve vw behavior for legacy %

  const closedWidth = 'var(--bard-sidenav-closed-width, 72px)'; // fallback matches collapsed rail width
  const openClosedDiff = `max(0px, calc(${clampedWidth} - ${closedWidth}))`;

  return `
    :root {
      --bard-sidenav-open-width: ${clampedWidth} !important;
      --bard-sidenav-open-closed-width-diff: ${openClosedDiff} !important;
      --gv-sidenav-shift: ${openClosedDiff} !important;
    }

    /* When sidenav is collapsed, zero out the shift */
    #app-root:has(side-navigation-content > div.collapsed) {
      --gv-sidenav-shift: 0px !important;
    }

    bard-sidenav {
      --bard-sidenav-open-width: ${clampedWidth} !important;
      --bard-sidenav-open-closed-width-diff: ${openClosedDiff} !important;
    }

    /* Keep top-level mode switcher (header) aligned when sidebar grows/shrinks */
    #app-root > main > div > bard-mode-switcher {
      transform: translateX(var(--gv-sidenav-shift)) !important;
      pointer-events: none !important;
    }

    /* Re-enable clicks for the actual switcher contents */
    #app-root > main > div > bard-mode-switcher * {
      pointer-events: auto;
    }

  `;
}

function ensureStyleEl(): HTMLStyleElement {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.documentElement.appendChild(style);
  }
  return style;
}

function applyWidth(widthValue: number): void {
  const style = ensureStyleEl();
  style.textContent = buildStyle(widthValue);
}

function removeStyles(): void {
  const style = document.getElementById(STYLE_ID);
  if (style) style.remove();
}

/** Initialize and start the sidebar width adjuster */
export function startSidebarWidthAdjuster(): void {
  let currentWidthValue = DEFAULT_PX;

  // 1) Read initial width
  try {
    chrome.storage?.sync?.get({ geminiSidebarWidth: DEFAULT_PX }, (res) => {
      const w = Number(res?.geminiSidebarWidth);
      const { normalized } = normalizeWidth(w);
      currentWidthValue = normalized;
      applyWidth(currentWidthValue);

      if (Number.isFinite(w) && w !== normalized) {
        try {
          chrome.storage?.sync?.set({ geminiSidebarWidth: normalized });
        } catch (err) {
          console.warn('[Gemini Voyager] Failed to migrate sidebar width to %:', err);
        }
      }
    });
  } catch (e) {
    // Fallback: inject default value if no storage permission
    console.error('[Gemini Voyager] Failed to get sidebar width from storage:', e);
    applyWidth(currentWidthValue);
  }

  // 2) Respond to storage changes (from Popup slider adjustment)
  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'sync' && changes.geminiSidebarWidth) {
        const w = Number(changes.geminiSidebarWidth.newValue);
        if (Number.isFinite(w)) {
          const { normalized } = normalizeWidth(w);
          currentWidthValue = normalized;
          applyWidth(currentWidthValue);

          if (normalized !== w) {
            try {
              chrome.storage?.sync?.set({ geminiSidebarWidth: normalized });
            } catch (err) {
              console.warn('[Gemini Voyager] Failed to migrate sidebar width to % on change:', err);
            }
          }
        }
      }
    });
  } catch (e) {
    console.error('[Gemini Voyager] Failed to add storage listener for sidebar width:', e);
  }

  // // 3) Listen for DOM changes (<bard-sidenav> may be lazily mounted)
  // let debounceTimer: number | null = null;
  // const observer = new MutationObserver(() => {
  //   if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  //   debounceTimer = window.setTimeout(() => {
  //     applyWidth(currentWidthValue);
  //     debounceTimer = null;
  //   }, 150);
  // });

  // const root = document.documentElement || document.body;
  // if (root) {
  //   observer.observe(root, { childList: true, subtree: true });
  // }

  // 4) Cleanup
  window.addEventListener('beforeunload', () => {
    // observer.disconnect();
    removeStyles();
  });
}
