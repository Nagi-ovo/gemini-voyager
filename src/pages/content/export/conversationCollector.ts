/**
 * Reads the conversation shown on the page into export turns and selectable messages.
 *
 * All host-specific selectors come from the export adapter. This module owns
 * the DOM heuristics shared by every caller: document-order pairing, skipping
 * Gemini's thinking panel and Deep Research immersive nodes, starred-turn
 * lookup, and appending Canvas document content to responses that reference it.
 */
import { filterTopLevel } from '@/core/utils/array';
import {
  type ContentExtractor,
  createContentExtractor,
  extractTurnContent,
} from '@/features/export/services/DOMContentExtractor';
import { queryOutsideThoughts } from '@/features/export/services/exportDomPolicy';
import type { CanvasDoc, ChatTurn as ExportChatTurn } from '@/features/export/types/export';

import { isServerTurnId } from '../fork/turnId';
import { historyTimestampStore } from '../timestamp/historyTimestamps';
import type { ExportPlatformAdapter } from './adapter/platformAdapters';
import { assistantHasCanvasDoc, extractAllCanvasDocs, isAnyCanvasOpen } from './canvasDocExtractor';
import {
  filterOutDeepResearchImmersiveNodes,
  findAssistantForTurn,
  pickAssistantExportElement,
} from './conversationDom';
import { resolveUniqueExportTurnIds } from './selectionIds';
import { groupSelectedMessagesByTurn } from './selectionUtils';
import { geminiConversationIdFromLocation } from './sidebarConversationNavigation';

const CANVAS_EXPORT_SECTION_CLASS = 'gv-canvas-export-section';

export type ChatTurn = {
  turnId: string;
  user: string;
  assistant: string;
  starred: boolean;
  userElement?: HTMLElement;
  assistantElement?: HTMLElement;
  assistantHostElement?: HTMLElement;
};

export type ExportMessageRole = 'user' | 'assistant' | 'unknown';

/** One selectable message: `${turnId}:u` / `${turnId}:a`, or an adapter turn-container id. */
export type ExportMessage = {
  messageId: string;
  role: ExportMessageRole;
  hostElement: HTMLElement;
  exportElement?: HTMLElement;
  text: string;
  starred: boolean;
};

export interface ConversationCollector {
  /** User/assistant pairs in document order. Appends Canvas sections to responses (once). */
  collectChatPairs(): ChatTurn[];
  /** Selectable messages for the current page, in reading order. */
  collectSelectionMessages(): ExportMessage[];
  /** Export turns for the given message ids, read fresh from the page. Empty turns are dropped. */
  turnsForMessageIds(
    selectedMessageIds: ReadonlySet<string>,
    starredIds?: ReadonlySet<string>,
  ): ExportChatTurn[];
  /** Message id of the response that owns a response-menu trigger, or null. */
  assistantMessageIdFor(trigger: HTMLElement | null): string | null;
  /** First top-level user turn inside the conversation root. */
  topUserElement(): HTMLElement | null;
  conversationRoot(): HTMLElement;
  /**
   * Remember open Canvas documents so their content still exports after the
   * preload loop scrolls or re-renders the page and closes the panel.
   */
  snapshotOpenCanvasDocs(): void;
  /** Forget the snapshot and remove every appended Canvas section. */
  releaseCanvasDocs(): void;
}

/** Remove Canvas sections appended to responses during an export. */
export function removeCanvasExportSections(): void {
  document.querySelectorAll(`.${CANVAS_EXPORT_SECTION_CLASS}`).forEach((el) => el.remove());
}

