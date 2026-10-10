/**
 * Gemini's long code block collapse (#817): the shared engine in `engine.ts`
 * pointed at Gemini's `code-block` elements. Long blocks stay expanded until
 * the user collapses them; the clipping and fade live in `contentStyle.css`.
 */
import { StorageKeys } from '@/core/types/common';

import {
  type CodeBlockCollapse,
  type CodeBlockCollapseSite,
  createCodeBlockCollapse,
} from './engine';

export { LONG_CODE_BLOCK_MIN_HEIGHT, LONG_CODE_BLOCK_MIN_LINES, isLongCodeBlock } from './engine';

const CODE_SELECTOR = 'code[data-test-id="code-content"], code.code-container, pre > code';

function isMermaidBlock(host: HTMLElement): boolean {
  if (host.closest('.gv-mermaid-wrapper')) return true;

  const language = host
    .querySelector('.code-block-decoration > span')
    ?.textContent?.trim()
    .toLowerCase();
  return language === 'mermaid';
}

const GEMINI_SITE: CodeBlockCollapseSite = {
  root: () => document.body,
  hostSelector: 'code-block',
  accepts: (host) => !isMermaidBlock(host),
  code: (host) => host.querySelector<HTMLElement>(CODE_SELECTOR),
  actions(host) {
    const decoration = host.querySelector<HTMLElement>('.code-block-decoration');
    return decoration?.querySelector<HTMLElement>('.buttons') ?? decoration;
  },
};

let engine: CodeBlockCollapse | null = null;
let languageChangeListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;

function geminiEngine(): CodeBlockCollapse {
  engine ??= createCodeBlockCollapse(GEMINI_SITE);
  return engine;
}

export function enhanceCodeBlock(host: HTMLElement): void {
  geminiEngine().enhance(host);
}

export function processCodeBlocks(root: ParentNode = document): void {
  geminiEngine().process(root);
}

export function stopCodeBlockCollapse(): void {
  engine?.stop();
  engine = null;
  if (languageChangeListener) {
    try {
      chrome.storage?.onChanged?.removeListener(languageChangeListener);
    } catch {}
    languageChangeListener = null;
  }
}

export function startCodeBlockCollapse(): () => void {
  stopCodeBlockCollapse();
  const current = geminiEngine();
  current.start();

  languageChangeListener = (changes, areaName) => {
    if ((areaName !== 'sync' && areaName !== 'local') || !changes[StorageKeys.LANGUAGE]) return;
    queueMicrotask(() => current.relabel());
  };
  chrome.storage?.onChanged?.addListener(languageChangeListener);

  return stopCodeBlockCollapse;
}
