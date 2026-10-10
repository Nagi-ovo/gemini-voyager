import { extractRouteUserIdFromPath } from '@/core/services/AccountIsolationService';
import { getTranslationSyncUnsafe } from '@/utils/i18n';

import {
  MENU_PANEL_SELECTOR as CONVERSATION_MENU_PANEL_SELECTOR,
  type ConversationMenuContext,
  getConversationMenuContext,
} from '../export/conversationMenuInjection';
import { normalizeConversationId } from './folderConversationIdentity';
import { getCurrentConversationId } from './nativeConversationIds';
import { isDeleteIconName, matchesDeleteKeyword, menuDebug as debug } from './nativeMenuActions';
import { type NativeSidebarReadContext, isConversationInDOM } from './nativeSidebarDom';

export interface NativeDeleteScope {
  storageKey: string;
  routeUserId: string | null;
}

export interface NativeDeleteTrackerCallbacks {
  getContext: () => NativeSidebarReadContext & { storageKey: string };
  onConfirmedDelete: (id: string) => void;
}

const VOYAGER_CONVERSATION_MENU_ACTION_SELECTOR =
  '.gv-export-conversation-menu-btn, .gv-export-response-menu-btn, .gv-move-to-folder-btn';
// Abandoned dialogs must not carry an old conversation into an unrelated action.
const NATIVE_DELETE_CANDIDATE_TIMEOUT_MS = 60_000;
// A bounded ~6 seconds lets route and sidebar settle; timeout preserves folder data.
const NATIVE_DELETE_SETTLE_CHECK_LIMIT = 20;
const DEBUG_RULE = '════════════════════════════════════════════════\n';

/**
 * The conversation menu behind `target` when it is a native Delete item, not
 * one of Voyager's own injected menu actions.
 */
export function getNativeDeleteMenuContext(target: HTMLElement): ConversationMenuContext | null {
  const action = target.closest(
    '[data-test-id="delete-button"], button[role="menuitem"], [role="menuitem"], gem-menu-item',
  ) as HTMLElement | null;
  if (!action || action.matches(VOYAGER_CONVERSATION_MENU_ACTION_SELECTOR)) return null;

  const panel = action.closest(CONVERSATION_MENU_PANEL_SELECTOR) as HTMLElement | null;
  const context = panel ? getConversationMenuContext(panel) : null;
  if (!context) return null;

  const icon = action.querySelector('mat-icon, .material-icons');
  const iconName =
    icon?.getAttribute('fonticon') ||
    icon?.getAttribute('data-mat-icon-name') ||
    icon?.textContent?.trim().toLowerCase();
  const text = action.textContent?.trim().toLowerCase() || '';
  const isDeleteAction =
    action.getAttribute('data-test-id') === 'delete-button' ||
    isDeleteIconName(iconName) ||
    matchesDeleteKeyword(text);
  return isDeleteAction ? context : null;
}

function getDialogButton(target: HTMLElement): HTMLElement | null {
  const button = target.closest('button, [role="button"]') as HTMLElement | null;
  return button?.closest('[role="dialog"], .mat-mdc-dialog-container') ? button : null;
}

function isNativeDeleteCompletionRoute(): boolean {
  try {
    const url = new URL(window.location.href);
    return (
      /^\/(?:u\/\d+\/)?app\/?$/.test(url.pathname) && url.searchParams.get('pageId') === 'none'
    );
  } catch {
    return false;
  }
}

/** Bare `/app` routes and `/u/0/app` both address Gemini's default account. */
function getNativeDeleteRouteUserId(): string | null {
  const routeUserId = extractRouteUserIdFromPath(window.location.pathname);
  if (routeUserId !== null) return routeUserId;
  return /^\/app(?:\/|$)/.test(window.location.pathname) ? '0' : null;
}

/**
 * Removes a conversation from folders only after the user explicitly deleted
 * it in Gemini's own menu and Gemini's route and sidebar confirm the deletion.
 * DOM disappearance alone never counts: the sidebar virtualizes rows during
 * normal scrolling.
 */
export class NativeDeleteTracker {
  private candidateId: string | null = null;
  private candidateScope: NativeDeleteScope | null = null;
  private candidateTimer: number | null = null;
  private candidateWasCurrent = false;