function normalizeText(text: string | null): string {
  try {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

function extractAssistantText(el: HTMLElement): string {
  // Prefer direct text from message container if available (connected to DOM)
  // Use queryOutsideThoughts to avoid matching the message-content inside
  // the expanded thinking/reasoning panel.
  try {
    const mc = queryOutsideThoughts<HTMLElement>(
      el,
      'message-content, .markdown, .markdown-main-panel',
    );
    if (mc) {
      const raw = mc.textContent || mc.innerText || '';
      const txt = normalizeText(raw);
      if (txt) return txt;
    }
  } catch {}

  // Clone and remove reasoning toggles/labels before reading text (detached fallback)
  const clone = el.cloneNode(true) as HTMLElement;
  const matchesReasonToggle = (txt: string): boolean => {
    const s = normalizeText(txt).toLowerCase();
    if (!s) return false;
    return (
      /^(show\s*(thinking|reasoning)|hide\s*(thinking|reasoning))$/i.test(s) ||
      /^(显示\s*(思路|推理)|隐藏\s*(思路|推理))$/u.test(s)
    );
  };
  const shouldDrop = (node: HTMLElement): boolean => {
    const role = (node.getAttribute('role') || '').toLowerCase();
    const aria = (node.getAttribute('aria-label') || '').toLowerCase();
    const txt = node.textContent || '';
    if (matchesReasonToggle(txt)) return true;
    if (role === 'button' && (/thinking|reasoning/i.test(txt) || /思路|推理/u.test(txt)))
      return true;
    if (/thinking|reasoning/i.test(aria) || /思路|推理/u.test(aria)) return true;
    return false;
  };
  try {
    const candidates = clone.querySelectorAll(
      'button, [role="button"], [aria-label], span, div, a',
    );
    candidates.forEach((n) => {
      const eln = n as HTMLElement;
      if (shouldDrop(eln)) eln.remove();
    });
  } catch {}
  const text = normalizeText(clone.innerText || clone.textContent || '');
  return text;
}

function appendCanvasDocSections(targetContainer: Element, canvasDocs: readonly CanvasDoc[]): void {
  for (const doc of canvasDocs) {
    const section = document.createElement('div');
    section.className = CANVAS_EXPORT_SECTION_CLASS;
    const heading = document.createElement('h3');
    heading.textContent = `📄 Canvas Document: ${doc.title}`;
    const content = document.createElement('div');
    content.className = 'gv-canvas-content';
    content.textContent = doc.content;
    section.appendChild(heading);
    section.appendChild(content);
    targetContainer.appendChild(section);
  }
}

function buildExportMessagesFromPairs(pairs: ChatTurn[]): ExportMessage[] {
  const out: ExportMessage[] = [];
  pairs.forEach((pair) => {
    if (pair.userElement) {
      out.push({
        messageId: `${pair.turnId}:u`,
        role: 'user',
        hostElement: pair.userElement,
        exportElement: pair.userElement,
        text: pair.user,
        starred: pair.starred,
      });
    }

    const assistantHost = pair.assistantHostElement;
    if (assistantHost) {
      out.push({
        messageId: `${pair.turnId}:a`,
        role: 'assistant',
        hostElement: assistantHost,
        exportElement: pair.assistantElement || assistantHost,
        text: pair.assistant,
        starred: pair.starred,
      });
    }
  });
  return out;
}

/** Turns read once from the page, after Canvas sections were appended to their responses. */
function buildTurnsForSelectedMessages(
  selectedMessages: readonly ExportMessage[],
  extractor: ContentExtractor,
): ExportChatTurn[] {
  const groupedTurns = groupSelectedMessagesByTurn(
    selectedMessages.filter(
      (message): message is ExportMessage & { role: Exclude<ExportMessageRole, 'unknown'> } =>
        message.role !== 'unknown',
    ),
  );
  return groupedTurns
    .map((turn) => ({
      user: turn.user?.text || '',
      assistant: turn.assistant?.text || '',
      starred: turn.starred,
      omitEmptySections: true,
      userElement: turn.user?.exportElement,
      assistantElement: turn.assistant?.exportElement,
    }))
    .filter(
      (turn) =>
        turn.user.length > 0 ||
        turn.assistant.length > 0 ||
        !!turn.userElement ||
        !!turn.assistantElement,
    )
    .map((turn) => extractTurnContent(turn, extractor));
}

export function createConversationCollector(adapter: ExportPlatformAdapter): ConversationCollector {
  const extractor = createContentExtractor(adapter);
  let cachedCanvasDocs: CanvasDoc[] | null = null;

  const conversationRoot = (): HTMLElement =>
    adapter.resolveConversationRoot(adapter.getUserSelectors(), document);

  const topUserElement = (): HTMLElement | null => {
    const selectors = adapter.getUserSelectors();
    const root = adapter.resolveConversationRoot(selectors, document);
    const all = filterOutDeepResearchImmersiveNodes(
      Array.from(root.querySelectorAll<HTMLElement>(selectors.join(','))),
    );
    if (!all.length) return null;
    const topLevel = filterTopLevel(all);
    return topLevel.length > 0 ? topLevel[0] : null;
  };

  const collectChatPairs = (starredIds: ReadonlySet<string> = new Set()): ChatTurn[] => {
    const userSelectors = adapter.getUserSelectors();
    const root = adapter.resolveConversationRoot(userSelectors, document);
    const assistantSelectors = adapter.getAssistantSelectors();
    const userNodeList = filterOutDeepResearchImmersiveNodes(
      Array.from(root.querySelectorAll<HTMLElement>(userSelectors.join(','))),
    );
    if (!userNodeList || userNodeList.length === 0) return [];
    const users = filterTopLevel(userNodeList);
    if (users.length === 0) return [];

    const uniqueTurnIds = resolveUniqueExportTurnIds(users);

    const assistantsAll = filterOutDeepResearchImmersiveNodes(
      Array.from(root.querySelectorAll<HTMLElement>(assistantSelectors.join(','))),
    );
    const assistants = filterTopLevel(assistantsAll);

    const nativeConversationId = geminiConversationIdFromLocation();
    const pairs: ChatTurn[] = [];

    for (let i = 0; i < users.length; i++) {
      const uEl = users[i] as HTMLElement;
      const uText = normalizeText(uEl.innerText || uEl.textContent || '');
      const aEl = findAssistantForTurn(
        uEl,
        users[i + 1],
        assistants,
        userSelectors.join(','),
        assistantSelectors.join(','),
      );
      const aText = aEl ? extractAssistantText(aEl) : '';
      const turnId = uniqueTurnIds[i];
      const turnIdAliases =
        turnId && nativeConversationId && isServerTurnId(turnId)
          ? historyTimestampStore.getTurnIdAliases(nativeConversationId, turnId)
          : turnId && isServerTurnId(turnId)
            ? [turnId]
            : [];
      const starred = turnIdAliases.some((alias) => starredIds.has(alias));
      if (uText || aText) {
        const finalAssistantEl = aEl ? pickAssistantExportElement(aEl) : undefined;
        pairs.push({
          turnId,
          user: uText,
          assistant: aText,
          starred,
          userElement: uEl,
          assistantElement: finalAssistantEl,
          assistantHostElement: aEl || undefined,
        });
        // Canvas document content injection: if this assistant response references
        // a Canvas doc, append full Canvas content directly into the DOM element
        // so DOMContentExtractor can pick it up.
        // Guard against duplicate injection (collectChatPairs may be called multiple times).
        if (
          aEl &&
          assistantHasCanvasDoc(aEl) &&
          (isAnyCanvasOpen() || (cachedCanvasDocs && cachedCanvasDocs.length > 0)) &&
          finalAssistantEl &&
          !finalAssistantEl.querySelector(`.${CANVAS_EXPORT_SECTION_CLASS}`)
        ) {
          const canvasDocs =
            cachedCanvasDocs && cachedCanvasDocs.length > 0
              ? cachedCanvasDocs
              : extractAllCanvasDocs();
          if (canvasDocs.length > 0) {
            appendCanvasDocSections(
              finalAssistantEl.querySelector('.markdown, .markdown-main-panel') || finalAssistantEl,
              canvasDocs,
            );
          }
        }
      }
    }
    return pairs;
  };

  const selectionMessagesFromPairs = (pairsInput: ChatTurn[]): ExportMessage[] => {
    const messages = buildExportMessagesFromPairs(pairsInput);
    return messages
      .map((message) => {
        const rect = message.hostElement.getBoundingClientRect();
        return {
          ...message,
          absTop: rect.top + window.scrollY,
        };
      })
      .sort((a, b) => a.absTop - b.absTop);
  };

  return {
    collectChatPairs,
    collectSelectionMessages: () => selectionMessagesFromPairs(collectChatPairs()),
    turnsForMessageIds: (selectedMessageIds, starredIds) => {
      const pairs = collectChatPairs(starredIds);
      if (selectedMessageIds.size === 0) return [];
      const selectedMessages = selectionMessagesFromPairs(pairs).filter((message) =>
        selectedMessageIds.has(message.messageId),
      );
      return buildTurnsForSelectedMessages(selectedMessages, extractor);
    },
    assistantMessageIdFor: (trigger) => {
      if (!trigger) return null;

      const assistantHost = trigger.closest(
        '.response-container, response-container, .model-response, model-response',
      ) as HTMLElement | null;
      if (!assistantHost) return null;

      const messages = buildExportMessagesFromPairs(collectChatPairs());
      const target = messages.find((message) => {
        if (message.role !== 'assistant') return false;
        const host = message.hostElement;
        return (
          host === assistantHost ||
          host.contains(assistantHost) ||
          assistantHost.contains(host) ||
          host.contains(trigger)
        );
      });

      return target?.messageId || null;
    },
    topUserElement,
    conversationRoot,
    snapshotOpenCanvasDocs: () => {
      if (isAnyCanvasOpen()) cachedCanvasDocs = extractAllCanvasDocs();
    },
    releaseCanvasDocs: () => {
      cachedCanvasDocs = null;
      removeCanvasExportSections();
    },
  };
}
