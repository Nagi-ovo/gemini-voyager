/**
 * Read one Gemini answer into a research-pack draft.
 *
 * Runs only when the user clicks "Add to pack" on that answer: nothing here
 * observes or reads responses on its own.
 */
import {
  type ContentExtractor,
  createContentExtractor,
} from '@/features/export/services/DOMContentExtractor';
import type { ResearchPackDraftItem } from '@/features/researchPack/services/types';

import { resolveExportAdapter } from '../export/adapter/platformAdapters';

export const RESPONSE_HOST_SELECTOR = 'model-response';
const THOUGHTS_SELECTOR = 'model-thoughts, .thoughts-container, .thoughts-content';
/** Action bars hold share/feedback links, never sources. */
const ACTION_BAR_LINK_SCOPE = 'message-actions, .message-actions';

function queryOutsideThoughts<T extends Element>(root: Element, selector: string): T | null {
  for (const element of Array.from(root.querySelectorAll<T>(selector))) {
    if (!element.closest(THOUGHTS_SELECTOR)) return element;
  }
  return null;
}

/** The element whose content is the answer itself (not thoughts, not the action bar). */
export function resolveAnswerElement(host: HTMLElement): HTMLElement {
  return (
    queryOutsideThoughts<HTMLElement>(host, 'message-content') ??
    queryOutsideThoughts<HTMLElement>(host, '.markdown, .markdown-main-panel') ??
    host
  );
}

/**
 * The text the user selected inside this answer, or '' when the selection is
 * empty or lies (even partly) outside it.
 */
export function readSelectionWithin(answer: HTMLElement, selection: Selection | null): string {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return '';
  const range = selection.getRangeAt(0);
  if (!answer.contains(range.commonAncestorContainer)) return '';
  return selection.toString().trim();
}

/**
 * Every outbound link in the answer, including Gemini's source chips and
 * source list, which the Markdown extractor deliberately drops. Links inside
 * thoughts and the action bar are skipped; normalization happens later.
 */
export function collectAnswerLinks(host: HTMLElement): Array<{ url: string; title: string }> {
  const links: Array<{ url: string; title: string }> = [];
  for (const anchor of Array.from(host.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    if (anchor.closest(THOUGHTS_SELECTOR) || anchor.closest(ACTION_BAR_LINK_SCOPE)) continue;
    const href = anchor.getAttribute('href') ?? '';
    if (!href || href.startsWith('#')) continue;
    const title =
      anchor.getAttribute('aria-label') || anchor.textContent || anchor.getAttribute('title') || '';
    links.push({ url: anchor.href || href, title });
  }
  return links;
}

function readPrompt(host: HTMLElement, extractor: ContentExtractor): string {
  const container = host.closest('.conversation-container');
  const userQuery = container?.querySelector<HTMLElement>('user-query');
  if (!userQuery) return '';
  try {
    const text = extractor.extractUserContent(userQuery).text;
    if (text.trim()) return text;
  } catch {
    // Fall through to the visible text.
  }
  return userQuery.textContent ?? '';
}

function readAnswerMarkdown(answer: HTMLElement, extractor: ContentExtractor): string {
  try {
    const text = extractor.extractAssistantContent(answer).text;
    if (text.trim()) return text;
  } catch {
    // Fall through to the visible text.
  }
  return answer.innerText || answer.textContent || '';
}

/**
 * Build the draft for one answer. `selectedText`, when non-empty, replaces the
 * whole answer so the user can add only the part that matters.
 */
export function captureAnswer(host: HTMLElement, selectedText: string): ResearchPackDraftItem {
  const adapter = resolveExportAdapter();
  const extractor = createContentExtractor(adapter);

  const answer = resolveAnswerElement(host);
  const excerpt = selectedText.length > 0;
  return {
    text: excerpt ? selectedText : readAnswerMarkdown(answer, extractor),
    excerpt,
    prompt: readPrompt(host, extractor),
    sourceTitle: adapter.extractConversationTitle(),
    sourceUrl: window.location.href,
    platform: adapter.site.id,
    citations: collectAnswerLinks(host),
  };
}
