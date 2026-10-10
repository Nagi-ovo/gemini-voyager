import type { ChatTurn } from '@/features/export/types/export';
import { loadChatGptStarHashes } from '@/features/savedLibrary/exportStars';

import { chatgptCollectTurnContainers } from './chatgpt';
import { type ChatGptCrawlOptions, crawlChatGptThread } from './chatgptCrawl';
import { assertActive, normalizedConversationUrl } from './chatgptShared';
import {
  type ChatGptThreadMessage,
  findAssistantReply,
  findUserBubble,
  hasRenderedThread,
  isChatGptThreadGenerating,
  mountedTurnItems,
  readTurnKey,
  resolveVisibleConversationRoot,
  userSelectionHost,
} from './chatgptThread';
import { type ThreadVersionWatch, watchThreadVersions } from './chatgptThreadWatch';
import type { ChatGptTurnContainer, ChatGptTurnRole, ExportSelectionOptions } from './type';

/**
 * Export entry points for ChatGPT.
 *
 * On the current DOM (`[data-turn-key]` items, virtualized whole), the export
 * crawls the thread once before selection mode opens and keeps what it
 * extracted. Selection then reads that snapshot: its ids, roles and content.
 * When the crawl cannot prove the thread complete the snapshot is empty, so
 * the export shows its existing warning instead of offering a partial list.
 * It is dropped as well once the thread changes from what was read: a turn
 * shows another branch or a regenerated reply, or a turn appears that was not
 * read. A watch that starts before the crawl sees such a change even when the
 * item has scrolled out of the DOM by the time of the export.
 *
 * The earlier DOM (`[data-turn-id-container]`, persistent per-message
 * containers) keeps its own path in `chatgpt.ts` for accounts ChatGPT has not
 * moved yet.
 */

interface ThreadSnapshot {
  readonly route: string;
  /** null: the crawl started for this route but did not finish, or the thread changed since. */
  readonly messages: readonly ChatGptThreadMessage[] | null;
  /** Why `messages` is null, as the export error to raise. */
  readonly failure: string;
}

/** What one preparation read, for the selection session that follows it. */
export interface ChatGptThreadSession {
  /** Every message the crawl read, bound to its live element where mounted; empty once unusable. */
  containers(): ChatGptTurnContainer[];
  /**
   * Selected messages as export turns, in conversation order. A prompt and its
   * reply share an item, so they form one turn when both are selected; either
   * alone becomes a one-sided turn.
   */
  build(selectedIds: ReadonlySet<string>, options: ExportSelectionOptions): Promise<ChatTurn[]>;
  roles(
    selectedIds: ReadonlySet<string>,
    options: ExportSelectionOptions,
  ): Promise<ReadonlyMap<string, ChatGptTurnRole>>;
  /** Drop the crawl and stop watching the thread. */
  release(): void;
}

