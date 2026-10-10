import type {
  ContentExtractor,
  ExtractedContent,
} from '@/features/export/services/DOMContentExtractor';
import type { ChatTurn } from '@/features/export/types/export';
import { chatGptTurnHash, loadChatGptStarHashes } from '@/features/savedLibrary/exportStars';

import { computeConversationFingerprint } from '../topNodePreload';
import { assertActive, mergeExtractedContent, wait } from './chatgptShared';
import { USER_BUBBLE_SELECTOR } from './chatgptThread';
import type {
  ChatGptReadOptions,
  ChatGptTurnContainer,
  ChatGptTurnRole,
  ExportSelectionOptions,
} from './type';

// Export for ChatGPT's earlier thread DOM (`[data-turn-id-container]`). The
// current `[data-turn-key]` thread goes through `chatgptThreadExport.ts`.
const TURN_CONTAINER_SELECTOR = '[data-turn-id-container]';
// ChatGPT stores virtual-list bookkeeping roots in the same attribute as turns:
// `client-created-root` for a conversation started in this tab and
// `paginated-root:<conversation-id>` for one opened from history.
const NON_TURN_CONTAINER_ID = /-root(?::|$)/;
const TURN_FRAME_SELECTOR = '[data-turn]';
const USER_MESSAGE_SELECTOR = '[data-message-author-role="user"]';
const ASSISTANT_MESSAGE_SELECTOR = '[data-message-author-role="assistant"]';
const IMAGEGEN_SELECTOR = '[class*="group/imagegen-image"]';
const STOP_GENERATING_SELECTOR = [
  '[data-testid="stop-button"]',
  'button[aria-label*="stop generating" i]',
  'button[aria-label*="停止生成"]',
].join(',');
const STREAMING_TURN_SELECTOR = [
  '[data-message-streaming="true"]',
  '[data-is-streaming="true"]',
  '.result-streaming',
].join(',');
const MATERIALIZATION_TIMEOUT_MS = 3000;
const MATERIALIZATION_POLL_MS = 80;
const MATERIALIZATION_IDLE_MS = 240;
const MATERIALIZATION_REPOSITION_MS = 160;

export function isChatGptResponseGenerating(root: ParentNode = document): boolean {
  return root.querySelector(`${STOP_GENERATING_SELECTOR},${STREAMING_TURN_SELECTOR}`) !== null;
}

function resolveTurnRole(container: HTMLElement): ChatGptTurnRole {
  if (container.querySelector(USER_MESSAGE_SELECTOR)) {
    return 'user';
  }

  if (
    container.querySelector(ASSISTANT_MESSAGE_SELECTOR) ||
    container.querySelector(IMAGEGEN_SELECTOR)
  ) {
    return 'assistant';
  }

  return resolveTurnFrameRole(container);
}

function findTurnFrame(container: HTMLElement): Element | null {
  return container.matches(TURN_FRAME_SELECTOR)
    ? container
    : container.querySelector(TURN_FRAME_SELECTOR);
}

/** ChatGPT labels the rendered turn frame (`section[data-turn]`) even when it holds no message. */
function resolveTurnFrameRole(container: HTMLElement): ChatGptTurnRole {
  const role = findTurnFrame(container)?.getAttribute('data-turn');
  return role === 'user' || role === 'assistant' ? role : 'unknown';
}

function extractSiblingGeneratedImages(
  container: HTMLElement,
  assistantElement: HTMLElement,
  extractor: ContentExtractor,
): ExtractedContent | null {
  const siblingImages = Array.from(
    container.querySelectorAll<HTMLImageElement>(`${IMAGEGEN_SELECTOR} img`),
  ).filter((image) => !assistantElement.contains(image));
  if (siblingImages.length === 0) return null;

  // ChatGPT can render generated-image cards beside (rather than inside) the
  // conventional assistant root. Extract only cloned image nodes so card
  // controls such as Edit/Share cannot leak into the exported response.
  const imageRoot = document.createElement('div');
  siblingImages.forEach((image) => imageRoot.appendChild(image.cloneNode(true)));
  return extractor.extractAssistantContent(imageRoot);
}

/**
 * 读取 ChatGPT 虚拟列表保留的顶层对话容器。
 *
 * 容器属性提供稳定身份和完整 DOM 顺序；内部消息 DOM 可能在离开视口时卸载，
 * 因而 role 可暂时为 unknown。
 */
