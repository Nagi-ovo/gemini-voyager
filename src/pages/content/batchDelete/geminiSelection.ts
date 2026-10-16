import { detectAccountContextFromDocument } from '@/core/services/AccountIsolationService';
import { askConfirm } from '@/core/ui/confirm';
import { isVoyagerLayerEvent } from '@/core/ui/layer';
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { startMachine, type Machine } from '@/features/plugins/runtime/stateMachine';
import { getTranslationSyncUnsafe as t } from '@/utils/i18n';

import type { FolderFeedback } from '../folder/FolderFeedback';
import type { FolderSidebarRuntime } from '../folder/FolderSidebarRuntime';
import type { NativeConversationMenus } from '../folder/NativeConversationMenus';
import { deleteNativeConversations } from '../folder/nativeBatchDelete';
import {
  bindNativeConversationSelection,
  findConversationElement,
  setLightweightDragImage,
  type NativeRowSelection,
} from '../folder/nativeConversationDrag';
import { extractConversationId } from '../folder/nativeConversationIds';
import { SelectionToolbarHost, type SelectionToolbarOptions } from '../folder/selectionToolbar';
import { type AccountHints, isDifferentAccount } from '../selectionToolbar/pageIdentity';
import { watchRouteChanges } from '../utils/routeWatcher';
import { LONG_PRESS_MS, MAX_BATCH_DELETE_COUNT } from './constants';

export interface GeminiBatchDeleteOptions {
  runtime: Pick<FolderSidebarRuntime, 'panel' | 'sidebar'>;
  toolbar: SelectionToolbarOptions;
  feedback: Pick<
    FolderFeedback,
    | 'showNotification'
    | 'showBatchDeleteProgress'
    | 'updateBatchDeleteProgress'
    | 'hideBatchDeleteProgress'
  >;
  menus: Pick<NativeConversationMenus, 'deleteConversation'>;
  activation(): number;
  getContext(): { isDestroyed: boolean; accountIsolationEnabled: boolean };
  onEnter(): void;
  onExit(): void;
}

type State =
  | { status: 'idle' }
  | { status: 'selecting' }
  | { status: 'confirming'; ids: readonly string[]; anchor: HTMLElement; current: () => boolean }
  | { status: 'deleting'; ids: readonly string[]; current: () => boolean };
type Event =
  | { type: 'select' }
  | { type: 'exit' }
  | { type: 'confirm'; ids: readonly string[]; anchor: HTMLElement; current: () => boolean }
  | { type: 'answer'; accepted: boolean }
  | { type: 'complete' | 'reset' };

function transition(state: State, event: Event): State {
  if (event.type === 'complete' || event.type === 'reset') return { status: 'idle' };
  if (state.status === 'deleting') return state;
  if (event.type === 'exit') return { status: 'idle' };
  if (event.type === 'select') return { status: 'selecting' };
  if (event.type === 'confirm' && state.status === 'selecting') {
    return { status: 'confirming', ids: event.ids, anchor: event.anchor, current: event.current };
  }
  if (event.type === 'answer' && state.status === 'confirming') {
    return event.accepted
      ? { status: 'deleting', ids: state.ids, current: state.current }
      : { status: 'selecting' };
  }
  return state;
}

/** Native chat selection is plugin-owned; folder storage and drag remain native. */
export class GeminiBatchDeleteSelection {
  private readonly selected = new Set<string>();
  private readonly rows = new Map<HTMLElement, () => void>();
  private readonly timers = new Set<number>();
  private readonly images = new Set<HTMLElement>();
  private readonly toolbar: SelectionToolbarHost;
  private readonly machine: Machine<State, Event>;
  private readonly observer: MutationObserver;
  private observedSidebar: HTMLElement | null = null;
  private rowFrame: number | null = null;
  private escapeRoot: ShadowRoot | null = null;
  private accountEpoch = 0;
  private accountContext = this.readAccountContext();
  private enabled = true;
  /** Visible selection may end while its accepted run continues. */
  private ownsToolbar = false;
  private run: Promise<void> | null = null;
  private controller: AbortController | null = null;
  readonly nativeRows: NativeRowSelection;

