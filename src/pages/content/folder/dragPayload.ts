import type { ConversationReference } from '@/core/types/folder';

import type { DragData } from './types';

/**
 * One validated reader for Voyager folder drag data.
 *
 * Any page can start a drag that carries `application/json`, so a drop target
 * must not trust the payload shape. The parser rebuilds a fresh object:
 * structural fields are type-checked, unknown top-level keys are dropped,
 * conversation references keep their stored fields minus prototype keys, URLs
 * must resolve to http(s), and a payload whose shape no drop site can use is
 * rejected. It stays host-neutral so every folder surface can share it.
 */

export const VOYAGER_DRAG_MIME = 'application/json';

export interface DragPayloadOptions {
  /**
   * Opt-in plain-URL fallback (AI Studio). Gemini drop sites stay JSON-only:
   * its drag ids come from `jslog` (`c_<hex>`) while URLs carry `/app/<hex>`,
   * so a URL-derived id would duplicate an existing reference.
   */
  conversationIdFromUrl?: (url: string) => string | null;
  /** Origin used to resolve a root-relative dropped URL. Defaults to `location.origin`. */
  origin?: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Resolves relative and protocol-relative URLs; only the resulting scheme matters. */
const URL_CHECK_BASE = 'https://voyager.invalid/';
/** Keys that would reach an object's prototype when copied by assignment. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Accept any URL that resolves to http(s): absolute, root-relative, relative and
 * protocol-relative (`//host/app/x`, which imported and stored rows may carry).
 * Reject other schemes (`javascript:`, `data:` ...). A string the URL parser
 * cannot read cannot be navigated either, so it only fails on an explicit
 * non-http(s) scheme; control characters and spaces are ignored like the parser does.
 */
export function isAllowedConversationUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url, URL_CHECK_BASE);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    // eslint-disable-next-line no-control-regex
    const compact = url.replace(/[\u0000- ]/g, '');
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
    return !scheme || /^https?$/i.test(scheme[1]);
  }
}

/**
 * Folder rows drag their stored record and a move persists that copy, so keep
 * every field as stored. Only the id and a string URL are checked; prototype
 * keys are dropped and a missing title becomes ''.
 */
function parseConversationReference(value: unknown): ConversationReference | null {
  if (!isRecord(value) || !isNonEmptyString(value.conversationId)) return null;
  if (typeof value.url === 'string' && !isAllowedConversationUrl(value.url)) return null;

  const reference: UnknownRecord = {};
  for (const [key, field] of Object.entries(value)) {
    if (!UNSAFE_KEYS.has(key)) reference[key] = field;
  }
  if (typeof reference.title !== 'string') reference.title = '';
  return reference as unknown as ConversationReference;
}

/** Validate an already-decoded payload object. */
export function parseDragPayloadObject(value: unknown): DragData | null {
  if (!isRecord(value)) return null;
  const { type } = value;
  if (type !== undefined && type !== 'conversation' && type !== 'folder') return null;
  const title = typeof value.title === 'string' ? value.title : '';

  if (type === 'folder') {
    if (!isNonEmptyString(value.folderId)) return null;
    return { type: 'folder', folderId: value.folderId, title };
  }

  const payload: DragData = { title };
  if (type) payload.type = type;

  if (value.sourceFolderId !== undefined) {
    if (!isNonEmptyString(value.sourceFolderId)) return null;
    payload.sourceFolderId = value.sourceFolderId;
  }

  if (value.conversations !== undefined) {
    if (!Array.isArray(value.conversations)) return null;
    const conversations: ConversationReference[] = [];
    for (const item of value.conversations) {
      const reference = parseConversationReference(item);
      if (!reference) return null;
      conversations.push(reference);
    }
    payload.conversations = conversations;
  }

  if (value.conversationId !== undefined) {
    if (!isNonEmptyString(value.conversationId)) return null;
    payload.conversationId = value.conversationId;
  }

  if (typeof value.url === 'string') {
    if (!isAllowedConversationUrl(value.url)) return null;
    payload.url = value.url;
  }
  if (typeof value.isGem === 'boolean') payload.isGem = value.isGem;
  if (typeof value.gemId === 'string') payload.gemId = value.gemId;

  const hasConversations = (payload.conversations?.length ?? 0) > 0;
  if (!hasConversations && !payload.conversationId) return null;
  return payload;
}

function normalizeDroppedUrl(raw: string, origin: string): string | null {
  const firstLine = raw.split(/\r?\n/, 1)[0]?.trim();
  if (!firstLine) return null;
  if (/^https?:\/\//i.test(firstLine)) return firstLine;
  // Root-relative paths are prefixed with the page origin, so they stay same-origin.
  if (firstLine.startsWith('/')) return `${origin}${firstLine}`;
  return null;
}

function resolveOrigin(options: DragPayloadOptions): string {
  if (options.origin !== undefined) return options.origin;
  try {
    return location.origin;
  } catch {
    return '';
  }
}

/**
 * Parse one drag string. JSON is tried first; when `conversationIdFromUrl` is
 * given, a URL line (text/uri-list, text/x-moz-url, URL) becomes a
 * conversation payload with an empty title.
 */
export function parseDragPayload(
  raw: string | null | undefined,
  options: DragPayloadOptions = {},
): DragData | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;

  try {
    const parsed = parseDragPayloadObject(JSON.parse(trimmed));
    if (parsed) return parsed;
  } catch {}

  if (!options.conversationIdFromUrl) return null;
  const url = normalizeDroppedUrl(trimmed, resolveOrigin(options));
  if (!url) return null;
  const conversationId = options.conversationIdFromUrl(url);
  if (!isNonEmptyString(conversationId)) return null;
  return { type: 'conversation', conversationId, title: '', url };
}

/** Read the Voyager JSON payload from a drop event's DataTransfer (JSON only). */
export function readDragPayload(transfer: DataTransfer | null | undefined): DragData | null {
  if (!transfer) return null;
  let raw = '';
  try {
    raw = transfer.getData(VOYAGER_DRAG_MIME);
  } catch {
    return null;
  }
  return parseDragPayload(raw);
}