export function chatgptCollectTurnContainers(root: ParentNode = document): ChatGptTurnContainer[] {
  const turnsById = new Map<string, ChatGptTurnContainer>();

  for (const container of root.querySelectorAll<HTMLElement>(TURN_CONTAINER_SELECTOR)) {
    const id = container.getAttribute('data-turn-id-container')?.trim();
    if (!id || NON_TURN_CONTAINER_ID.test(id)) continue;

    const role = resolveTurnRole(container);
    const existing = turnsById.get(id);
    if (!existing) {
      // The first occurrence establishes ChatGPT's virtual-list order.
      turnsById.set(id, {
        id,
        sequence: turnsById.size,
        role,
        container,
      });
      continue;
    }

    // ChatGPT can briefly retain a duplicate container during virtual-list
    // reconciliation. Both nodes carry the same stable turn ID and represent
    // one message, so never emit a second record. Prefer the copy with mounted
    // content when the first occurrence is currently only an empty shell.
    if (existing.role === 'unknown' && role !== 'unknown') {
      turnsById.set(id, { ...existing, role, container });
    }
  }

  return Array.from(turnsById.values());
}

/*
  物化单条，确定角色
 */
function findTurnContainer(id: string): ChatGptTurnContainer | null {
  return chatgptCollectTurnContainers().find((turn) => turn.id === id) ?? null;
}

function hasUsableGeneratedImage(container: HTMLElement): boolean {
  const imageGenRoot = container.querySelector(IMAGEGEN_SELECTOR);
  if (!imageGenRoot) return false;

  return Array.from(imageGenRoot.querySelectorAll<HTMLImageElement>('img')).some((image) => {
    const src = (image.getAttribute('src') || image.src || '').trim();
    return src.length > 0 && src !== 'about:blank';
  });
}

function hasMountedContent(turn: ChatGptTurnContainer): boolean {
  if (turn.container.querySelector(IMAGEGEN_SELECTOR)) {
    // Image-generation cards mount their Edit/Share controls before the image.
    // Those labels are not exportable response content, so wait for a usable
    // image URL instead of snapshotting the placeholder card.
    if (hasUsableGeneratedImage(turn.container)) return true;
    const assistantRoot = turn.container.querySelector<HTMLElement>(ASSISTANT_MESSAGE_SELECTOR);
    return assistantRoot ? hasConventionalMountedContent(assistantRoot) : false;
  }

  const root =
    turn.role === 'user'
      ? turn.container.querySelector<HTMLElement>(USER_MESSAGE_SELECTOR)
      : turn.container.querySelector<HTMLElement>(ASSISTANT_MESSAGE_SELECTOR);
  return root ? hasConventionalMountedContent(root) : false;
}

function hasConventionalMountedContent(root: HTMLElement): boolean {
  return (
    (root.textContent?.trim().length ?? 0) > 0 ||
    root.querySelector('img, svg, canvas, pre, table, [data-math-source], [role="math"]') != null
  );
}

/**
 * A turn whose frame ChatGPT rendered but that holds no message root at all,
 * for example a response that only produced a file which is no longer shown.
 * Unlike an unmounted virtual shell, the frame proves ChatGPT already laid the
 * turn out, so waiting for content cannot succeed.
 */
function isRenderedWithoutMessage(turn: ChatGptTurnContainer): boolean {
  const { container } = turn;
  return (
    findTurnFrame(container) != null &&
    container.querySelector(
      `${USER_MESSAGE_SELECTOR},${ASSISTANT_MESSAGE_SELECTOR},${IMAGEGEN_SELECTOR}`,
    ) == null
  );
}

function isGeneratingTurn(turn: ChatGptTurnContainer): boolean {
  if (
    turn.container.matches(STREAMING_TURN_SELECTOR) ||
    turn.container.querySelector(STREAMING_TURN_SELECTOR)
  ) {
    return true;
  }
  if (!isChatGptResponseGenerating()) return false;
  const ordered = chatgptCollectTurnContainers();
  return ordered.at(-1)?.id === turn.id && turn.role === 'assistant';
}

/**
 * Materialize a virtualized ChatGPT turn. Already-mounted, completed turns use
 * a zero-wait fast path; empty shells wait for a positive role/content signal.
 * A rendered turn that stays message-less through the idle window is returned
 * with `empty: true` instead of timing out.
 */
