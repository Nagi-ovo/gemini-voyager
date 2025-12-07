/* Adjust Gemini sidebar (<bard-sidenav>) width: through CSS variable --bard-sidenav-open-width */
const STYLE_ID = 'gv-sidebar-width-style';
const DEFAULT_PERCENT = 26;
const MIN_PERCENT = 15;
const MAX_PERCENT = 45;
const LEGACY_BASELINE_PX = 1200;

const clampPercent = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const normalizePercent = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  if (value > MAX_PERCENT) {
    const approx = (value / LEGACY_BASELINE_PX) * 100;
    return clampPercent(approx, MIN_PERCENT, MAX_PERCENT);
  }
  return clampPercent(value, MIN_PERCENT, MAX_PERCENT);
};

function buildStyle(widthPercent: number): string {
  const normalizedPercent = normalizePercent(widthPercent, DEFAULT_PERCENT);
  // Keep a hard clamp to avoid overly wide sidebars on very large screens
  const clampedWidth = `clamp(200px, ${normalizedPercent}vw, 520px)`;
  const baselineOpenPx = 310; // estimated default open width
  const extraShift = `clamp(0px, calc(${clampedWidth} - ${baselineOpenPx}px), 320px)`;

  return `
    bard-sidenav {
      --bard-sidenav-open-width: ${clampedWidth} !important;
    }

    /* Keep mode switcher aligned when sidebar grows */
    bard-mode-switcher {
      transform: translateX(
        calc(var(--bard-sidenav-open-closed-width-diff, 0px) + ${extraShift})
      ) !important;
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

function applyWidth(widthPercent: number): void {
  const style = ensureStyleEl();
  style.textContent = buildStyle(widthPercent);
}

function removeStyles(): void {
  const style = document.getElementById(STYLE_ID);
  if (style) style.remove();
}

/** Initialize and start the sidebar width adjuster */
export function startSidebarWidthAdjuster(): void {
  let currentWidthPercent = DEFAULT_PERCENT;

  // 1) Read initial width
  try {
    chrome.storage?.sync?.get({ geminiSidebarWidth: DEFAULT_PERCENT }, (res) => {
      const w = Number(res?.geminiSidebarWidth);
      const normalized = normalizePercent(w, DEFAULT_PERCENT);
      currentWidthPercent = normalized;
      applyWidth(currentWidthPercent);

      if (Number.isFinite(w) && w !== normalized) {
        try {
          chrome.storage?.sync?.set({ geminiSidebarWidth: normalized });
        } catch (err) {
          console.warn('[Gemini Voyager] Failed to migrate sidebar width to %:', err);
        }
      }
    });
  } catch (e){
    // Fallback: inject default value if no storage permission
      console.error('[Gemini Voyager] Failed to get sidebar width from storage:', e);
	    applyWidth(currentWidthPercent);
	  }

  // 2) Respond to storage changes (from Popup slider adjustment)
  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'sync' && changes.geminiSidebarWidth) {
        const w = Number(changes.geminiSidebarWidth.newValue);
        if (Number.isFinite(w)) {
          const normalized = normalizePercent(w, DEFAULT_PERCENT);
          currentWidthPercent = normalized;
          applyWidth(currentWidthPercent);

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
  //     applyWidth(currentWidthPercent);
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