/* 调整 Gemini 侧边栏（<bard-sidenav>）宽度：通过 CSS 变量 --bard-sidenav-open-width 实现 */
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

/** 初始化与启动侧边栏宽度调节器 */
export function startSidebarWidthAdjuster(): void {
  let currentWidth = 400;

  // 1) 读取初始宽度
  try {
    chrome.storage?.sync?.get({ geminiSidebarWidth: 400 }, (res) => {
      const w = Number(res?.geminiSidebarWidth);
      currentWidth = Number.isFinite(w) ? w : 400;
      applyWidth(currentWidth);
    });
  } catch {
    // 兜底：无存储权限时也按默认值注入
    applyWidth(currentWidth);
  }

  // 2) 响应存储变化（来自 Popup 滑块调整）
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
  } catch {}

  // 3) 监听 DOM 变化（<bard-sidenav> 可能是延迟挂载的）
  let debounceTimer: number | null = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      applyWidth(currentWidth);
      debounceTimer = null;
    }, 150);
  });

  const root = document.documentElement || document.body;
  if (root) {
    observer.observe(root, { childList: true, subtree: true });
  }

  // 4) 清理
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    removeStyles();
  });
}