export async function materializeChatGptTurnContainer(
  turn: ChatGptTurnContainer,
  options: ExportSelectionOptions = {},
): Promise<ChatGptTurnContainer> {
  assertActive(options);
  let current = findTurnContainer(turn.id) ?? turn;
  current = { ...current, role: resolveTurnRole(current.container) };
  if (current.role !== 'unknown' && hasMountedContent(current) && !isGeneratingTurn(current)) {
    return current;
  }

  current.container.scrollIntoView({ block: 'center', behavior: 'auto' });

  const contentSelectors = [USER_MESSAGE_SELECTOR, ASSISTANT_MESSAGE_SELECTOR, IMAGEGEN_SELECTOR];
  const startedAt = Date.now();
  let lastPositionAt = startedAt;
  let stableSignature = '';
  let stableSince = 0;

  while (Date.now() - startedAt < MATERIALIZATION_TIMEOUT_MS) {
    assertActive(options);
    const latest = findTurnContainer(turn.id);
    if (latest) current = { ...latest, role: resolveTurnRole(latest.container) };

    const hasContent = current.role !== 'unknown' && hasMountedContent(current);
    const renderedEmpty =
      !hasContent && current.role !== 'unknown' && isRenderedWithoutMessage(current);
    if (
      !hasContent &&
      !renderedEmpty &&
      Date.now() - lastPositionAt >= MATERIALIZATION_REPOSITION_MS
    ) {
      const rect = current.container.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
        // ChatGPT reconciles estimated shell heights after nearby turns mount.
        // That layout shift can move the requested shell back out of view even
        // though the first scrollIntoView call succeeded, so re-anchor it.
        current.container.scrollIntoView({ block: 'center', behavior: 'auto' });
        lastPositionAt = Date.now();
      }
    }

    if ((hasContent || renderedEmpty) && !isGeneratingTurn(current)) {
      const fingerprint = computeConversationFingerprint(current.container, contentSelectors, 10);
      const signature = `${fingerprint.signature}:${fingerprint.count}`;
      if (signature !== stableSignature) {
        stableSignature = signature;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= MATERIALIZATION_IDLE_MS) {
        return renderedEmpty ? { ...current, empty: true } : current;
      }
    } else {
      stableSignature = '';
      stableSince = 0;
    }

    await wait(MATERIALIZATION_POLL_MS, options.signal);
  }

  if (isGeneratingTurn(current)) throw new Error('chatgpt_export_response_still_generating');
  throw new Error(`chatgpt_export_message_unavailable:${turn.id}`);
}

function resolveSelectedContainers(
  selectedContainerIds: ReadonlySet<string>,
  allContainers: ChatGptTurnContainer[],
): ChatGptTurnContainer[] {
  const knownIds = new Set(allContainers.map((turn) => turn.id));
  const missingIds = Array.from(selectedContainerIds).filter((id) => !knownIds.has(id));
  if (missingIds.length > 0) {
    throw new Error(`chatgpt_export_messages_missing:${missingIds.join(',')}`);
  }
  return allContainers.filter((turn) => selectedContainerIds.has(turn.id));
}

type ScrollSnapshot = {
  readonly element: HTMLElement;
  readonly top: number;
  readonly left: number;
};

function captureScrollState(container: HTMLElement | undefined): {
  readonly elements: ScrollSnapshot[];
  readonly windowX: number;
  readonly windowY: number;
} {
  const elements: ScrollSnapshot[] = [];
  for (let current = container?.parentElement ?? null; current; current = current.parentElement) {
    if (current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth) {
      elements.push({ element: current, top: current.scrollTop, left: current.scrollLeft });
    }
  }
  return { elements, windowX: window.scrollX, windowY: window.scrollY };
}

function restoreScrollState(snapshot: ReturnType<typeof captureScrollState>): void {
  for (const { element, top, left } of snapshot.elements) {
    element.scrollTop = top;
    element.scrollLeft = left;
  }
  try {
    window.scrollTo(snapshot.windowX, snapshot.windowY);
  } catch {
    // jsdom and locked-down pages may not implement scrolling.
  }
}

