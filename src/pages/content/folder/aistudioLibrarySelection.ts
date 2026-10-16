/**
 * Multi-select on /library rows: a long press starts it, clicks then toggle
 * rows, and a floating bar counts the selection and offers batch delete.
 */
import { detectAccountContextFromDocument } from '@/core/services/AccountIsolationService';
import { askConfirm } from '@/core/ui/confirm';
import { isVoyagerLayerEvent } from '@/core/ui/layer';
import type { ToastTone, Toaster } from '@/core/ui/toast/types';
import { type Stay, startMachine } from '@/features/plugins/runtime/stateMachine';

import { LONG_PRESS_MS, MAX_BATCH_DELETE_COUNT } from '../batchDelete/constants';
import { type AccountHints, isDifferentAccount } from '../selectionToolbar/pageIdentity';
import { watchRouteChanges } from '../utils/routeWatcher';
import { LibraryBatchDeleter } from './aistudioLibraryBatchDelete';
import { getLibraryPromptRows, isLibraryPath, libraryPromptData } from './aistudioLibraryTable';

const PAGE_REFRESH_DELAY_MS = 1500;
const SELECTED_ROW_CLASS = 'gv-library-row-selected';

type SelectionPhase =
  | { status: 'idle' }
  | { status: 'selecting' }
  | { status: 'confirming' }
  | { status: 'deleting' };
type SelectionEvent = { type: 'select' | 'confirm' | 'accept' | 'cancel' | 'exit' | 'finish' };

function transition(state: SelectionPhase, event: SelectionEvent): SelectionPhase {
  if (state.status === 'deleting') return event.type === 'finish' ? { status: 'idle' } : state;
  if (event.type === 'exit') return { status: 'idle' };
  if (event.type === 'select' && state.status === 'idle') return { status: 'selecting' };
  if (event.type === 'confirm' && state.status === 'selecting') return { status: 'confirming' };
  if (event.type === 'accept' && state.status === 'confirming') return { status: 'deleting' };
  if (event.type === 'cancel' && state.status === 'confirming') return { status: 'selecting' };
  return state;
}

interface LibraryDeleteContext extends AccountHints {
  readonly pathname: string;
}

/** A changed route or signed-in account retires the destructive DOM context. */
function libraryDeleteContext(): LibraryDeleteContext {
  const context = detectAccountContextFromDocument(location.href, document);
  return { pathname: location.pathname, routeUserId: context.routeUserId, email: context.email };
}

function createIcon(name: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'google-symbols';
  span.dataset.icon = name;
  span.textContent = name;
  return span;
}

function onControl(event: Event): boolean {
  return event.target instanceof Element && !!event.target.closest('button, [role="button"]');
}

export class LibrarySelection {
  private readonly selected = new Set<string>();
  private active = false;
  private readonly phase = startMachine<SelectionPhase, SelectionEvent>(
    {
      id: 'aistudio-batch-delete',
      transition,
      effects: {
        confirming: (stay) => {
          this.confirmSignal = stay.signal;
          this.watchRunContext(stay);
        },
        deleting: (stay) => this.watchRunContext(stay),
      },
    },
    { status: 'idle' },
  );
  private readonly rows = new Map<HTMLElement, () => void>();
  private pending: Promise<void> = Promise.resolve();
  private enabled = true;
  private get deleting(): boolean {
    return this.phase.state.status === 'deleting';
  }

  get hasConfirmedRun(): boolean {
    return this.deleting;
  }

  /** Teardown waits for an already accepted run before a replacement activation can start. */
  get settled(): Promise<void> {
    return this.pending;
  }
  private host: HTMLElement | null = null;
  private outsideClick: ((event: MouseEvent) => void) | null = null;
  /** The confirming stay owns cancellation and makes late answers inert. */
  private confirmSignal: AbortSignal | null = null;
  /** Bumped by teardown so an old run cannot refresh a replacement activation. */
  private lifetime = 0;
  private contextEpoch = 0;
  private runContext: LibraryDeleteContext | null = null;
  private refreshTimer: number | null = null;
  private readonly deleter: LibraryBatchDeleter;

