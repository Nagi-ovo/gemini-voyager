import type { Toaster } from '@/core/ui/toast/types';

import { watchRouteChanges } from '../utils/routeWatcher';
import { ModelPicker } from './modelPicker';
import type { PickerInteraction } from './modelPicker';
import { DefaultModelPreferences } from './preferences';
import type { DefaultModelSetting, DefaultThinkingLevel } from './preferences';

const CHAT_INPUT_SELECTORS = [
  'main rich-textarea [contenteditable="true"]',
  'rich-textarea [contenteditable="true"]',
  'main div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"][role="textbox"]',
  'main .input-area textarea',
  '.input-area textarea',
  'main [contenteditable="true"]',
  'main textarea',
] as const;

const RECENT_COMPOSER_ACTIVITY_MS = 8000;
const NAVIGATION_SETTLE_MS = 150;
const REFOCUS_DELAY_MS = 120;
/** Long enough to read and act on, short enough not to camp on the page. */
const FAILURE_TOAST_MS = 12000;
export const AUTO_APPLY_FAILURE_CHANNEL = 'default-model-failure';

export class DefaultModelAutoApply {
  private checkTimer: number | null = null;
  /** Bumped on start and stop: work queued by an earlier run sees a different value and drops out. */
  private generation = 0;
  private running = false;
  /** One-shot timers of the current run (navigation settle, refocus); cleared on stop. */
  private readonly timers = new Set<number>();
  private lastCheckedPath: string | null = null;
  private stopRouteWatcher: (() => void) | null = null;
  private sameRouteNewChatClickHandler: ((event: Event) => void) | null = null;
  // Track if we've already auto-selected for this navigation to prevent duplicates
  private autoSelectSessionId: string | null = null;
  // Track consecutive failures to stop retrying when model is unavailable
  private consecutiveFailures = 0;
  private readonly maxConsecutiveFailures = 3;
  // Once we hit `maxConsecutiveFailures`, show a one-time toast suggesting
  // the user pause the feature (until we ship a fix for the broken selector).
  // The flag only resets when the user flips the kill switch off-then-on,
  // so revisiting /app many times in a broken session does not spam toasts.
  private failureToastShown = false;
  // Tracks a model item we clicked on the previous tick. If the trigger pill is
  // still not on that model on the next tick, Gemini likely rejected the switch
  // (for example because that model's quota is exhausted), so we back off after
  // a few confirmations instead of reopening the menu forever (#761).
  private pendingModelSwitchKey: string | null = null;
  private consecutiveRejectedModelSwitches = 0;
  private pendingThinkingSwitchKey: string | null = null;
  private consecutiveRejectedThinkingSwitches = 0;
  private composerActivityHandler: ((event: Event) => void) | null = null;
  private lastComposerActivityPath: string | null = null;
  private lastComposerActivityAt = 0;

  public constructor(
    private readonly preferences: DefaultModelPreferences,
    private readonly picker: ModelPicker,
    private readonly toaster: Toaster,
  ) {}

