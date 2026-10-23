import { createContentExtractor } from '@/features/export/services/DOMContentExtractor';

import { buildChatGptTurnsForSelection, resolveChatGptSelectionRoles } from '../adapter/chatgpt';
import { createChatGptLoggedOutReader } from '../adapter/chatgptLoggedOut';
import { isChatGptLoggedOutConversation } from '../adapter/chatgptLoggedOutDom';
import { normalizedConversationUrl } from '../adapter/chatgptShared';
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
import type { ExportSite, ExportTurnReader, ExportTurnSession } from '../exportSite';

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

type ChatGptReaderKind = 'desktop' | 'loggedOut';

/** The desktop thread wins whenever its turns are rendered; see `isChatGptLoggedOutConversation`. */
function currentReaderKind(): ChatGptReaderKind {
  return isChatGptLoggedOutConversation() ? 'loggedOut' : 'desktop';
}

/**
 * ChatGPT virtualizes its thread, so the DOM holds only a few turns. On the
 * current DOM the export crawls the thread before selection and reads that
 * crawl; the earlier DOM keeps its retained per-message containers. The
 * logged-out page (`/uc/<id>`, at any width) keeps every message mounted and
 * has its own reader.
 */
export function createChatGptExportSite(adapter: ExportPlatformAdapter): ExportSite {
  const extractor = createContentExtractor(adapter);
  const preparer = createChatGptThreadPreparer();
  const loggedOut = createChatGptLoggedOutReader(adapter);
  const desktop: ExportTurnReader & Required<Pick<ExportTurnReader, 'roles'>> = {
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
  };
  /**
   * The reader the last preparation chose, for its route. The earlier DOM's
   * export reads `turns` itself rather than a session, and must not switch
   * readers when the page's markers change under the selection.
   */
  let prepared: { route: string; kind: ChatGptReaderKind } | null = null;
  const reader = () => {
    const kind =
      prepared?.route === normalizedConversationUrl() ? prepared.kind : currentReaderKind();
    return kind === 'loggedOut' ? loggedOut : desktop;
  };

  return {
    id: adapter.site.id,
    label: adapter.site.label,
    entryPoints: { kind: 'toolbar', isConversationPage: chatgptIsConversationPage },
    title: adapter.extractConversationTitle,
    turns: {
      scrollsWhileBuilding: true,
      messages: () => reader().messages(),
      build: (selectedIds, options) => reader().build(selectedIds, options),
      roles: (selectedIds, options) => reader().roles(selectedIds, options),
      prepare: async (options) => {
        const kind = currentReaderKind();
        prepared = { route: normalizedConversationUrl(options.expectedUrl), kind };
        if (kind === 'loggedOut') return { ...loggedOut, release() {} };
        const session = await prepareChatGptExportWithProgress(preparer, { ...options, extractor });
        return session && exportSession(session);
      },
    },
    page: createConversationCollector(adapter),
  };
}