export interface ChatGptThreadPreparer {
  /**
   * Crawl the current thread before selection mode opens. Resolves with its
   * session when it handled the preparation: a failed crawl yields a session
   * with nothing to select. Resolves null on the earlier DOM; cancellation
   * rejects after releasing.
   *
   * Starting a preparation releases the previous one, so an export that ends
   * late (one cancelled during its scroll restore, say) cannot publish over
   * the export that replaced it.
   */
  prepare(options: ChatGptCrawlOptions): Promise<ChatGptThreadSession | null>;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function createChatGptThreadPreparer(): ChatGptThreadPreparer {
  let latest: ChatGptThreadSession | null = null;

  async function prepare(options: ChatGptCrawlOptions): Promise<ChatGptThreadSession | null> {
    latest?.release();
    latest = null;
    // The earlier DOM keeps its scroll-to-top preparation.
    if (!hasRenderedThread()) return null;
    const route = normalizedConversationUrl(options.expectedUrl ?? location.href);
    const versions = watchThreadVersions();
    const session = createThreadSession(route, versions);
    latest = session;
    try {
      session.publish(await crawlChatGptThread(options));
    } catch (error) {
      if (isAbortError(error)) {
        session.release();
        throw error;
      }
      versions.stop();
      console.warn('[Gemini Voyager] ChatGPT export could not read the whole conversation:', error);
    }
    return session;
  }

  return { prepare };
}

function createThreadSession(
  route: string,
  watch: ThreadVersionWatch,
): ChatGptThreadSession & { publish(messages: readonly ChatGptThreadMessage[]): void } {
  let snapshot: ThreadSnapshot | null = {
    route,
    messages: null,
    failure: 'chatgpt_export_thread_incomplete',
  };
  /**
   * The element each message's checkbox was last bound to. An unmounted message
   * keeps it, so selection mode does not rebind it on every refresh.
   */
  const lastHosts = new Map<string, HTMLElement>();

  function currentSnapshot(): ThreadSnapshot | null {
    if (!snapshot) return null;
    if (snapshot.route !== normalizedConversationUrl()) {
      return { ...snapshot, messages: null, failure: 'chatgpt_export_conversation_changed' };
    }
    if (snapshot.messages && watch.changed()) {
      snapshot = { ...snapshot, messages: null, failure: 'chatgpt_export_thread_changed' };
    }
    return snapshot;
  }

  function crawledMessages(selectedIds: ReadonlySet<string>): readonly ChatGptThreadMessage[] {
    const current = currentSnapshot();
    if (!current?.messages) throw new Error(current?.failure || 'chatgpt_export_thread_incomplete');
    const known = new Set(current.messages.map((message) => message.id));
    const missing = Array.from(selectedIds).filter((id) => !known.has(id));
    if (missing.length > 0) throw new Error(`chatgpt_export_messages_missing:${missing.join(',')}`);
    return current.messages;
  }

  return {
    publish(messages) {
      // Released: a newer preparation superseded this one while it crawled.
      if (!snapshot) return;
      watch.adopt(messages);
      snapshot = { route, messages, failure: '' };
    },
    containers() {
      const messages = currentSnapshot()?.messages;
      if (!messages) return [];
      const hosts = liveHosts();
      return messages.map((message, sequence) => {
        const container = hosts.get(message.id) ?? lastHosts.get(message.id) ?? message.host;
        lastHosts.set(message.id, container);
        return { id: message.id, sequence, role: message.role, container };
      });
    },
    async build(selectedIds, options) {
      assertActive(options);
      crawledMessages(selectedIds);
      const hashes = await loadChatGptStarHashes(route);
      assertActive(options);
      // A branch switch or release during the Library read invalidates its result too.
      return turnsFromMessages(
        crawledMessages(selectedIds).filter((message) => selectedIds.has(message.id)),
        hashes,
      );
    },
    async roles(selectedIds, options) {
      assertActive(options);
      const roles = new Map<string, ChatGptTurnRole>();
      for (const message of crawledMessages(selectedIds)) {
        if (selectedIds.has(message.id)) roles.set(message.id, message.role);
      }
      return roles;
    },
    release() {
      snapshot = null;
      watch.stop();
      lastHosts.clear();
    },
  };
}

/** Where each message's checkbox goes now: its live element, else the one it was read from. */
function liveHosts(): Map<string, HTMLElement> {
  const hosts = new Map<string, HTMLElement>();
  for (const item of mountedTurnItems(resolveVisibleConversationRoot(document))) {
    const key = readTurnKey(item);
    const bubble = findUserBubble(item);
    const reply = findAssistantReply(item);
    if (bubble) hosts.set(`${key}:u`, userSelectionHost(item, bubble));
    if (reply) hosts.set(`${key}:a`, reply);
  }
  return hosts;
}

/**
 * Selectable messages without a crawl: the earlier DOM's retained containers.
 * A thread on the current DOM that was not crawled would list only the few
 * mounted items, so it offers nothing rather than a partial selection.
 */
export function uncrawledChatGptTurnContainers(): ChatGptTurnContainer[] {
  return hasRenderedThread() ? [] : chatgptCollectTurnContainers();
}

function turnsFromMessages(
  messages: readonly ChatGptThreadMessage[],
  starHashes: ReadonlySet<string>,
): ChatTurn[] {
  const turns: ChatTurn[] = [];
  const byKey = new Map<string, ChatTurn>();
  for (const message of messages) {
    let turn = byKey.get(message.turnKey);
    if (!turn) {
      turn = {
        user: '',
        assistant: '',
        starred: message.starHash !== undefined && starHashes.has(message.starHash),
        omitEmptySections: true,
      };
      byKey.set(message.turnKey, turn);
      turns.push(turn);
    }
    if (message.role === 'user') {
      turn.user = message.content.text;
      turn.attachments = message.content.attachments;
      turn.userContent = message.content;
    } else {
      turn.assistant = message.content.text;
      turn.assistantContent = message.content;
    }
  }
  return turns;
}

/**
 * Read the whole current thread as export turns, for a caller that takes the
 * entire conversation at once (the temporary-chat handoff). Throws when the
 * crawl cannot prove it complete, when the last prompt has no reply yet, or
 * when the thread changed by the time the crawl returned.
 */
export async function readChatGptThreadTurns(options: ChatGptCrawlOptions): Promise<ChatTurn[]> {
  const captured = { ...options, expectedUrl: options.expectedUrl ?? location.href };
  const versions = watchThreadVersions();
  try {
    const messages = await crawlChatGptThread(captured);
    if (messages.at(-1)?.role === 'user') {
      throw new Error('chatgpt_export_response_still_generating');
    }
    versions.adopt(messages);
    const starHashes = await loadChatGptStarHashes(captured.expectedUrl);
    assertActive(captured);
    if (isChatGptThreadGenerating(resolveVisibleConversationRoot(document)) || versions.changed()) {
      throw new Error('chatgpt_export_conversation_changed');
    }
    return turnsFromMessages(messages, starHashes);
  } finally {
    versions.stop();
  }
}