  constructor(
    private readonly t: (key: string) => string,
    private readonly notify: (message: string, tone: ToastTone) => void,
    toaster: Toaster,
  ) {
    this.deleter = new LibraryBatchDeleter(t, toaster);
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Long press starts selecting from this row; while selecting, a click toggles it. */
  bindRow(row: HTMLElement): void {
    if (this.rows.has(row)) return;
    this.enabled = true;
    const listeners = new AbortController();
    let longPressed = false;
    let timer: number | null = null;
    const clearPress = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    row.addEventListener(
      'mousedown',
      (event) => {
        if (
          !this.enabled ||
          this.deleting ||
          this.phase.state.status === 'confirming' ||
          event.button !== 0 ||
          onControl(event)
        )
          return;
        const data = libraryPromptData(row);
        if (!data) return;
        longPressed = false;
        clearPress();
        timer = window.setTimeout(() => {
          longPressed = true;
          this.enter(data.conversationId);
        }, LONG_PRESS_MS);
      },
      { signal: listeners.signal },
    );
    row.addEventListener('mouseup', clearPress, { signal: listeners.signal });
    row.addEventListener('mouseleave', clearPress, { signal: listeners.signal });
    row.addEventListener('dragstart', clearPress, { signal: listeners.signal });
    row.addEventListener(
      'click',
      (event) => {
        if (
          !this.enabled ||
          onControl(event) ||
          this.deleting ||
          this.phase.state.status === 'confirming'
        )
          return;
        if (longPressed) {
          event.preventDefault();
          event.stopPropagation();
          longPressed = false;
          return;
        }
        const data = this.active ? libraryPromptData(row) : null;
        if (!data) return;
        event.preventDefault();
        event.stopPropagation();
        this.toggle(data.conversationId);
      },
      { capture: true, signal: listeners.signal },
    );
    this.rows.set(row, () => {
      clearPress();
      listeners.abort();
    });
  }

  exit(): void {
    this.phase.send({ type: 'exit' });
    this.active = false;
    this.removeOutsideClick();
    this.selected.clear();
    this.refresh();
  }

  /** Marks selected rows and syncs the floating bar with the selection. */
  refresh(): void {
    for (const [row, stop] of this.rows) {
      if (row.isConnected) continue;
      stop();
      row.classList.remove(SELECTED_ROW_CLASS);
      this.rows.delete(row);
    }
    for (const row of getLibraryPromptRows()) {
      const data = libraryPromptData(row);
      row.classList.toggle(SELECTED_ROW_CLASS, !!data && this.selected.has(data.conversationId));
    }
    const host = this.active ? this.ensureHost() : this.host?.isConnected ? this.host : null;
    if (!host) return;
    host.classList.toggle('gv-multi-select-mode', this.active);
    const count = host.querySelector('[data-selection-count="true"]');
    if (count) count.textContent = this.countLabel(this.selected.size);
    const actions = host.querySelector('[data-multi-select-actions="true"]');
    if (!actions) return;
    if (!this.active) {
      if (actions.childElementCount > 0) actions.innerHTML = '';
      return;
    }
    if (actions.childElementCount === 0) actions.append(...this.actionButtons());
  }

  invalidateContext(): void {
    this.contextEpoch++;
    this.destroy();
  }

  destroy(): void {
    this.enabled = false;
    for (const [row, stop] of this.rows) {
      stop();
      row.classList.remove(SELECTED_ROW_CLASS);
    }
    this.rows.clear();
    this.lifetime++;
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    if (this.active) this.exit();
    this.removeOutsideClick();
    this.host?.remove();
    this.host = null;
    if (!this.deleting) this.deleter.hideProgress();
  }

  private enter(conversationId: string): void {
    if (!this.enabled || this.deleting || this.phase.state.status === 'confirming') return;
    this.phase.send({ type: 'select' });
    this.active = true;
    this.selected.add(conversationId);
    this.refresh();
    this.addOutsideClick();
  }

  private toggle(conversationId: string): void {
    if (this.selected.has(conversationId)) {
      this.selected.delete(conversationId);
      if (this.selected.size === 0) return this.exit();
    } else if (this.selected.size >= MAX_BATCH_DELETE_COUNT) {
      const message = this.t('batch_delete_limit_reached');
      this.notify(message.replace('{max}', String(MAX_BATCH_DELETE_COUNT)), 'info');
      return;
    } else {
      this.selected.add(conversationId);
    }
    this.refresh();
  }

  private countLabel(count: number): string {
    return this.t('folder_multi_select_count').replace('{count}', String(count));
  }

  private actionButtons(): HTMLButtonElement[] {
    const deleteButton = document.createElement('button');
    deleteButton.className = 'gv-multi-select-action-btn gv-multi-select-delete-btn';
    deleteButton.title = this.t('batch_delete_button');
    deleteButton.appendChild(createIcon('delete'));
    deleteButton.addEventListener('click', () => {
      if (this.phase.state.status !== 'selecting') return;
      this.pending = this.deleteSelected(deleteButton);
    });

    const exitButton = document.createElement('button');
    exitButton.className = 'gv-multi-select-action-btn gv-multi-select-exit-btn';
    exitButton.title = this.t('folder_multi_select_exit');
    exitButton.appendChild(createIcon('close'));
    exitButton.addEventListener('click', () => this.exit());
    return [deleteButton, exitButton];
  }

  private ensureHost(): HTMLElement {
    if (this.host?.isConnected) return this.host;
    const host = document.createElement('div');
    host.className = 'gv-folder-container gv-multi-select-floating-host gv-aistudio-library-select';
    host.dataset.multiSelectFloatingHost = 'true';
    Object.assign(host.style, {
      position: 'fixed',
      top: '72px',
      right: '24px',
      width: 'min(360px, calc(100vw - 48px))',
      zIndex: String(2147483647),
    });
    host.appendChild(this.indicator());
    document.body.appendChild(host);
    this.host = host;
    return host;
  }

  private indicator(): HTMLElement {
    const indicator = document.createElement('div');
    indicator.className = 'gv-multi-select-indicator';
    const content = document.createElement('div');
    content.className = 'gv-multi-select-indicator-content';
    content.appendChild(createIcon('check_circle'));
    const text = document.createElement('span');
    text.className = 'gv-multi-select-indicator-text';
    text.dataset.selectionCount = 'true';
    text.textContent = this.countLabel(0);
    content.appendChild(text);
    const actions = document.createElement('div');
    actions.className = 'gv-multi-select-actions';
    actions.dataset.multiSelectActions = 'true';
    indicator.append(content, actions);
    return indicator;
  }

  private addOutsideClick(): void {
    this.removeOutsideClick();
    const handler = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || this.host?.contains(target)) return;
      // The delete confirm and the toasts are part of this selection's flow.
      if (isVoyagerLayerEvent(event)) return;
      if ((target as Element).closest?.('.cdk-overlay-container, .mat-mdc-dialog-container'))
        return;
      if (getLibraryPromptRows().some((row) => row.contains(target))) return;
      this.exit();
    };
    this.outsideClick = handler;
    // Registered after the click that started selecting has finished.
    setTimeout(() => {
      if (this.outsideClick === handler) document.addEventListener('click', handler, true);
    }, 0);
  }

  private removeOutsideClick(): void {
    if (!this.outsideClick) return;
    document.removeEventListener('click', this.outsideClick, true);
    this.outsideClick = null;
  }

  private async deleteSelected(anchor: HTMLElement): Promise<void> {
    if (!this.enabled || this.phase.state.status !== 'selecting' || this.selected.size === 0)
      return;
    this.runContext = libraryDeleteContext();
    this.phase.send({ type: 'confirm' });
    const ids = Array.from(this.selected);
    const lifetime = this.lifetime;
    const contextEpoch = this.contextEpoch;
    const signal = this.confirmSignal!;
    const answer = await askConfirm({
      message: this.t('batch_delete_confirm').replace('{count}', String(ids.length)),
      anchor,
      tone: 'danger',
      choices: [{ id: 'confirm', label: this.t('pm_delete') }],
      signal,
    });
    if (signal.aborted) return;
    if (
      answer !== 'confirm' ||
      !this.enabled ||
      !this.checkRunContext() ||
      this.contextEpoch !== contextEpoch
    ) {
      this.phase.send({ type: 'cancel' });
      return;
    }

    this.phase.send({ type: 'accept' });
    // Plugin disable retires the UI, not the immutable set the user already confirmed.
    const { successCount, failedCount } = await this.deleter
      .run(ids, () => this.checkRunContext() && this.contextEpoch === contextEpoch)
      .finally(() => {
        this.phase.send({ type: 'finish' });
      });
    if (failedCount === 0) {
      this.notify(
        this.t('batch_delete_success').replace('{count}', String(successCount)),
        'success',
      );
    } else {
      const message = this.t('batch_delete_partial')
        .replace('{success}', String(successCount))
        .replace('{failed}', String(failedCount));
      this.notify(message, 'warning');
    }
    this.exit();
    // Disabling mid-run finishes the accepted work but must not reload after its UI is gone.
    // AI Studio's table does not drop deleted rows on its own.
    if (successCount > 0 && this.isCurrent(lifetime)) this.scheduleRefresh(lifetime);
  }

  private checkRunContext(): boolean {
    const captured = this.runContext;
    if (!captured) return false;
    const current = libraryDeleteContext();
    if (captured.pathname !== current.pathname || isDifferentAccount(captured, current)) {
      this.runContext = null;
      this.invalidateContext();
      return false;
    }
    // Header replacement can temporarily hide the email; retain the last real account evidence.
    this.runContext = { ...current, email: current.email ?? captured.email };
    return true;
  }

  private watchRunContext(stay: Stay<SelectionPhase, SelectionEvent>): void {
    const check = () => {
      if (!stay.signal.aborted) this.checkRunContext();
    };
    stay.scope.observe(
      document.documentElement,
      {
        attributes: true,
        attributeFilter: ['aria-label', 'data-email', 'title', 'alt', 'href'],
        characterData: true,
        childList: true,
        subtree: true,
      },
      check,
    );
    stay.scope.effect(() => watchRouteChanges(check));
  }

  /** Still mounted and on /library: a reload anywhere else would discard an open prompt. */
  private isCurrent(lifetime: number): boolean {
    return this.lifetime === lifetime && isLibraryPath();
  }

  private scheduleRefresh(lifetime: number): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      if (this.isCurrent(lifetime)) location.reload();
    }, PAGE_REFRESH_DELAY_MS);
  }
}