export async function resolveChatGptSelectionRoles(
  selectedContainerIds: ReadonlySet<string>,
  options: ExportSelectionOptions = {},
): Promise<ReadonlyMap<string, ChatGptTurnRole>> {
  assertActive(options);
  const selectedContainers = resolveSelectedContainers(
    selectedContainerIds,
    chatgptCollectTurnContainers(),
  );
  const scrollState = captureScrollState(selectedContainers[0]?.container);
  const roles = new Map<string, ChatGptTurnRole>();
  try {
    for (const turn of selectedContainers) {
      assertActive(options);
      const resolved =
        turn.role === 'unknown' ? await materializeChatGptTurnContainer(turn, options) : turn;
      if (resolved.role === 'unknown') {
        throw new Error(`chatgpt_export_role_unavailable:${turn.id}`);
      }
      roles.set(turn.id, resolved.role);
    }
    return roles;
  } finally {
    restoreScrollState(scrollState);
  }
}

function promptBubble(container: Element): Element | null {
  const user = container.querySelector(USER_MESSAGE_SELECTOR);
  // The timeline prefers the inner bubble; surrounding action text is not its identity.
  return user?.querySelector(USER_BUBBLE_SELECTOR) ?? user;
}

function promptHash(container: Element): string | undefined {
  const bubble = promptBubble(container);
  return bubble ? chatGptTurnHash(bubble) : undefined;
}

interface RetainedThreadVersion {
  readonly ids: string;
  readonly promptIds: ReadonlySet<string>;
  readonly prompts: Map<string, string>;
}

function retainedThreadVersion(
  registry: readonly ChatGptTurnContainer[],
  promptIds: ReadonlySet<string>,
): RetainedThreadVersion {
  const prompts = new Map<string, string>();
  for (const turn of registry) {
    if (!promptIds.has(turn.id)) continue;
    const bubble = promptBubble(turn.container);
    // Empty prompt roots are mounting placeholders, not a changed exchange.
    if (bubble?.textContent?.trim()) prompts.set(turn.id, chatGptTurnHash(bubble));
  }
  return { ids: JSON.stringify(registry.map((turn) => turn.id)), promptIds, prompts };
}

function assertRetainedThreadVersion(version: RetainedThreadVersion): void {
  const current = retainedThreadVersion(chatgptCollectTurnContainers(), version.promptIds);
  // Replies may finish streaming; only ids and prompts determine exchange star identity.
  if (
    current.ids !== version.ids ||
    Array.from(version.prompts).some(
      ([id, hash]) => current.prompts.has(id) && current.prompts.get(id) !== hash,
    )
  ) {
    throw new Error('chatgpt_export_thread_changed');
  }
  for (const [id, hash] of current.prompts) {
    if (!version.prompts.has(id)) version.prompts.set(id, hash);
  }
}

/**
 * Builds export-ready ChatTurn records for selected ChatGPT message containers.
 *
 * ChatGPT keeps every `[data-turn-id-container]` element as an ordered virtual
 * list item, but unloads its inner message DOM outside the viewport. The
 * selected container IDs are therefore the stable selection and ordering source.
 * For each selected ID we:
 *
 * 1. look it up in a fresh container registry, preserving the conversation order;
 * 2. scroll it into view and wait for ChatGPT to mount and settle its content;
 * 3. immediately extract the message to persist rich text/HTML before the
 *    next scroll can cause ChatGPT to unload this message again;
 * 4. merge adjacent selected user and assistant messages into the existing
 *    platform-neutral ChatTurn shape consumed by all export formats.
 *
 * A selected assistant without its user message deliberately becomes an
 * assistant-only ChatTurn. This preserves the user's message-level selection
 * rather than silently attaching it to an unselected prompt.
 */
