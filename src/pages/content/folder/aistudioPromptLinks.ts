/**
 * AI Studio prompt links: the selectors, ids, titles and drag payloads read from
 * the page's own `/prompts/<id>` anchors. Pure DOM reads; nothing here holds state.
 */
import { normalizeText } from '@/core/utils/text';

import { parseDragPayload } from './dragPayload';
import type { DragData } from './types';

const PROMPT_LINK_SELECTORS = [
  'a[href^="/prompts/"]',
  'a[href^="/u/"][href*="/prompts/"]',
  'a[href*="://aistudio.google.com/prompts/"]',
  'a[href*="://aistudio.google.com/u/"][href*="/prompts/"]',
  'a[href*="://aistudio.google.cn/prompts/"]',
  'a[href*="://aistudio.google.cn/u/"][href*="/prompts/"]',
];
export const PROMPT_LINK_SELECTOR = PROMPT_LINK_SELECTORS.join(', ');
export const UNBOUND_PROMPT_LINK_SELECTOR = PROMPT_LINK_SELECTORS.map(
  (selector) => `${selector}:not([data-gv-drag-bound])`,
).join(', ');

/** Drag data for a prompt the page links to. */
export type PromptDragData = DragData & { conversationId: string };

export function nodeContainsPromptLink(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  if (node.matches(PROMPT_LINK_SELECTOR)) return true;
  return !!node.querySelector(PROMPT_LINK_SELECTOR);
}

export function mutationAddsPromptLinks(mutations: MutationRecord[]): boolean {
  return mutations.some((mutation) =>
    Array.from(mutation.addedNodes).some((node) => nodeContainsPromptLink(node)),
  );
}

function insidePromptLink(node: Node): boolean {
  return node instanceof Element && !!node.closest(PROMPT_LINK_SELECTOR);
}

function mutationMayAffectTitle(mutation: MutationRecord): boolean {
  if (mutation.type === 'characterData') {
    return !!mutation.target.parentElement?.closest(PROMPT_LINK_SELECTOR);
  }
  if (mutation.type === 'attributes') return insidePromptLink(mutation.target);
  if (mutation.type !== 'childList') return false;
  if (insidePromptLink(mutation.target)) return true;
  return (
    Array.from(mutation.addedNodes).some((node) => nodeContainsPromptLink(node)) ||
    Array.from(mutation.removedNodes).some((node) => nodeContainsPromptLink(node))
  );
}

export function mutationMayAffectPromptTitles(mutations: MutationRecord[]): boolean {
  return mutations.some(mutationMayAffectTitle);
}

export function extractPromptIdFromHref(rawHref: string): string | null {
  const href = String(rawHref || '').trim();
  if (!href) return null;
  const match = href.match(/\/prompts\/([^/?#]+)/);
  if (match && match[1]) return match[1];
  try {
    const url = new URL(href, location.origin);
    const pathMatch = url.pathname.match(/\/prompts\/([^/?#]+)/);
    return pathMatch?.[1] || null;
  } catch {
    return null;
  }
}

/** The prompt the page has open, from `/prompts/<id>` in the path. */
export function currentPromptId(): string | null {
  try {
    const match = (location.pathname || '').match(/\/prompts\/([^/?#]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function anchorHref(anchor: HTMLAnchorElement): string {
  return anchor.getAttribute('href') || anchor.href || '';
}

/** The prompt id an anchor links to; an unrecognised link falls back to its path or href. */
export function extractPromptId(anchor: HTMLAnchorElement): string {
  const rawHref = anchorHref(anchor);
  const id = extractPromptIdFromHref(rawHref);
  if (id) return id;
  try {
    const parts = (new URL(rawHref, location.origin).pathname || '').split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'prompts') return parts[1];
    return parts[1] || rawHref;
  } catch {
    return rawHref;
  }
}

/** The anchor's accessible title: aria-label, then title, then its text. */
function extractPromptTitle(anchor: HTMLAnchorElement | null): string | null {
  if (!anchor) return null;
  return (
    normalizeText(anchor.getAttribute('aria-label')) ||
    normalizeText(anchor.getAttribute('title')) ||
    normalizeText(anchor.textContent) ||
    null
  );
}

/** The drag payload a prompt anchor stands for, with its URL made absolute. */
export function promptDragData(anchor: HTMLAnchorElement): PromptDragData {
  const rawHref = anchorHref(anchor);
  const url = rawHref.startsWith('http')
    ? rawHref
    : `${location.origin}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
  return {
    type: 'conversation',
    conversationId: extractPromptId(anchor),
    title: extractPromptTitle(anchor) || '',
    url,
  };
}

/**
 * Every native prompt-link title in one document scan, by prompt id. Anchors
 * with the `prompt-link` class win over generic matches; within each tier the
 * first anchor in document order with a usable title wins.
 */
export function collectNativePromptTitles(): Map<string, string> {
  const preferred = new Map<string, string>();
  const titles = new Map<string, string>();
  document.querySelectorAll<HTMLAnchorElement>(PROMPT_LINK_SELECTOR).forEach((anchor) => {
    const promptId = extractPromptIdFromHref(anchorHref(anchor));
    const title = promptId ? extractPromptTitle(anchor) : null;
    if (!promptId || !title) return;
    const tier = anchor.classList.contains('prompt-link') ? preferred : titles;
    if (!tier.has(promptId)) tier.set(promptId, title);
  });
  preferred.forEach((title, promptId) => titles.set(promptId, title));
  return titles;
}

/** AI Studio drops accept Voyager JSON or a dropped prompt URL; only conversations apply. */
export function parseDragDataPayload(raw: string): DragData | null {
  const parsed = parseDragPayload(raw, { conversationIdFromUrl: extractPromptIdFromHref });
  if (parsed?.type !== 'conversation' || !parsed.conversationId) return null;
  return {
    type: 'conversation',
    conversationId: parsed.conversationId,
    title: parsed.title,
    url: parsed.url ?? '',
    ...(parsed.sourceFolderId ? { sourceFolderId: parsed.sourceFolderId } : {}),
  };
}

const DROP_DATA_TYPES = [
  'application/json',
  'text/plain',
  'text/uri-list',
  'text/x-moz-url',
  'URL',
] as const;

/** The first drag data type that holds a prompt: Voyager JSON, then the URL forms. */
export function readPromptDragData(event: DragEvent): DragData | null {
  const transfer = event.dataTransfer;
  if (!transfer) return null;
  for (const type of DROP_DATA_TYPES) {
    const candidate = transfer.getData(type);
    const parsed = candidate ? parseDragDataPayload(candidate) : null;
    if (parsed) return parsed;
  }
  return null;
}

/** Fills a prompt drag with Voyager JSON plus its URL, so a URL-only drop target still works. */
export function writePromptDragData(
  event: DragEvent,
  data: DragData,
  dragImage: HTMLElement,
): void {
  try {
    const transfer = event.dataTransfer;
    if (!transfer) return;
    const json = JSON.stringify(data);
    transfer.effectAllowed = 'move';
    transfer.setData('application/json', json);
    transfer.setData('text/plain', json);
    if (data.url) {
      transfer.setData('text/uri-list', data.url);
      transfer.setData('text/x-moz-url', `${data.url}\n${data.title || ''}`);
    }
  } catch {}
  try {
    event.dataTransfer?.setDragImage(dragImage, 10, 10);
  } catch {}
}
