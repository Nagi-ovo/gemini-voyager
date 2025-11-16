/* Adjust Gemini sidebar (<bard-sidenav>) width: through CSS variable --bard-sidenav-open-width */
const STYLE_ID = 'gv-sidebar-width-style';

function buildStyle(width: number): string {
  return `
    bard-sidenav {
      --bard-sidenav-open-width: ${width}px !important;
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

function applyWidth(width: number): void {
  const style = ensureStyleEl();
  style.textContent = buildStyle(width);
}

function removeStyles(): void {
  const style = document.getElementById(STYLE_ID);
  if (style) style.remove();
}

/** Initialize and start the sidebar width adjuster */
export function startSidebarWidthAdjuster(): void {
  let currentWidth = 310;

  // 1) Read initial width
  try {
    chrome.storage?.sync?.get({ geminiSidebarWidth: 310 }, (res) => {
      const w = Number(res?.geminiSidebarWidth);
      currentWidth = Number.isFinite(w) ? w : 310;
      applyWidth(currentWidth);
    });
  } catch (e){
    // Fallback: inject default value if no storage permission
      console.error('[Gemini Voyager] Failed to get sidebar width from storage:', e);
	    applyWidth(currentWidth);
	  }

  // 2) Respond to storage changes (from Popup slider adjustment)
  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'sync' && changes.geminiSidebarWidth) {
        const w = Number(changes.geminiSidebarWidth.newValue);
        if (Number.isFinite(w)) {
          currentWidth = w;
          applyWidth(currentWidth);
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
  //     applyWidth(currentWidth);
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