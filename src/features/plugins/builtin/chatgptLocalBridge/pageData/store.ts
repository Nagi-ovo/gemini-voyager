/**
 * What ChatGPT's own responses told the page, as the data observer reports
 * it: the sidebar's projects and whether that list is whole, each project's
 * file list, and the message each conversation ends on. The ops compare the
 * page against these instead of waiting for it to stop changing.
 *
 * Kept for the document's life, like the runtime: an in-app visit to a
 * project or conversation seen before is served from the page's cache, with
 * no new request to observe.
 *
 * Each report also wakes the op's waits (`subscribe`), as do the observer's
 * route reports: the page's router moved with `pushState` or `replaceState`.
 */
import type { ProjectSummary } from '@/features/bridge/protocol';

import {
  type DataObserverEvent,
  type FileListSource,
  postToDataObserver,
  readDataObserverMessage,
} from './protocol';

export interface ProjectsReport {
  readonly projects: readonly ProjectSummary[];
  readonly complete: boolean;
}

export interface FilesReport {
  readonly names: readonly string[];
  readonly source: FileListSource;
  /** When this document received it, on the store's clock. */
  readonly receivedAt: number;
}

export interface PageData {
  /** The observer answered: this browser runs it in the page (Firefox before 128 cannot). */
  observing(): boolean;
  projects(): ProjectsReport | null;
  files(projectId: string): FilesReport | null;
  currentNode(conversationId: string): string | null;
}

export type PageDataWake = 'pageData' | 'route';

export interface PageDataStore extends PageData {
  /** Listen and arm the observer; repeat calls do nothing. */
  start(): void;
  /** Called after each report; the returned function stops it. */
  subscribe(listener: (reason: PageDataWake) => void): () => void;
}

export function createPageDataStore(now: () => number = Date.now): PageDataStore {
  let started = false;
  let observing = false;
  let projects: ProjectsReport | null = null;
  const files = new Map<string, FilesReport>();
  const conversations = new Map<string, string>();
  const listeners = new Set<(reason: PageDataWake) => void>();

  const onMessage = (event: MessageEvent): void => {
    const report = readDataObserverMessage(event);
    if (!report) return;
    // Only the observer's answers say it runs; route reports follow its `armed` anyway.
    if (report.type !== 'route') observing = true;
    record(report);
    const reason: PageDataWake = report.type === 'route' ? 'route' : 'pageData';
    for (const listener of listeners) listener(reason);
  };

  const record = (report: DataObserverEvent): void => {
    switch (report.type) {
      case 'ready':
        // The observer may load after this: its `ready` asks to be armed again.
        postToDataObserver('arm');
        return;
      case 'armed':
      case 'route':
        return;
      case 'projects':
        projects = { projects: report.projects, complete: report.complete };
        return;
      case 'files':
        files.set(report.projectId, {
          names: report.names,
          source: report.source,
          receivedAt: now(),
        });
        return;
      case 'conversation':
        conversations.set(report.conversationId, report.currentNode);
        return;
    }
  };

  return {
    start() {
      if (started) return;
      started = true;
      window.addEventListener('message', onMessage);
      postToDataObserver('arm');
    },
    observing: () => observing,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    projects: () => projects,
    files: (projectId) => files.get(projectId) ?? null,
    currentNode: (conversationId) => conversations.get(conversationId) ?? null,
  };
}
