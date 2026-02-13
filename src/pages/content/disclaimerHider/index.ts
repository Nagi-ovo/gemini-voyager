import { StorageKeys } from '@/core/types/common';

const HIDDEN_ATTR = 'data-gv-disclaimer-hidden';
const PREVIOUS_DISPLAY_ATTR = 'data-gv-disclaimer-prev-display';
const DISCLAIMER_ROOT_SELECTOR = 'body';

const DISCLAIMER_PATTERNS: RegExp[] = [
  /gemini\s+is\s+ai\s+and\s+can\s+make\s+mistakes?/i,
  /gemini.+(make\s+mistakes?|incorrect|errors?)/i,
  /gemini.+(可能|會).*(犯错|犯錯|错误|錯誤)/i,
  /gemini.+(間違|誤|ошиб|خطأ|실수)/i,
];

let initialized = false;
let hiddenEnabled = false;
let observer: MutationObserver | null = null;
let storageChangeListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;

export function normalizeDisclaimerText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function matchesGeminiDisclaimerText(text: string): boolean {
  const normalized = normalizeDisclaimerText(text);
  if (!normalized) return false;
  return DISCLAIMER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function resolveHideTarget(node: Text): HTMLElement | null {
  let current = node.parentElement;
  const text = normalizeDisclaimerText(node.textContent || '');
  if (!text) return null;

  for (
    let depth = 0;
    depth < 4 && current && (typeof document === 'undefined' || current !== document.body);
    depth += 1
  ) {
    const currentText = normalizeDisclaimerText(current.textContent || '');
    if (currentText === text) return current;
    current = current.parentElement;
  }

  return node.parentElement;
}

export function findDisclaimerContainers(root?: ParentNode): HTMLElement[] {
  if (!root && (typeof document === 'undefined' || !document.body)) return [];
  const targetRoot = root || document.body;
  if (!targetRoot) return [];
  const found = new Set<HTMLElement>();
  const treeWalker = document.createTreeWalker(targetRoot, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const text = node.textContent?.trim() || '';
      if (text.length < 12) return NodeFilter.FILTER_REJECT;
      return matchesGeminiDisclaimerText(text)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  while (treeWalker.nextNode()) {
    const textNode = treeWalker.currentNode as Text;
    const target = resolveHideTarget(textNode);
    if (target) found.add(target);
  }

  return Array.from(found);
}

function hideContainers(): void {
  if (typeof document === 'undefined') return;
  const root = document.querySelector(DISCLAIMER_ROOT_SELECTOR);
  if (!root) return;

  const targets = findDisclaimerContainers(root);
  targets.forEach((element) => {
    if (element.getAttribute(HIDDEN_ATTR) === '1') return;
    element.setAttribute(HIDDEN_ATTR, '1');
    element.setAttribute(PREVIOUS_DISPLAY_ATTR, element.style.display || '');
    element.style.display = 'none';
  });
}

function restoreContainers(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}="1"]`).forEach((element) => {
    const previous = element.getAttribute(PREVIOUS_DISPLAY_ATTR) || '';
    element.style.display = previous;
    element.removeAttribute(PREVIOUS_DISPLAY_ATTR);
    element.removeAttribute(HIDDEN_ATTR);
  });
}

function applyVisibility(): void {
  if (hiddenEnabled) {
    hideContainers();
  } else {
    restoreContainers();
  }
}

export function startDisclaimerHider(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (initialized) return;
  initialized = true;

  chrome.storage?.sync?.get({ [StorageKeys.GV_HIDE_GEMINI_DISCLAIMER]: false }, (result) => {
    hiddenEnabled = result?.[StorageKeys.GV_HIDE_GEMINI_DISCLAIMER] === true;
    applyVisibility();
  });

  observer = new MutationObserver(() => {
    if (!hiddenEnabled) return;
    hideContainers();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  storageChangeListener = (changes, areaName) => {
    if (areaName !== 'sync' || !changes[StorageKeys.GV_HIDE_GEMINI_DISCLAIMER]) return;
    hiddenEnabled = changes[StorageKeys.GV_HIDE_GEMINI_DISCLAIMER].newValue === true;
    applyVisibility();
  };

  chrome.storage?.onChanged?.addListener(storageChangeListener);

  window.addEventListener(
    'beforeunload',
    () => {
      observer?.disconnect();
      observer = null;
      if (storageChangeListener) {
        try {
          chrome.storage?.onChanged?.removeListener(storageChangeListener);
        } catch {}
      }
      storageChangeListener = null;
      initialized = false;
    },
    { once: true },
  );
}
