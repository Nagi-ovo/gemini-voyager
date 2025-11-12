/**
 * startSidebarWidthAdjuster
 * - 注入样式： bard-sidenav { --bard-sidenav-open-width: ${width}px !important; }
 * - 监听 storage 变更以实时更新
 */

import { StorageKeys } from '@/core/types/common';

const STYLE_ID = 'gemini-voyager-sidebar-width';
const DEFAULT_WIDTH = 400;

function applyWidth(width: number) {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `bard-sidenav { --bard-sidenav-open-width: ${width}px !important; }`;
}

function readAndApplyFromStorage() {
  try {
    // 使用 globalThis 访问 browser 避免 tsc 报错
    const g: any = globalThis as any;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get([StorageKeys.SIDEBAR_WIDTH], (res: any) => {
        const v = res && res[StorageKeys.SIDEBAR_WIDTH];
        const w = typeof v === 'number' && !isNaN(v) ? v : DEFAULT_WIDTH;
        applyWidth(w);
      });
    } else if (typeof g.browser !== 'undefined' && g.browser.storage && g.browser.storage.local) {
      g.browser.storage.local.get([StorageKeys.SIDEBAR_WIDTH]).then((res: any) => {
        const v = res && res[StorageKeys.SIDEBAR_WIDTH];
        const w = typeof v === 'number' && !isNaN(v) ? v : DEFAULT_WIDTH;
        applyWidth(w);
      });
    } else {
      const raw = localStorage.getItem(StorageKeys.SIDEBAR_WIDTH);
      const w = raw ? Number(raw) : DEFAULT_WIDTH;
      applyWidth(w);
    }
  } catch (e) {
    const raw = localStorage.getItem(StorageKeys.SIDEBAR_WIDTH);
    const w = raw ? Number(raw) : DEFAULT_WIDTH;
    applyWidth(w);
  }
}

/**
 * 启动：立即读取并应用；并监听 storage 变更 / runtime message
 */
export function startSidebarWidthAdjuster() {
  readAndApplyFromStorage();

  try {
    const g: any = globalThis as any;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes: any) => {
        if (changes && changes[StorageKeys.SIDEBAR_WIDTH]) {
          const newValue = changes[StorageKeys.SIDEBAR_WIDTH].newValue;
          if (typeof newValue === 'number') applyWidth(newValue);
        }
      });

      chrome.runtime.onMessage.addListener((msg: any) => {
        if (msg && msg.type === 'gv_sidebar_width_changed' && typeof msg.width === 'number') {
          applyWidth(msg.width);
        }
      });
    } else if (typeof g.browser !== 'undefined' && g.browser.storage && g.browser.storage.onChanged) {
      g.browser.storage.onChanged.addListener((changes: any) => {
        if (changes && changes[StorageKeys.SIDEBAR_WIDTH]) {
          const newValue = changes[StorageKeys.SIDEBAR_WIDTH].newValue;
          if (typeof newValue === 'number') applyWidth(newValue);
        }
      });
    }
  } catch (e) {
    // ignore
  }
}