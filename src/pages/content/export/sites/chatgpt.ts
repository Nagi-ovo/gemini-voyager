import { createContentExtractor } from '@/features/export/services/DOMContentExtractor';

import { buildChatGptTurnsForSelection, resolveChatGptSelectionRoles } from '../adapter/chatgpt';
import {
  type ChatGptThreadSession,
  createChatGptThreadPreparer,
  uncrawledChatGptTurnContainers,
} from '../adapter/chatgptThreadExport';
import { chatgptIsConversationPage } from '../adapter/platform/chatgpt';
import type { ExportPlatformAdapter } from '../adapter/platformAdapters';
import type { ChatGptTurnContainer } from '../adapter/type';
import { prepareChatGptExportWithProgress } from '../chatgptCrawlProgress';
import { createConversationCollector } from '../conversationCollector';
import type { ExportMessage } from '../conversationCollector';
import type { ExportSite, ExportTurnSession } from '../exportSite';

function selectionMessages(containers: readonly ChatGptTurnContainer[]): ExportMessage[] {
  return containers.map((turn) => ({
    messageId: turn.id,
    role: turn.role,
    hostElement: turn.container,
    exportElement: turn.container,
    text: '',
    starred: false,
  }));
}

function exportSession(session: ChatGptThreadSession): ExportTurnSession {
  return {
    messages: () => selectionMessages(session.containers()),
    build: session.build,
    roles: session.roles,
    release: session.release,
  };
}

/**
 * ChatGPT virtualizes its thread, so the DOM holds only a few turns. On the
 * current DOM the export crawls the thread before selection and reads that
 * crawl; the earlier DOM keeps its retained per-message containers.
 */
export function createChatGptExportSite(adapter: ExportPlatformAdapter): ExportSite {
  const extractor = createContentExtractor(adapter);
  const preparer = createChatGptThreadPreparer();
  return {
    id: adapter.site.id,
    label: adapter.site.label,
    entryPoints: { kind: 'toolbar', isConversationPage: chatgptIsConversationPage },
    title: adapter.extractConversationTitle,
    turns: {
      scrollsWhileBuilding: true,
      messages: () => selectionMessages(uncrawledChatGptTurnContainers()),
      build: async (selectedIds, options) => {
        // Direct consumers also need a full crawl; they do not run the selection preparer.
        const session = await createChatGptThreadPreparer().prepare({ ...options, extractor });
        if (!session) {
          return buildChatGptTurnsForSelection(selectedIds, { ...options, extractor });
        }
        try {
          return await session.build(selectedIds, options);
        } finally {
          session.release();
        }
      },
      roles: resolveChatGptSelectionRoles,
      prepare: async (options) => {
        const session = await prepareChatGptExportWithProgress(preparer, { ...options, extractor });
        return session && exportSession(session);
      },
    },
    page: createConversationCollector(adapter),
  };
}
