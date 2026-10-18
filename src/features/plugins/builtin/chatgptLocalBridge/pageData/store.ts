/**
 * What ChatGPT's own responses told the page, as the data observer reports
 * it: the sidebar's projects and whether that list is whole, each project's
 * file list, and the message each conversation ends on. The ops compare the
 * page against these instead of waiting for it to stop changing.
 *
 * Kept for the document's life, like the runtime: an in-app visit to a
 * project or conversation seen before is served from the page's cache, with
 * no new request to observe.
 */
import type { ProjectSummary } from '@/features/bridge/protocol';

import { type FileListSource, postToDataObserver, readDataObserverMessage } from './protocol';

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

export interface PageDataStore extends PageData {
  /** Listen and arm the observer; repeat calls do nothing. */
  start(): void;
}

export function createPageDataStore(now: () => number = Date.now): PageDataStore {
  let started = false;
  let observing = false;
  let projects: ProjectsReport | null = null;
  const files = new Map<string, FilesReport>();
  const conversations = new Map<string, string>();

  const onMessage = (event: MessageEvent): void => {
    const report = readDataObserverMessage(event);
    if (!report) return;
    observing = true;
    switch (report.type) {
      case 'ready':
        // The observer may load after this: its `ready` asks to be armed again.
        postToDataObserver('arm');
        return;
      case 'armed':
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
    projects: () => projects,
    files: (projectId) => files.get(projectId) ?? null,
    currentNode: (conversationId) => conversations.get(conversationId) ?? null,
  };
}
