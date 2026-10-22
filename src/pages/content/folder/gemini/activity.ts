/**
 * When each filed Gemini chat last had a turn: the server timestamps Gemini's
 * history reports, the stored message timestamps, and a send in the composer
 * of a filed chat. It runs only while the folders are on; `knownLastTurnAt`
 * answers what is already known at any time, so a newly filed chat starts with
 * its last turn.
 */
import { buildConversationIdFromUrl } from '@/core/utils/conversationIdentity';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { applyFolderOp } from '@/features/folder/owner/applyFolderOp';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';

import { TimestampService } from '../../timestamp/TimestampService';
import { whenHistoryTimestampsReady } from '../../timestamp/historyTimestampPageService';
import { historyTimestampStore } from '../../timestamp/historyTimestamps';
import { folderDebugWarn } from '../FolderRepository';
import { normalizeConversationId, resolveConversationRouteId } from '../folderConversationIdentity';
import { getCurrentConversationId } from '../nativeConversationIds';
import type { FolderData } from '../types';

const SEND_BUTTON_SELECTOR = [
  'button[aria-label*="Send"]',
  'button[aria-label*="send"]',
  'button[data-tooltip*="Send"]',
  'button[data-tooltip*="send"]',
  '[data-send-button]',
  '.send-button',
].join(', ');
const COMPOSER_INPUT_SELECTOR = [
  'rich-textarea [contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  '.input-area textarea',
  'textarea[placeholder*="Ask"]',
].join(', ');

export interface ConversationActivityEntry {
  conversationId: string;
  lastTurnAt: number;
}

export interface ConversationActivityHost {
  /** The folders the activity reads; resolved on every call. */
  data(): FolderData;
  /** Not destroyed, and the folders are on. */
  isActive(): boolean;
  isConversationInFolders(conversationId: string): boolean;
  /** Raise the entries' last turns in the folders and save. */
  apply(entries: ConversationActivityEntry[]): void;
}

/**
 * The folders with `lastTurnAt` raised on every record each entry's id or
 * saved route names, as the op does; `null` when nothing would change.
 */
export function raiseConversationActivity(
  data: FolderData,
  entries: ConversationActivityEntry[],
): FolderData | null {
  const known = entries.filter((entry) => entry.conversationId && entry.lastTurnAt > 0);
  if (known.length === 0) return null;
  const result = applyFolderOp(
    data,
    { kind: 'setConversationActivity', entries: known },
    FOLDER_SITE_POLICIES.gemini,
    Date.now(),
  );
  return result.outcome.kind === 'saved' ? result.data : null;
}

function isConversationSendIntent(event: Event): boolean {
  if (event.type === 'submit') {
    const form = event.target;
    return form instanceof HTMLFormElement && form.querySelector(COMPOSER_INPUT_SELECTOR) !== null;
  }

  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest(SEND_BUTTON_SELECTOR);
  if (!(button instanceof HTMLElement)) return false;
  if (
    button instanceof HTMLButtonElement &&
    (button.disabled || button.getAttribute('aria-disabled') === 'true')
  ) {
    return false;
  }

  const composer = button.closest(
    'form, .text-input-field, input-area-v2, input-container, ms-prompt-input-wrapper',
  );
  return composer?.querySelector(COMPOSER_INPUT_SELECTOR) !== null;
}

export class GeminiConversationActivity {
  private timestampService: TimestampService | null = null;
  private starting: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  private sendIntentHandler: ((event: Event) => void) | null = null;

  constructor(private readonly host: ConversationActivityHost) {}

  /** Starts tracking once; a call while it starts or runs returns the same start. */
  start(): Promise<void> {
    if (this.unsubscribe || this.sendIntentHandler) return Promise.resolve();
    if (this.starting) return this.starting;

    this.starting = (async () => {
      try {
        if (!this.timestampService) {
          this.timestampService = new TimestampService();
          await this.timestampService.initialize();
        }
        // Waits for the page service; starting the store here could revive it after page teardown.
        const ready = await whenHistoryTimestampsReady();
        if (!ready || !this.host.isActive()) return;

        this.backfill();
        this.unsubscribe = historyTimestampStore.subscribe((cids) => {
          if (!this.host.isActive()) return;
          this.applyHistory(cids);
        });

        this.sendIntentHandler = (event) => {
          if (!isConversationSendIntent(event)) return;
          const conversationId = getCurrentConversationId();
          if (!conversationId || !this.host.isConversationInFolders(conversationId)) return;

          const sentAt = Date.now();
          window.setTimeout(() => {
            if (!this.host.isActive() || event.defaultPrevented) return;
            this.host.apply([{ conversationId, lastTurnAt: sentAt }]);
          }, 0);
        };
        document.addEventListener('click', this.sendIntentHandler, true);
        document.addEventListener('submit', this.sendIntentHandler, true);
      } catch (error) {
        if (!isExtensionContextInvalidatedError(error)) {
          folderDebugWarn('Failed to initialize conversation activity tracking:', error);
        }
      }
    })().finally(() => {
      this.starting = null;
    });

    return this.starting;
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;

    if (this.sendIntentHandler) {
      document.removeEventListener('click', this.sendIntentHandler, true);
      document.removeEventListener('submit', this.sendIntentHandler, true);
      this.sendIntentHandler = null;
    }
  }

  knownLastTurnAt(conversationId: string, url?: string): number | undefined {
    const nativeConversationId = normalizeConversationId(conversationId);
    if (!nativeConversationId) return undefined;

    // An imported record may keep a synthetic id; Gemini's history reports its route id.
    const routeId = resolveConversationRouteId(url, conversationId);
    const serverTimestamp = Math.max(
      ...[nativeConversationId, routeId].map((id) =>
        id ? (historyTimestampStore.getLatestTurnTimestamp(id) ?? 0) : 0,
      ),
    );
    const stableConversationId = buildConversationIdFromUrl(
      url || `https://gemini.google.com/app/${nativeConversationId}`,
    );
    const storedTimestamp =
      this.timestampService?.getLatestTimestampForConversation(stableConversationId) ?? undefined;
    const latest = Math.max(serverTimestamp, storedTimestamp ?? 0);
    return latest > 0 ? latest : undefined;
  }

  /** Raises every filed chat to its last known turn. */
  backfill(): void {
    this.host.apply(
      Object.values(this.host.data().folderContents)
        .flat()
        .map(({ conversationId, url }) => ({
          conversationId,
          lastTurnAt: this.knownLastTurnAt(conversationId, url) ?? 0,
        })),
    );
  }

  applyHistory(cids: string[]): void {
    this.host.apply(
      cids.map((cid) => {
        const conversationId = normalizeConversationId(cid) ?? '';
        const lastTurnAt = historyTimestampStore.getLatestTurnTimestamp(conversationId) ?? 0;
        return { conversationId, lastTurnAt };
      }),
    );
  }
}
