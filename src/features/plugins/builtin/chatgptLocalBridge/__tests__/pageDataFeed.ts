import type { ProjectSummary } from '@/features/bridge/protocol';

import type { PageDownloadReply, PageDownloadRequest } from '../pageData/download';
import {
  type ConversationMessage,
  DATA_CONTENT_SOURCE,
  DATA_OBSERVER_SOURCE,
  type FileListSource,
} from '../pageData/protocol';

/**
 * Plays `public/chatgpt-bridge-data-observer.js` for the fixtures: reports what
 * ChatGPT's answers would carry, as the observer posts it, and posts it all
 * again when the runtime arms it. jsdom's postMessage sets neither `source`
 * nor `origin`, so reports are dispatched with both, as a browser sets them.
 */
export interface PageDataFeed {
  projects(projects: readonly ProjectSummary[], complete?: boolean): void;
  files(projectId: string, names: readonly string[], source?: FileListSource): void;
  conversation(
    conversationId: string,
    currentNode: string,
    messages?: readonly ConversationMessage[],
  ): void;
  /** Answer the bridge's `download` requests as the observer would, after its own requests. */
  answerDownloads(answer: (request: PageDownloadRequest) => PageDownloadReply): void;
}

/**
 * Plays the observer's route reports for every page: the router's `pushState`
 * and `replaceState` are followed by a `route` post, as the page-world
 * observer sends one. Installed once per test file's window.
 */
export function playRouteReports(): void {
  const marked = history as History & { gvRouteReports?: true };
  if (marked.gvRouteReports) return;
  marked.gvRouteReports = true;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method].bind(history);
    history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args);
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: DATA_OBSERVER_SOURCE, type: 'route', payload: {} },
          source: window,
          origin: location.origin,
        }),
      );
    };
  }
}

/** Each mounted fixture replaces the last one's feed: an older page must not replay. */
let activeFeed: object | null = null;

/** `running: false` plays a browser that cannot run the observer (Firefox before 128). */
export function createPageDataFeed({ running = true } = {}): PageDataFeed {
  const self = {};
  activeFeed = self;
  const latest = new Map<string, { type: string; payload: unknown }>();

  const post = (type: string, payload: unknown): void => {
    if (activeFeed !== self || !running) return;
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { source: DATA_OBSERVER_SOURCE, type, payload },
        source: window,
        origin: location.origin,
      }),
    );
  };
  const report = (key: string, type: string, payload: unknown): void => {
    latest.set(key, { type, payload });
    post(type, payload);
  };

  let answer: ((request: PageDownloadRequest) => PageDownloadReply) | null = null;
  window.addEventListener('message', (event) => {
    const data = event.data as { source?: string; type?: string; payload?: unknown } | null;
    if (activeFeed !== self || data?.source !== DATA_CONTENT_SOURCE) return;
    if (data.type === 'download' && answer) {
      const { requestId, ...request } = data.payload as PageDownloadRequest & {
        requestId: string;
      };
      post('download', { requestId, ...answer(request) });
      return;
    }
    if (data.type !== 'arm') return;
    post('armed', {});
    for (const { type, payload } of latest.values()) post(type, payload);
  });

  return {
    projects: (projects, complete = true) =>
      report('projects', 'projects', { projects: projects.map((p) => ({ ...p })), complete }),
    files: (projectId, names, source = 'project') =>
      report(`files:${projectId}`, 'files', { projectId, names: [...names], source }),
    conversation: (conversationId, currentNode, messages) =>
      report(`conversation:${conversationId}`, 'conversation', {
        conversationId,
        currentNode,
        ...(messages ? { messages: messages.map((message) => ({ ...message })) } : {}),
      }),
    answerDownloads: (next) => {
      answer = next;
    },
  };
}