  private currentNativeDeletionChecks = new Set<string>();
  private pendingNativeDeletionScopes = new Map<string, NativeDeleteScope>();

  // Pending conversation removals with timer IDs.
  private pendingRemovals: Map<string, number> = new Map();

  // Delay (ms) before checking whether the native route and row have settled.
  private removalCheckDelay: number = 300;

  constructor(private readonly callbacks: NativeDeleteTrackerCallbacks) {}

  /** Cancels every pending removal check; a stopped tracker keeps no deletion state. */
  stop(): void {
    this.clearCandidate();
    this.pendingRemovals.forEach((timerId) => clearTimeout(timerId));
    this.pendingRemovals.clear();
    this.currentNativeDeletionChecks.clear();
    this.pendingNativeDeletionScopes.clear();
  }

  captureScope(): NativeDeleteScope {
    // A delayed deletion must never remove data from an account opened after the click.
    return {
      storageKey: this.callbacks.getContext().storageKey,
      routeUserId: getNativeDeleteRouteUserId(),
    };
  }

  isScopeCurrent(scope: NativeDeleteScope): boolean {
    return (
      scope.storageKey === this.callbacks.getContext().storageKey &&
      scope.routeUserId === getNativeDeleteRouteUserId()
    );
  }

  /**
   * Follows a click through Gemini's delete dialog. Returns true when the click
   * cancelled, dismissed or confirmed an armed delete.
   */
  handleDialogClick(target: HTMLElement): boolean {
    if (this.isCancellationTarget(target) || this.isOverlayDismissalTarget(target)) {
      this.clearCandidate();
      return true;
    }
    if (!this.isConfirmationTarget(target)) return false;

    const conversationId = this.candidateId;
    const deletionScope = this.candidateScope;
    if (conversationId && deletionScope && this.isScopeCurrent(deletionScope)) {
      const wasCurrent = this.candidateWasCurrent;
      this.clearCandidate();
      if (wasCurrent) this.currentNativeDeletionChecks.add(conversationId);
      this.pendingNativeDeletionScopes.set(conversationId, deletionScope);
      this.scheduleConversationRemovalCheck(conversationId);
    } else {
      this.clearCandidate();
    }
    return true;
  }

  /** Arms a delete for `conversationId` until its dialog resolves or times out. */
  rememberCandidate(conversationId: string): void {
    const normalized = normalizeConversationId(conversationId);
    if (!normalized) return;
    this.clearCandidate();
    this.candidateId = normalized;
    this.candidateScope = this.captureScope();
    this.candidateWasCurrent = normalizeConversationId(getCurrentConversationId()) === normalized;

    this.candidateTimer = window.setTimeout(
      () => this.clearCandidate(),
      NATIVE_DELETE_CANDIDATE_TIMEOUT_MS,
    );
  }

  clearCandidate(): void {
    if (this.candidateTimer !== null) {
      window.clearTimeout(this.candidateTimer);
      this.candidateTimer = null;
    }
    this.candidateId = null;
    this.candidateScope = null;
    this.candidateWasCurrent = false;
  }

  private isConfirmationTarget(target: HTMLElement): boolean {
    if (!this.candidateId) return false;
    const button = getDialogButton(target);
    if (!button) return false;

    const testId = button.getAttribute('data-test-id')?.toLowerCase() || '';
    if (testId.includes('cancel')) return false;
    if (testId.includes('confirm') || testId.includes('delete')) return true;

    const text = button.textContent?.trim().toLowerCase() || '';
    return matchesDeleteKeyword(text);
  }

  private isCancellationTarget(target: HTMLElement): boolean {
    if (!this.candidateId) return false;
    const button = getDialogButton(target);
    if (!button) return false;

    const testId = button.getAttribute('data-test-id')?.toLowerCase() || '';
    if (testId.includes('cancel')) return true;

    const text = button.textContent?.trim().toLowerCase() || '';
    const cancelLabel = getTranslationSyncUnsafe('pm_cancel').trim().toLowerCase();
    return text === 'cancel' || (!!cancelLabel && text === cancelLabel);
  }

  private isOverlayDismissalTarget(target: HTMLElement): boolean {
    return !!this.candidateId && !!target.closest('.cdk-overlay-backdrop');
  }

