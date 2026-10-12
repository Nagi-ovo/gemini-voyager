/**
 * Gemini's long code block collapse (#817): the shared engine in `engine.ts`
 * pointed at Gemini's `code-block` elements. Long blocks stay expanded until
 * the user collapses them; the clipping and fade live in `contentStyle.css`.
 */
import { StorageKeys } from '@/core/types/common';

import type { NativeFeatureToggle } from '../featureLifecycle';
import { type CodeBlockCollapse, createCodeBlockCollapse } from './engine';
import { createGeminiCodeBlockSite } from './geminiSite';

export { LONG_CODE_BLOCK_MIN_HEIGHT, LONG_CODE_BLOCK_MIN_LINES, isLongCodeBlock } from './engine';

/** Gemini's switch: on unless the user turned it off. */
export function isCodeBlockCollapseEnabledValue(value: unknown): boolean {
  return value !== false;
}

/** The popup switch that starts and stops {@link startCodeBlockCollapse} while the page lives. */
export const CODE_BLOCK_COLLAPSE_TOGGLE: NativeFeatureToggle = {
  key: StorageKeys.CODE_BLOCK_COLLAPSE_ENABLED,
  isEnabled: isCodeBlockCollapseEnabledValue,
  areas: ['sync'],
};

let engine: CodeBlockCollapse | null = null;
let languageChangeListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;

function geminiEngine(): CodeBlockCollapse {
  engine ??= createCodeBlockCollapse(createGeminiCodeBlockSite(document, 'code-block'));
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
