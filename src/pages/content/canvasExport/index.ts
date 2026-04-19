import { StorageKeys } from '@/core/types/common';
import { getCurrentLanguage, getTranslation } from '@/utils/i18n';
import { normalizeLanguage } from '@/utils/language';

import { showExportToast } from '../../../features/export/ui/ExportToast';
import { convertCanvasDomToMarkdown } from './markdownConverter';
import {
  CANVAS_MARKDOWN_BUTTON_CLASS,
  findCanvasProseMirrorRoot,
  injectCanvasCopyMarkdownButton,
  isCanvasShareMenuPanel,
} from './menuInjection';

const MENU_PANEL_SELECTOR = '.mat-mdc-menu-panel[role="menu"]';
const MENU_INJECTION_RETRY_LIMIT = 8;
const MENU_INJECTION_RETRY_DELAY_MS = 80;

let canvasMenuObserver: MutationObserver | null = null;
let currentLabels = { label: 'Copy as Markdown', tooltip: 'Copy Canvas content as Markdown' };

async function copyMarkdownFromCanvas(): Promise<void> {
  const root = findCanvasProseMirrorRoot();
  if (!root) {
    const msg = await getTranslation('canvasExportEmpty');
    showExportToast(msg);
    return;
  }

  const markdown = convertCanvasDomToMarkdown(root).trim();
  if (!markdown) {
    const msg = await getTranslation('canvasExportEmpty');
    showExportToast(msg);
    return;
  }

  try {
    await navigator.clipboard.writeText(markdown);
    const msg = await getTranslation('canvasExportCopied');
    showExportToast(msg);
  } catch (err) {
    console.error('[Gemini Voyager] Canvas markdown copy failed:', err);
    const msg = await getTranslation('canvasExportFailed');
    showExportToast(msg);
  }
}

function getMenuPanelsFromNode(node: HTMLElement): HTMLElement[] {
  const panels: HTMLElement[] = [];
  if (node.matches(MENU_PANEL_SELECTOR)) panels.push(node);
  panels.push(...Array.from(node.querySelectorAll<HTMLElement>(MENU_PANEL_SELECTOR)));
  return panels;
}

function tryInjectOnPanel(menuPanel: HTMLElement, retriesLeft = MENU_INJECTION_RETRY_LIMIT): void {
  if (!menuPanel.isConnected) return;
  if (!isCanvasShareMenuPanel(menuPanel)) {
    if (retriesLeft > 0) {
      window.setTimeout(
        () => tryInjectOnPanel(menuPanel, retriesLeft - 1),
        MENU_INJECTION_RETRY_DELAY_MS,
      );
    }
    return;
  }

  const injected = injectCanvasCopyMarkdownButton(menuPanel, {
    label: currentLabels.label,
    tooltip: currentLabels.tooltip,
    onClick: () => void copyMarkdownFromCanvas(),
  });
  if (!injected && retriesLeft > 0) {
    window.setTimeout(
      () => tryInjectOnPanel(menuPanel, retriesLeft - 1),
      MENU_INJECTION_RETRY_DELAY_MS,
    );
  }
}

function updateExistingButton(label: string, tooltip: string): void {
  const btn = document.querySelector(
    `.${CANVAS_MARKDOWN_BUTTON_CLASS}`,
  ) as HTMLButtonElement | null;
  if (!btn) return;
  btn.title = tooltip;
  btn.setAttribute('aria-label', tooltip);
  const text = btn.querySelector('.mat-mdc-menu-item-text') as HTMLElement | null;
  if (text) text.textContent = label;
}

async function refreshLabels(): Promise<void> {
  const [label, tooltip] = await Promise.all([
    getTranslation('canvasExportCopyMarkdown'),
    getTranslation('canvasExportCopyMarkdownTooltip'),
  ]);
  currentLabels = { label, tooltip };
  updateExistingButton(label, tooltip);
}

export async function startCanvasExport(): Promise<void> {
  if (location.hostname !== 'gemini.google.com') return;
  if (canvasMenuObserver) return;

  await refreshLabels();
  // Also pre-warm: language may have been cached by initI18n; keep translations fresh.
  void getCurrentLanguage().then(() => void refreshLabels());

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const panelSet = new Set<HTMLElement>();
        getMenuPanelsFromNode(node).forEach((panel) => panelSet.add(panel));
        const closest = node.closest(MENU_PANEL_SELECTOR) as HTMLElement | null;
        if (closest) panelSet.add(closest);
        panelSet.forEach((panel) => {
          window.setTimeout(() => tryInjectOnPanel(panel), 30);
        });
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  canvasMenuObserver = observer;

  document.querySelectorAll<HTMLElement>(MENU_PANEL_SELECTOR).forEach((panel) => {
    window.setTimeout(() => tryInjectOnPanel(panel), 30);
  });

  const storageHandler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'sync' && area !== 'local') return;
    const next = changes[StorageKeys.LANGUAGE]?.newValue;
    if (typeof next !== 'string') return;
    // Normalize early so future lookups pick the right dictionary.
    normalizeLanguage(next);
    void refreshLabels();
  };

  try {
    chrome.storage?.onChanged?.addListener(storageHandler);
  } catch {}

  window.addEventListener(
    'beforeunload',
    () => {
      try {
        canvasMenuObserver?.disconnect();
      } catch {}
      canvasMenuObserver = null;
      try {
        chrome.storage?.onChanged?.removeListener(storageHandler);
      } catch {}
    },
    { once: true },
  );
}
