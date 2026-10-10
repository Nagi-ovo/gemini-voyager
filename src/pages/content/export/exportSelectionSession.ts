/**
 * Message selection mode shown before an export is written.
 *
 * Puts a checkbox on every message and a bar with Select all / Only user /
 * Only AI / count / Export / Cancel at the top of the conversation, keeps both
 * in sync while the host lazy-loads more messages, and ends on Export, Cancel,
 * Escape or a route change. This module owns all selection state and every
 * listener, observer and timer it installs; all of them are removed when the
 * selection UI is dismissed.
 */
import { resolveExportErrorMessage } from '../../../features/export/ui/ExportErrorMessage';
import { showExportAlert } from '../../../features/export/ui/exportToasts';
import type { ChatGptTurnRole } from './adapter/type';
import type { ExportMessage, ExportMessageRole } from './conversationCollector';
import { isAbortError, throwIfExportCancelled } from './exportCancellation';
import type { ExportTranslate } from './exportLocale';
import { type ConversationAnchors, alignToConversationCenter } from './exportOverlayUi';
import {
  pruneMissingSelectionIds,
  reconcileExistingSelectionHost,
  resolveInitialSelectedMessageIds,
  shouldRefreshSelectionUi,
} from './selectionUtils';

const SELECTION_REFRESH_DELAY_MS = 250;

export interface ExportSelectionConfirmation {
  /**
   * Snapshot the selected message ids and remove the selection UI. Call it
   * after any work that needs the user gesture and before capturing the page.
   */
  takeSelection: () => ReadonlySet<string>;
}

export interface ExportSelectionSessionOptions {
  t: ExportTranslate;
  /** Signal of the export operation; an aborted signal disables refreshes and role filters. */
  signal?: AbortSignal;
  /** Abort the export operation. Called on Cancel, Escape and a route change. */
  abortExport: () => void;
  /** Selectable messages currently on the page, in reading order. */
  readMessages: () => ExportMessage[];
  /** Message to preselect once it appears (e.g. from a response menu). */
  initialSelectedMessageId: string | null;
  /** Conversation landmarks: the bar is centred on them and the root is observed. */
  anchors: ConversationAnchors;
  /** False once the page shows another conversation; the session then cancels itself. */
  isSameConversation: () => boolean;
  /**
   * Resolve roles for messages whose role is unknown (ChatGPT virtual list).
   * Called by the role filters only while some role is still unknown.
   */
  resolveRoles?: (messageIds: ReadonlySet<string>) => Promise<ReadonlyMap<string, ChatGptTurnRole>>;
  /**
   * Export the selection. Runs when Export is clicked with at least one message
   * selected; must handle its own errors. The session ends after it settles.
   */
  onConfirm: (confirmation: ExportSelectionConfirmation) => Promise<void>;
}

export interface ExportSelectionSession {
  /** Resolves when the session ends: after export settles, on cancel, or on route change. */
  readonly done: Promise<void>;
  /** Remove the selection UI and end the session without exporting. */
  cancel: () => void;
}

function swallow(ev: Event): void {
  try {
    ev.preventDefault();
  } catch {}
  try {
    ev.stopPropagation();
  } catch {}
}

function createBarButton(className: string, action: string | null, text: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  if (action) button.dataset.gvExportAction = action;
  button.textContent = text;
  return button;
}

/**
 * Show the selection UI. Throws (after removing the UI) only if reading the
 * initial messages throws.
 */
