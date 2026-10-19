/**
 * The postMessage protocol between the Local Bridge runtime and the page-world
 * data observer (`public/chatgpt-bridge-data-observer.js`, which repeats the
 * two source tags). Page scripts can post the same tags, so a message is only
 * ever ids, names and sandbox links, checked down to its shape. Download
 * replies, which carry a file's bytes, are read in `./download.ts`.
 */
import { PROJECT_ID_PATTERN, type ProjectSummary } from '@/features/bridge/protocol';

/** Messages the page observer posts. */
export const DATA_OBSERVER_SOURCE = 'gv-chatgpt-bridge-data-observer';
/** Messages the runtime posts: `arm` / `disarm`, and `download` requests (`./download.ts`). */
export const DATA_CONTENT_SOURCE = 'gv-chatgpt-bridge-data';

const MAX_PROJECTS = 500;
const MAX_FILES = 1000;
const MAX_NAME = 512;
const MAX_MESSAGES = 2000;
const MAX_LINKS = 100;
const MAX_HREF = 2048;
const MAX_LABEL = 1000;
const MAX_ROLE = 32;
/** The observer reports only links into the python tool's sandbox. */
export const SANDBOX_HREF_PREFIX = 'sandbox:/mnt/data/';
/** The forms the bridge reads from a route; ChatGPT's own are UUIDs. */
const CONVERSATION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type FileListSource = 'project' | 'sidebar';

/** A `[label](sandbox:/mnt/data/…)` link of an assistant's final-channel text. */
export interface SandboxLink {
  readonly label: string;
  readonly href: string;
}

/** One message on the branch a conversation ends on, as ChatGPT's own answer listed it. */
export interface ConversationMessage {
  readonly id: string;
  /** `user`, `assistant`, `tool`, `system`, …; empty when ChatGPT gave none. */
  readonly role: string;
  readonly links: readonly SandboxLink[];
}

export type DataObserverEvent =
  | { readonly type: 'ready' }
  /** The answer to `arm`: this browser runs the observer in the page. */
  | { readonly type: 'armed' }
  /** The page's router moved (`pushState` / `replaceState`); carries nothing. */
  | { readonly type: 'route' }
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
      /** The branch to `currentNode`, oldest first; null when the answer had no usable mapping. */
      readonly messages: readonly ConversationMessage[] | null;
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

function readLink(raw: unknown): SandboxLink | null {
  if (!isRecord(raw)) return null;
  const { label, href } = raw;
  if (typeof label !== 'string' || label.length > MAX_LABEL) return null;
  if (typeof href !== 'string' || href.length > MAX_HREF) return null;
  return href.startsWith(SANDBOX_HREF_PREFIX) ? { label, href } : null;
}

function readMessage(raw: unknown): ConversationMessage | null {
  if (!isRecord(raw) || !isName(raw.id)) return null;
  if (typeof raw.role !== 'string' || raw.role.length > MAX_ROLE) return null;
  if (!Array.isArray(raw.links) || raw.links.length > MAX_LINKS) return null;
  const links: SandboxLink[] = [];
  for (const entry of raw.links) {
    const link = readLink(entry);
    if (!link) return null;
    links.push(link);
  }
  return { id: raw.id, role: raw.role, links };
}

/** The whole branch, or null: a branch with a gap would join two turns into one. */
function readMessages(raw: unknown): ConversationMessage[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_MESSAGES) return null;
  const messages: ConversationMessage[] = [];
  for (const entry of raw) {
    const message = readMessage(entry);
    if (!message) return null;
    messages.push(message);
  }
  return messages;
}

function readConversation(payload: Record<string, unknown>): DataObserverEvent | null {
  const { conversationId, currentNode } = payload;
  if (typeof conversationId !== 'string' || !CONVERSATION_ID.test(conversationId)) return null;
  if (!isName(currentNode)) return null;
  const messages = readMessages(payload.messages);
  return { type: 'conversation', conversationId, currentNode, messages };
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
  if (data.type === 'route') return { type: 'route' };
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