  constructor(private readonly options: GeminiBatchDeleteOptions) {
    this.toolbar = new SelectionToolbarHost(options.toolbar);
    this.machine = startMachine<State, Event>(
      {
        id: 'gemini-batch-delete',
        transition,
        effects: {
          confirming: (stay) => {
            this.watchAccount(stay.scope);
            const state = stay.state();
            void askConfirm({
              message: t('batch_delete_confirm').replace('{count}', String(state.ids.length)),
              anchor: state.anchor,
              tone: 'danger',
              choices: [{ id: 'delete', label: t('pm_delete') }],
              signal: stay.signal,
            }).then((answer) => {
              if (stay.signal.aborted) return;
              stay.send({
                type: 'answer',
                accepted: answer === 'delete' && this.enabled && state.current(),
              });
            });
          },
          deleting: (stay) => {
            this.watchAccount(stay.scope);
            const state = stay.state();
            this.run = this.deleteConfirmed(state.ids, state.current).finally(() => {
              this.run = null;
              stay.send({ type: 'complete' });
            });
          },
        },
      },
      { status: 'idle' },
    );
    this.nativeRows = {
      bindRow: (row) => this.bindRow(row),
      longPressMs: LONG_PRESS_MS,
      schedule: (callback, delay) => this.schedule(callback, delay),
      clearTimer: (timer) => {
        clearTimeout(timer);
        this.timers.delete(timer);
      },
      isBatchDeleting: () => this.machine.state.status === 'deleting',
      isMultiSelectMode: () => this.active,
      isSelected: (id) => this.selected.has(id),
      selectedIds: () => [...this.selected],
      enterMultiSelect: (id) => this.enter(id),
      toggle: (id) => this.toggle(id),
      selectOnly: (id) => {
        if (this.machine.state.status === 'deleting') return;
        this.machine.send({ type: 'select' });
        this.selected.clear();
        this.selected.add(id);
      },
      refresh: () => this.refresh(),
      endDrag: () => {
        if (!this.active) this.exit();
      },
      accountIsolationEnabled: () => options.getContext().accountIsolationEnabled,
      findConversationElement: (id) =>
        findConversationElement(id, options.runtime.panel, options.runtime.sidebar),
      setDragImage: (event, label) =>
        setLightweightDragImage(event, label, this.images, (callback, delay) =>
          this.schedule(callback, delay),
        ),
    };
    this.observer = new MutationObserver(() => {
      if (this.rowFrame !== null) return;
      this.rowFrame = requestAnimationFrame(() => {
        this.rowFrame = null;
        this.bindRows();
      });
    });
    this.refresh();
    document.addEventListener('click', this.onOutside, true);
    document.addEventListener('keydown', this.onKey);
  }

  private readAccountContext(): AccountHints {
    const context = detectAccountContextFromDocument(location.href, document);
    return { routeUserId: context.routeUserId, email: context.email || null };
  }

  private checkAccount(): void {
    const context = this.readAccountContext();
    const changed = isDifferentAccount(this.accountContext, context);
    // Header rerenders may hide the email; retain it to detect a real switch when it returns.
    this.accountContext = { ...context, email: context.email ?? this.accountContext.email };
    if (!changed) return;
    this.accountEpoch++;
    this.reset();
  }