export async function buildChatGptTurnsForSelection(
  selectedContainerIds: ReadonlySet<string>,
  options: ChatGptReadOptions,
): Promise<ChatTurn[]> {
  const { extractor } = options;
  const captured = { ...options, expectedUrl: options.expectedUrl ?? location.href };
  // querySelectorAll returns ChatGPT's retained virtual-list order. Filtering
  // this registry, rather than sorting visual coordinates, prevents image cards
  // and independently positioned DOM wrappers from changing export order.
  assertActive(captured);
  const registry = chatgptCollectTurnContainers();
  const selectedContainers = resolveSelectedContainers(selectedContainerIds, registry);
  const promptIds = new Set(
    selectedContainers
      .flatMap((turn) =>
        turn.role === 'user' ? [turn.id] : [turn.id, registry[turn.sequence - 1]?.id],
      )
      .filter((id): id is string => id !== undefined),
  );
  const version = retainedThreadVersion(registry, promptIds);
  const scrollState = captureScrollState(selectedContainers[0]?.container);

  const turns: ChatTurn[] = [];
  let pendingUser: { readonly turn: ChatTurn; readonly sequence: number } | null = null;
  const handledIds = new Set<string>();

  try {
    const hashes = await loadChatGptStarHashes(captured.expectedUrl);
    // A branch can change during prompt/return scrolling too, not just the Library read.
    const assertThread = () => {
      assertActive(captured);
      if (hashes.size > 0) assertRetainedThreadVersion(version);
    };
    assertThread();
    const promptHashes = new Map<string, string | undefined>();
    for (const turn of selectedContainers) {
      let materialized = await materializeChatGptTurnContainer(turn, captured);
      assertThread();
      if (materialized.empty) {
        // Nothing to export for this turn, but not a failure: ChatGPT itself
        // shows it blank. Pairing stays sequence-based, so a prompt followed by
        // a blank response exports as a user-only turn.
        promptHashes.set(turn.id, undefined);
        handledIds.add(turn.id);
        continue;
      }
      let starHash: string | undefined;
      if (hashes.size > 0) {
        if (materialized.role === 'user') {
          starHash = promptHash(materialized.container);
          promptHashes.set(turn.id, starHash);
        } else if (materialized.role === 'assistant') {
          const prompt = registry[turn.sequence - 1];
          if (prompt && prompt.role !== 'assistant') {
            if (!promptHashes.has(prompt.id)) {
              // Only assistant-only selections need an extra prompt materialization.
              const mounted = await materializeChatGptTurnContainer(prompt, captured);
              assertThread();
              promptHashes.set(
                prompt.id,
                mounted.role === 'user' && !mounted.empty
                  ? promptHash(mounted.container)
                  : undefined,
              );
              // Reading the unselected prompt may have unloaded the selected reply.
              materialized = await materializeChatGptTurnContainer(turn, captured);
              assertThread();
              if (materialized.empty) {
                handledIds.add(turn.id);
                continue;
              }
            }
            starHash = promptHashes.get(prompt.id);
          }
        }
      }
      const { container, role } = materialized;
      const sequence = turn.sequence;
      const starred = starHash !== undefined && hashes.has(starHash);

      if (role === 'user') {
        // A second user message closes an earlier selected user-only turn.
        if (pendingUser) turns.push(pendingUser.turn);

        const userElement = container.querySelector<HTMLElement>(USER_MESSAGE_SELECTOR);
        if (!userElement) throw new Error(`chatgpt_export_message_unavailable:${turn.id}`);

        const userContent = extractor.extractUserContent(userElement);
        if (!userContent.text && !userContent.html && userContent.attachments.length === 0) {
          throw new Error(`chatgpt_export_message_empty:${turn.id}`);
        }
        pendingUser = {
          sequence,
          turn: {
            user: userContent.text,
            assistant: '',
            starred,
            attachments: userContent.attachments,
            omitEmptySections: true,
            userContent,
          },
        };
        handledIds.add(turn.id);
        continue;
      }

      if (role === 'assistant') {
        const assistantElement =
          container.querySelector<HTMLElement>(ASSISTANT_MESSAGE_SELECTOR) ?? container;
        let assistantContent = extractor.extractAssistantContent(assistantElement);
        const siblingImageContent = extractSiblingGeneratedImages(
          container,
          assistantElement,
          extractor,
        );
        if (siblingImageContent) {
          assistantContent = mergeExtractedContent(assistantContent, siblingImageContent);
        }
        if (!assistantContent.text && !assistantContent.html) {
          throw new Error(`chatgpt_export_message_empty:${turn.id}`);
        }

        if (pendingUser?.sequence === sequence - 1) {
          pendingUser.turn.assistant = assistantContent.text;
          pendingUser.turn.assistantContent = assistantContent;
          turns.push(pendingUser.turn);
          pendingUser = null;
        } else {
          if (pendingUser) {
            turns.push(pendingUser.turn);
            pendingUser = null;
          }
          turns.push({
            user: '',
            assistant: assistantContent.text,
            starred,
            omitEmptySections: true,
            assistantContent,
          });
        }
        handledIds.add(turn.id);
        continue;
      }

      throw new Error(`chatgpt_export_role_unavailable:${turn.id}`);
    }

    if (pendingUser) turns.push(pendingUser.turn);
    if (handledIds.size !== selectedContainerIds.size) {
      throw new Error('chatgpt_export_incomplete_selection');
    }

    return turns;
  } finally {
    restoreScrollState(scrollState);
  }
}