  public start(): void {
    this.running = true;
    this.generation++;
    this.subscribeToComposerActivity();
    void this.checkAndLockModel();
    // One shared watcher covers browser history events and page-world SPA
    // navigations without stacking per-feature History API wrappers.
    this.stopRouteWatcher = watchRouteChanges(() => {
      const currentPath = window.location.pathname;
      if (currentPath !== this.lastCheckedPath && this.isNewConversation()) {
        this.lastCheckedPath = currentPath;
        this.checkAndLockModelWithDelay();
      }
    });

    // A click on the already-active /app new-chat link does not change href, so
    // the shared watcher cannot observe it. Keep only this semantic exception;
    // all real URL changes go through watchRouteChanges.
    this.sameRouteNewChatClickHandler = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest<HTMLAnchorElement>('a[href]');
      if (!link) return;
      try {
        const destination = new URL(link.href, window.location.href);
        if (destination.href === window.location.href && this.isNewConversation()) {
          this.checkAndLockModelWithDelay();
        }
      } catch {
        // Ignore malformed host links.
      }
    };
    document.addEventListener('click', this.sameRouteNewChatClickHandler, true);
  }

  public stop(): void {
    this.running = false;
    this.generation++;
    this.autoSelectSessionId = null;
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();

    this.stopRouteWatcher?.();
    this.stopRouteWatcher = null;

    if (this.sameRouteNewChatClickHandler) {
      document.removeEventListener('click', this.sameRouteNewChatClickHandler, true);
      this.sameRouteNewChatClickHandler = null;
    }

    this.unsubscribeFromComposerActivity();

    this.lastComposerActivityPath = null;
    this.lastComposerActivityAt = 0;
  }

  /** Runs `callback` after `delayMs` unless this run stops first. */
  private schedule(callback: () => void, delayMs: number): void {
    const generation = this.generation;
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (generation === this.generation) callback();
    }, delayMs);
    this.timers.add(id);
  }

  /**
   * What the picker may do on behalf of one lock loop. `isCurrent` turns false
   * when this run stops, a newer loop replaces this one, or the route changes.
   */
  private interactionFor(sessionId: string, lockPath: string): PickerInteraction {
    const generation = this.generation;
    const isCurrent = (): boolean =>
      generation === this.generation &&
      this.autoSelectSessionId === sessionId &&
      window.location.pathname === lockPath;
    return {
      isCurrent,
      shouldYield: () => this.shouldYieldToUserComposerActivity(),
      stop: () => this.stopLockTimer(),
      failed: () => {
        this.consecutiveFailures++;
        this.maybeNotifyAutoApplyFailure();
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) this.stopLockTimer();
      },
      resetFailures: () => {
        this.consecutiveFailures = 0;
      },
      focusInput: () => this.focusChatInputAfterAutoSwitch(isCurrent),
    };
  }

  private maybeNotifyAutoApplyFailure() {
    if (this.consecutiveFailures < this.maxConsecutiveFailures) return;
    if (this.failureToastShown) return;
    this.failureToastShown = true;
    this.showAutoApplyFailureToast();
  }

  private showAutoApplyFailureToast() {
    this.toaster.show({
      channel: AUTO_APPLY_FAILURE_CHANNEL,
      tone: 'warning',
      durationMs: FAILURE_TOAST_MS,
      message:
        chrome.i18n.getMessage('defaultModelAutoApplyFailed') ||
        'Default model auto-apply failed 3 times in a row. Gemini may have changed its menu layout.',
      action: {
        label: chrome.i18n.getMessage('defaultModelAutoApplyFailedAction') || 'Pause in settings',
        run: (handle) => {
          void this.requestOpenPopup().then((opened) => {
            if (opened) {
              handle.dismiss();
              return;
            }
            // Firefox/Safari (or any host that refuses a programmatic popup):
            // say how to get there by hand; the button has nothing left to do.
            handle.update({
              message:
                chrome.i18n.getMessage('defaultModelAutoApplyFailedFallback') ||
                'Open the extension popup from your toolbar to pause this feature.',
              action: undefined,
            });
          });
        },
      },
    });
  }

  private async requestOpenPopup(): Promise<boolean> {
    try {
      const response = (await chrome.runtime.sendMessage({ type: 'gv.openPopup' })) as
        | { ok?: boolean }
        | undefined;
      return response?.ok === true;
    } catch {
      return false;
    }
  }

  /**
   * Delayed version of checkAndLockModel for SPA navigation.
   * Adds a small delay to ensure the URL has actually changed.
   */
  private checkAndLockModelWithDelay(): void {
    this.schedule(() => void this.checkAndLockModel(), NAVIGATION_SETTLE_MS);
  }

  private async checkAndLockModel() {
    if (!this.running) return;
    // Defaults remain visible in the cache while enforcement is paused.
    if (!this.preferences.enabled) return;
    // Only lock on new conversation pages
    if (!this.isNewConversation()) return;

    // Update last checked path
    this.lastCheckedPath = window.location.pathname;

    const generation = this.generation;
    const { model: targetModel, thinking: targetThinking } =
      await this.preferences.reloadDefaults();
    // Stopped while the defaults loaded: no lock loop may start.
    if (generation !== this.generation) return;
    // Keep the raw value for the in-menu star display, but never *enforce*
    // Standard: it is Gemini's built-in default thinking level, so locking to it
    // is always a no-op that can only make the picker flash open on an
    // already-correct chat. Treat a Standard target as "no thinking preference".
    const enforcedThinking = this.preferences.isPageDefaultThinkingLevel(targetThinking)
      ? null
      : targetThinking;

    if (!targetModel && !enforcedThinking) return;

    // Skip when the only target is the Flash/Fast model and there is no thinking
    // preference left to enforce — Gemini already defaults to Flash, so a no-op
    // lock loop just wastes ticks.
    if (targetModel && this.preferences.isFastModel(targetModel) && !enforcedThinking) {
      return;
    }

    // Nothing to do when the picker already shows the starred model + thinking
    // level. A one-line pill ("Pro") already means Pro + Standard — Gemini hides
    // the thinking line at Standard. Bail before starting the 1s lock loop so an
    // already-correct new chat never spins up (or briefly opens) the picker. The
    // `lines.length` guard keeps the startup case — pill not painted yet — on
    // the loop path.
    const pillLines = this.picker.readTriggerPillLines();
    if (pillLines.length) {
      const modelOk = !targetModel || this.preferences.modelMatchesLines(targetModel, pillLines);
      const thinkingOk =
        !enforcedThinking || this.preferences.thinkingMatchesLines(enforcedThinking, pillLines);
      if (modelOk && thinkingOk) return;
    }

    // Generate a unique session ID to prevent duplicate selections in the same navigation
    const lockPath = window.location.pathname;
    const sessionId = `${lockPath}-${Date.now()}`;
    this.autoSelectSessionId = sessionId;
    const interaction = this.interactionFor(sessionId, lockPath);
    // Reset failure counter for new session
    this.consecutiveFailures = 0;
    this.pendingModelSwitchKey = null;
    this.consecutiveRejectedModelSwitches = 0;
    this.pendingThinkingSwitchKey = null;
    this.consecutiveRejectedThinkingSwitches = 0;

    // Start checking loop
    let attempts = 0;
    const maxAttempts = 5;

    if (this.checkTimer) clearInterval(this.checkTimer);

    this.checkTimer = window.setInterval(async () => {
      // Abort if session changed (e.g., user navigated away and came back)
      if (this.autoSelectSessionId !== sessionId) {
        this.stopLockTimer();
        return;
      }

      attempts++;
      if (attempts > maxAttempts) {
        this.stopLockTimer();
        return;
      }

      await this.tickLock(targetModel, enforcedThinking, interaction);
    }, 1000);
  }

  /**
   * Single tick: cheap fast-path via trigger pill text, then targeted lock if needed.
   * Handles both model and thinking-level prefs.
   */
  private async tickLock(
    targetModel: DefaultModelSetting | null,
    targetThinking: DefaultThinkingLevel | null,
    interaction: PickerInteraction,
  ) {
    if (this.shouldYieldToUserComposerActivity()) {
      this.stopLockTimer();
      return;
    }

    const lines = this.picker.readTriggerPillLines();
    const modelOk = !targetModel || this.preferences.modelMatchesLines(targetModel, lines);
    const thinkingOk =
      !targetThinking || this.preferences.thinkingMatchesLines(targetThinking, lines);

    if (modelOk && thinkingOk) {
      this.stopLockTimer();
      this.consecutiveFailures = 0;
      this.pendingModelSwitchKey = null;
      this.consecutiveRejectedModelSwitches = 0;
      this.pendingThinkingSwitchKey = null;
      this.consecutiveRejectedThinkingSwitches = 0;
      return;
    }

    if (modelOk) {
      this.pendingModelSwitchKey = null;
      this.consecutiveRejectedModelSwitches = 0;
    }

    if (!modelOk && targetModel) {
      const switchKey = this.getModelSwitchKey(targetModel);
      if (this.pendingModelSwitchKey === switchKey) {
        this.consecutiveRejectedModelSwitches++;
        if (this.consecutiveRejectedModelSwitches >= this.maxConsecutiveFailures) {
          this.consecutiveFailures = this.maxConsecutiveFailures;
          this.maybeNotifyAutoApplyFailure();
          this.stopLockTimer();
          return;
        }
      }

      const result = await this.picker.selectModel(targetModel, interaction);
      // A newer loop may own the lock timer by now; acting on this result would stop it.
      if (result === 'cancelled' || !interaction.isCurrent()) return;
      if (result === 'switched') {
        this.pendingModelSwitchKey = switchKey;
      } else if (result === 'already-selected') {
        this.pendingModelSwitchKey = null;
        this.consecutiveRejectedModelSwitches = 0;
        if (!thinkingOk && targetThinking) {
          await this.picker.selectThinking(targetThinking, interaction);
        } else {
          this.stopLockTimer();
        }
      } else {
        this.pendingModelSwitchKey = null;
        this.consecutiveRejectedModelSwitches = 0;
      }
      return;
    }

    if (!thinkingOk && targetThinking) {
      const switchKey = this.getThinkingSwitchKey(targetThinking);
      if (this.pendingThinkingSwitchKey === switchKey) {
        this.consecutiveRejectedThinkingSwitches++;
        if (this.consecutiveRejectedThinkingSwitches >= this.maxConsecutiveFailures) {
          this.consecutiveFailures = this.maxConsecutiveFailures;
          this.maybeNotifyAutoApplyFailure();
          this.stopLockTimer();
          return;
        }
      }

      const result = await this.picker.selectThinking(targetThinking, interaction);
      if (result === 'cancelled' || !interaction.isCurrent()) return;
      if (result === 'switched') {
        this.pendingThinkingSwitchKey = switchKey;
      } else {
        this.pendingThinkingSwitchKey = null;
        this.consecutiveRejectedThinkingSwitches = 0;
      }
    }
  }

  private isNewConversation() {
    const path = window.location.pathname;
    // Supports multi-profile paths like /u/0/app as well as /app.
    // Also supports Gem paths like /gem/xyz or /u/0/gem/xyz
    return /^\/(u\/\d+\/)?(app\/?|gem\/.*)$/.test(path);
  }

  private getModelSwitchKey(model: DefaultModelSetting): string {
    return model.kind === 'id' ? `id:${model.id}` : `name:${model.name.toLowerCase().trim()}`;
  }

  private getThinkingSwitchKey(thinking: DefaultThinkingLevel): string {
    return `thinking:${thinking.mode ?? 'legacy'}:${thinking.index}:${thinking.label.toLowerCase().trim()}`;
  }

  private stopLockTimer() {
    if (!this.checkTimer) return;
    clearInterval(this.checkTimer);
    this.checkTimer = null;
  }

  /** `isCurrent` is the lock loop's: a route change inside the delay must not focus the next page. */
  private focusChatInputAfterAutoSwitch(isCurrent: () => boolean): void {
    this.schedule(() => {
      if (!isCurrent()) return;
      const input = this.findChatInputElement();
      if (!input) return;

      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    }, REFOCUS_DELAY_MS);
  }

  private findChatInputElement(): HTMLElement | null {
    for (const selector of CHAT_INPUT_SELECTORS) {
      const candidates = document.querySelectorAll<HTMLElement>(selector);
      for (const candidate of Array.from(candidates)) {
        if (!candidate.isConnected) continue;
        if (candidate instanceof HTMLTextAreaElement && candidate.disabled) continue;
        return candidate;
      }
    }
    return null;
  }

  private subscribeToComposerActivity(): void {
    if (this.composerActivityHandler) return;

    this.composerActivityHandler = (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!this.isChatInputElement(target)) return;
      this.lastComposerActivityPath = window.location.pathname;
      this.lastComposerActivityAt = Date.now();
    };

    document.addEventListener('input', this.composerActivityHandler, { capture: true });
    document.addEventListener('keydown', this.composerActivityHandler, { capture: true });
  }

  private unsubscribeFromComposerActivity(): void {
    if (!this.composerActivityHandler) return;
    document.removeEventListener('input', this.composerActivityHandler, { capture: true });
    document.removeEventListener('keydown', this.composerActivityHandler, { capture: true });
    this.composerActivityHandler = null;
  }

  private isChatInputElement(element: HTMLElement | null): boolean {
    if (!element) return false;
    const input = this.findChatInputElement();
    return Boolean(input && (element === input || input.contains(element)));
  }

  private shouldYieldToUserComposerActivity(): boolean {
    // Opening the picker steals focus while the user is composing.
    const input = this.findChatInputElement();
    const text = input ? this.getChatInputText(input).trim() : '';
    if (text.length > 0) return true;

    return (
      this.lastComposerActivityPath === window.location.pathname &&
      Date.now() - this.lastComposerActivityAt < RECENT_COMPOSER_ACTIVITY_MS
    );
  }

  private getChatInputText(input: HTMLElement): string {
    if (input instanceof HTMLTextAreaElement) {
      return input.value;
    }
    return input.innerText ?? input.textContent ?? '';
  }
}