  private watchAccount(scope: PluginScope): void {
    const check = () => {
      if (!scope.signal.aborted) this.checkAccount();
    };
    scope.effect(() => {
      const observer = new MutationObserver(check);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['aria-label', 'data-email', 'title', 'alt', 'href'],
        characterData: true,
        childList: true,
        subtree: true,
      });
      const stopRoute = watchRouteChanges(check);
      return () => {
        observer.disconnect();
        stopRoute();
      };
    }, 'batch-account');
  }

  private get active(): boolean {
    return this.enabled && this.ownsToolbar;
  }

  private schedule(callback: () => void, delay: number): number {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      if (!this.options.getContext().isDestroyed) callback();
    }, delay);
    this.timers.add(timer);
    return timer;
  }

  private bindRow(row: HTMLElement): void {
    if (!this.enabled) return;
    if (!this.rows.has(row))
      this.rows.set(row, bindNativeConversationSelection(row, this.nativeRows));
    row.classList.toggle('gv-conversation-selected', this.selected.has(extractConversationId(row)));
  }

  private bindRows(): void {
    if (!this.enabled) return;
    for (const [row, release] of this.rows) {
      if (row.isConnected) {
        this.bindRow(row);
        continue;
      }
      release();
      row.classList.remove('gv-conversation-selected');
      row.style.opacity = '1';
      this.rows.delete(row);
    }
    for (const row of this.options.runtime.sidebar?.querySelectorAll<HTMLElement>(
      '[data-test-id="conversation"]',
    ) ?? [])
      this.bindRow(row);
  }

  private enter(id: string): void {
    if (!this.enabled || this.machine.state.status === 'deleting') return;
    this.options.onEnter();
    this.ownsToolbar = true;
    this.selected.add(id);
    this.machine.send({ type: 'select' });
    this.refresh();
    navigator.vibrate?.(50);
  }

  private toggle(id: string): void {
    if (this.machine.state.status === 'deleting') return;
    // Changing a pending confirmation invalidates its snapshot before another can be accepted.
    this.machine.send({ type: 'select' });
    if (this.selected.has(id)) this.selected.delete(id);
    else if (this.selected.size < MAX_BATCH_DELETE_COUNT) this.selected.add(id);
    else
      this.options.feedback.showNotification(
        t('batch_delete_limit_reached').replace('{max}', String(MAX_BATCH_DELETE_COUNT)),
        'info',
      );
    if (this.selected.size === 0) this.exit();
  }

  refresh(): void {
    if (!this.enabled) return;
    const sidebar = this.options.runtime.sidebar;
    if (sidebar !== this.observedSidebar) {
      this.observer.disconnect();
      this.observedSidebar = sidebar;
      if (sidebar) this.observer.observe(sidebar, { childList: true, subtree: true });
    }
    const shadow = this.options.runtime.panel?.shadowRoot ?? null;
    if (shadow !== this.escapeRoot) {
      this.escapeRoot?.removeEventListener('keydown', this.onKey as EventListener);
      this.escapeRoot = shadow;
      shadow?.addEventListener('keydown', this.onKey as EventListener);
    }
    this.bindRows();
    if (!this.active) return;
    if (this.options.runtime.panel?.isConnected) this.toolbar.removeFloating();
    this.toolbar.render({
      active: this.active,
      count: this.selected.size,
      source: 'native',
      onDelete: (anchor) => this.confirm(anchor),
      onExit: () => this.exit(),
    });
  }

  unmount(): void {
    this.escapeRoot?.removeEventListener('keydown', this.onKey as EventListener);
    this.escapeRoot = null;
    this.observer.disconnect();
    this.observedSidebar = null;
    this.toolbar.unmount();
  }

  exit(): void {
    const ownedToolbar = this.ownsToolbar;
    this.ownsToolbar = false;
    this.machine.send({ type: 'exit' });
    this.selected.clear();
    if (ownedToolbar)
      this.toolbar.render({
        active: false,
        count: 0,
        source: null,
        onDelete: () => {},
        onExit: () => {},
      });
    for (const row of this.rows.keys()) {
      row.classList.remove('gv-conversation-selected');
      row.style.opacity = '1';
    }
    this.options.onExit();
  }

  private readonly onOutside = (event: MouseEvent) => {
    if (!this.active || isVoyagerLayerEvent(event)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      this.options.runtime.panel?.contains(target) ||
      this.options.runtime.sidebar?.contains(target) ||
      this.toolbar.containsFloating(target)
    )
      return;
    if (
      target.closest(
        '[data-test-id="overflow-container"], .gv-folder-menu, .gv-folder-dialog-overlay, .gv-color-picker-dialog, .cdk-overlay-container, .mat-mdc-dialog-container, [data-test-id="conversation"]',
      )
    )
      return;
    this.exit();
  };
  private readonly onKey = (event: KeyboardEvent) => {
    if (this.active && event.key === 'Escape' && !event.defaultPrevented && !event.isComposing)
      this.exit();
  };

  private confirm(anchor: HTMLElement): void {
    if (
      !this.enabled ||
      this.run ||
      this.selected.size === 0 ||
      this.machine.state.status !== 'selecting'
    )
      return;
    const activation = this.options.activation();
    this.checkAccount();
    const epoch = this.accountEpoch;
    this.machine.send({
      type: 'confirm',
      anchor,
      ids: [...this.selected],
      current: () => {
        this.checkAccount();
        return (
          !this.options.getContext().isDestroyed &&
          this.options.activation() === activation &&
          this.accountEpoch === epoch
        );
      },
    });
  }

  private async deleteConfirmed(ids: readonly string[], current: () => boolean): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    const isCurrent = () => !controller.signal.aborted && current();
    try {
      const deleted = await deleteNativeConversations({
        conversationIds: ids,
        signal: controller.signal,
        isCurrent,
        deleteConversation: (id, signal) => this.options.menus.deleteConversation(id, signal),
        feedback: this.options.feedback,
      });
      // A cancelled run must not clear a replacement selection while its native waits unwind.
      if (!isCurrent()) return;
      this.exit();
      // Preserve native refresh while enabled; disabling must not reload a user's later work.
      if (deleted && this.enabled)
        this.schedule(() => {
          if (this.enabled && isCurrent()) location.reload();
        }, 1500);
    } finally {
      this.controller = null;
      this.options.feedback.hideBatchDeleteProgress();
    }
  }

  /** Account/manager teardown cancels native waits before they can click another account. */
  reset(): void {
    this.controller?.abort();
    // The native account owner already retired the old selection; the next one uses its new account.
    this.accountContext = this.readAccountContext();
    this.machine.send({ type: 'reset' });
    this.exit();
  }

  /** Disable clears UI now; only the already confirmed snapshot may finish before release. */
  async stop(): Promise<void> {
    this.enabled = false;
    this.observer.disconnect();
    if (this.rowFrame !== null) cancelAnimationFrame(this.rowFrame);
    this.rowFrame = null;
    this.escapeRoot?.removeEventListener('keydown', this.onKey as EventListener);
    this.escapeRoot = null;
    for (const [row, release] of this.rows) {
      release();
      row.classList.remove('gv-conversation-selected');
      row.style.opacity = '1';
    }
    this.rows.clear();
    document.removeEventListener('click', this.onOutside, true);
    document.removeEventListener('keydown', this.onKey);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    for (const image of this.images) image.remove();
    this.images.clear();
    this.exit();
    this.toolbar.removeFloating();
    this.toolbar.unmount();
    try {
      await this.run;
    } finally {
      await this.machine.stop();
    }
  }
}
