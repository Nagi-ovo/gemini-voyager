import { getTranslationSync } from '@/utils/i18n';

export const LONG_CODE_BLOCK_MIN_LINES = 24;
export const LONG_CODE_BLOCK_MIN_HEIGHT = 520;

const HOST_SELECTOR = 'code-block';
const CODE_SELECTOR = 'code[data-test-id="code-content"], code.code-container, pre > code';
const TOGGLE_CLASS = 'gv-code-block-toggle';
const COLLAPSIBLE_CLASS = 'gv-code-block-collapsible';
const COLLAPSED_CLASS = 'gv-code-block-collapsed';
const SCAN_DEBOUNCE_MS = 120;

let observer: MutationObserver | null = null;
let scanTimer: number | null = null;
const managedBlocks = new Set<HTMLElement>();
const buttonsByBlock = new Map<HTMLElement, HTMLButtonElement>();

function lineCount(text: string): number {
  if (!text) return 0;
  return text.split(/\r\n?|\n/).length;
}

export function isLongCodeBlock(code: HTMLElement): boolean {
  const pre = code.closest('pre');
  const renderedHeight = Math.max(
    code.scrollHeight,
    pre instanceof HTMLElement ? pre.scrollHeight : 0,
  );

  return (
    lineCount(code.textContent ?? '') >= LONG_CODE_BLOCK_MIN_LINES ||
    renderedHeight >= LONG_CODE_BLOCK_MIN_HEIGHT
  );
}

function isMermaidBlock(host: HTMLElement): boolean {
  if (host.closest('.gv-mermaid-wrapper')) return true;

  const language = host
    .querySelector('.code-block-decoration > span')
    ?.textContent?.trim()
    .toLowerCase();
  return language === 'mermaid';
}

function toggleIcon(collapsed: boolean): string {
  const path = collapsed ? 'M8 8l4 4 4-4M8 13l4 4 4-4' : 'M8 16l4-4 4 4M8 11l4-4 4 4';
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="${path}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
    </svg>
  `;
}

function updateToggle(host: HTMLElement, button: HTMLButtonElement): void {
  const collapsed = host.classList.contains(COLLAPSED_CLASS);
  const state = collapsed ? 'collapsed' : 'expanded';
  const label = getTranslationSync(collapsed ? 'pm_expand' : 'pm_collapse');

  if (button.dataset.state !== state) {
    button.dataset.state = state;
    button.innerHTML = toggleIcon(collapsed);
  }
  if (button.title !== label) button.title = label;
  if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
  button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function removeEnhancement(host: HTMLElement): void {
  const button =
    buttonsByBlock.get(host) ?? host.querySelector<HTMLButtonElement>(`.${TOGGLE_CLASS}`);
  button?.remove();
  buttonsByBlock.delete(host);
  managedBlocks.delete(host);
  host.classList.remove(COLLAPSIBLE_CLASS, COLLAPSED_CLASS);
}

export function enhanceCodeBlock(host: HTMLElement): void {
  const code = host.querySelector<HTMLElement>(CODE_SELECTOR);
  const decoration = host.querySelector<HTMLElement>('.code-block-decoration');
  const actions = decoration?.querySelector<HTMLElement>('.buttons') ?? decoration;

  if (!code || !actions || isMermaidBlock(host) || !isLongCodeBlock(code)) {
    removeEnhancement(host);
    return;
  }

  managedBlocks.add(host);
  host.classList.add(COLLAPSIBLE_CLASS);

  let button = buttonsByBlock.get(host);
  if (!button || !button.isConnected || button.parentElement !== actions) {
    button?.remove();
    button = document.createElement('button');
    button.type = 'button';
    button.className = TOGGLE_CLASS;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      host.classList.toggle(COLLAPSED_CLASS);
      updateToggle(host, button!);
    });
    actions.appendChild(button);
    buttonsByBlock.set(host, button);
  }

  updateToggle(host, button);
}

export function processCodeBlocks(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(HOST_SELECTOR).forEach(enhanceCodeBlock);

  for (const host of managedBlocks) {
    if (!host.isConnected) removeEnhancement(host);
  }
}

function scheduleScan(): void {
  if (scanTimer !== null) window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    processCodeBlocks();
  }, SCAN_DEBOUNCE_MS);
}

export function stopCodeBlockCollapse(): void {
  observer?.disconnect();
  observer = null;
  if (scanTimer !== null) {
    window.clearTimeout(scanTimer);
    scanTimer = null;
  }
  for (const host of [...managedBlocks]) removeEnhancement(host);
}

export function startCodeBlockCollapse(): () => void {
  stopCodeBlockCollapse();
  processCodeBlocks();

  observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  return stopCodeBlockCollapse;
}