  /** Schedules a delayed check after an explicit native Delete action. */
  private scheduleConversationRemovalCheck(
    conversationId: string,
    checksRemaining: number = NATIVE_DELETE_SETTLE_CHECK_LIMIT,
  ): void {
    const normalizedId = normalizeConversationId(conversationId);
    if (!normalizedId || this.callbacks.getContext().isDestroyed) return;
    const deletionScope = this.pendingNativeDeletionScopes.get(normalizedId) ?? this.captureScope();
    this.pendingNativeDeletionScopes.set(normalizedId, deletionScope);

    // Cancel any existing timer for this conversation
    const existingTimer = this.pendingRemovals.get(normalizedId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      debug('log', `Cancelled previous removal timer for ${normalizedId}`);
    }

    const timerId = window.setTimeout(() => {
      this.confirmConversationRemoval(normalizedId, checksRemaining, deletionScope);
    }, this.removalCheckDelay);

    this.pendingRemovals.set(normalizedId, timerId);
    debug(
      'log',
      `Scheduled removal check for ${normalizedId} (delay: ${this.removalCheckDelay}ms)`,
    );
  }

  /**
   * Confirms an explicit native deletion after the UI has settled. The current
   * URL / visible-row checks keep the folder entry if Gemini rejected or
   * cancelled the operation.
   */
  private confirmConversationRemoval(
    conversationId: string,
    checksRemaining: number,
    deletionScope: NativeDeleteScope,
  ): void {
    this.pendingRemovals.delete(conversationId);
    if (this.callbacks.getContext().isDestroyed) return;
    if (!this.isScopeCurrent(deletionScope)) {
      this.forgetDeletion(conversationId);
      debug('log', `Discarded deletion check after account scope changed: ${conversationId}`);
      return;
    }

    debug('log', `\n═══ Confirming removal for conversation ${conversationId} ═══`);
    debug('log', `  Delay elapsed: ${this.removalCheckDelay}ms`);

    if (this.isStillPresent(conversationId)) {
      this.retryConversationRemovalCheck(conversationId, checksRemaining);
      return;
    }

    debug('log', `  ✗ CONFIRMED DELETION: Removing from all folders`);
    debug('log', `    Reason: Not in current URL and not found in DOM`);
    debug('log', `    Current URL: ${window.location.href}`);
    debug('log', DEBUG_RULE);

    this.callbacks.onConfirmedDelete(conversationId);
    this.forgetDeletion(conversationId);
  }

  /** Whether the conversation is still open, or still listed, in Gemini. */
  private isStillPresent(conversationId: string): boolean {
    const currentConvId = getCurrentConversationId();
    if (normalizeConversationId(currentConvId) === conversationId) {
      debug('log', `  ✓ SKIPPED: Currently active conversation`);
      debug('log', `    Current URL: ${window.location.href}`);
      debug('log', `    Matched ID: ${currentConvId}`);
      debug('log', DEBUG_RULE);
      return true;
    }

    // The lr26 sidebar can retain hidden virtualized rows after a successful
    // current-chat deletion. Ignore those only when the explicit delete flow
    // was armed for the current route and Gemini reached its completion page.
    const ignoreHiddenRows =
      this.currentNativeDeletionChecks.has(conversationId) && isNativeDeleteCompletionRoute();
    if (
      isConversationInDOM(this.callbacks.getContext().sidebar, conversationId, ignoreHiddenRows)
    ) {
      debug('log', `  ✓ SKIPPED: Conversation still exists in DOM`);
      debug('log', `    Likely a UI refresh, not a deletion`);
      debug('log', DEBUG_RULE);
      return true;
    }
    return false;
  }

  private retryConversationRemovalCheck(conversationId: string, checksRemaining: number): void {
    if (checksRemaining <= 1) {
      debug('log', `Removal check timed out for ${conversationId}; preserving folder entry`);
      this.forgetDeletion(conversationId);
      return;
    }
    this.scheduleConversationRemovalCheck(conversationId, checksRemaining - 1);
  }

  private forgetDeletion(conversationId: string): void {
    this.currentNativeDeletionChecks.delete(conversationId);
    this.pendingNativeDeletionScopes.delete(conversationId);
  }
}