export function startExportSelectionSession(
  options: ExportSelectionSessionOptions,
): ExportSelectionSession {
  const { t, signal } = options;
  const selectedIds = new Set<string>();
  let allMessageIds: string[] = [];
  const cleanupTasks: Array<() => void> = [];
  const idToHost = new Map<string, HTMLElement>();
  const idToCheckbox = new Map<string, HTMLButtonElement>();
  const selectorBindings = new Map<
    string,
    { readonly host: HTMLElement; readonly cleanup: () => void }
  >();
  const messageRoles = new Map<string, ExportMessageRole>();
  let pendingInitialSelectionId: string | null = options.initialSelectedMessageId;
  let refreshTimer: number | null = null;
  let uiCleaned = false;
  let sessionSettled = false;
  let resolveSession: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveSession = resolve;
  });

  let autoSelectAll = false;
  let selectionBusy = false;

  const cleanup = () => {
    if (uiCleaned) return;
    uiCleaned = true;
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    selectorBindings.forEach(({ cleanup: cleanupBinding }) => cleanupBinding());
    selectorBindings.clear();
    idToHost.clear();
    idToCheckbox.clear();
    cleanupTasks.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    cleanupTasks.length = 0;
  };

  const settleSession = () => {
    if (sessionSettled) return;
    sessionSettled = true;
    resolveSession();
  };

  const cancelSession = () => {
    cleanup();
    settleSession();
  };

  const setSelected = (id: string, next: boolean) => {
    if (next) selectedIds.add(id);
    else selectedIds.delete(id);

    const btn = idToCheckbox.get(id);
    if (btn) {
      btn.setAttribute('aria-pressed', next ? 'true' : 'false');
      btn.dataset.selected = next ? 'true' : 'false';
    }
    const host = idToHost.get(id);
    if (host) {
      if (next) host.classList.add('gv-export-msg-selected');
      else host.classList.remove('gv-export-msg-selected');
    }
  };

  const isOnlyRoleSelected = (role: ExportMessageRole): boolean => {
    const roleMessageIds = allMessageIds.filter((id) => messageRoles.get(id) === role);
    return (
      roleMessageIds.length > 0 &&
      selectedIds.size === roleMessageIds.length &&
      roleMessageIds.every((id) => selectedIds.has(id))
    );
  };

  const updateBottomBar = (bar: HTMLElement) => {
    const countEl = bar.querySelector(
      '[data-gv-export-selection-count="true"]',
    ) as HTMLElement | null;
    if (countEl) {
      countEl.textContent = t('export_select_mode_count').replace(
        '{count}',
        String(selectedIds.size),
      );
    }

    const exportBtn = bar.querySelector(
      '[data-gv-export-action="export"]',
    ) as HTMLButtonElement | null;
    if (exportBtn) {
      exportBtn.disabled = selectionBusy || selectedIds.size === 0;
    }

    const selectAllBtn = bar.querySelector(
      '[data-gv-export-action="selectAll"]',
    ) as HTMLButtonElement | null;
    if (selectAllBtn) {
      selectAllBtn.disabled = selectionBusy;
      const isAllSelected = allMessageIds.length > 0 && selectedIds.size === allMessageIds.length;
      selectAllBtn.dataset.checked = isAllSelected ? 'true' : 'false';
    }

    const selectUserBtn = bar.querySelector(
      '[data-gv-export-action="selectUser"]',
    ) as HTMLButtonElement | null;
    if (selectUserBtn) {
      selectUserBtn.disabled = selectionBusy;
      selectUserBtn.dataset.checked = isOnlyRoleSelected('user') ? 'true' : 'false';
    }

    const selectAIBtn = bar.querySelector(
      '[data-gv-export-action="selectAI"]',
    ) as HTMLButtonElement | null;
    if (selectAIBtn) {
      selectAIBtn.disabled = selectionBusy;
      selectAIBtn.dataset.checked = isOnlyRoleSelected('assistant') ? 'true' : 'false';
    }

    idToCheckbox.forEach((checkbox) => {
      checkbox.disabled = selectionBusy;
    });
  };

  const attachSelectorIfNeeded = (msg: ExportMessage) => {
    messageRoles.set(msg.messageId, msg.role);
    const previousBinding = selectorBindings.get(msg.messageId);
    if (
      reconcileExistingSelectionHost(
        previousBinding?.host,
        msg.hostElement,
        selectedIds.has(msg.messageId),
      )
    ) {
      setSelected(msg.messageId, selectedIds.has(msg.messageId));
      return;
    }
    previousBinding?.cleanup();

    const host = msg.hostElement;
    idToHost.set(msg.messageId, host);
    host.classList.add('gv-export-msg-host');

    const selector = document.createElement('div');
    selector.className = 'gv-export-msg-selector';
    selector.dataset.gvExportMessageId = msg.messageId;

    const checkbox = document.createElement('button');
    checkbox.type = 'button';
    checkbox.className = 'gv-export-msg-checkbox';
    checkbox.setAttribute('aria-pressed', 'false');
    checkbox.title = t('export_select_mode_toggle');

    const mark = document.createElement('span');
    mark.className = 'gv-export-msg-checkbox-mark';
    checkbox.appendChild(mark);

    const toggleSelection = () => {
      if (selectionBusy) return;
      autoSelectAll = false;
      const next = !selectedIds.has(msg.messageId);
      setSelected(msg.messageId, next);
      const bar = document.querySelector(
        '[data-gv-export-select-bar="true"]',
      ) as HTMLElement | null;
      if (bar) updateBottomBar(bar);
    };

    checkbox.addEventListener('click', (ev) => {
      swallow(ev);
      toggleSelection();
    });

    host.addEventListener('click', toggleSelection);

    selector.appendChild(checkbox);
    host.appendChild(selector);

    idToCheckbox.set(msg.messageId, checkbox);
    setSelected(msg.messageId, selectedIds.has(msg.messageId));

    const cleanupBinding = () => {
      host.removeEventListener('click', toggleSelection);
      host.classList.remove('gv-export-msg-host', 'gv-export-msg-selected');
      selector.remove();
      if (idToHost.get(msg.messageId) === host) idToHost.delete(msg.messageId);
      if (idToCheckbox.get(msg.messageId) === checkbox) idToCheckbox.delete(msg.messageId);
    };
    selectorBindings.set(msg.messageId, { host, cleanup: cleanupBinding });
  };

  const syncMessages = (selectionMessages: ExportMessage[]) => {
    allMessageIds = selectionMessages.map((m) => m.messageId);
    const liveMessageIds = new Set(allMessageIds);
    const removedSelectionIds = pruneMissingSelectionIds(selectedIds, liveMessageIds);
    removedSelectionIds.forEach((id) => setSelected(id, false));
    for (const [id, binding] of selectorBindings) {
      if (liveMessageIds.has(id)) continue;
      binding.cleanup();
      selectorBindings.delete(id);
      messageRoles.delete(id);
    }

    selectionMessages.forEach((m) => attachSelectorIfNeeded(m));

    // Auto-select new messages when a policy is active.
    if (autoSelectAll) {
      for (const id of allMessageIds) setSelected(id, true);
    }

    const initialSelected = resolveInitialSelectedMessageIds(
      allMessageIds,
      pendingInitialSelectionId,
    );
    if (initialSelected.size > 0) {
      initialSelected.forEach((id) => setSelected(id, true));
      pendingInitialSelectionId = null;
    }
  };

  // Selection mode body class
  document.body.classList.add('gv-export-select-mode');
  cleanupTasks.push(() => document.body.classList.remove('gv-export-select-mode'));

  // Bottom action bar
  const bar = document.createElement('div');
  bar.className = 'gv-export-select-bar';
  bar.dataset.gvExportSelectBar = 'true';

  const selectAllBtn = createBarButton(
    'gv-export-select-all-toggle',
    'selectAll',
    t('export_select_mode_select_all'),
  );
  const selectUserBtn = createBarButton(
    'gv-export-select-role-btn',
    'selectUser',
    t('export_select_mode_only_user'),
  );
  const selectAIBtn = createBarButton(
    'gv-export-select-role-btn',
    'selectAI',
    t('export_select_mode_only_ai'),
  );

  const count = document.createElement('div');
  count.className = 'gv-export-select-count';
  count.dataset.gvExportSelectionCount = 'true';
  count.textContent = t('export_select_mode_count').replace('{count}', '0');

  const exportBtn = createBarButton('gv-export-select-export-btn', 'export', t('pm_export'));
  exportBtn.disabled = true;

  const cancelBtn = createBarButton('gv-export-select-cancel-btn', null, '×');
  cancelBtn.title = t('pm_cancel');

  bar.appendChild(selectAllBtn);
  bar.appendChild(selectUserBtn);
  bar.appendChild(selectAIBtn);
  bar.appendChild(count);
  bar.appendChild(exportBtn);
  bar.appendChild(cancelBtn);

  document.body.appendChild(bar);

  const selectOnlyRole = async (role: Exclude<ExportMessageRole, 'unknown'>) => {
    if (selectionBusy) return;
    autoSelectAll = false;
    selectionBusy = true;
    updateBottomBar(bar);
    try {
      throwIfExportCancelled(signal);
      if (options.resolveRoles && allMessageIds.some((id) => messageRoles.get(id) === 'unknown')) {
        const resolved = await options.resolveRoles(new Set(allMessageIds));
        resolved.forEach((resolvedRole, id) => messageRoles.set(id, resolvedRole));
      }

      throwIfExportCancelled(signal);
      const onlyRoleSelected = isOnlyRoleSelected(role);
      for (const id of allMessageIds) {
        setSelected(id, onlyRoleSelected ? false : messageRoles.get(id) === role);
      }
      updateBottomBar(bar);
    } catch (error) {
      if (!isAbortError(error)) showExportAlert(resolveExportErrorMessage(error, t), t);
    } finally {
      if (!signal?.aborted && !uiCleaned) {
        selectionBusy = false;
        updateBottomBar(bar);
      }
    }
  };

  selectUserBtn.addEventListener('click', (ev) => {
    swallow(ev);
    void selectOnlyRole('user');
  });

  selectAIBtn.addEventListener('click', (ev) => {
    swallow(ev);
    void selectOnlyRole('assistant');
  });
  cleanupTasks.push(() => bar.remove());
  cleanupTasks.push(alignToConversationCenter(bar, options.anchors));

  selectAllBtn.addEventListener('click', (ev) => {
    swallow(ev);
    if (selectionBusy) return;
    const isAllSelected = allMessageIds.length > 0 && selectedIds.size === allMessageIds.length;
    if (isAllSelected) {
      selectedIds.clear();
      autoSelectAll = false;
      allMessageIds.forEach((id) => setSelected(id, false));
    } else {
      selectedIds.clear();
      autoSelectAll = true;
      allMessageIds.forEach((id) => setSelected(id, true));
    }
    updateBottomBar(bar);
  });

  const finishUi = () => {
    allMessageIds.forEach((id) => setSelected(id, false));
    selectedIds.clear();
    autoSelectAll = false;
    cleanup();
  };

  cancelBtn.addEventListener('click', (ev) => {
    swallow(ev);
    options.abortExport();
    finishUi();
    settleSession();
  });

  exportBtn.addEventListener('click', async (ev) => {
    swallow(ev);
    if (selectionBusy) return;
    if (selectedIds.size === 0) {
      showExportAlert(t('export_select_mode_empty'), t, 'warning');
      return;
    }

    try {
      await options.onConfirm({
        takeSelection: () => {
          const selectedIdsForExport = new Set(selectedIds);
          // Cleanup before capture/export so selection UI is not included in screenshots.
          finishUi();
          return selectedIdsForExport;
        },
      });
    } finally {
      settleSession();
    }
  });

  // Observe new lazy-loaded messages while selection mode is active.
  const root = options.anchors.conversationRoot();
  const scheduleRefresh = () => {
    if (refreshTimer) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      if (signal?.aborted || uiCleaned) return;
      if (!options.isSameConversation()) {
        options.abortExport();
        cancelSession();
        return;
      }
      try {
        syncMessages(options.readMessages());
        updateBottomBar(bar);
      } catch {}
    }, SELECTION_REFRESH_DELAY_MS);
  };

  const obs = new MutationObserver((mutations) => {
    if (shouldRefreshSelectionUi(mutations)) scheduleRefresh();
  });
  try {
    obs.observe(root, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    });
    cleanupTasks.push(() => obs.disconnect());
  } catch {}

  // Escape to cancel
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      options.abortExport();
      finishUi();
      settleSession();
    }
  };
  document.addEventListener('keydown', onKeyDown);
  cleanupTasks.push(() => document.removeEventListener('keydown', onKeyDown));

  // Initial sync. A failure here removes the half-built UI before rethrowing,
  // since the caller never receives a handle to cancel it.
  try {
    syncMessages(options.readMessages());
    updateBottomBar(bar);
  } catch (error) {
    cancelSession();
    throw error;
  }
  return { done, cancel: cancelSession };
}
