/**
 * The postMessage protocol between the Local Bridge runtime and the page-world
 * data observer (`public/chatgpt-bridge-data-observer.js`, which repeats the
 * two source tags). Page scripts can post the same tags, so a message is only
 * ever ids and names, checked down to its shape.
 */
import { PROJECT_ID_PATTERN, type ProjectSummary } from '@/features/bridge/protocol';

/** Messages the page observer posts. */
export const DATA_OBSERVER_SOURCE = 'gv-chatgpt-bridge-data-observer';
/** Messages the runtime posts: `arm` / `disarm`. */
export const DATA_CONTENT_SOURCE = 'gv-chatgpt-bridge-data';

const MAX_PROJECTS = 500;
const MAX_FILES = 1000;
const MAX_NAME = 512;
/** The forms the bridge reads from a route; ChatGPT's own are UUIDs. */
const CONVERSATION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type FileListSource = 'project' | 'sidebar';

export type DataObserverEvent =
  | { readonly type: 'ready' }
  /** The answer to `arm`: this browser runs the observer in the page. */
  | { readonly type: 'armed' }
  | {
      readonly type: 'projects';
      readonly projects: readonly ProjectSummary[];
      /** ChatGPT answered its last sidebar page with no further cursor. */
      readonly complete: boolean;
    }
  | {
      readonly type: 'files';
      readonly projectId: string;
      readonly names: readonly string[];
      readonly source: FileListSource;
    }
  | {
      readonly type: 'conversation';
      readonly conversationId: string;
      readonly currentNode: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_NAME;
}

function readProjects(payload: Record<string, unknown>): DataObserverEvent | null {
  const { projects, complete } = payload;
  if (!Array.isArray(projects) || projects.length > MAX_PROJECTS) return null;
  if (typeof complete !== 'boolean') return null;
  const read: ProjectSummary[] = [];
  for (const entry of projects) {
    if (!isRecord(entry) || typeof entry.projectId !== 'string') return null;
    if (!PROJECT_ID_PATTERN.test(entry.projectId) || !isName(entry.name)) return null;
    read.push({ projectId: entry.projectId, name: entry.name });
  }
  return { type: 'projects', projects: read, complete };
}

function readFiles(payload: Record<string, unknown>): DataObserverEvent | null {
  const { projectId, names, source } = payload;
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) return null;
  if (source !== 'project' && source !== 'sidebar') return null;
  if (!Array.isArray(names) || names.length > MAX_FILES || !names.every(isName)) return null;
  return { type: 'files', projectId, names: [...names], source };
}

function readConversation(payload: Record<string, unknown>): DataObserverEvent | null {
  const { conversationId, currentNode } = payload;
  if (typeof conversationId !== 'string' || !CONVERSATION_ID.test(conversationId)) return null;
  if (!isName(currentNode)) return null;
  return { type: 'conversation', conversationId, currentNode };
}

/** The observer's event, or null for another frame, origin, tag or shape. */
export function readDataObserverMessage(
  event: MessageEvent,
  win: Window = window,
): DataObserverEvent | null {
  if (event.source !== win || event.origin !== win.location.origin) return null;
  const data: unknown = event.data;
  if (!isRecord(data) || data.source !== DATA_OBSERVER_SOURCE) return null;
  if (data.type === 'ready') return { type: 'ready' };
  if (data.type === 'armed') return { type: 'armed' };
  if (!isRecord(data.payload)) return null;
  if (data.type === 'projects') return readProjects(data.payload);
  if (data.type === 'files') return readFiles(data.payload);
  if (data.type === 'conversation') return readConversation(data.payload);
  return null;
}

export function postToDataObserver(type: 'arm' | 'disarm', win: Window = window): void {
  try {
    win.postMessage({ source: DATA_CONTENT_SOURCE, type }, win.location.origin);
  } catch {
    // A closing page has nothing left to arm.
  }
}
