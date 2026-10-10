import { filterTopLevel } from '@/core/utils/array';
import { createContentExtractor } from '@/features/export/services/DOMContentExtractor';

import { resolveExportAdapter } from '../export/adapter/platformAdapters';
import {
  filterOutDeepResearchImmersiveNodes,
  findAssistantForTurn,
  geminiAssistantTurnSelectors,
  geminiUserTurnSelectors,
  pickAssistantExportElement,
  resolveConversationRoot,
} from '../export/conversationDom';
import { makeTurnId } from './turnId';

export interface ForkChatPair {
  turnId: string;
  user: string;
  assistant: string;
  userElement: HTMLElement;
}

function normalizeText(text: string | null): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

export function collectForkChatPairs(): ForkChatPair[] {
  const userSelectors = geminiUserTurnSelectors();
  const assistantSelectors = geminiAssistantTurnSelectors();
  const root = resolveConversationRoot({ userSelectors, doc: document });

  const userNodesRaw = filterOutDeepResearchImmersiveNodes(
    Array.from(root.querySelectorAll<HTMLElement>(userSelectors.join(','))),
  );
  if (userNodesRaw.length === 0) return [];

  const users = filterTopLevel(userNodesRaw);
  if (users.length === 0) return [];

  const assistantNodesRaw = filterOutDeepResearchImmersiveNodes(
    Array.from(root.querySelectorAll<HTMLElement>(assistantSelectors.join(','))),
  );
  const assistants = filterTopLevel(assistantNodesRaw);

  const extractor = createContentExtractor(resolveExportAdapter());
  const pairs: ForkChatPair[] = [];

  for (let i = 0; i < users.length; i++) {
    const userEl = users[i];
    const turnId = makeTurnId(userEl, i);
    userEl.dataset.turnId = turnId;

    const userExtracted = extractor.extractUserContent(userEl).text;
    const userText = userExtracted || normalizeText(userEl.innerText || userEl.textContent || '');

    const assistantHost = findAssistantForTurn(
      userEl,
      users[i + 1],
      assistants,
      userSelectors.join(','),
      assistantSelectors.join(','),
    );

    let assistantText = '';
    if (assistantHost) {
      const assistantExportEl = pickAssistantExportElement(assistantHost);
      const extracted = extractor.extractAssistantContent(assistantExportEl).text;
      assistantText =
        extracted ||
        normalizeText(assistantExportEl.innerText || assistantExportEl.textContent || '');
    }

    if (userText || assistantText) {
      pairs.push({
        turnId,
        user: userText,
        assistant: assistantText,
        userElement: userEl,
      });
    }
  }

  return pairs;
}
